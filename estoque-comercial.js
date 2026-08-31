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
    contractsCcDone: [],
    firebaseOk: false,
    inited: false,
    stopSync: false,
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
    const contractId = u.contractId || u.salesContractId || u.currentSalesContractId || null;
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
      contractId: contractId,
      contractNumber: contractNumber || null,
      receivableBillId: u.receivableBillId || null,
      customerId: u.customerId || null,
      outstandingBalance: bal == null || bal === "" ? null : Number(bal),
      contractValue: u.totalSellingValue || u.value || null,
      situation: u.situation || "",
      quitado: !!quitado,
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
      contractsCcDone: this.state.contractsCcDone,
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
    this.state.units = (Array.isArray(data.units) ? data.units : []).map(u => this.sanitizeUnit(u));
    this.state.ccDone = Array.isArray(data.ccDone) ? data.ccDone.map(String) : [];
    this.state.complete = !!data.complete;
    this.state.contractsEnriched = !!data.contractsEnriched;
    this.state.contractsCcDone = Array.isArray(data.contractsCcDone) ? data.contractsCcDone.map(String) : [];
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
        contractsCcDone: Array.isArray(meta.contractsCcDone) ? meta.contractsCcDone.map(String) : [],
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
        contractsCcDone: this.state.contractsCcDone,
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

  async saveFirebaseCc(ccId) {
    if (!this.fbReady()) return false;
    const { doc, setDoc } = window.firebaseCollections;
    const cc = String(ccId);
    const list = this.state.units.filter(u => String(u.enterpriseId) === cc);
    try {
      const empName = (list[0] && list[0].enterpriseName) || this.empName(cc);
      const writes = [];
      for (let i = 0, n = 0; i < list.length; i += this.FB_CHUNK, n += 1) {
        writes.push(setDoc(doc(window.firebaseDb, this.FB_COL, `cc_${cc}_${n}`), {
          enterpriseId: cc,
          enterpriseName: empName,
          chunk: n,
          units: list.slice(i, i + this.FB_CHUNK),
          updatedAt: new Date().toISOString(),
          date: this.todayStr()
        }));
      }
      writes.push(setDoc(doc(window.firebaseDb, this.FB_COL, "_meta"), {
        date: this.todayStr(),
        ccDone: this.state.ccDone,
        complete: this.state.complete,
        contractsEnriched: this.state.contractsEnriched,
        contractsCcDone: this.state.contractsCcDone,
        fetchedAt: this.state.fetchedAt || new Date().toISOString(),
        unitCount: this.state.units.length,
        updatedAt: new Date().toISOString()
      }, { merge: true }));
      await Promise.all(writes);
      this.state.firebaseOk = true;
      return true;
    } catch (e) {
      console.error("[Estoque] gravação CC Firebase", cc, e);
      return false;
    }
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
      this.state.firebaseOk = true;
    } else if (local && local.units && local.units.length) {
      this.applyCache(local);
      if (this.fbReady()) await this.persistAll();
    }
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
      el.textContent = "Ainda sem estoque. Só Atualizar unidades dispara o loop no Sienge.";
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

  normNameLoose(name) {
    return this.normName(name).replace(/-0+/g, "-").replace(/^0+/, "") || this.normName(name);
  },

  buildDefaulterIndex() {
    const idx = { byRb: new Map(), byUnit: new Map() };
    const bills = (window.AppState && AppState.defaultersBills) || [];
    bills.forEach(b => {
      const val = Number(b.value) || 0;
      const rb = String(b.receivableBillId || b.id || "");
      if (rb) idx.byRb.set(rb, (idx.byRb.get(rb) || 0) + val);
      const cc = String(b.costCenterId || (b.costCentersId && b.costCentersId[0]) || "");
      const units = String(b.units || "");
      units.split(/[;,|/]/).forEach(part => {
        const n = this.normName(part);
        if (n && n !== "N/D") {
          const k = `${cc}|${n}`;
          idx.byUnit.set(k, (idx.byUnit.get(k) || 0) + val);
        }
      });
    });
    this.state.defaulterIndex = idx;
    return idx;
  },

  isInadimplente(u) {
    return this.overdueValue(u) > 0.009;
  },

  overdueValue(u) {
    const idx = this.state.defaulterIndex || this.buildDefaulterIndex();
    if (u.receivableBillId && idx.byRb.has(String(u.receivableBillId))) {
      return idx.byRb.get(String(u.receivableBillId)) || 0;
    }
    const k = `${String(u.enterpriseId || "")}|${this.normName(u.name)}`;
    return idx.byUnit.get(k) || 0;
  },

  sanitizeUnit(u) {
    if (!u) return u;
    const next = { ...u };
    if (next.contractId != null && String(next.contractNumber || "") === String(next.contractId)) {
      next.contractNumber = null;
    }
    return next;
  },

  isFakeContractNumber(u) {
    if (!u || !u.contractNumber) return true;
    if (u.contractId != null && String(u.contractNumber) === String(u.contractId)) return true;
    return false;
  },

  displayContract(u) {
    if (!u) return "";
    if (u.contractNumber && String(u.contractNumber) !== String(u.contractId || "")) return String(u.contractNumber);
    if (u.receivableBillId && String(u.receivableBillId) !== String(u.contractId || "")) return String(u.receivableBillId);
    return "";
  },

  unitBalance(u) {
    if (!u) return null;
    if (u.presentDebitBalance != null && !Number.isNaN(Number(u.presentDebitBalance))) return Number(u.presentDebitBalance);
    if (u.outstandingBalance != null && !Number.isNaN(Number(u.outstandingBalance))) return Number(u.outstandingBalance);
    return null;
  },

  finChipClass(fin) {
    if (fin === "Ativo adimplente") return "est-fin-Adimplente";
    if (fin === "Ativo inadimplente") return "est-fin-Inadimplente";
    if (fin === "Em aberto" || fin === "A apurar") return "est-fin-apurar";
    return "est-fin-" + fin;
  },

  financialStatus(u) {
    const code = String(u.commercialStock || "").toUpperCase();
    const sold = this.SOLD_CODES.includes(code) || !!u.contractId || !!this.displayContract(u);
    if (!sold) return "—";
    if (String(u.situation || "").toLowerCase().includes("distrat")) return "Distratado";
    const bal = this.unitBalance(u);
    if (u.quitado || bal === 0) return "Quitado";
    if (this.isInadimplente(u)) return "Ativo inadimplente";
    if (bal != null && Number(bal) > 0.009) return "Ativo adimplente";
    return "A apurar";
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  contractKey(u) {
    return String(u.receivableBillId || u.contractNumber || u.contractId || ("u-" + u.id));
  },

  portfolioOf(rows) {
    const seen = new Set();
    let aReceber = 0;
    let atraso = 0;
    let ativos = 0;
    let quitados = 0;
    let distratados = 0;
    let inadimplentes = 0;
    let semSaldo = 0;
    (rows || []).forEach(u => {
      const fin = this.financialStatus(u);
      if (fin === "—") return;
      if (fin === "Distratado") {
        distratados += 1;
        return;
      }
      if (fin === "Quitado") {
        quitados += 1;
        return;
      }
      if (fin === "A apurar" || fin === "Em aberto") {
        semSaldo += 1;
        return;
      }
      const key = this.contractKey(u);
      if (seen.has(key)) return;
      seen.add(key);
      ativos += 1;
      const bal = this.unitBalance(u);
      if (bal == null || Number.isNaN(Number(bal))) semSaldo += 1;
      else aReceber += Number(bal) || 0;
      const ov = this.overdueValue(u);
      if (ov > 0.009) {
        inadimplentes += 1;
        atraso += ov;
      }
    });
    return { aReceber, atraso, aVencer: Math.max(0, aReceber - atraso), ativos, quitados, distratados, inadimplentes, semSaldo };
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
    const finEl = document.getElementById("est-stock-finance");
    if (finEl) {
      const p = this.portfolioOf(rows);
      const falta = p.semSaldo
        ? `<small>${p.semSaldo} contrato(s) ativo(s) ainda sem saldo — rode o cruzamento de contratos.</small>`
        : `<small>${p.ativos} contrato(s) ativo(s) · ${p.inadimplentes} em atraso</small>`;
      finEl.innerHTML = `
        <div class="est-fin-card"><label>A receber</label><strong>${this.money(p.aReceber)}</strong>${falta}</div>
        <div class="est-fin-card is-warn"><label>Em atraso</label><strong>${this.money(p.atraso)}</strong><small>Da fila de inadimplência do dia (se carregada)</small></div>
        <div class="est-fin-card"><label>A vencer</label><strong>${this.money(p.aVencer)}</strong><small>A receber menos o atraso (aprox.)</small></div>
        <div class="est-fin-card is-ok"><label>Quitados</label><strong>${p.quitados}</strong><small>Saldo zero — fora do a receber</small></div>
      `;
    }
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
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8;">Nenhuma unidade para os filtros atuais.</td></tr>`;
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
      const contrato = this.displayContract(u) || "—";
      const fin = this.financialStatus(u);
      const finClass = this.finChipClass(fin);
      const bal = this.unitBalance(u);
      const saldo = fin === "Quitado"
        ? this.money(0)
        : (fin === "—" || fin === "Distratado" || fin === "A apurar" || bal == null
          ? "—"
          : this.money(bal));
      return `<tr>
        <td><span class="est-status-chip">${this.esc(status)}</span></td>
        <td>${this.esc(u.enterpriseId)} / ${this.esc(empName)}</td>
        <td>${this.esc(u.name)}</td>
        <td>${this.esc(this.mapCode(this.LEGAL_MAP, u.legalStock))}</td>
        <td>${this.esc(area)}</td>
        <td>${this.esc(contrato)}</td>
        <td><span class="est-fin-chip ${finClass}">${this.esc(fin)}</span></td>
        <td style="text-align:right;white-space:nowrap;">${this.esc(saldo)}</td>
      </tr>`;
    }).join("");
  },

  setBusy(on) {
    this.state.loading = !!on;
    ["est-btn-consultar", "est-btn-atualizar", "est-btn-contratos", "est-filter-emp", "est-filter-unit"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !!on;
    });
    const stop = document.getElementById("est-btn-parar");
    if (stop) stop.style.display = on ? "inline-flex" : "none";
  },

  parar() {
    this.state.stopSync = true;
    this.setProgress("Parando…");
  },

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  },

  keepQuitado(prev, next) {
    const old = {};
    (prev || []).forEach(u => {
      if (u) old[String(u.id)] = u;
    });
    return (next || []).map(u => {
      const keep = old[String(u.id)];
      if (!keep) return u;
      return this.sanitizeUnit({
        ...u,
        contractNumber: u.contractNumber || keep.contractNumber,
        outstandingBalance: keep.quitado ? 0 : (u.outstandingBalance != null ? u.outstandingBalance : keep.outstandingBalance),
        presentDebitBalance: u.presentDebitBalance != null ? u.presentDebitBalance : keep.presentDebitBalance,
        contractValue: u.contractValue || keep.contractValue,
        situation: u.situation || keep.situation,
        quitado: !!(keep.quitado || u.quitado),
        receivableBillId: u.receivableBillId || keep.receivableBillId,
        customerId: u.customerId || keep.customerId,
        customerDoc: u.customerDoc || keep.customerDoc
      });
    });
  },

  async fetchUnitsForCc(cc) {
    const empName = cc.name || "";
    const collected = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      if (this.state.stopSync) break;
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
    if (this.unitBalance(u) != null && this.displayContract(u)) return false;
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
    if (!info) return u;
    const bal = info.outstandingBalance;
    const quitado = Number(bal) === 0 && !String(info.situation || "").toLowerCase().includes("distrat");
    const num = info.contractNumber && String(info.contractNumber) !== String(info.saleId || u.contractId || "")
      ? info.contractNumber
      : (this.displayContract(u) || null);
    return {
      ...u,
      contractId: info.saleId || u.contractId,
      contractNumber: num,
      receivableBillId: info.receivableBillId || u.receivableBillId,
      customerId: info.customerId || u.customerId,
      customerDoc: info.customerDoc || u.customerDoc,
      outstandingBalance: bal == null || bal === "" ? u.outstandingBalance : Number(bal),
      presentDebitBalance: info.presentDebitBalance != null ? Number(info.presentDebitBalance) : u.presentDebitBalance,
      contractValue: info.contractValue || u.contractValue,
      situation: info.situation || u.situation,
      quitado: u.quitado || !!quitado
    };
  },

  contractInfoFromSale(c) {
    const mainCust = (c.salesContractCustomers || []).find(x => x.main === true) || (c.salesContractCustomers || [])[0] || {};
    const num = c.number || c.contractNumber || c.documentNumber || c.salesContractNumber || "";
    const doc = mainCust.cpf || mainCust.cnpj || mainCust.cpfCnpj || c.customerCpf || c.customerCnpj || "";
    return {
      saleId: c.id,
      contractNumber: num ? String(num) : "",
      outstandingBalance: c.outstandingBalance,
      contractValue: c.totalSellingValue || c.value || null,
      receivableBillId: c.receivableBillId || null,
      customerId: mainCust.id || c.customerId || null,
      customerDoc: String(doc || "").replace(/\D/g, ""),
      situation: c.situation || c.status || ""
    };
  },

  rememberContractNames(byName, raw, info) {
    if (!raw) return;
    const n = this.normName(raw);
    const l = this.normNameLoose(raw);
    if (n) byName[n] = info;
    if (l) byName[l] = info;
  },

  async fetchContractsForCc(ccId) {
    const byId = {};
    const byName = {};
    const bySaleId = {};
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      if (this.state.stopSync) break;
      const path = `/sales-contracts?limit=${this.LIMIT}&offset=${offset}&enterpriseId=${ccId}`;
      const data = await this.siengeFetch(path);
      const results = (data && data.results) || [];
      results.forEach(c => {
        const info = this.contractInfoFromSale(c);
        if (c.id != null) bySaleId[String(c.id)] = info;
        const units = c.salesContractUnits || c.units || [];
        units.forEach(su => {
          const uid = su.unitId || su.id;
          if (uid) byId[String(uid)] = info;
          this.rememberContractNames(byName, su.name || su.unitName || su.unityName, info);
        });
        if (c.unitId) byId[String(c.unitId)] = info;
        this.rememberContractNames(byName, c.unitName || c.unityName, info);
      });
      if (results.length < this.LIMIT) hasMore = false;
      else offset += results.length;
    }
    return { byId, byName, bySaleId };
  },

  async enrichContracts() {
    this.state.stopSync = false;
    const pending = [...new Set(this.state.units.filter(u => this.needsContract(u)).map(u => String(u.enterpriseId)))]
      .filter(id => !this.state.contractsCcDone.includes(String(id)));
    if (!pending.length) {
      this.state.contractsEnriched = true;
      this.saveCache();
      this.setProgress("");
      this.updateMeta();
      this.renderTable();
      return;
    }
    this.setBusy(true);
    try {
      for (let i = 0; i < pending.length; i++) {
        if (this.state.stopSync) break;
        const ccId = pending[i];
        this.setProgress(`Cruzando contratos ${ccId} (${i + 1}/${pending.length})…`, ((i + 1) / pending.length) * 100);
        try {
          const maps = await this.fetchContractsForCc(ccId);
          this.state.units = this.state.units.map(u => {
            if (String(u.enterpriseId) !== String(ccId)) return u;
            if (u.quitado) return u;
            const info = maps.byId[String(u.id)]
              || (u.contractId != null ? maps.bySaleId[String(u.contractId)] : null)
              || maps.byName[this.normName(u.name)]
              || maps.byName[this.normNameLoose(u.name)];
            return this.applyContractInfo(u, info);
          });
          if (!this.state.contractsCcDone.includes(ccId)) this.state.contractsCcDone.push(ccId);
          this.saveCache();
          await this.saveFirebaseCc(ccId);
        } catch (e) {
          console.error("[Estoque] contratos CC", ccId, e);
        }
        await this.sleep(80);
      }
      this.state.contractsEnriched = this.state.stopSync
        ? false
        : !this.state.units.some(u => this.needsContract(u));
      await this.saveFirebaseCc(pending[pending.length - 1]);
    } finally {
      this.setBusy(false);
      this.setProgress(this.state.stopSync ? "Cruzamento interrompido. O que já cruzou ficou salvo." : "");
      this.state.stopSync = false;
      this.updateMeta();
      this.renderTable();
      if (window.lucide) window.lucide.createIcons();
    }
  },

  parseDebit(res) {
    if (!res || typeof res !== "object") return null;
    const pick = (o) => {
      if (!o || typeof o !== "object") return null;
      const v = o.presentValue != null ? o.presentValue : (o.totalBalance != null ? o.totalBalance : o.currentBalance);
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };
    const direct = pick(res);
    if (direct != null) return direct;
    if (Array.isArray(res.data) && res.data[0]) return pick(res.data[0]);
    if (Array.isArray(res.results) && res.results[0]) return pick(res.results[0]);
    return null;
  },

  customerDocFromContract(c) {
    const mainCust = (c && c.salesContractCustomers || []).find(x => x.main === true) || (c && c.salesContractCustomers || [])[0] || {};
    return String(mainCust.cpf || mainCust.cnpj || mainCust.cpfCnpj || c.customerCpf || c.customerCnpj || "").replace(/\D/g, "");
  },

  async fetchSaleForUnit(u) {
    if (u.contractId) {
      try {
        const raw = await this.siengeFetch(`/sales-contracts/${u.contractId}`);
        if (raw && (raw.id || raw.number || raw.contractNumber)) return raw;
      } catch (e) {
        console.warn("[Estoque] sales-contracts id", u.contractId, e);
      }
    }
    try {
      const res = await this.siengeFetch(`/sales-contracts?limit=50&offset=0&enterpriseId=${u.enterpriseId}&unitId=${u.id}`);
      const list = (res && res.results) || [];
      const named = list.find(c => {
        const units = c.salesContractUnits || [];
        return units.some(su => String(su.unitId || su.id) === String(u.id) || this.normName(su.name || su.unitName) === this.normName(u.name));
      });
      return named || list[0] || null;
    } catch (e) {
      console.warn("[Estoque] sales-contracts unit", u.id, e);
      return null;
    }
  },

  async hydrateUnitById(unitId) {
    const idx = this.state.units.findIndex(x => String(x.id) === String(unitId));
    if (idx < 0) return;
    let u = this.sanitizeUnit(this.state.units[idx]);
    this.setProgress(`Consultando contrato da unidade ${u.name}…`);
    const raw = await this.fetchSaleForUnit(u);
    if (raw) {
      const info = this.contractInfoFromSale(raw);
      info.customerDoc = info.customerDoc || this.customerDocFromContract(raw);
      u = this.applyContractInfo(u, info);
    }
    const doc = u.customerDoc;
    const rb = u.receivableBillId;
    if (doc && window.SiengeApiService && typeof SiengeApiService.getTotalCurrentDebitBalance === "function") {
      try {
        const debit = await SiengeApiService.getTotalCurrentDebitBalance(doc, rb || "");
        const present = this.parseDebit(debit);
        if (present != null) {
          u.presentDebitBalance = present;
          if (u.outstandingBalance == null) u.outstandingBalance = present;
          if (present === 0) u.quitado = true;
        }
      } catch (e) {
        console.warn("[Estoque] saldo devedor presente", e);
      }
    }
    this.state.units[idx] = u;
    this.saveCache();
    await this.saveFirebaseCc(u.enterpriseId);
    this.setProgress("");
  },
    if (this.state.loading) return;
    if (!this.state.units.length) await this.init();
    if (!this.state.units.length) {
      alert("Não há estoque salvo. Use Atualizar unidades uma vez.");
      return;
    }
    await this.enrichContracts();
  },

  async consultar(forceRefresh) {
    if (this.state.loading) return;
    if (!this.state.units.length) await this.init();
    if (!forceRefresh) {
      this.fillUnitSelect();
      const unitId = (document.getElementById("est-filter-unit") || {}).value;
      if (unitId) {
        this.setBusy(true);
        try {
          await this.hydrateUnitById(unitId);
        } finally {
          this.setBusy(false);
        }
      }
      this.updateMeta();
      this.renderTable();
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    if (!this.state.enterprises.length) await this.loadEnterprises();
    if (!this.state.enterprises.length) {
      alert("Nenhum centro de custo começando com 1, 2 ou 3.");
      return;
    }

    const prev = this.state.units.slice();
    this.state.stopSync = false;
    this.state.units = [];
    this.state.ccDone = [];
    this.state.complete = false;
    this.state.fetchedAt = null;
    this._prevQuitados = prev;

    this.setBusy(true);
    try {
      const total = this.state.enterprises.length;
      let done = 0;
      for (const cc of this.state.enterprises) {
        if (this.state.stopSync) break;
        done += 1;
        this.setProgress(`Buscando ${this.ccLabel(cc)} (${done}/${total})…`, (done / total) * 100);
        try {
          let batch = await this.fetchUnitsForCc(cc);
          batch = this.keepQuitado(this._prevQuitados, batch);
          this.state.units = this.state.units.filter(u => String(u.enterpriseId) !== String(cc.id)).concat(batch);
          this.state.ccDone.push(String(cc.id));
          this.state.fetchedAt = new Date().toISOString();
          this.saveCache();
          await this.saveFirebaseCc(cc.id);
        } catch (e) {
          console.error("[Estoque] falha no CC", cc.id, e);
          this.setProgress(`Erro em ${cc.id}: ${e.message || e}. Continuando…`, (done / total) * 100);
          await this.sleep(400);
        }
        await this.sleep(80);
      }
      this.state.complete = !this.state.stopSync;
      this._prevQuitados = null;
      this.saveCache();
      this.setProgress(this.state.stopSync ? "Atualização interrompida. O que já baixou ficou salvo." : "");
      this.fillUnitSelect();
      this.updateMeta();
      this.renderTable();
    } finally {
      this.setBusy(false);
      this.state.stopSync = false;
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
