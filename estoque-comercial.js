const EstoqueComercialApp = {
  CACHE_KEY: "crm_estoque_posicao_v1",
  FB_COL: "estoque_comercial",
  CC_WITH_KEY: "crm_cc_ids_com_unidade",
  CC_EMPTY_KEY: "crm_cc_ids_sem_unidade",
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

  foldCcName(s) {
    return String(s || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  },

  isDeptOnlyCc(cc) {
    const name = this.foldCcName(cc && typeof cc === "object" ? cc.name : cc);
    const parts = name.split(" - ").map(p => p.trim()).filter(Boolean);
    const tail = parts[parts.length - 1] || "";
    return [
      "OBRAS",
      "MARKETING",
      "COMERCIAL",
      "GESTAO DE PRODUTOS",
      "PARCERIA",
      "NOVOS NEGOCIOS",
      "PROJETOS"
    ].includes(tail);
  },

  readIdSet(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      return new Set((Array.isArray(raw) ? raw : []).map(String).filter(Boolean));
    } catch (e) {
      return new Set();
    }
  },

  writeIdSet(key, set) {
    try {
      localStorage.setItem(key, JSON.stringify([...set].sort((a, b) => Number(a) - Number(b))));
    } catch (e) {}
  },

  markCcUnits(id, hasUnits) {
    const idS = String(id || "").trim();
    if (!idS) return;
    const withU = this.readIdSet(this.CC_WITH_KEY);
    const empty = this.readIdSet(this.CC_EMPTY_KEY);
    if (hasUnits) {
      withU.add(idS);
      empty.delete(idS);
    } else {
      empty.add(idS);
      withU.delete(idS);
    }
    this.writeIdSet(this.CC_WITH_KEY, withU);
    this.writeIdSet(this.CC_EMPTY_KEY, empty);
  },

  syncCcPresenceFromUnits() {
    const withU = this.readIdSet(this.CC_WITH_KEY);
    (this.state.units || []).forEach(u => {
      const id = String(u.enterpriseId || "");
      if (id) withU.add(id);
    });
    const empty = this.readIdSet(this.CC_EMPTY_KEY);
    withU.forEach(id => empty.delete(id));
    this.writeIdSet(this.CC_WITH_KEY, withU);
    this.writeIdSet(this.CC_EMPTY_KEY, empty);
  },

  filterCostCentersForEmp(ccs) {
    this.syncCcPresenceFromUnits();
    const empty = this.readIdSet(this.CC_EMPTY_KEY);
    const withU = this.readIdSet(this.CC_WITH_KEY);
    return (ccs || []).filter(c => {
      if (!c) return false;
      if (this.isDeptOnlyCc(c)) return false;
      if (empty.has(String(c.id))) return false;
      if (withU.size && !withU.has(String(c.id))) return false;
      return true;
    });
  },

  enterprisesForFilter() {
    const empty = this.readIdSet(this.CC_EMPTY_KEY);
    const fromUnits = new Set((this.state.units || []).map(u => String(u.enterpriseId || "")).filter(Boolean));
    let list = (this.state.enterprises || []).filter(cc =>
      this.isObraCc(cc.id) && !this.isDeptOnlyCc(cc) && !empty.has(String(cc.id))
    );
    if (fromUnits.size) list = list.filter(cc => fromUnits.has(String(cc.id)));
    return list.sort((a, b) => Number(a.id) - Number(b.id));
  },

  paintEmpSelect() {
    const sel = document.getElementById("est-filter-emp");
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = '<option value="">Todos os empreendimentos</option>';
    this.enterprisesForFilter().forEach(cc => {
      const opt = document.createElement("option");
      opt.value = String(cc.id);
      opt.textContent = this.ccLabel(cc);
      sel.appendChild(opt);
    });
    if (keep && this.enterprisesForFilter().some(cc => String(cc.id) === keep)) sel.value = keep;
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
    const rawNum = u.contractNumber != null && u.contractNumber !== ""
      ? u.contractNumber
      : (u.contractnumber != null && u.contractnumber !== ""
        ? u.contractnumber
        : u.currentSalesContractNumber);
    const contractNumber = rawNum == null || rawNum === "" ? null : String(rawNum);
    const contractId = u.contractId || u.salesContractId || u.currentSalesContractId || null;
    const bal = u.outstandingBalance;
    const balNum = bal == null || bal === "" ? null : Number(bal);
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
      outstandingBalance: balNum != null && !Number.isNaN(balNum) && balNum > 0.009 ? balNum : null,
      contractValue: u.totalSellingValue || u.value || null,
      situation: u.situation || "",
      quitado: false,
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
    this.state.loading = false;
    this.setBusy(false);
    this.renderPills();
    if (this.state.inited && this.state.units.length) {
      this.fillEnterprisesFromUnits();
      this.fillUnitSelect();
      this.updateMeta();
      this.renderTable();
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    if (this._initPromise) return this._initPromise;
    this._initPromise = this.loadFromCache();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  },

  fillEnterprisesFromUnits() {
    const byId = {};
    (this.state.units || []).forEach(u => {
      const id = String(u.enterpriseId || "");
      if (!id) return;
      if (!byId[id]) byId[id] = { id, name: u.enterpriseName || "" };
    });
    const fromUnits = Object.values(byId).sort((a, b) => Number(a.id) - Number(b.id));
    if (fromUnits.length) {
      const have = new Set(this.state.enterprises.map(c => String(c.id)));
      fromUnits.forEach(cc => {
        if (!have.has(String(cc.id))) this.state.enterprises.push(cc);
      });
      this.state.enterprises.sort((a, b) => Number(a.id) - Number(b.id));
    }
    this.syncCcPresenceFromUnits();
    this.paintEmpSelect();
  },

  async loadFromCache() {
    this.setProgress("Carregando estoque do Firebase…");
    try {
      await this.waitFirebase(8000);
      const fb = await this.loadFirebase();
      const local = this.loadCache();
      if (fb && fb.units.length) {
        this.applyCache(fb);
        this.state.firebaseOk = true;
      } else if (local && local.units && local.units.length) {
        this.applyCache(local);
      }
    } catch (e) {
      console.error("[Estoque] leitura cache", e);
    }
    this.fillEnterprisesFromUnits();
    this.fillUnitSelect();
    this.updateMeta();
    this.renderTable();
    this.setProgress("");
    if (window.lucide) window.lucide.createIcons();
    this.state.inited = true;
    this.loadEnterprises().then(() => {
      this.fillEnterprisesFromUnits();
      this.fillUnitSelect();
    }).catch(() => {});
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
    this.paintEmpSelect();
    if (keep && this.enterprisesForFilter().some(cc => String(cc.id) === keep)) sel.value = keep;
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
    if (next.contractNumber != null && next.contractNumber !== "") {
      next.contractNumber = String(next.contractNumber);
    } else {
      next.contractNumber = null;
    }
    return next;
  },

  isFakeContractNumber(u) {
    return !u || u.contractNumber == null || String(u.contractNumber) === "";
  },

  displayReceived(u) {
    if (!u) return "";
    if (u.receivedAmount != null && !Number.isNaN(Number(u.receivedAmount))) return this.money(u.receivedAmount);
    const val = u.contractValue != null ? Number(u.contractValue) : null;
    const bal = this.unitBalance(u);
    if (val != null && bal != null) return this.money(Math.max(0, val - bal));
    return "";
  },

  displayContract(u) {
    if (!u) return "";
    if (u.contractNumber != null && String(u.contractNumber).trim() !== "") return String(u.contractNumber);
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
    if (!this.isFinanceUnit(u)) return "—";
    if (u.relFin === "distratado" || String(u.situation || "").toLowerCase().includes("distrat")) return "Distratado";
    if (u.relFin === "quitado" || u.quitado) return "Quitado";
    if (u.relFin === "inadimplente" || this.isInadimplente(u)) return "Ativo inadimplente";
    if (u.relFin === "adimplente") return "Ativo adimplente";
    const bal = this.unitBalance(u);
    if (bal != null && Number(bal) > 0.009) return "Ativo adimplente";
    const fallback = this.defaultFinanceStatus(u);
    if (fallback === "quitado") return "Quitado";
    if (fallback === "inadimplente") return "Ativo inadimplente";
    if (fallback === "distratado") return "Distratado";
    return "Ativo adimplente";
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
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:#94a3b8;">Nenhuma unidade no estoque salvo. Se o Firebase já tem dados, atualize a página (Ctrl+F5).</td></tr>`;
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
        : (fin === "—" || fin === "Distratado" || bal == null
          ? "—"
          : this.money(bal));
      return `<tr>
        <td><span class="est-status-chip">${this.esc(status)}</span></td>
        <td>${this.esc(u.enterpriseId)} / ${this.esc(empName)}</td>
        <td>${this.esc(u.name)}</td>
        <td>${this.esc(this.mapCode(this.LEGAL_MAP, u.legalStock))}</td>
        <td>${this.esc(area)}</td>
        <td>${this.esc(contrato)}</td>
        <td style="text-align:right;white-space:nowrap;">${u.contractValue != null ? this.esc(this.money(u.contractValue)) : "—"}</td>
        <td style="text-align:right;white-space:nowrap;">${this.displayReceived(u) || "—"}</td>
        <td><span class="est-fin-chip ${finClass}">${this.esc(fin)}</span></td>
        <td style="text-align:right;white-space:nowrap;">${this.esc(saldo)}</td>
        <td style="white-space:nowrap;">${fin === "Quitado" && u.quitacaoDate
          ? this.esc(new Date(u.quitacaoDate + "T12:00:00").toLocaleDateString("pt-BR"))
          : "—"}</td>
      </tr>`;
    }).join("");
  },

  setBusy(on) {
    this.state.loading = !!on;
    ["est-btn-consultar", "est-btn-atualizar", "est-btn-contratos", "est-btn-batimento", "est-filter-emp", "est-filter-unit"].forEach(id => {
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
        receivedAmount: keep.receivedLocked ? keep.receivedAmount : (u.receivedAmount != null ? u.receivedAmount : keep.receivedAmount),
        receivedLocked: !!(keep.receivedLocked || u.receivedLocked),
        statementDone: !!(keep.statementDone || u.statementDone),
        quitacaoDate: keep.quitacaoDate || u.quitacaoDate || null,
        finAt: u.finAt || keep.finAt,
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
    if (!u) return false;
    const code = String(u.commercialStock || "").toUpperCase();
    const sold = this.SOLD_CODES.includes(code) || !!u.contractId;
    if (!sold) return false;
    if (this.isSettledUnit(u)) return false;
    if (!this.displayContract(u)) return true;
    if (this.unitBalance(u) == null) return true;
    return false;
  },

  needsContractEnrich() {
    if (this.state.contractsEnriched) {
      return this.state.units.some(u => this.needsContract(u));
    }
    return this.state.units.some(u => this.needsContract(u));
  },

  salePayable(c) {
    const v = c.outstandingBalance ?? c.currentBalance ?? c.balance ?? c.receivableBalance
      ?? c.totalOutstandingBalance ?? c.presentValue ?? c.debtBalance;
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  },

  isoDate(s) {
    if (!s) return null;
    const d = String(s).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  },

  lastBaixaFromExtractRow(row) {
    if (!row) return null;
    return this.lastBaixaFromReceipts(row.receipts);
  },

  digitsKey(s) {
    return String(s || "").replace(/\D/g, "");
  },

  docMatchesContract(doc, num) {
    if (!doc || !num) return false;
    const a = String(doc).replace(/\s/g, "").toUpperCase();
    const b = String(num).replace(/\s/g, "").toUpperCase();
    if (a.includes(b) || b.includes(a)) return true;
    const da = this.digitsKey(doc);
    const db = this.digitsKey(num);
    if (!da || !db) return false;
    return da === db || da.endsWith(db) || db.endsWith(da);
  },

  unitNameMatches(extractName, unitName) {
    const a = this.normName(extractName);
    const b = this.normName(unitName);
    if (!a || !b) return false;
    if (a === b) return true;
    const al = this.normNameLoose(extractName);
    const bl = this.normNameLoose(unitName);
    if (al && bl && al === bl) return true;
    return a.endsWith(b) || b.endsWith(a);
  },

  lastBaixaFromReceipts(receipts) {
    let last = null;
    (receipts || []).forEach(rec => {
      const t = String(rec.type || rec.receiptType || rec.receiptTypeId || rec.typeId || "").toLowerCase();
      if (t.includes("distrato") || t.includes("cancel") || t === "3" || t === "7") return;
      const d = this.isoDate(rec.date || rec.receiptDate || rec.paymentDate || rec.netReceiptDate);
      if (d && (!last || d > last)) last = d;
    });
    return last;
  },

  applyContractInfo(u, info) {
    if (!info) return u;
    const bal = info.outstandingBalance;
    const value = info.contractValue != null ? Number(info.contractValue) : (u.contractValue != null ? Number(u.contractValue) : null);
    const sit = String(info.situation || u.situation || "").toLowerCase();
    const distrato = sit.includes("distrat") || (info.active === false && !info.payOffDate);
    const sitQuit = /quit|pago|liquid|baixad/.test(sit);
    const hasOpenBal = bal != null && Number(bal) > 0.009;
    if (hasOpenBal) {
      let numOpen = info.contractNumber ? String(info.contractNumber) : "";
      if (numOpen && info.saleId != null && String(numOpen) === String(info.saleId) && this.displayContract(u)) {
        numOpen = this.displayContract(u);
      }
      let received = u.receivedAmount;
      let locked = !!u.receivedLocked;
      if (!locked && value != null) {
        received = Math.max(0, Number(value) - Number(bal));
        locked = true;
      }
      return {
        ...u,
        contractId: info.saleId || u.contractId,
        contractNumber: numOpen || u.contractNumber || null,
        receivableBillId: info.receivableBillId || u.receivableBillId,
        customerId: info.customerId || u.customerId,
        customerDoc: info.customerDoc || u.customerDoc,
        outstandingBalance: Number(bal),
        presentDebitBalance: Number(bal),
        contractValue: value != null ? value : u.contractValue,
        receivedAmount: received,
        receivedLocked: locked,
        situation: info.situation || u.situation,
        quitado: false,
        quitacaoDate: null,
        statementDone: false,
        finAt: new Date().toISOString()
      };
    }
    if (u.quitado && u.receivedLocked && u.statementDone) {
      return {
        ...u,
        contractNumber: u.contractNumber || info.contractNumber || null,
        receivableBillId: u.receivableBillId || info.receivableBillId,
        customerId: u.customerId || info.customerId,
        quitacaoDate: u.quitacaoDate || info.payOffDate || null
      };
    }
    const quitado = !distrato && (!!info.payOffDate || sitQuit);
    let num = info.contractNumber ? String(info.contractNumber) : "";
    if (num && info.saleId != null && String(num) === String(info.saleId) && this.displayContract(u)) {
      num = this.displayContract(u);
    }
    if (!num) num = this.displayContract(u) || "";
    let received = u.receivedAmount;
    let locked = !!u.receivedLocked;
    const nextBal = bal == null ? u.outstandingBalance : Number(bal);
    if (!locked && value != null && nextBal != null && !Number.isNaN(Number(nextBal)) && Number(nextBal) > 0.009) {
      received = Math.max(0, Number(value) - Number(nextBal));
      locked = true;
    }
    return {
      ...u,
      contractId: info.saleId || u.contractId,
      contractNumber: num || u.contractNumber || null,
      receivableBillId: info.receivableBillId || u.receivableBillId,
      customerId: info.customerId || u.customerId,
      customerDoc: info.customerDoc || u.customerDoc,
      outstandingBalance: nextBal,
      presentDebitBalance: info.presentDebitBalance != null ? Number(info.presentDebitBalance) : u.presentDebitBalance,
      contractValue: value != null ? value : u.contractValue,
      receivedAmount: received,
      receivedLocked: locked,
      situation: info.situation || u.situation,
      quitado: u.quitado || !!quitado,
      quitacaoDate: quitado ? (u.quitacaoDate || info.payOffDate || null) : null,
      finAt: new Date().toISOString()
    };
  },

  contractInfoFromSale(c) {
    const mainCust = (c.salesContractCustomers || []).find(x => x.main === true) || (c.salesContractCustomers || [])[0] || {};
    const num = c.number || c.contractNumber || c.documentNumber || c.salesContractNumber || "";
    const doc = mainCust.cpf || mainCust.cnpj || mainCust.cpfCnpj || c.customerCpf || c.customerCnpj || "";
    return {
      saleId: c.id,
      contractNumber: num ? String(num) : "",
      outstandingBalance: this.salePayable(c),
      contractValue: c.totalSellingValue || c.value || null,
      receivableBillId: c.receivableBillId || null,
      customerId: mainCust.id || c.customerId || null,
      customerDoc: String(doc || "").replace(/\D/g, ""),
      situation: c.situation || c.status || "",
      active: c.active,
      payOffDate: this.isoDate(c.payOffDate || c.payoffDate || c.quittanceDate || c.settlementDate || c.lastPaymentDate)
    };
  },

  cleanUnitKey(name, entId) {
    if (!name) return "";
    let clean = String(name).trim();
    if (entId) {
      const eStr = String(entId);
      if (clean === eStr) return "";
      if (clean.startsWith(eStr + " - ")) clean = clean.substring(eStr.length + 3);
      else if (clean.startsWith(eStr + "-")) clean = clean.substring(eStr.length + 1);
      else if (clean.startsWith(eStr + " ")) clean = clean.substring(eStr.length + 1);
    }
    return clean.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  },

  rememberContractNames(byName, raw, info) {
    if (!raw) return;
    const n = this.normName(raw);
    const l = this.normNameLoose(raw);
    if (n) byName[n] = info;
    if (l) byName[l] = info;
    const c = this.cleanUnitKey(raw);
    if (c) byName[c] = info;
  },

  async fetchContractsForCc(ccId) {
    const byId = {};
    const byName = {};
    const bySaleId = {};
    const byNumber = {};
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
        if (info.contractNumber) byNumber[String(info.contractNumber)] = info;
        if (info.receivableBillId) byNumber[String(info.receivableBillId)] = info;
        const units = c.salesContractUnits || c.units || c.salesContractBuildings || [];
        units.forEach(su => {
          const uid = su.unitId || su.buildingUnitId || su.id;
          if (uid) byId[String(uid)] = info;
          this.rememberContractNames(byName, su.name || su.unitName || su.unityName || su.unit, info);
        });
        if (c.unitId) byId[String(c.unitId)] = info;
        this.rememberContractNames(byName, c.unitName || c.unityName || c.unit, info);
      });
      if (results.length < this.LIMIT) hasMore = false;
      else offset += results.length;
    }
    return { byId, byName, bySaleId, byNumber };
  },

  pickSale(u, maps) {
    if (!u || !maps) return null;
    const clean = this.cleanUnitKey(u.name, u.enterpriseId);
    return maps.byId[String(u.id)]
      || (u.contractId != null ? maps.bySaleId[String(u.contractId)] : null)
      || (this.displayContract(u) ? maps.byNumber[this.displayContract(u)] : null)
      || (u.contractNumber ? maps.byNumber[String(u.contractNumber)] : null)
      || (u.receivableBillId ? maps.byNumber[String(u.receivableBillId)] : null)
      || maps.byName[this.normName(u.name)]
      || maps.byName[this.normNameLoose(u.name)]
      || (clean ? maps.byName[clean] : null)
      || null;
  },

  async enrichContracts(opts) {
    opts = opts || {};
    this.state.stopSync = false;
    const empSel = ((document.getElementById("est-filter-emp") || {}).value || "").trim();
    let pending = empSel
      ? [String(empSel)]
      : [...new Set(this.state.units.filter(u => this.needsContract(u)).map(u => String(u.enterpriseId)))];
    if (empSel) pending = pending.filter(id => id === String(empSel));
    if (!pending.length) {
      this.state.contractsEnriched = true;
      this.saveCache();
      this.setProgress("");
      this.updateMeta();
      this.renderTable();
      if (!opts.quiet) alert("Não há unidades vendidas pendentes de contrato/saldo.");
      return false;
    }
    if (!opts.keepBusy) this.setBusy(true);
    try {
      for (let i = 0; i < pending.length; i++) {
        if (this.state.stopSync) break;
        const ccId = pending[i];
        const falta = this.state.units.filter(u => String(u.enterpriseId) === ccId && this.needsContract(u)).length;
        this.setProgress(`Cruzando ${ccId} por unidade, id e número do contrato (${i + 1}/${pending.length}, ${falta} unidades)…`, ((i + 1) / pending.length) * 100);
        try {
          const maps = await this.fetchContractsForCc(ccId);
          this.state.units = this.state.units.map(u => {
            if (String(u.enterpriseId) !== String(ccId)) return u;
            if (this.isSettledUnit(u)) return u;
            const info = this.pickSale(u, maps);
            return info ? this.applyContractInfo(u, info) : u;
          });
          if (!this.state.contractsCcDone.includes(ccId)) this.state.contractsCcDone.push(ccId);
          this.saveCache();
          await this.saveFirebaseCc(ccId);
          this.renderTable();
        } catch (e) {
          console.error("[Estoque] contratos CC", ccId, e);
        }
        await this.sleep(80);
      }
      this.state.contractsEnriched = this.state.stopSync
        ? false
        : !this.state.units.some(u => this.needsContract(u));
      return !this.state.stopSync;
    } finally {
      if (!opts.keepBusy) {
        this.setBusy(false);
        this.setProgress(this.state.stopSync ? "Cruzamento interrompido. O que já cruzou ficou salvo." : "");
        this.state.stopSync = false;
        this.updateMeta();
        this.renderTable();
        if (window.lucide) window.lucide.createIcons();
      }
    }
  },

  isSoldUnit(u) {
    const code = String((u && u.commercialStock) || "").toUpperCase();
    return this.SOLD_CODES.includes(code) || !!(u && u.contractId);
  },

  isFinanceUnit(u) {
    if (!u) return false;
    const code = String(u.commercialStock || "").toUpperCase();
    return code === "V" || code === "O" || !!u.contractId || !!this.displayContract(u);
  },

  isSettledUnit(u) {
    if (!u) return false;
    return u.relFin === "quitado" || u.quitado === true;
  },

  defaultFinanceStatus(u) {
    if (String(u.situation || "").toLowerCase().includes("distrat")) return "distratado";
    if (this.isInadimplente(u)) return "inadimplente";
    if (this.displayContract(u) || u.contractId) return "adimplente";
    return "quitado";
  },

  needsStatement(u) {
    if (!u || this.isSettledUnit(u) || u.statementDone) return false;
    if (!this.isSoldUnit(u)) return false;
    if (!u.customerId) return false;
    return this.unitBalance(u) == null;
  },

  flattenStatements(res) {
    if (typeof window.mapaJuridicoFlattenStatements === "function") {
      return window.mapaJuridicoFlattenStatements(res);
    }
    const raw = (res && (res.results || res.data)) || [];
    const out = [];
    raw.forEach(item => {
      if (!item) return;
      if (Array.isArray(item.billsReceivable) && item.billsReceivable.length) {
        item.billsReceivable.forEach(b => out.push(b));
        return;
      }
      if (Array.isArray(item.bills) && item.bills.length) {
        item.bills.forEach(b => out.push(b));
        return;
      }
      if (item.installments || item.billReceivableId || item.receivableBillId) out.push(item);
    });
    return out;
  },

  kpisFromInstallments(installments) {
    let paid = 0;
    let due = 0;
    let upcoming = 0;
    const today = new Date().toISOString().split("T")[0];
    (installments || []).forEach(inst => {
      const cb = Number(inst.currentBalance != null ? inst.currentBalance : inst.balanceDue || 0);
      (inst.receipts || []).forEach(rec => {
        const rType = String(rec.type || rec.receiptType || rec.receiptTypeId || rec.typeId || rec.receiptId || "").toLowerCase();
        if (rType.includes("distrato") || rType.includes("cancel") || rType === "3" || rType === "7") return;
        paid += Number(rec.receiptValue || 0);
      });
      const dueDate = String(inst.dueDate || inst.originalDueDate || "").slice(0, 10);
      if (cb > 0.009 && dueDate && dueDate < today) due += cb;
      else if (cb > 0.009) upcoming += cb;
    });
    return { kpiPago: paid, kpiVencidas: due, kpiAVencer: upcoming };
  },

  billMatchesUnit(bill, u) {
    if (!bill || !u) return false;
    const billId = String(bill.billReceivableId || bill.receivableBillId || bill.id || "").replace(/^B-/, "").split("-")[0];
    if (u.receivableBillId && billId && String(u.receivableBillId) === billId) return true;
    const doc = String(bill.document || bill.contractNumber || "");
    const num = this.displayContract(u);
    if (num && doc && doc.replace(/\s/g, "").includes(String(num).replace(/\s/g, ""))) return true;
    const bName = this.normName(bill.unitName || bill.unityName || bill.unit || "");
    if (bName && bName === this.normName(u.name)) return true;
    return false;
  },

  applyStatementToUnit(u, bill) {
    const installments = (bill && bill.installments) || [];
    const kpis = this.kpisFromInstallments(installments);
    const aReceber = (Number(kpis.kpiVencidas) || 0) + (Number(kpis.kpiAVencer) || 0);
    const received = Number(kpis.kpiPago) || 0;
    const quitado = aReceber <= 0.009 && (received <= 0.009 || !u.contractValue || received >= Number(u.contractValue) * 0.8);
    const value = u.contractValue != null ? Number(u.contractValue) : (received + aReceber);
    return {
      ...u,
      receivableBillId: u.receivableBillId || bill.billReceivableId || bill.receivableBillId || null,
      outstandingBalance: aReceber > 0.009 ? aReceber : (quitado ? 0 : u.outstandingBalance),
      receivedAmount: u.receivedLocked && !quitado && aReceber <= 0.009 ? u.receivedAmount : received,
      receivedLocked: true,
      contractValue: value || u.contractValue,
      quitado: aReceber > 0.009 ? false : (u.quitado || quitado),
      quitacaoDate: aReceber > 0.009 ? null : (u.quitacaoDate || this.lastBaixaFromInstallments(installments) || null),
      statementDone: true,
      finAt: new Date().toISOString()
    };
  },

  lastBaixaFromInstallments(installments) {
    let last = null;
    (installments || []).forEach(inst => {
      const d = this.lastBaixaFromReceipts(inst.receipts);
      if (d && (!last || d > last)) last = d;
    });
    return last;
  },

  companyIdOfCc(ccId) {
    const cc = (this.state.enterprises || []).find(c => String(c.id) === String(ccId));
    if (cc && cc.companyId != null && cc.companyId !== "") return String(cc.companyId);
    const all = (window.AppState && AppState.cachedCostCenters) || [];
    const found = all.find(x => String(x.id) === String(ccId));
    return found && found.companyId != null ? String(found.companyId) : "";
  },

  extractRows(res) {
    if (!res) return [];
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.results)) return res.results;
    return [];
  },

  groupExtractByBill(rows, ccId) {
    const map = {};
    (rows || []).forEach(row => {
      if (!row) return;
      const rowCc = String(row.costCenterId || row.costCenter || "").trim();
      if (ccId && rowCc && rowCc !== String(ccId) && !String(rowCc).startsWith(String(ccId)) && !String(ccId).startsWith(rowCc)) {
        return;
      }
      const bid = String(row.billReceivableId || row.receivableBillId || "").replace(/^B-/, "").split("-")[0];
      if (!bid) return;
      if (!map[bid]) {
        map[bid] = { billId: bid, unitName: "", remaining: 0, lastBaixa: null, paid: 0, hasOpen: false, document: "", contractNumber: "" };
      }
      const g = map[bid];
      g.unitName = row.unitName || row.unityName || g.unitName;
      g.document = row.document || row.documentNumber || g.document;
      g.contractNumber = row.contractNumber || row.salesContractNumber || g.contractNumber;
      const bal = Number(row.currentBalance != null ? row.currentBalance : (row.currentBalanceWithAddition || 0));
      if (bal > 0.009) {
        g.hasOpen = true;
        g.remaining += bal;
      }
      const recLast = this.lastBaixaFromExtractRow(row);
      if (recLast && (!g.lastBaixa || recLast > g.lastBaixa)) g.lastBaixa = recLast;
      (row.receipts || []).forEach(rec => {
        const t = String(rec.type || rec.receiptType || "").toLowerCase();
        if (t.includes("distrato") || t.includes("cancel")) return;
        g.paid += Number(rec.netReceipt || rec.receiptValue || rec.value || 0);
      });
    });
    return map;
  },

  extractFitsUnit(u, g) {
    if (!u || !g) return false;
    if (u.receivableBillId && String(g.billId) === String(u.receivableBillId).replace(/^B-/, "").split("-")[0]) {
      if (!g.unitName || this.unitNameMatches(g.unitName, u.name)) return true;
    }
    const num = this.displayContract(u);
    if (num && (this.docMatchesContract(g.document, num) || this.docMatchesContract(g.contractNumber, num) || this.docMatchesContract(g.billId, num))) {
      return true;
    }
    if (this.unitNameMatches(g.unitName, u.name)) return true;
    return false;
  },

  pickExtractForUnit(u, byBill) {
    if (!u || !byBill) return null;
    if (u.receivableBillId) {
      const hit = byBill[String(u.receivableBillId)] || byBill[String(u.receivableBillId).replace(/^B-/, "").split("-")[0]];
      if (hit && this.extractFitsUnit(u, hit)) return hit;
    }
    const num = this.displayContract(u);
    let byDoc = null;
    let byName = null;
    Object.values(byBill).forEach(g => {
      if (num && (this.docMatchesContract(g.document, num) || this.docMatchesContract(g.contractNumber, num) || this.docMatchesContract(g.billId, num))) {
        byDoc = g;
      } else if (this.unitNameMatches(g.unitName, u.name)) {
        byName = g;
      }
    });
    return byDoc || byName;
  },

  applyExtractQuitado(u, g) {
    if (!u || !g) return u;
    if (g.hasOpen || g.remaining > 0.009) {
      const received = g.paid != null ? g.paid : u.receivedAmount;
      return {
        ...u,
        receivableBillId: u.receivableBillId || g.billId,
        outstandingBalance: g.remaining,
        presentDebitBalance: g.remaining,
        receivedAmount: received,
        receivedLocked: true,
        quitado: false,
        quitacaoDate: null,
        statementDone: true,
        finAt: new Date().toISOString()
      };
    }
    const paid = Number(g.paid) || 0;
    const contract = Number(u.contractValue) || 0;
    const lastBaixa = g.lastBaixa || null;
    if (!lastBaixa && paid <= 0.009) return u;
    if (contract > 1 && paid > 0.009 && paid < contract * 0.8) {
      return {
        ...u,
        receivableBillId: u.receivableBillId || g.billId,
        statementDone: false
      };
    }
    const received = u.receivedLocked && u.quitado ? u.receivedAmount : (paid || u.receivedAmount);
    return {
      ...u,
      receivableBillId: u.receivableBillId || g.billId,
      outstandingBalance: 0,
      receivedAmount: received,
      receivedLocked: true,
      quitado: true,
      quitacaoDate: lastBaixa || u.quitacaoDate || null,
      statementDone: true,
      finAt: new Date().toISOString()
    };
  },

  async fetchExtractByCompany(companyId) {
    if (window.SiengeApiService && typeof SiengeApiService.getCustomerExtractHistoryByCompany === "function") {
      return SiengeApiService.getCustomerExtractHistoryByCompany(companyId);
    }
    const endYear = new Date().getFullYear() + 24;
    const endDueDate = `${endYear}-01-01`;
    return this.siengeFetch(`/bulk-data/v1/customer-extract-history?startDueDate=1996-01-01&endDueDate=${endDueDate}&companyId=${companyId}&documentsId=CT&includeRemadeInstallments=false&includeCanceledInstallments=true&includeRevokedInstallments=true&includeRenegotiatedDischarge=false`);
  },

  applyExtractMap(ccId, byBill) {
    let marked = 0;
    this.state.units = this.state.units.map(u => {
      if (String(u.enterpriseId) !== String(ccId) || !this.isSoldUnit(u) || this.isSettledUnit(u)) return u;
      const g = this.pickExtractForUnit(u, byBill);
      if (!g) return u;
      const next = this.applyExtractQuitado(u, g);
      if (next.quitado !== u.quitado || next.quitacaoDate !== u.quitacaoDate || next.outstandingBalance !== u.outstandingBalance) {
        marked += 1;
      }
      return next;
    });
    return marked;
  },

  async fetchSaleByNumber(number, enterpriseId) {
    const num = String(number || "").trim();
    if (!num) return null;
    try {
      let path = `/sales-contracts?limit=20&offset=0&number=${encodeURIComponent(num)}`;
      if (enterpriseId) path += `&enterpriseId=${enterpriseId}`;
      const res = await this.siengeFetch(path);
      const list = (res && res.results) || [];
      return list.find(c => String(c.number || c.contractNumber || "") === num) || list[0] || null;
    } catch (e) {
      console.warn("[Estoque] sales-contracts number", num, e);
      return null;
    }
  },

  async applyExtractByBill(u) {
    const billId = u && u.receivableBillId;
    if (!billId || !window.SiengeApiService || typeof SiengeApiService.getCustomerExtractHistoryByBill !== "function") return u;
    try {
      const res = await SiengeApiService.getCustomerExtractHistoryByBill(billId);
      const byBill = this.groupExtractByBill(this.extractRows(res), null);
      const g = byBill[String(billId)] || this.pickExtractForUnit(u, byBill);
      return g ? this.applyExtractQuitado(u, g) : u;
    } catch (e) {
      console.warn("[Estoque] extrato por título", billId, e);
      return u;
    }
  },

  async lookupMissingQuitados(ccId) {
    const leftover = this.state.units.filter(u =>
      String(u.enterpriseId) === String(ccId)
      && this.isSoldUnit(u)
      && !u.quitado
      && (this.displayContract(u) || u.receivableBillId)
    );
    let marked = 0;
    for (let i = 0; i < leftover.length; i++) {
      if (this.state.stopSync) break;
      const u0 = leftover[i];
      this.setProgress(`Títulos sem match no extrato bulk (${i + 1}/${leftover.length}): contrato ${this.displayContract(u0) || u0.name}…`);
      let u = this.state.units.find(x => String(x.id) === String(u0.id));
      if (!u) continue;
      const raw = await this.fetchSaleByNumber(this.displayContract(u), u.enterpriseId);
      if (raw) u = this.applyContractInfo(u, this.contractInfoFromSale(raw));
      if (u.receivableBillId) u = await this.applyExtractByBill(u);
      const idx = this.state.units.findIndex(x => String(x.id) === String(u0.id));
      if (idx >= 0) {
        if (u.quitado && !this.state.units[idx].quitado) marked += 1;
        else if (u.quitacaoDate && u.quitacaoDate !== this.state.units[idx].quitacaoDate) marked += 1;
        this.state.units[idx] = u;
      }
      await this.sleep(80);
    }
    return marked;
  },

  async enrichQuitadosFromExtract(ccId) {
    const companyId = this.companyIdOfCc(ccId);
    if (!companyId) {
      this.setProgress(`Sem empresa do centro ${ccId} para o extrato bulk. Rode depois de carregar os centros de custo.`);
      return await this.lookupMissingQuitados(ccId);
    }
    this.setProgress(`Lendo extrato histórico da empresa ${companyId} (quitados de ${ccId})…`);
    const res = await this.fetchExtractByCompany(companyId);
    const rows = this.extractRows(res);
    let marked = this.applyExtractMap(ccId, this.groupExtractByBill(rows, ccId));
    const still = this.state.units.some(u => String(u.enterpriseId) === String(ccId) && this.isSoldUnit(u) && !u.quitado);
    if (still && rows.length) {
      marked += this.applyExtractMap(ccId, this.groupExtractByBill(rows, null));
    }
    if (this.state.units.some(u => String(u.enterpriseId) === String(ccId) && this.isSoldUnit(u) && !u.quitado)) {
      marked += await this.lookupMissingQuitados(ccId);
    }
    this.saveCache();
    await this.saveFirebaseCc(ccId);
    this.renderTable();
    return marked;
  },

  statementQueue(empSel) {
    const rows = this.state.units.filter(u => {
      if (empSel && String(u.enterpriseId) !== String(empSel)) return false;
      return this.needsStatement(u);
    });
    const byCust = new Map();
    rows.forEach(u => {
      const id = String(u.customerId);
      if (!byCust.has(id)) byCust.set(id, []);
      byCust.get(id).push(u);
    });
    return [...byCust.entries()];
  },

  async enrichStatements() {
    const empSel = ((document.getElementById("est-filter-emp") || {}).value || "").trim();
    const queue = this.statementQueue(empSel);
    if (!queue.length) return 0;
    const fn = window.SiengeApiService && SiengeApiService.getCustomerFinancialStatements;
    if (typeof fn !== "function") {
      alert("Extrato financeiro do Sienge indisponível nesta sessão.");
      return 0;
    }
    let done = 0;
    const dirtyCc = new Set();
    for (let i = 0; i < queue.length; i++) {
      if (this.state.stopSync) break;
      const [customerId, units] = queue[i];
      this.setProgress(`Extrato ${i + 1}/${queue.length} (cliente ${customerId}) — só quem ainda não tem saldo…`, ((i + 1) / queue.length) * 100);
      try {
        const res = await fn.call(SiengeApiService, customerId);
        const bills = this.flattenStatements(res);
        const idSet = new Set(units.map(u => String(u.id)));
        this.state.units = this.state.units.map(u => {
          if (!idSet.has(String(u.id))) return u;
          const bill = bills.find(b => this.billMatchesUnit(b, u)) || (units.length === 1 && bills.length === 1 ? bills[0] : null);
          if (!bill) {
            if (!bills.length) {
              dirtyCc.add(String(u.enterpriseId));
              return { ...u, statementDone: true, finAt: new Date().toISOString() };
            }
            return u;
          }
          dirtyCc.add(String(u.enterpriseId));
          return this.applyStatementToUnit(u, bill);
        });
        done += 1;
        if (done % 8 === 0) {
          this.saveCache();
          for (const cc of dirtyCc) await this.saveFirebaseCc(cc);
          dirtyCc.clear();
          this.renderTable();
        }
      } catch (e) {
        console.warn("[Estoque] extrato", customerId, e);
      }
      await this.sleep(120);
    }
    this.saveCache();
    for (const cc of dirtyCc) await this.saveFirebaseCc(cc);
    this.renderTable();
    return done;
  },

  classifyReceivableBill(b) {
    if (!b) return "adimplente";
    const sit = String(b.status || b.situation || "").toUpperCase();
    if ((b.active === false && !b.payOffDate) || sit === "CANCELED" || sit === "DISTRATO") return "distratado";
    if (b.payOffDate || sit === "QUIT" || sit === "QUITADO") return "quitado";
    if (b.defaulting) return "inadimplente";
    if (b.active !== false && !b.payOffDate && b.dueDate) {
      try {
        const due = new Date(b.dueDate).toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];
        if (due < today) return "inadimplente";
      } catch (e) {}
    }
    return "adimplente";
  },

  classifyUnitBills(bills) {
    const list = (bills || []).filter(Boolean);
    if (!list.length) return null;
    const ranks = list.map(b => this.classifyReceivableBill(b));
    if (ranks.every(s => s === "distratado")) return "distratado";
    if (ranks.every(s => s === "quitado")) return "quitado";
    if (ranks.some(s => s === "inadimplente")) return "inadimplente";
    return "adimplente";
  },

  billMatchesEstoqueUnit(b, u) {
    if (!b || !u) return false;
    const bid = String(b.id || b.receivableBillId || b.billReceivableId || "");
    if (u.receivableBillId && bid && String(u.receivableBillId) === bid) return true;
    const bEnt = String(b.enterpriseId || b.costCenterId || "");
    if (bEnt && String(u.enterpriseId) !== bEnt) return false;
    const bName = b.unityName || b.unitName || b.unit || "";
    const uk = this.cleanUnitKey(u.name, u.enterpriseId);
    const bk = this.cleanUnitKey(bName, bEnt || u.enterpriseId);
    if (uk && bk && uk === bk) return true;
    if (this.unitNameMatches(bName, u.name)) return true;
    return false;
  },

  applyRelFin(u, status, bill) {
    const next = {
      ...u,
      relFin: status,
      statementDone: true,
      finAt: new Date().toISOString()
    };
    if (bill) {
      const bid = bill.id || bill.receivableBillId || bill.billReceivableId;
      if (bid) next.receivableBillId = u.receivableBillId || bid;
    }
    if (status === "quitado") {
      next.quitado = true;
      next.outstandingBalance = 0;
      next.presentDebitBalance = 0;
      next.quitacaoDate = this.isoDate(bill && (bill.payOffDate || bill.payoffDate)) || u.quitacaoDate || null;
    } else if (status === "distratado") {
      next.quitado = false;
      next.quitacaoDate = null;
      next.situation = u.situation || "Distratado";
    } else {
      next.quitado = false;
      next.quitacaoDate = null;
      if (status === "inadimplente") {
        const ov = this.overdueValue(next);
        if (ov > 0.009 && next.outstandingBalance == null) next.outstandingBalance = ov;
      }
    }
    return next;
  },

  applyFichaMoney(u, installments, status, rb) {
    const kpis = this.kpisFromInstallments(installments);
    const aReceber = (Number(kpis.kpiVencidas) || 0) + (Number(kpis.kpiAVencer) || 0);
    const received = Number(kpis.kpiPago) || 0;
    let fin = status;
    if (kpis.kpiVencidas <= 0.009 && kpis.kpiAVencer <= 0.009) fin = "quitado";
    else if (kpis.kpiVencidas > 0.009) fin = "inadimplente";
    else if (aReceber > 0.009) fin = "adimplente";
    const next = this.applyRelFin(u, fin, rb);
    next.receivedAmount = received;
    next.receivedLocked = true;
    next.outstandingBalance = aReceber;
    next.presentDebitBalance = aReceber;
    next.kpiVencidas = kpis.kpiVencidas;
    next.kpiAVencer = kpis.kpiAVencer;
    if (fin === "quitado") {
      next.quitado = true;
      next.outstandingBalance = 0;
      next.presentDebitBalance = 0;
      next.quitacaoDate = this.lastBaixaFromInstallments(installments)
        || this.isoDate(rb && (rb.payOffDate || rb.payoffDate))
        || u.quitacaoDate
        || null;
    }
    return next;
  },

  async fetchStatementsCached(customerId) {
    const id = String(customerId || "");
    if (!id) return [];
    if (!this.state.stCache) this.state.stCache = {};
    if (this.state.stCache[id]) return this.state.stCache[id];
    const fn = window.SiengeApiService && SiengeApiService.getCustomerFinancialStatements;
    if (typeof fn !== "function") return [];
    try {
      const res = await fn.call(SiengeApiService, id);
      const rows = this.flattenStatements(res);
      this.state.stCache[id] = rows;
      return rows;
    } catch (e) {
      console.warn("[Estoque] extrato ficha", id, e);
      this.state.stCache[id] = [];
      return [];
    }
  },

  async fetchReceivableBillsCached(customerId) {
    const id = String(customerId || "");
    if (!id) return [];
    if (!this.state.rbCache) this.state.rbCache = {};
    if (this.state.rbCache[id]) return this.state.rbCache[id];
    const fn = window.SiengeApiService && SiengeApiService.getReceivableBills;
    if (typeof fn !== "function") return [];
    try {
      const res = await fn.call(SiengeApiService, id);
      const rows = this.extractRows(res);
      this.state.rbCache[id] = rows;
      return rows;
    } catch (e) {
      console.warn("[Estoque] receivable-bills", id, e);
      this.state.rbCache[id] = [];
      return [];
    }
  },

  async applyRelacionamentoBatimento(ccId) {
    this.buildDefaulterIndex();
    const sold = this.state.units.filter(u => String(u.enterpriseId) === String(ccId) && this.isFinanceUnit(u));
    const byCust = new Map();
    sold.forEach(u => {
      if (this.isSettledUnit(u) || !u.customerId) return;
      const id = String(u.customerId);
      if (!byCust.has(id)) byCust.set(id, []);
      byCust.get(id).push(u);
    });
    const custIds = [...byCust.keys()];
    let marked = 0;
    for (let i = 0; i < custIds.length; i++) {
      if (this.state.stopSync) break;
      const customerId = custIds[i];
      this.setProgress(`Valores da ficha ${i + 1}/${custIds.length} — cliente ${customerId}…`, ((i + 1) / Math.max(custIds.length, 1)) * 100);
      const bills = await this.fetchReceivableBillsCached(customerId);
      const statements = await this.fetchStatementsCached(customerId);
      const unitIds = new Set(byCust.get(customerId).map(u => String(u.id)));
      this.state.units = this.state.units.map(u => {
        if (!unitIds.has(String(u.id))) return u;
        const mine = bills.filter(b => this.billMatchesEstoqueUnit(b, u));
        const stmt = statements.find(s => {
          const sid = String(s.billReceivableId || s.receivableBillId || s.id || "").replace(/^B-/, "").split("-")[0];
          if (mine.some(b => String(b.id || b.receivableBillId || "") === sid)) return true;
          return this.billMatchesUnit(s, u) || this.billMatchesEstoqueUnit(s, u);
        }) || (statements.length === 1 && unitIds.size === 1 ? statements[0] : null);
        const status = this.classifyUnitBills(mine)
          || (this.isInadimplente(u) ? "inadimplente" : this.defaultFinanceStatus(u));
        const rb = mine
          .filter(b => this.classifyReceivableBill(b) === status)
          .sort((a, b) => String(b.payOffDate || "").localeCompare(String(a.payOffDate || "")))[0]
          || mine[0]
          || null;
        if (stmt && (stmt.installments || []).length) {
          marked += 1;
          return this.applyFichaMoney(u, stmt.installments, status || "adimplente", rb || stmt);
        }
        marked += 1;
        return this.applyRelFin(u, status, rb);
      });
      if ((i + 1) % 10 === 0) {
        this.saveCache();
        this.renderTable();
      }
      await this.sleep(90);
    }
    this.state.units = this.state.units.map(u => {
      if (String(u.enterpriseId) !== String(ccId) || !this.isFinanceUnit(u) || u.relFin || this.isSettledUnit(u)) return u;
      marked += 1;
      return this.applyRelFin(u, this.defaultFinanceStatus(u), null);
    });
    this.saveCache();
    await this.saveFirebaseCc(ccId);
    this.renderTable();
    return marked;
  },

  async batimentoFinanceiro() {
    try {
      if (this.state.loading) return;
      if (!this.state.units.length) await this.init();
      if (!this.state.units.length) {
        alert("Não há estoque salvo. Use Atualizar unidades uma vez.");
        return;
      }
      const empSel = ((document.getElementById("est-filter-emp") || {}).value || "").trim();
      if (!this.state.enterprises.length) await this.loadEnterprises();
      let ccIds = empSel
        ? [empSel]
        : [...new Set(this.state.units
          .filter(u => this.isFinanceUnit(u) && u.enterpriseId)
          .map(u => String(u.enterpriseId)))];
      ccIds = ccIds.filter(id => {
        const cc = this.state.enterprises.find(c => String(c.id) === String(id)) || { id, name: this.empName(id) };
        return !this.isDeptOnlyCc(cc) && !this.readIdSet(this.CC_EMPTY_KEY).has(String(id));
      });
      if (!ccIds.length) {
        alert("Não há empreendimentos com unidades para bater. Baixe as unidades do Sienge ou escolha um centro que tenha lote.");
        return;
      }
      this.state.stopSync = false;
      this.setBusy(true);
      await this.enrichContracts({ quiet: true, keepBusy: true });
      if (this.state.stopSync) return;
      let marked = 0;
      for (let i = 0; i < ccIds.length; i++) {
        if (this.state.stopSync) break;
        const ccId = ccIds[i];
        const soldN = this.state.units.filter(u => String(u.enterpriseId) === String(ccId) && this.isSoldUnit(u)).length;
        this.setProgress(`Batimento ${i + 1}/${ccIds.length} — ${ccId} (${soldN} vendidas)…`, ((i + 1) / ccIds.length) * 100);
        marked += await this.applyRelacionamentoBatimento(ccId);
      }
      const inScope = u => !empSel || String(u.enterpriseId) === empSel;
      const qtdQ = this.state.units.filter(u => inScope(u) && this.financialStatus(u) === "Quitado").length;
      const qtdI = this.state.units.filter(u => inScope(u) && this.financialStatus(u) === "Ativo inadimplente").length;
      const qtdA = this.state.units.filter(u => inScope(u) && this.financialStatus(u) === "Ativo adimplente").length;
      this.paintEmpSelect();
      this.setProgress(`Batimento (${ccIds.length} empreendimento(s), mesma lógica do Relacionamento): ${qtdQ} quitados · ${qtdI} inadimplentes · ${qtdA} adimplentes · ${marked} unidade(s) classificada(s).`);
    } catch (e) {
      console.error("[Estoque] batimento", e);
      alert("Erro no batimento: " + (e.message || e));
    } finally {
      this.setBusy(false);
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
    const byNum = await this.fetchSaleByNumber(this.displayContract(u), u.enterpriseId);
    if (byNum) return byNum;
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

  async fetchUnitFromSienge(u) {
    if (!u || !u.enterpriseId) return null;
    const qName = u.name ? `&name=${encodeURIComponent(u.name)}` : "";
    try {
      const data = await this.siengeFetch(`/units?limit=20&offset=0&enterpriseId=${u.enterpriseId}${qName}&additionalData=NONE`);
      const list = (data && data.results) || [];
      const hit = list.find(x => String(x.id) === String(u.id))
        || list.find(x => this.normName(x.name) === this.normName(u.name))
        || null;
      return hit;
    } catch (e) {
      console.warn("[Estoque] units lookup", u.id, e);
      return null;
    }
  },

  async hydrateUnitById(unitId) {
    const idx = this.state.units.findIndex(x => String(x.id) === String(unitId));
    if (idx < 0) return;
    let u = this.sanitizeUnit(this.state.units[idx]);
    if (this.isSettledUnit(u)) {
      this.setProgress("Contrato quitado — sem consultas auxiliares.");
      this.renderTable();
      return;
    }
    this.setProgress(`Consultando contrato da unidade ${u.name}…`);
    const fromUnits = await this.fetchUnitFromSienge(u);
    if (fromUnits) {
      const slim = this.slimUnit(fromUnits, u.enterpriseName);
      u = this.sanitizeUnit({
        ...u,
        contractId: slim.contractId || u.contractId,
        contractNumber: slim.contractNumber || u.contractNumber,
        commercialStock: slim.commercialStock || u.commercialStock,
        area: slim.area != null ? slim.area : u.area
      });
    }
    const raw = await this.fetchSaleForUnit(u);
    if (raw) {
      const info = this.contractInfoFromSale(raw);
      info.customerDoc = info.customerDoc || this.customerDocFromContract(raw);
      u = this.applyContractInfo(u, info);
    }
    if (u.receivableBillId) {
      this.setProgress(`Consultando extrato do título ${u.receivableBillId}…`);
      u = await this.applyExtractByBill(u);
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
          if (present === 0 && u.statementDone) u.quitado = true;
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

  async cruzarContratos() {
    try {
      if (this.state.loading) return;
      if (!this.state.units.length) await this.init();
      if (!this.state.units.length) {
        alert("Não há estoque salvo. Use Atualizar unidades uma vez.");
        return;
      }
      await this.enrichContracts();
    } catch (e) {
      console.error("[Estoque] cruzar", e);
      this.setBusy(false);
      alert("Erro ao cruzar contratos: " + (e.message || e));
    }
  },

  async consultar(forceRefresh) {
    try {
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

    const empSel = ((document.getElementById("est-filter-emp") || {}).value || "").trim();
    const empty = this.readIdSet(this.CC_EMPTY_KEY);
    const targets = (empSel
      ? this.state.enterprises.filter(cc => String(cc.id) === empSel)
      : this.state.enterprises
    ).filter(cc => !this.isDeptOnlyCc(cc) && !empty.has(String(cc.id)));
    if (empSel && !targets.length) {
      alert("Selecione um empreendimento válido para atualizar as unidades.");
      return;
    }

    const prev = this.state.units.slice();
    this.state.stopSync = false;
    if (!empSel) {
      this.state.units = [];
      this.state.ccDone = [];
      this.state.complete = false;
      this.state.fetchedAt = null;
    }
    this._prevQuitados = prev;

    this.setBusy(true);
    try {
      const total = targets.length;
      let done = 0;
      for (const cc of targets) {
        if (this.state.stopSync) break;
        done += 1;
        this.setProgress(`Buscando ${this.ccLabel(cc)} (${done}/${total})…`, (done / total) * 100);
        try {
          let batch = await this.fetchUnitsForCc(cc);
          this.markCcUnits(cc.id, batch.length > 0);
          if (!batch.length) {
            this.state.units = this.state.units.filter(u => String(u.enterpriseId) !== String(cc.id));
            this.paintEmpSelect();
            continue;
          }
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
      if (!empSel) this.state.complete = !this.state.stopSync;
      this._prevQuitados = null;
      this.saveCache();
      this.setProgress(this.state.stopSync ? "Atualização interrompida. O que já baixou ficou salvo." : "");
      this.fillUnitSelect();
      this.paintEmpSelect();
      this.updateMeta();
      this.renderTable();
    } finally {
      this.setBusy(false);
      this.state.stopSync = false;
      if (window.lucide) window.lucide.createIcons();
    }
    } catch (e) {
      console.error("[Estoque] consultar", e);
      this.setBusy(false);
      alert("Erro na consulta: " + (e.message || e));
    }
  }
};

window.EstoqueComercialApp = EstoqueComercialApp;

document.addEventListener("tabChanged", function(e) {
  if (e.detail === "estoque-comercial") {
    EstoqueComercialApp.init();
  }
});
