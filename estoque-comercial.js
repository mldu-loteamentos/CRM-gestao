const EstoqueComercialApp = {
  CACHE_KEY: "crm_estoque_posicao_v1",
  FIN_KEY: "crm_estoque_fin_v1",
  FB_COL: "estoque_comercial",
  CC_WITH_KEY: "crm_cc_ids_com_unidade",
  CC_EMPTY_KEY: "crm_cc_ids_sem_unidade",
  LIMIT: 200,
  FB_CHUNK: 400,
  /** Firestore recusa documento acima de 1 MiB (contado em bytes UTF-8, com nomes de campo); com parcelas abertas 400 unidades passam disso. */
  FB_DOC_BYTES: 600000,
  /** Censo pesado fica no cron. No browser o automático é diário (delta + fila). */
  BATIMENTO_AUTO_PAUSED: false,
  BATIMENTO_AUTO_DELTA: true,
  /**
   * Modo "delta" para reduzir consumo de API no batimento diário:
   * recalcula só clientes que tiveram pagamento recente (via paidMap do app).
   */
  BATIMENTO_DELTA_ENABLED: true,
  BATIMENTO_DELTA_DAYS: 5,
  BATIMENTO_DELTA_MAX_CUSTOMERS: 1200,
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
    batimentoDate: null,
    batimentoAt: null,
    batimentoDone: false,
    complete: false,
    contractsEnriched: false,
    contractsCcDone: [],
    firebaseOk: false,
    inited: false,
    stopSync: false,
    defaulterIndex: null,
    _autoFinanceRunning: false,
    _autoFinanceRanFor: null,
    tablePage: 0,
    sortKey: "emp",
    sortDir: "asc"
  },

  PAGE: 60,

  todayStr() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().split("T")[0];
    }
  },

  isObraCc(id) {
    const s = String(id || "").trim();
    return s.charAt(0) === "1" || s.charAt(0) === "2" || s.charAt(0) === "3";
  },

  /** Empreendimentos comerciais (estoque/venda): IDs 1xxxx ou 2xxxx. */
  isEmpreendimentoCcId(id) {
    const s = String(id || "").trim();
    return s.charAt(0) === "1" || s.charAt(0) === "2";
  },

  foldCcName(s) {
    return String(s || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  },

  isDeptOnlyCc(cc) {
    const name = this.foldCcName(cc && typeof cc === "object" ? cc.name : cc);
    if (!name) return false;
    // "… - OBRA", "… - OBRAS", "… MLES (OBRAS)" etc.
    if (/\bOBRAS?\b/.test(name)) return true;
    const parts = name.split(" - ").map(p => p.trim()).filter(Boolean);
    const tail = parts[parts.length - 1] || "";
    const deptTails = [
      "OBRAS",
      "OBRA",
      "MARKETING",
      "COMERCIAL",
      "GESTAO DE PRODUTOS",
      "PARCERIA",
      "NOVOS NEGOCIOS",
      "PROJETOS"
    ];
    if (deptTails.includes(tail)) return true;
    return deptTails.some((d) => tail.endsWith(" " + d) || tail.includes("(" + d + ")"));
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
    // Inventário em memória (estoque carregado). Não usa só crm_cc_ids_com_unidade
    // do localStorage — cache incompleto escondia CCs válidos (ex.: Bianca).
    const fromUnits = new Set(
      (this.state.units || []).map((u) => String(u.enterpriseId || "")).filter(Boolean)
    );
    return (ccs || []).filter(c => {
      if (!c) return false;
      const id = String(c.id || "").trim();
      if (!this.isEmpreendimentoCcId(id)) return false;
      if (this.isDeptOnlyCc(c)) return false;
      if (empty.has(id)) return false;
      if (fromUnits.size && !fromUnits.has(id)) return false;
      return true;
    });
  },

  /** IDs 1/2 + loteamento/incorporação + com unidade (quando inventário conhecido). */
  filterEmpreendimentosLikeRelacionamento(ccs) {
    let customFields = {};
    try {
      customFields = JSON.parse(localStorage.getItem("crm_centros_custo_custom") || "{}") || {};
    } catch (e) {
      customFields = {};
    }
    const typed = (ccs || []).filter((c) => {
      if (!c) return false;
      if (!this.isEmpreendimentoCcId(c.id)) return false;
      if (this.isDeptOnlyCc(c)) return false;
      const custom = customFields[c.id] || customFields[String(c.id)] || {};
      const tipo = custom.tipo_cc || "";
      return tipo === "Loteamento Aberto" || tipo === "Loteamento Fechado" || tipo === "Incorporação";
    });
    return this.filterCostCentersForEmp(typed);
  },

  enterprisesForFilter() {
    const empty = this.readIdSet(this.CC_EMPTY_KEY);
    const fromUnits = new Set((this.state.units || []).map(u => String(u.enterpriseId || "")).filter(Boolean));
    let list = (this.state.enterprises || []).filter(cc =>
      this.isEmpreendimentoCcId(cc.id) && !this.isDeptOnlyCc(cc) && !empty.has(String(cc.id))
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
      quitado: !!(u.quitado || u.relFin === "quitado"),
      quitacaoDate: this.isoQuitacao(
        u.quitacaoDate || u.payOffDate || u.payoffDate || u.quittanceDate || u.settlementDate
      ),
      area: u.totalArea || u.privateArea || u.indexedPrivateArea || null
    };
  },

  loadFinanceOverlay() {
    try {
      const raw = localStorage.getItem(this.FIN_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && Array.isArray(data.items) ? data.items : null;
    } catch (e) {
      return null;
    }
  },

  financeOverlayDate() {
    try {
      const data = JSON.parse(localStorage.getItem(this.FIN_KEY) || "null");
      return (data && data.date) || null;
    } catch (e) {
      return null;
    }
  },

  // Firestore rejeita o documento inteiro se houver undefined, função ou NaN em qualquer unidade.
  fbClean(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  },

  fbBytes(value) {
    const json = JSON.stringify(value == null ? null : value);
    if (!this._fbEncoder && typeof TextEncoder !== "undefined") this._fbEncoder = new TextEncoder();
    return this._fbEncoder ? this._fbEncoder.encode(json).length : json.length * 2;
  },

  fbChunks(list) {
    const out = [];
    let cur = [];
    let bytes = 0;
    (list || []).forEach((u) => {
      const size = this.fbBytes(u) + 2;
      if (cur.length && (cur.length >= this.FB_CHUNK || bytes + size > this.FB_DOC_BYTES)) {
        out.push(cur);
        cur = [];
        bytes = 0;
      }
      cur.push(u);
      bytes += size;
    });
    if (cur.length) out.push(cur);
    return out;
  },

  financeLite(u) {
    if (!u) return null;
    return {
      id: u.id,
      relFin: u.relFin || null,
      quitado: !!u.quitado,
      statementDone: !!u.statementDone,
      receivedLocked: !!u.receivedLocked,
      censusAt: u.censusAt || null,
      contractNumber: u.contractNumber || null,
      contractId: u.contractId || null,
      receivableBillId: u.receivableBillId || null,
      customerId: u.customerId || null,
      customerDoc: u.customerDoc || "",
      customerName: u.customerName || "",
      contractValue: u.contractValue != null ? Number(u.contractValue) : null,
      receivedAmount: u.receivedAmount != null ? Number(u.receivedAmount) : null,
      outstandingBalance: u.outstandingBalance != null ? Number(u.outstandingBalance) : null,
      presentDebitBalance: u.presentDebitBalance != null ? Number(u.presentDebitBalance) : null,
      kpiVencidas: u.kpiVencidas != null ? Number(u.kpiVencidas) : null,
      kpiAVencer: u.kpiAVencer != null ? Number(u.kpiAVencer) : null,
      quitacaoDate: this.isoQuitacao(u.quitacaoDate),
      quitacaoFonte: u.quitacaoFonte || null,
      quitadoEvidencia: !!u.quitadoEvidencia,
      siengeConferidoEm: u.siengeConferidoEm || null,
      situation: u.situation || ""
    };
  },

  applyFinanceLite(units, lites) {
    if (!lites || !lites.length) return units || [];
    return this.keepQuitado(lites, units || []);
  },

  loadCache() {
    let data = null;
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) {
      data = null;
    }
    const overlay = this.loadFinanceOverlay();
    if (data && overlay && overlay.length) {
      data.units = this.applyFinanceLite(data.units || [], overlay);
    } else if (!data && overlay && overlay.length) {
      this._pendingFin = overlay;
    }
    return data;
  },

  saveCache() {
    const payload = {
      date: this.todayStr(),
      units: this.state.units,
      ccDone: this.state.ccDone,
      complete: this.state.complete,
      contractsEnriched: this.state.contractsEnriched,
      contractsCcDone: this.state.contractsCcDone,
      fetchedAt: this.state.fetchedAt || new Date().toISOString(),
      batimentoDate: this.state.batimentoDate || null,
      batimentoAt: this.state.batimentoAt || null,
      batimentoDone: !!this.state.batimentoDone
    };
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
      try {
        const compact = {
          ...payload,
          units: (payload.units || []).map((u) => {
            if (!u || !u.openParcelas) return u;
            const next = { ...u };
            delete next.openParcelas;
            return next;
          })
        };
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(compact));
      } catch (e2) {
        console.warn("[Estoque] localStorage cheio; overlay financeiro + Firebase permanecem a fonte.", e2);
      }
    }
    try {
      const items = (this.state.units || [])
        .filter((u) => u && (u.relFin || u.quitado || u.contractNumber || u.statementDone))
        .map((u) => this.financeLite(u));
      localStorage.setItem(this.FIN_KEY, JSON.stringify({
        date: this.todayStr(),
        items
      }));
    } catch (e) {
      console.warn("[Estoque] overlay financeiro não coube no localStorage.", e);
    }
  },

  applyCache(data) {
    if (!data) return;
    const locked = this.ensureQuitacaoLocked(Array.isArray(data.units) ? data.units : []);
    this.state.units = locked.units;
    if (locked.changed) this._quitacaoDirty = true;
    this.state.ccDone = Array.isArray(data.ccDone) ? data.ccDone.map(String) : [];
    this.state.complete = !!data.complete;
    this.state.contractsEnriched = !!data.contractsEnriched;
    this.state.contractsCcDone = Array.isArray(data.contractsCcDone) ? data.contractsCcDone.map(String) : [];
    this.state.fetchedAt = data.fetchedAt || data.batimentoAt || null;
    this.state.batimentoDate = data.batimentoDate || null;
    this.state.batimentoAt = data.batimentoAt || data.fetchedAt || null;
    this.state.batimentoDone = !!data.batimentoDone;
    this.sealInferredFinance();
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
      const byId = new Map();
      const ccDone = [];
      colSnap.forEach(d => {
        if (d.id === "_meta") return;
        const data = d.data() || {};
        const at = String(data.updatedAt || "");
        if (Array.isArray(data.units)) {
          data.units.forEach((u) => {
            if (!u) return;
            const key = String(u.id);
            const cur = byId.get(key);
            if (!cur || at > cur.at) byId.set(key, { u, at });
          });
        }
        if (data.enterpriseId) ccDone.push(String(data.enterpriseId));
      });
      const units = [...byId.values()].map((x) => x.u);
      if (!units.length) return null;
      const meta = metaSnap.exists() ? metaSnap.data() : {};
      return {
        units,
        ccDone: [...new Set(ccDone.concat(meta.ccDone || []))],
        complete: meta.complete !== false,
        contractsEnriched: !!meta.contractsEnriched,
        contractsCcDone: Array.isArray(meta.contractsCcDone) ? meta.contractsCcDone.map(String) : [],
        fetchedAt: meta.fetchedAt || meta.batimentoAt || meta.snapshotAt || null,
        batimentoDate: meta.batimentoDate || null,
        batimentoAt: meta.batimentoAt || meta.snapshotAt || meta.fetchedAt || null,
        batimentoDone: meta.batimentoDone === true || meta.batimentoDone === "true",
        unitsSavedDate: meta.unitsSavedDate || null
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
      if (!this._skipFinanceGuard) {
        const existing = await this.loadFirebase();
        const curF = (this.state.units || []).filter((u) => u && u.relFin).length;
        const oldF = existing && existing.units
          ? existing.units.filter((u) => u && u.relFin).length
          : 0;
        if (oldF > curF) {
          this.state.units = this.mergeUnitsPreferFinance(existing.units, this.state.units);
        }
      }
      const grouped = {};
      this.state.units.forEach(u => {
        const cc = String(u.enterpriseId || "0");
        if (!grouped[cc]) grouped[cc] = [];
        grouped[cc].push(u);
      });

      const keep = new Set(["_meta", "_batimento_state"]);
      const writes = [];
      Object.keys(grouped).forEach(cc => {
        const list = grouped[cc];
        const empName = (list[0] && list[0].enterpriseName) || this.empName(cc);
        this.fbChunks(list).forEach((units, n) => {
          const id = `cc_${cc}_${n}`;
          keep.add(id);
          writes.push(() => setDoc(doc(window.firebaseDb, this.FB_COL, id), {
            enterpriseId: cc,
            enterpriseName: empName || "",
            chunk: n,
            units: this.fbClean(units),
            updatedAt: new Date().toISOString(),
            date: this.todayStr()
          }));
        });
      });
      // Uns 70 documentos de ~300 KB de uma vez estouram a fila de escrita do SDK; vai de 5 em 5.
      for (let i = 0; i < writes.length; i += 5) {
        await Promise.all(writes.slice(i, i + 5).map((w) => w()));
      }
      await setDoc(doc(window.firebaseDb, this.FB_COL, "_meta"), this.fbClean({
        date: this.todayStr(),
        ccDone: this.state.ccDone || [],
        complete: !!this.state.complete,
        contractsEnriched: !!this.state.contractsEnriched,
        contractsCcDone: this.state.contractsCcDone || [],
        fetchedAt: this.state.fetchedAt || new Date().toISOString(),
        batimentoDate: this.state.batimentoDate || null,
        batimentoAt: this.state.batimentoAt || null,
        batimentoDone: !!this.state.batimentoDone,
        unitsSavedDate: this.todayStr(),
        unitCount: this.state.units.length,
        updatedAt: new Date().toISOString()
      }), { merge: true });

      const existing = await getDocs(collection(window.firebaseDb, this.FB_COL));
      const leftovers = [];
      existing.forEach(d => {
        if (!keep.has(d.id)) leftovers.push(deleteDoc(d.ref));
      });
      if (leftovers.length) await Promise.all(leftovers);
      this.state.firebaseOk = true;
      this.state.fbSaveError = null;
      return true;
    } catch (e) {
      console.error("[Estoque] gravação Firebase", e);
      this.state.firebaseOk = false;
      this.state.fbSaveError = (e && e.message) || String(e);
      return false;
    }
  },

  persistAll() {
    this.saveCache();
    return this.saveFirebase();
  },

  async persistTodayResult(opts) {
    opts = opts || {};
    const today = this.todayStr();
    const finN = (this.state.units || []).filter((u) => u && (u.relFin || u.quitado)).length;
    if (!finN) {
      this.saveCache();
      return today;
    }
    this.state.fetchedAt = new Date().toISOString();
    this.state.batimentoAt = this.state.fetchedAt;
    this.state.lastSnapshotDate = today;
    this.state.batimentoDate = today;
    // Com pausa + 1 empreendimento, não marca o dia inteiro como concluído (evita pular cron ao reativar).
    const markDone = opts.markDone === true
      || (opts.markDone !== false && !this._censusStillOpen);
    if (markDone) this.state.batimentoDone = true;
    this.saveCache();
    if (this.fbReady()) {
      try {
        if (!(await this.saveFirebase())) {
          console.warn("[Estoque] unidades não gravaram no Firebase; o dia não fica marcado como concluído.", this.state.fbSaveError);
          return today;
        }
        const { doc, setDoc } = window.firebaseCollections;
        const meta = {
          date: today,
          batimentoAt: new Date().toISOString(),
          batimentoDate: today,
          fetchedAt: this.state.fetchedAt,
          unitCount: this.state.units.length,
          updatedAt: new Date().toISOString()
        };
        if (markDone) meta.batimentoDone = true;
        await setDoc(doc(window.firebaseDb, this.FB_COL, "_meta"), meta, { merge: true });
        if (markDone) {
          await setDoc(doc(window.firebaseDb, this.FB_COL, "_batimento_state"), {
            date: today,
            cursor: 999999,
            processed: this.state.units.filter(u => this.isFinanceUnit(u)).length,
            skippedSettled: this.state.units.filter(u => this.isSettledUnit(u)).length,
            done: true,
            source: "manual"
          });
        }
      } catch (e) {
        console.warn("[Estoque] meta do batimento do dia", e);
      }
    }
    if (window.CaixaPosicaoStore && typeof CaixaPosicaoStore.saveFromUnits === "function") {
      try {
        await CaixaPosicaoStore.saveFromUnits(this.state.units, today);
      } catch (e) {
        console.warn("[Estoque] posição de caixa do dia", e);
      }
    }
    return today;
  },

  async saveFirebaseCc(ccId) {
    if (!this.fbReady()) return false;
    const { doc, setDoc, deleteDoc } = window.firebaseCollections;
    const cc = String(ccId);
    const list = this.state.units.filter(u => String(u.enterpriseId) === cc);
    try {
      const empName = (list[0] && list[0].enterpriseName) || this.empName(cc);
      const chunks = this.fbChunks(list);
      const writes = chunks.map((units, n) => setDoc(doc(window.firebaseDb, this.FB_COL, `cc_${cc}_${n}`), {
        enterpriseId: cc,
        enterpriseName: empName || "",
        chunk: n,
        units: this.fbClean(units),
        updatedAt: new Date().toISOString(),
        date: this.todayStr()
      }));
      await Promise.all(writes);
      if (typeof deleteDoc === "function") {
        const stale = [];
        for (let n = chunks.length; n < chunks.length + 4; n++) {
          stale.push(deleteDoc(doc(window.firebaseDb, this.FB_COL, `cc_${cc}_${n}`)).catch(() => {}));
        }
        await Promise.all(stale);
      }
      await setDoc(doc(window.firebaseDb, this.FB_COL, "_meta"), this.fbClean({
        date: this.todayStr(),
        ccDone: this.state.ccDone || [],
        complete: !!this.state.complete,
        contractsEnriched: !!this.state.contractsEnriched,
        contractsCcDone: this.state.contractsCcDone || [],
        fetchedAt: this.state.fetchedAt || new Date().toISOString(),
        unitCount: this.state.units.length,
        updatedAt: new Date().toISOString()
      }), { merge: true });
      this.state.firebaseOk = true;
      return true;
    } catch (e) {
      console.error("[Estoque] gravação CC Firebase", cc, e);
      this.state.fbSaveError = "empreendimento " + cc + ": " + ((e && e.message) || String(e));
      return false;
    }
  },

  async init() {
    this.state.loading = false;
    this.setBusy(false);
    this.renderPills();
    this.paintBatimentoPauseBanner();
    if (this.state.inited && this.state.units.length) {
      this.sealInferredFinance();
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
    // Primeiro renderiza cache local (evita travar esperando Firebase carregar todos os lotes).
    const local = this.loadCache();
    const hasLocal = !!(local && local.units && local.units.length);
    if (hasLocal) {
      this.applyCache(local);
      this.state.firebaseOk = false;
      if (!(local.units || []).some((u) => u && u.relFin)) {
        this.setProgress("Carregando a última classificação financeira…");
      }
    } else {
      this.setProgress("Carregando a última atualização do Firebase…");
    }

    this.fillEnterprisesFromUnits();
    this.fillUnitSelect();
    this.updateMeta();
    this.renderTable();
    if (window.lucide) window.lucide.createIcons();

    this.state.inited = true;
    this.loadEnterprises().then(() => {
      this.fillEnterprisesFromUnits();
      this.fillUnitSelect();
      this.updateMeta();
      this.renderTable();
    }).catch(() => {});

    await this.loadFirebaseInBackground();
    if (this._pendingFin && this._pendingFin.length) {
      this.state.units = this.applyFinanceLite(this.state.units, this._pendingFin);
      this._pendingFin = null;
    }
    if (!this.hasFinanceFields()) {
      await this.restoreFromLastSnapshot();
    }
    this.persistQuitacaoIfDirty();
    this.updateMeta();
    this.renderTable();
  },

  async loadFirebaseInBackground() {
    if (this._fbBgPromise) return this._fbBgPromise;
    this._fbBgPromise = (async () => {
      try {
        if (!this.fbReady()) await this.waitFirebase(12000);
        const fb = await this.loadFirebase();
        if (!fb || !fb.units || !fb.units.length) return;

        if (this.state._autoFinanceRunning) {
          this._firebasePendingData = fb;
          return;
        }

        const overlay = this._pendingFin || this.loadFinanceOverlay();
        const overlayDate = this.financeOverlayDate();
        const localDate = [this.state.batimentoDate, overlayDate].filter(Boolean).sort().pop() || "";
        const fbFresh = !!(fb.unitsSavedDate && fb.unitsSavedDate >= localDate);
        let next;
        if (fbFresh) {
          const ids = new Set(fb.units.map((u) => String(u && u.id)));
          next = fb.units.concat((this.state.units || []).filter((u) => u && !ids.has(String(u.id))));
          if (overlay && overlay.length && overlayDate && overlayDate > fb.unitsSavedDate) next = this.applyFinanceLite(next, overlay);
          this._pendingFin = null;
        } else {
          next = this.mergeUnitsPreferFinance(this.state.units, fb.units);
          if (overlay && overlay.length) next = this.applyFinanceLite(next, overlay);
        }
        this.applyCache({
          ...fb,
          units: next,
          batimentoDate: fbFresh ? (fb.batimentoDate || this.state.batimentoDate || null) : (this.state.batimentoDate || fb.batimentoDate || null),
          batimentoAt: fbFresh ? (fb.batimentoAt || this.state.batimentoAt || null) : (this.state.batimentoAt || fb.batimentoAt || null),
          batimentoDone: fbFresh ? !!fb.batimentoDone : (this.state.batimentoDone || !!fb.batimentoDone)
        });
        if (fbFresh) this.saveCache();
        this.state.firebaseOk = true;
        this.persistQuitacaoIfDirty();
        this.fillEnterprisesFromUnits();
        this.fillUnitSelect();
        this.updateMeta();
        this.renderTable();
        if (window.lucide) window.lucide.createIcons();
      } catch (e) {
        console.error("[Estoque] leitura Firebase (background)", e);
      } finally {
        this.setProgress("");
      }
    })();
    return this._fbBgPromise;
  },

  async tryLoadBatimentoMetaOnly() {
    if (!this.fbReady()) return null;
    try {
      await this.waitFirebase(2000);
      if (!this.fbReady()) return null;
      const { doc, getDoc } = window.firebaseCollections;
      const metaSnap = await getDoc(doc(window.firebaseDb, this.FB_COL, "_meta"));
      const meta = metaSnap.exists() ? metaSnap.data() : {};
      const batimentoDate = meta.batimentoDate || null;
      const batimentoAt = meta.batimentoAt || meta.snapshotAt || meta.fetchedAt || null;
      const batimentoDone = meta.batimentoDone === true || meta.batimentoDone === "true";
      const unitsSavedDate = meta.unitsSavedDate || null;
      this.state.batimentoDate = batimentoDate;
      this.state.batimentoAt = this.state.batimentoAt || batimentoAt;
      this.state.batimentoDone = batimentoDone;
      return { batimentoDate, batimentoAt, batimentoDone, unitsSavedDate };
    } catch (e) {
      return null;
    }
  },

  hideManualFinanceButtons() {},

  hasFinanceFields() {
    return (this.state.units || []).some(u => {
      const pmpOk = u && u.pmp3m != null && Number.isFinite(Number(u.pmp3m));
      const relOk = u && (u.relFin != null || u.quitado === true);
      return pmpOk || relOk;
    });
  },

  hasPaidMapReady() {
    return !!(window.paidMapHasBillDays
      && window.advFilters
      && window.advFilters.paidMap
      && window.paidMapHasBillDays(window.advFilters.paidMap));
  },

  paintBatimentoPauseBanner() {
    const el = document.getElementById("est-batimento-pause");
    if (el) {
      el.hidden = true;
      el.style.display = "none";
      el.innerHTML = "";
    }
  },

  inferRelFin(u) {
    if (!u || !this.isFinanceUnit(u)) return null;
    if (u.relFin) return u.relFin;
    if (u.quitado) return "quitado";
    if (String(u.situation || "").toLowerCase().includes("distrat")) return "distratado";
    if (this.isInadimplente(u)) return "inadimplente";
    const bal = this.unitBalance(u);
    const rec = u.receivedAmount != null ? Number(u.receivedAmount) : null;
    if (bal != null && Number(bal) <= 0.009 && rec > 0.009) return "quitado";
    if (bal != null && Number(bal) > 0.009) return "adimplente";
    if (u.statementDone || u.receivedLocked || this.displayContract(u) || u.contractId) return "adimplente";
    return null;
  },

  /** Quitado sem data do Sienge e sem nenhum valor recebido não tem prova: volta para conferência. */
  quitadoSemEvidencia(u) {
    if (!u || !(u.quitado || u.relFin === "quitado")) return false;
    if (u.quitacaoFonte === "sienge" || u.quitadoEvidencia) return false;
    return !(Number(u.receivedAmount) > 0.009);
  },

  reabrirParaConferencia(u) {
    return {
      ...u,
      relFin: null,
      quitado: false,
      quitacaoDate: null,
      quitacaoFonte: null,
      statementDone: false,
      receivedLocked: false,
      censusAt: null,
      outstandingBalance: null,
      presentDebitBalance: null
    };
  },

  revisarQuitadosSemEvidencia(scopeEmp) {
    const ccs = new Set();
    this.state.units = (this.state.units || []).map((u) => {
      if (scopeEmp && String(u && u.enterpriseId) !== String(scopeEmp)) return u;
      if (!this.isFinanceUnit(u) || !this.quitadoSemEvidencia(u)) return u;
      ccs.add(String(u.enterpriseId || ""));
      return this.reabrirParaConferencia(u);
    });
    if (!ccs.size) return 0;
    this.saveCache();
    return ccs.size;
  },

  sealInferredFinance(scopeEmp) {
    this.revisarQuitadosSemEvidencia(scopeEmp);
    let n = 0;
    this.state.units = (this.state.units || []).map((u) => {
      if (scopeEmp && String(u && u.enterpriseId) !== String(scopeEmp)) return u;
      if (!this.isFinanceUnit(u) || u.relFin) return u;
      const inferred = this.inferRelFin(u);
      if (!inferred) return u;
      n += 1;
      return {
        ...u,
        relFin: inferred,
        quitado: inferred === "quitado" ? true : !!u.quitado
      };
    });
    return n;
  },

  requireEmpForApiHeavy() {
    return ((document.getElementById("est-filter-emp") || {}).value || "").trim();
  },

  paidDaysForBillId(billId) {
    const paidMap = window.advFilters && window.advFilters.paidMap;
    if (!paidMap || typeof paidMap.get !== "function") return null;
    const raw = String(billId || "").trim();
    if (!raw) return null;
    const candidates = [];
    candidates.push(raw);
    candidates.push(raw.replace(/^B-/, ""));
    const norm = raw.replace(/^B-/, "").split("-")[0];
    if (norm) candidates.push(norm);
    for (const c of candidates) {
      if (!paidMap.has(c)) continue;
      const v = paidMap.get(c);
      const n = typeof v === "string" ? Number(v) : v;
      if (Number.isFinite(n)) return n;
    }
    return null;
  },

  unitNeedsCensus(u) {
    if (!this.isFinanceUnit(u) || !u.customerId) return false;
    return !(u.statementDone && u.relFin && (u.receivedLocked || u.censusAt));
  },

  stampFilaOnUnits(scopeEmp, opts) {
    const onlyWithoutStatement = !!(opts && opts.onlyWithoutStatement);
    this.buildDefaulterIndex();
    let n = 0;
    this.state.units = this.state.units.map((u) => {
      if (scopeEmp && String(u.enterpriseId) !== String(scopeEmp)) return u;
      if (!this.isFinanceUnit(u) || this.isSettledUnit(u)) return u;
      if (onlyWithoutStatement && u.statementDone && u.relFin) return u;
      const ov = this.overdueValue(u);
      if (ov <= 0.009) return u;
      const paid = this.paidDaysForBillId(u.receivableBillId || u.contractId || u.contractNumber || "");
      if (paid != null && paid <= (this.BATIMENTO_DELTA_DAYS || 5)) return u;
      n += 1;
      const aReceber = Math.max(Number(u.outstandingBalance) || 0, ov);
      return {
        ...u,
        relFin: "inadimplente",
        quitado: false,
        kpiVencidas: ov,
        outstandingBalance: aReceber,
        presentDebitBalance: aReceber,
        filaAt: new Date().toISOString(),
        finAt: new Date().toISOString()
      };
    });
    return n;
  },

  isActiveFinance(u) {
    const fin = this.financialStatus(u);
    return fin === "Ativo adimplente" || fin === "Ativo inadimplente";
  },

  hasActivePending() {
    return (this.state.units || []).some((u) => {
      if (!this.isActiveFinance(u)) return false;
      return !(u.statementDone && (u.receivedLocked || u.censusAt));
    });
  },

  collectActiveCustomers(empSel, opts) {
    const onlyPending = !!(opts && opts.onlyPending);
    const byCc = new Map();
    let count = 0;
    this.state.units.forEach((u) => {
      if (!u || (empSel && String(u.enterpriseId) !== String(empSel))) return;
      if (!u.customerId || !u.enterpriseId) return;
      if (!this.isActiveFinance(u)) return;
      const pending = !(u.statementDone && (u.receivedLocked || u.censusAt));
      const paid = this.paidDaysForBillId(u.receivableBillId || u.contractId || u.contractNumber || "");
      const recent = paid != null && paid <= (Number(this.BATIMENTO_DELTA_DAYS) || 5);
      const leftFila = u.relFin === "inadimplente" && this.overdueValue(u) <= 0.009;
      if (onlyPending && !pending && !recent && !leftFila) return;
      const ccKey = String(u.enterpriseId);
      if (!byCc.has(ccKey)) byCc.set(ccKey, new Set());
      byCc.get(ccKey).add(String(u.customerId));
      count += 1;
    });
    return { byCc, count };
  },

  collectAllFinanceCustomers(empSel, includeSettled) {
    const byCc = new Map();
    this.state.units.forEach((u) => {
      if (!u || (empSel && String(u.enterpriseId) !== String(empSel))) return;
      if (!this.isFinanceUnit(u) || !u.customerId) return;
      if (!includeSettled && this.isSettledUnit(u)) return;
      const ccKey = String(u.enterpriseId);
      if (!byCc.has(ccKey)) byCc.set(ccKey, new Set());
      byCc.get(ccKey).add(String(u.customerId));
    });
    return { byCc };
  },

  collectBatimentoCustomers(empSel, includeCensus) {
    const deltaDays = Number(this.BATIMENTO_DELTA_DAYS) || 5;
    const byCc = new Map();
    const census = new Set();
    this.state.units.forEach((u) => {
      if (!u || (empSel && String(u.enterpriseId) !== String(empSel))) return;
      if (!this.isFinanceUnit(u) || !u.customerId) return;
      if (this.isSettledUnit(u) && u.statementDone && u.receivedLocked) return;
      const ccKey = String(u.enterpriseId);
      const cid = String(u.customerId);
      if (includeCensus && this.unitNeedsCensus(u)) {
        census.add(cid);
        if (!byCc.has(ccKey)) byCc.set(ccKey, new Set());
        byCc.get(ccKey).add(cid);
        return;
      }
      const paid = this.paidDaysForBillId(u.receivableBillId || u.contractId || u.contractNumber || "");
      const inFila = this.overdueValue(u) > 0.009;
      const leftFila = u.relFin === "inadimplente" && !inFila;
      if ((paid != null && paid <= deltaDays) || leftFila) {
        if (!byCc.has(ccKey)) byCc.set(ccKey, new Set());
        byCc.get(ccKey).add(cid);
      }
    });
    return { byCc, censusCount: census.size };
  },

  async autoStartDailyBatimento() {
    this.paintBatimentoPauseBanner();
    const today = this.todayStr();
    if (this.state._autoFinanceRunning) return;

    await this.loadFirebaseInBackground();
    if (this._pendingFin && this._pendingFin.length) {
      this.state.units = this.applyFinanceLite(this.state.units, this._pendingFin);
      this._pendingFin = null;
    }
    if (!this.hasFinanceFields()) {
      this.setProgress("Restaurando a última classificação gravada…");
      await this.restoreFromLastSnapshot();
      this.setProgress("");
    }

    const meta = await this.tryLoadBatimentoMetaOnly();
    this.buildDefaulterIndex();
    this.stampFilaOnUnits();
    this.sealInferredFinance();
    const already = (meta && meta.batimentoDate === today) || this.state.batimentoDate === today;
    if (already && !this.hasActivePending()) return;
    // Posição do dia já gravada inteira no Firebase: mostra a de hoje sem refazer o batimento.
    if (meta && meta.batimentoDate === today && meta.unitsSavedDate === today) return;

    if (!this.state.units.length) {
      this.setProgress("Sem estoque salvo. Use Baixar unidades do Sienge — a classificação anterior será reaproveitada.");
      return;
    }

    this._firebasePendingData = null;
    this._autoDeltaRun = true;
    try {
      await this.batimentoFinanceiro({ auto: true });
    } finally {
      this._autoDeltaRun = false;
      if (this._firebasePendingData) {
        const fb = this._firebasePendingData;
        this._firebasePendingData = null;
        const merged = this.mergeUnitsPreferFinance(this.state.units, fb.units || []);
        this.applyCache({ ...fb, units: merged });
        this.state.firebaseOk = true;
        this.persistQuitacaoIfDirty();
        this.fillEnterprisesFromUnits();
        this.fillUnitSelect();
        this.updateMeta();
        this.renderTable();
        if (window.lucide) window.lucide.createIcons();
      }
    }
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
    const emp = (document.getElementById("est-filter-emp") || {}).value || "";
    const base = emp ? this.state.units.filter(u => String(u.enterpriseId) === String(emp)) : this.state.units;
    const counts = { all: base.length };
    base.forEach(u => {
      const code = String(u.commercialStock || "").toUpperCase() || "none";
      counts[code] = (counts[code] || 0) + 1;
    });
    wrap.innerHTML = this.STATUS_PILLS.filter(p => {
      if (p.id === "all" || p.id === this.state.status) return true;
      return (counts[p.id] || 0) > 0;
    }).map(p => {
      const n = p.id === "all" ? counts.all : (counts[p.id] || 0);
      return `<button type="button" class="est-pill${this.state.status === p.id ? " is-active" : ""}" data-status="${this.esc(p.id)}" onclick="EstoqueComercialApp.setStatus('${p.id}')">${this.esc(p.label)} <b>${n}</b></button>`;
    }).join("");
  },

  setStatus(id) {
    this.state.status = id;
    this.state.tablePage = 0;
    this.fillUnitSelect();
    this.renderTable();
  },

  onEmpChange() {
    this.state.tablePage = 0;
    this.fillUnitSelect();
    this.renderTable();
  },

  scheduleRender() {
    this.state.tablePage = 0;
    clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => this.renderTable(), 160);
  },

  toggleSort(key) {
    if (this.state.sortKey === key) this.state.sortDir = this.state.sortDir === "asc" ? "desc" : "asc";
    else {
      this.state.sortKey = key;
      this.state.sortDir = "asc";
    }
    this.state.tablePage = 0;
    this.renderTable();
  },

  setPage(page) {
    const total = this._lastCount || 0;
    const pages = Math.max(1, Math.ceil(total / this.PAGE));
    this.state.tablePage = Math.max(0, Math.min(pages - 1, page));
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
    const when = this.state.batimentoAt || this.state.fetchedAt;
    const whenLabel = when ? new Date(when).toLocaleString("pt-BR") : "";
    const finN = (this.state.units || []).filter((u) => u && u.relFin).length;
    const last = this.state.batimentoDate
      ? ` Última atualização financeira: ${String(this.state.batimentoDate).split("-").reverse().join("/")}${whenLabel ? " · " + whenLabel : ""} (${finN} títulos classificados).`
      : (finN
        ? ` Situação financeira de ${finN} título(s) da última base.`
        : " Sem classificação financeira gravada — aguardando a última atualização.");
    const fb = this.state.fbSaveError
      ? ` Falha ao gravar no Firebase — o resultado ficou só neste navegador (${String(this.state.fbSaveError).slice(0, 160)}).`
      : (this.state.firebaseOk ? " Firebase ok." : (this.fbReady() ? " Gravando/lendo Firebase." : " Firebase indisponível."));
    const extra = this.state.complete ? "" : ` Carga incompleta (${this.state.ccDone.length} empreendimentos).`;
    el.textContent = `${this.state.units.length} unidades.${last}${extra}${fb}`;
  },

  normName(name) {
    return String(name || "").replace(/\s+/g, "").toUpperCase();
  },

  normNameLoose(name) {
    return this.normName(name).replace(/-0+/g, "-").replace(/^0+/, "") || this.normName(name);
  },

  buildDefaulterIndex() {
    const idx = { byRb: new Map(), byUnit: new Map(), byCustomer: new Map() };
    const bills = (window.AppState && AppState.defaultersBills) || [];
    bills.forEach(b => {
      const val = this.filaBillAmount(b);
      const rb = String(b.receivableBillId || b.id || "");
      if (rb) idx.byRb.set(rb, (idx.byRb.get(rb) || 0) + val);
      const cust = String(b.customerId || b.clientId || "");
      if (cust) {
        if (!idx.byCustomer) idx.byCustomer = new Map();
        idx.byCustomer.set(cust, (idx.byCustomer.get(cust) || 0) + val);
      }
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

  filaBillAmount(b) {
    if (!b) return 0;
    const charges = Number(b.overdueCharges);
    const principal = Number(b.overdueValue != null ? b.overdueValue : b.value) || 0;
    if (Number.isFinite(charges) && charges > 0.009) return principal + charges;
    const interest = Number(b.interest || b.interestValue || 0);
    const fine = Number(b.fine || b.fineValue || 0);
    if (interest + fine > 0.009) return principal + interest + fine;
    const insts = b.defaulterInstallments || [];
    if (insts.length) {
      return insts.reduce((s, inst) => {
        if (inst.correctedValueWithAdditions != null) return s + Number(inst.correctedValueWithAdditions || 0);
        return s + Number(inst.value || inst.correctedValueWithoutAdditions || 0)
          + Number(inst.interest || 0) + Number(inst.fine || 0);
      }, 0);
    }
    return principal;
  },

  overdueValue(u) {
    const ficha = Number(u && u.kpiVencidas);
    if (Number.isFinite(ficha) && ficha > 0.009) return ficha;
    if (u && Number.isFinite(ficha) && String(u.siengeConferidoEm || "").slice(0, 10) === this.todayStr()) return 0;
    const idx = this.state.defaulterIndex || this.buildDefaulterIndex();
    if (u.receivableBillId && idx.byRb.has(String(u.receivableBillId))) {
      return idx.byRb.get(String(u.receivableBillId)) || 0;
    }
    const k = `${String(u.enterpriseId || "")}|${this.normName(u.name)}`;
    if (idx.byUnit.has(k)) return idx.byUnit.get(k) || 0;
    const cust = String(u.customerId || "");
    if (cust && idx.byCustomer && idx.byCustomer.has(cust)) return idx.byCustomer.get(cust) || 0;
    return 0;
  },

  sanitizeUnit(u) {
    if (!u) return u;
    const next = { ...u };
    if (next.contractNumber != null && next.contractNumber !== "") {
      next.contractNumber = String(next.contractNumber);
    } else {
      next.contractNumber = null;
    }
    const dist = next.relFin === "distratado" || String(next.situation || "").toLowerCase().includes("distrat");
    if (dist) return next;
    if (next.quitado || next.relFin === "quitado") {
      next.quitado = true;
      next.quitacaoDate = this.sealQuitacao(next);
    } else {
      next.quitacaoDate = this.isoQuitacao(next.quitacaoDate);
    }
    return next;
  },

  isFakeContractNumber(u) {
    return !u || u.contractNumber == null || String(u.contractNumber) === "";
  },

  displayReceived(u) {
    if (!u) return "";
    if (u.receivedAmount != null && !Number.isNaN(Number(u.receivedAmount))) return this.money(u.receivedAmount);
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
    const rel = u.relFin || this.inferRelFin(u);
    if (rel === "distratado" || String(u.situation || "").toLowerCase().includes("distrat")) return "Distratado";
    if (rel === "quitado" || u.quitado) return "Quitado";
    if (rel === "inadimplente" || this.isInadimplente(u)) return "Ativo inadimplente";
    if (rel === "adimplente") return "Ativo adimplente";
    const bal = this.unitBalance(u);
    if (bal != null && Number(bal) > 0.009) return "Ativo adimplente";
    const fallback = this.defaultFinanceStatus(u);
    if (fallback === "quitado") return "Quitado";
    if (fallback === "inadimplente") return "Ativo inadimplente";
    if (fallback === "distratado") return "Distratado";
    if (this.displayContract(u) || u.contractId || u.statementDone) return "Ativo adimplente";
    return "A apurar";
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  displayContractValue(u, finKnown) {
    const rec = u && u.receivedAmount != null && !Number.isNaN(Number(u.receivedAmount))
      ? Number(u.receivedAmount)
      : null;
    const fin = finKnown || this.financialStatus(u);
    const balRaw = this.unitBalance(u);
    const bal = fin === "Quitado"
      ? 0
      : (fin === "—" || fin === "Distratado" || balRaw == null ? null : Number(balRaw));
    if (rec != null || bal != null) return (rec || 0) + (bal || 0);
    if (u && u.contractValue != null && !Number.isNaN(Number(u.contractValue))) return Number(u.contractValue);
    return null;
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
    let aVencer = 0;
    let vencido = 0;
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
      const saldo = bal == null || Number.isNaN(Number(bal)) ? null : Number(bal) || 0;
      if (saldo == null) semSaldo += 1;
      else aReceber += saldo;
      const ov = this.overdueValue(u);
      if (ov > 0.009) {
        inadimplentes += 1;
        atraso += ov;
      }
      // "Em atraso" traz juros e multa; o a vencer e o vencido saem do principal (saldo − parcelas ainda no prazo).
      if (saldo != null) {
        const noPrazo = u.kpiAVencer != null && Number.isFinite(Number(u.kpiAVencer)) ? Math.min(saldo, Math.max(0, Number(u.kpiAVencer))) : Math.max(0, saldo - ov);
        aVencer += noPrazo;
        vencido += saldo - noPrazo;
      }
    });
    return { aReceber, atraso, vencido, aVencer, ativos, quitados, distratados, inadimplentes, semSaldo };
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
        <div class="est-fin-card is-warn"><label>Em atraso</label><strong>${this.money(p.atraso)}</strong><small>Principal, juros e multa</small></div>
        <div class="est-fin-card"><label>A vencer</label><strong>${this.money(p.aVencer)}</strong><small>Saldo ainda no prazo</small></div>
        <div class="est-fin-card is-ok"><label>Quitados</label><strong>${p.quitados}</strong><small>Fora do saldo a receber</small></div>
      `;
      let conf = document.getElementById("est-conferencia");
      if (!conf) {
        conf = document.createElement("div");
        conf.id = "est-conferencia";
        finEl.insertAdjacentElement("afterend", conf);
      }
      conf.innerHTML = this.conferenciaHtml();
    }
    const el = document.getElementById("est-stock-kpis");
    if (el) el.innerHTML = "";
    this.renderPills();
  },

  sortRows(rows) {
    const key = this.state.sortKey || "emp";
    const dir = this.state.sortDir === "desc" ? -1 : 1;
    const num = key === "area" || key === "valor" || key === "recebido" || key === "saldo";
    const prepared = rows.map(u => ({ u, fin: this.financialStatus(u) }));
    const val = (item) => {
      const u = item.u;
      if (key === "status") return this.mapStock(u.commercialStock);
      if (key === "emp") return String(u.enterpriseId || "");
      if (key === "unit") return String(u.name || "");
      if (key === "legal") return this.mapCode(this.LEGAL_MAP, u.legalStock);
      if (key === "area") return Number(u.area) || 0;
      if (key === "contract") return this.displayContract(u) || "";
      if (key === "valor") return this.displayContractValue(u, item.fin) || 0;
      if (key === "recebido") return Number(u.receivedAmount) || 0;
      if (key === "fin") return item.fin;
      if (key === "saldo") {
        if (item.fin === "Quitado") return 0;
        const bal = this.unitBalance(u);
        return bal == null ? -1 : Number(bal) || 0;
      }
      if (key === "quita") return item.fin === "Quitado" ? (u.quitacaoDate || "") : "";
      return "";
    };
    prepared.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp = num
        ? (av - bv)
        : String(av).localeCompare(String(bv), "pt", { numeric: true, sensitivity: "base" });
      if (cmp) return cmp * dir;
      return String(a.u.name || "").localeCompare(String(b.u.name || ""), "pt", { numeric: true, sensitivity: "base" });
    });
    return prepared;
  },

  renderPager(total) {
    const el = document.getElementById("est-stock-pager");
    if (!el) return;
    this._lastCount = total;
    const pages = Math.max(1, Math.ceil(total / this.PAGE));
    if (this.state.tablePage >= pages) this.state.tablePage = pages - 1;
    if (this.state.tablePage < 0) this.state.tablePage = 0;
    if (total <= this.PAGE) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const page = this.state.tablePage;
    const from = page * this.PAGE + 1;
    const to = Math.min(total, (page + 1) * this.PAGE);
    el.hidden = false;
    el.innerHTML = `<span>${from}–${to} de ${total.toLocaleString("pt-BR")}</span>
      <button type="button" ${page <= 0 ? "disabled" : ""} onclick="EstoqueComercialApp.setPage(${page - 1})">Anterior</button>
      <button type="button" ${page >= pages - 1 ? "disabled" : ""} onclick="EstoqueComercialApp.setPage(${page + 1})">Próxima</button>`;
  },

  FIN_FILTROS: [
    { id: "all", label: "Todos" },
    { id: "Quitado", label: "Quitados" },
    { id: "Ativo adimplente", label: "Ativos adimplentes" },
    { id: "Ativo inadimplente", label: "Ativos inadimplentes" }
  ],

  renderFinFiltros(base) {
    const wrap = document.getElementById("est-fin-filtros");
    if (!wrap) return;
    const counts = { all: base.length };
    base.forEach((u) => {
      const fin = this.financialStatus(u);
      counts[fin] = (counts[fin] || 0) + 1;
    });
    const atual = this.state.finFiltro || "all";
    wrap.innerHTML = this.FIN_FILTROS.map((f) => {
      const n = counts[f.id] || 0;
      return `<button type="button" class="est-fin-filtro is-${f.id === "all" ? "todos" : this.finChipClass(f.id).replace("est-fin-", "").toLowerCase()}${atual === f.id ? " is-active" : ""}" onclick="EstoqueComercialApp.setFinFiltro('${f.id}')">${this.esc(f.label)} <b>${n.toLocaleString("pt-BR")}</b></button>`;
    }).join("");
  },

  setFinFiltro(id) {
    this.state.finFiltro = this.state.finFiltro === id ? "all" : id;
    this.state.tablePage = 0;
    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById("est-stock-tbody");
    if (!tbody) return;
    const base = this.selectedUnits();
    this.renderKpis(base);
    this.renderFinFiltros(base);
    const filtro = this.state.finFiltro || "all";
    const rows = filtro === "all" ? base : base.filter((u) => this.financialStatus(u) === filtro);
    if (!rows.length) {
      this.renderPager(0);
      tbody.innerHTML = `<tr><td colspan="11" class="est-empty">Nenhuma unidade com esse filtro.</td></tr>`;
      return;
    }
    const prepared = this.sortRows(rows);
    const page = this.state.tablePage || 0;
    const slice = prepared.slice(page * this.PAGE, page * this.PAGE + this.PAGE);
    this.renderPager(prepared.length);
    this._linhas = slice;
    tbody.innerHTML = slice.map((item, i) => {
      const u = item.u;
      const fin = item.fin;
      const status = this.mapStock(u.commercialStock);
      const area = u.area != null && u.area !== "" ? Number(u.area).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—";
      const empName = u.enterpriseName || this.empName(u.enterpriseId);
      const contrato = this.displayContract(u) || "—";
      const finClass = this.finChipClass(fin);
      const bal = this.unitBalance(u);
      const saldo = fin === "Quitado"
        ? this.money(0)
        : (fin === "—" || fin === "Distratado" || bal == null
          ? "—"
          : this.money(bal));
      const valorContrato = this.displayContractValue(u, fin);
      const comExtrato = !!u.customerId;
      return `<tr${comExtrato ? ` class="est-row-extrato" title="Clique para ver o extrato do cliente" onclick="EstoqueComercialApp.abrirExtrato(${i}, this)"` : ""}>
        <td><span class="est-status-chip">${this.esc(status)}</span></td>
        <td class="est-emp"><b>${this.esc(u.enterpriseId)}</b><span title="${this.esc(empName)}">${this.esc(empName)}</span></td>
        <td class="est-unit">${this.esc(u.name)}</td>
        <td>${this.esc(this.mapCode(this.LEGAL_MAP, u.legalStock))}</td>
        <td class="est-num">${this.esc(area)}</td>
        <td>${this.esc(contrato)}</td>
        <td class="est-num">${valorContrato == null ? "—" : this.esc(this.money(valorContrato))}</td>
        <td class="est-num">${this.displayReceived(u) || "—"}</td>
        <td><span class="est-fin-chip ${finClass}">${this.esc(fin)}</span></td>
        <td class="est-num">${this.esc(saldo)}</td>
        <td class="est-date">${fin === "Quitado" ? this.esc(this.formatQuitacao(u)) : "—"}</td>
      </tr>`;
    }).join("");
    const head = document.querySelector("#tab-estoque-comercial thead");
    if (window.lucide && head) lucide.createIcons({ root: head });
    this.verificarQuitacoes(slice);
  },

  /** Abre o PDF do extrato do cliente no Sienge (mesmo extrato do botão Visualizar Extrato da ficha). */
  async abrirExtrato(idx, tr) {
    const item = (this._linhas || [])[idx];
    const u = item && item.u;
    if (!u || !u.customerId) return;
    if (tr && tr.classList.contains("is-loading")) return;
    const win = this.abrirGuiaEspera(u);
    if (tr) tr.classList.add("is-loading");
    try {
      const billId = u.receivableBillId || await this.acharTituloCliente(u);
      if (!billId) throw new Error("Não encontrei o título desse contrato no Sienge.");
      const res = await SiengeApiService.getCustomerFinancialStatementsPdf(u.customerId, billId);
      const r0 = (res && res.results && res.results[0]) || (Array.isArray(res) ? res[0] : res) || {};
      const url = r0.urlReport || r0.value || (typeof r0 === "string" && r0.startsWith("http") ? r0 : "");
      if (!url) throw new Error("O Sienge não devolveu o extrato desse título.");
      const ccId = String(u.enterpriseId || "");
      const fileName = typeof window.buildFichaPdfFilename === "function"
        ? window.buildFichaPdfFilename("Extrato", { contrato: u.name, costCenterId: ccId, titulo: billId, nome: u.customerName || "" })
        : `Extrato ${ccId} ${u.name} - Título ${billId}.pdf`;
      const aberta = window.openNamedSiengePdf(url, fileName, win);
      if (!aberta && typeof window.showBoletoPdfFallback === "function") window.showBoletoPdfFallback(url, fileName);
    } catch (e) {
      console.warn("[Estoque] extrato do cliente", u.customerId, e);
      if (win && !win.closed) win.close();
      alert(e && e.message ? e.message : "Não foi possível gerar o extrato do cliente.");
    } finally {
      if (tr) tr.classList.remove("is-loading");
    }
  },

  /** Guia aberta já no clique: depois da consulta ao Sienge o navegador bloquearia um window.open novo. */
  abrirGuiaEspera(u) {
    let w = null;
    try { w = window.open("", "_blank"); } catch (e) { w = null; }
    if (!w) return null;
    try {
      const ref = this.esc(`${u.enterpriseId || ""} · ${u.name || ""}${u.customerName ? " · " + u.customerName : ""}`);
      w.document.open();
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Extrato</title><style>body{font-family:Segoe UI,sans-serif;background:#f8fafc;color:#105436;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.box{text-align:center;padding:32px;max-width:440px}.spin{width:28px;height:28px;border:3px solid #cfe3d8;border-top-color:#105436;border-radius:50%;animation:s .8s linear infinite;margin:0 auto 16px}@keyframes s{to{transform:rotate(360deg)}}p{color:#64748b;font-size:14px;line-height:1.45}</style></head><body><div class="box"><div class="spin"></div><div style="font-weight:700;margin-bottom:8px">Gerando o extrato do cliente</div><p>${ref}</p></div></body></html>`);
      w.document.close();
    } catch (e) {}
    return w;
  },

  /** Unidade sem título gravado: procura o título do contrato na lista do cliente no Sienge. */
  async acharTituloCliente(u) {
    if (!window.SiengeApiService || !SiengeApiService.getReceivableBills) return null;
    const res = await SiengeApiService.getReceivableBills(u.customerId);
    const list = (res && (res.results || res)) || [];
    const arr = Array.isArray(list) ? list : [];
    const contrato = String(this.displayContract(u) || "").trim();
    const docNum = (b) => String(b.documentNumber || "").toUpperCase().replace(/^(CTCV|CT|CV)\s*/, "").trim();
    const hit = (contrato && arr.find((b) => docNum(b) === contrato))
      || arr.find((b) => String(b.costCenterId || b.enterpriseId || "") === String(u.enterpriseId || "") && String(b.unit || b.unitName || "").trim() === String(u.name || "").trim())
      || (arr.length === 1 ? arr[0] : null);
    return hit ? (hit.receivableBillId || hit.id || null) : null;
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

  unitFinanceScore(u) {
    if (!u) return 0;
    let s = 0;
    if (u.relFin) s += 10;
    if (u.statementDone) s += 5;
    if (u.quitado || u.relFin === "quitado") s += 8;
    if (u.contractNumber) s += 3;
    if (u.receivableBillId) s += 2;
    if (u.receivedLocked) s += 2;
    if (u.censusAt) s += 2;
    if (u.kpiVencidas != null || u.kpiAVencer != null) s += 2;
    if (u.receivedAmount != null) s += 1;
    return s;
  },

  mergeUnitsPreferFinance(a, b) {
    const map = {};
    (a || []).forEach((u) => {
      if (u && u.id != null) map[String(u.id)] = u;
    });
    (b || []).forEach((u) => {
      if (!u || u.id == null) return;
      const id = String(u.id);
      const cur = map[id];
      if (!cur) {
        map[id] = u;
        return;
      }
      const richer = this.unitFinanceScore(u) > this.unitFinanceScore(cur) ? u : cur;
      const poorer = richer === u ? cur : u;
      map[id] = this.keepQuitado([poorer], [richer])[0];
    });
    return Object.keys(map).map((k) => map[k]);
  },

  applyCaixaRows(units, rows) {
    if (!rows || !rows.length) return units || [];
    const byId = {};
    rows.forEach((r) => {
      if (r && r.uid) byId[String(r.uid)] = r;
    });
    return (units || []).map((u) => {
      const r = byId[String(u.id)];
      if (!r) return u;
      if (this.unitFinanceScore(u) >= 15) return u;
      const st = r.st || u.relFin || null;
      return {
        ...u,
        relFin: u.relFin || st || null,
        quitado: !!(u.quitado || st === "quitado"),
        statementDone: !!(u.statementDone || st),
        receivedLocked: !!(u.receivedLocked || st),
        customerId: u.customerId || r.cid || null,
        customerDoc: u.customerDoc || r.cpf || "",
        customerName: u.customerName || r.nome || "",
        receivedAmount: u.receivedAmount != null ? u.receivedAmount : r.rec,
        kpiVencidas: u.kpiVencidas != null ? u.kpiVencidas : r.ven,
        kpiAVencer: u.kpiAVencer != null ? u.kpiAVencer : r.av,
        outstandingBalance: u.outstandingBalance != null ? u.outstandingBalance : r.vp,
        presentDebitBalance: u.presentDebitBalance != null ? u.presentDebitBalance : r.vp,
        pmp3m: u.pmp3m != null ? u.pmp3m : r.pmp,
        openParcelas: (u.openParcelas && u.openParcelas.length) ? u.openParcelas : (r.parc || u.openParcelas)
      };
    });
  },

  async loadLastCaixaOverlay() {
    if (!window.CaixaPosicaoStore || typeof CaixaPosicaoStore.listDates !== "function") return [];
    try {
      if (!this.fbReady()) await this.waitFirebase(8000);
      const dates = await CaixaPosicaoStore.listDates();
      if (!dates.length) return [];
      return await CaixaPosicaoStore.loadDate(dates[0]);
    } catch (e) {
      console.warn("[Estoque] última posição de caixa", e);
      return [];
    }
  },

  async restoreFromLastSnapshot() {
    const rows = await this.loadLastCaixaOverlay();
    if (!rows.length) return 0;
    const before = (this.state.units || []).filter((u) => u && u.relFin).length;
    this.state.units = this.applyCaixaRows(this.state.units, rows);
    const after = (this.state.units || []).filter((u) => u && u.relFin).length;
    if (after > before) {
      this.saveCache();
      if (this.fbReady()) {
        try { await this.saveFirebase(); } catch (e) {}
      }
    }
    return after - before;
  },

  async previousFinanceUnits() {
    const mem = this.state.units || [];
    let fbUnits = [];
    try {
      const fb = await this.loadFirebase();
      if (fb && fb.units) fbUnits = fb.units;
    } catch (e) {}
    let merged = this.mergeUnitsPreferFinance(mem, fbUnits);
    const overlay = this._pendingFin || this.loadFinanceOverlay();
    if (overlay && overlay.length) merged = this.applyFinanceLite(merged, overlay);
    const caixa = await this.loadLastCaixaOverlay();
    if (caixa.length) merged = this.applyCaixaRows(merged, caixa);
    return merged;
  },

  keepQuitado(prev, next) {
    const old = {};
    (prev || []).forEach(u => {
      if (u) old[String(u.id)] = u;
    });
    return (next || []).map(u => {
      const keep = old[String(u.id)];
      if (!keep) return u;
      const confU = String(u.siengeConferidoEm || "");
      const confK = String(keep.siengeConferidoEm || "");
      if (confU || confK) {
        // Conferência com o extrato do Sienge é a fonte mais recente: vale sobre quitado antigo.
        if (confU >= confK) return this.sanitizeUnit({ ...keep, ...u });
        const fin = this.financeLite(keep);
        delete fin.id;
        return this.sanitizeUnit({ ...u, ...fin, openParcelas: keep.openParcelas || u.openParcelas, pmp3m: keep.pmp3m != null ? keep.pmp3m : u.pmp3m });
      }
      return this.sanitizeUnit({
        ...u,
        contractNumber: u.contractNumber || keep.contractNumber,
        outstandingBalance: keep.quitado ? 0 : (u.outstandingBalance != null ? u.outstandingBalance : keep.outstandingBalance),
        presentDebitBalance: u.presentDebitBalance != null ? u.presentDebitBalance : keep.presentDebitBalance,
        contractValue: u.contractValue || keep.contractValue,
        receivedAmount: keep.receivedLocked ? keep.receivedAmount : (u.receivedAmount != null ? u.receivedAmount : keep.receivedAmount),
        receivedLocked: !!(keep.receivedLocked || u.receivedLocked),
        statementDone: !!(keep.statementDone || u.statementDone),
        censusAt: u.censusAt || keep.censusAt || null,
        quitacaoDate: (u.quitacaoFonte === "sienge" && this.isoQuitacao(u.quitacaoDate))
          || (keep.quitacaoFonte === "sienge" && this.isoQuitacao(keep.quitacaoDate))
          || this.sealQuitacao({
            quitado: !!(keep.quitado || u.quitado || keep.relFin === "quitado"),
            relFin: keep.relFin || u.relFin,
            quitacaoDate: keep.quitacaoDate || u.quitacaoDate,
            finAt: keep.finAt || u.finAt
          }, u.quitacaoDate, keep.quitacaoDate),
        quitacaoFonte: (u.quitacaoFonte === "sienge" || keep.quitacaoFonte === "sienge") ? "sienge" : (u.quitacaoFonte || keep.quitacaoFonte || null),
        quitadoEvidencia: !!(u.quitadoEvidencia || keep.quitadoEvidencia),
        finAt: u.finAt || keep.finAt,
        situation: u.situation || keep.situation,
        quitado: !!(keep.quitado || u.quitado || keep.relFin === "quitado"),
        relFin: (keep.quitado || keep.relFin === "quitado") ? (keep.relFin || "quitado") : (keep.relFin || u.relFin || null),
        filaAt: keep.filaAt || u.filaAt || null,
        receivableBillId: u.receivableBillId || keep.receivableBillId,
        customerId: u.customerId || keep.customerId,
        customerDoc: u.customerDoc || keep.customerDoc,
        customerName: u.customerName || keep.customerName,
        pmp3m: u.pmp3m != null ? u.pmp3m : keep.pmp3m,
        openParcelas: Array.isArray(u.openParcelas) && u.openParcelas.length ? u.openParcelas : keep.openParcelas,
        kpiVencidas: u.kpiVencidas != null ? u.kpiVencidas : keep.kpiVencidas,
        kpiAVencer: u.kpiAVencer != null ? u.kpiAVencer : keep.kpiAVencer
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

  isoQuitacao(v) {
    if (v == null || v === "") return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (br) return `${br[3]}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")}`;
    return this.isoDate(s);
  },

  /** Data de quitação trava: uma vez gravada, não some no baixar/classificar. */
  sealQuitacao(u, ...candidates) {
    const locked = this.isoQuitacao(u && u.quitacaoDate);
    if (locked) return locked;
    for (let i = 0; i < candidates.length; i++) {
      const iso = this.isoQuitacao(candidates[i]);
      if (iso) return iso;
    }
    if (u && (u.quitado || u.relFin === "quitado")) {
      return this.isoQuitacao(u.finAt) || this.todayStr();
    }
    return null;
  },

  /** A data de quitação do título no Sienge vale sobre a última baixa do extrato, mesmo que já tenha sido gravada. */
  quitacaoDoTitulo(next, bill) {
    const iso = this.isoQuitacao(bill && (bill.payOffDate || bill.payoffDate));
    if (iso) {
      next.quitacaoDate = iso;
      next.quitacaoFonte = "sienge";
    }
    return next;
  },

  /** Linhas visíveis quitadas cuja data ainda não veio do título: confere no Sienge, 3 por vez. */
  verificarQuitacoes(items) {
    if (typeof window.siengeFetchWithRetry !== "function" || this.state.loading) return;
    this._quitConferidas = this._quitConferidas || new Set();
    const ids = (items || []).map((i) => i.u).filter((u) => u && (u.quitado || u.relFin === "quitado") && u.receivableBillId
      && u.quitacaoFonte !== "sienge" && !this._quitConferidas.has(String(u.id))).map((u) => String(u.id));
    if (!ids.length) return;
    ids.forEach((id) => this._quitConferidas.add(id));
    this._quitFila = (this._quitFila || []).concat(ids);
    if (!this._quitRodando) this._rodarQuitFila();
  },

  async _rodarQuitFila() {
    this._quitRodando = true;
    const dirtyCc = new Set();
    try {
      while (this._quitFila.length) {
        const lote = this._quitFila.splice(0, 3);
        let mudou = false;
        await Promise.all(lote.map(async (id) => {
          const u0 = this.state.units.find((x) => String(x.id) === id);
          const billId = String((u0 && u0.receivableBillId) || "").replace(/^B-/, "").split("-")[0];
          if (!billId) return;
          let bill = null;
          try {
            bill = await window.siengeFetchWithRetry(`/accounts-receivable/receivable-bills/${encodeURIComponent(billId)}`, 2);
          } catch (e) {
            return;
          }
          const iso = this.isoQuitacao(bill && (bill.payOffDate || bill.payoffDate));
          const idx = this.state.units.findIndex((x) => String(x.id) === id);
          if (idx < 0) return;
          const cur = this.state.units[idx];
          if (!iso) {
            if (cur.siengeConferidoEm) return;
            const st = bill ? this.classifyReceivableBill(bill) : "";
            if (st !== "adimplente" && st !== "inadimplente") return;
            this.state.units[idx] = this.reabrirParaConferencia(cur);
            mudou = true;
            dirtyCc.add(String(cur.enterpriseId));
            return;
          }
          if (cur.quitacaoDate !== iso) mudou = true;
          this.state.units[idx] = { ...cur, quitacaoDate: iso, quitacaoFonte: "sienge" };
          dirtyCc.add(String(cur.enterpriseId));
        }));
        if (mudou) this.renderTable();
        await this.sleep(150);
      }
    } finally {
      this._quitRodando = false;
    }
    if (dirtyCc.size) {
      this.saveCache();
      for (const cc of dirtyCc) await this.saveFirebaseCc(cc);
    }
  },

  formatQuitacao(u) {
    const iso = this.isoQuitacao(u && u.quitacaoDate);
    if (!iso) return "—";
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
  },

  ensureQuitacaoLocked(units) {
    let changed = 0;
    const out = (units || []).map((u) => {
      if (!u) return u;
      const next = this.sanitizeUnit(u);
      if (next.quitacaoDate !== u.quitacaoDate || !!next.quitado !== !!u.quitado) changed += 1;
      return next;
    });
    return { units: out, changed };
  },

  persistQuitacaoIfDirty() {
    if (!this._quitacaoDirty) return;
    this._quitacaoDirty = false;
    this.saveCache();
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
    if (hasOpenBal && !(u.quitado || u.relFin === "quitado")) {
      let numOpen = info.contractNumber ? String(info.contractNumber) : "";
      if (numOpen && info.saleId != null && String(numOpen) === String(info.saleId) && this.displayContract(u)) {
        numOpen = this.displayContract(u);
      }
      return {
        ...u,
        contractId: info.saleId || u.contractId,
        contractNumber: numOpen || u.contractNumber || null,
        receivableBillId: info.receivableBillId || u.receivableBillId,
        customerId: info.customerId || u.customerId,
        customerDoc: info.customerDoc || u.customerDoc,
        customerName: info.customerName || u.customerName,
        outstandingBalance: Number(bal),
        presentDebitBalance: Number(bal),
        contractValue: value != null ? value : u.contractValue,
        receivedAmount: u.receivedLocked ? u.receivedAmount : u.receivedAmount,
        receivedLocked: !!u.receivedLocked,
        situation: info.situation || u.situation,
        quitado: false,
        quitacaoDate: this.isoQuitacao(u.quitacaoDate),
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
        quitacaoDate: this.sealQuitacao(u, info.payOffDate)
      };
    }
    const quitado = !distrato && (!!info.payOffDate || sitQuit);
    let num = info.contractNumber ? String(info.contractNumber) : "";
    if (num && info.saleId != null && String(num) === String(info.saleId) && this.displayContract(u)) {
      num = this.displayContract(u);
    }
    if (!num) num = this.displayContract(u) || "";
    const nextBal = bal == null ? u.outstandingBalance : Number(bal);
    return {
      ...u,
      contractId: info.saleId || u.contractId,
      contractNumber: num || u.contractNumber || null,
      receivableBillId: info.receivableBillId || u.receivableBillId,
      customerId: info.customerId || u.customerId,
      customerDoc: info.customerDoc || u.customerDoc,
      customerName: info.customerName || u.customerName,
      outstandingBalance: nextBal,
      presentDebitBalance: info.presentDebitBalance != null ? Number(info.presentDebitBalance) : u.presentDebitBalance,
        contractValue: value != null ? value : u.contractValue,
        receivedAmount: u.receivedAmount,
        receivedLocked: !!u.receivedLocked,
        situation: info.situation || u.situation,
      quitado: u.quitado || !!quitado,
      quitacaoDate: this.sealQuitacao({
        ...u,
        quitado: u.quitado || !!quitado
      }, info.payOffDate),
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
      customerName: mainCust.name || c.customerName || "",
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
    return null;
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
    if (typeof window.mapaJuridicoKpisFromInstallments === "function") {
      return window.mapaJuridicoKpisFromInstallments(installments);
    }
    let paid = 0;
    let add = 0;
    let disc = 0;
    let net = 0;
    let due = 0;
    let upcoming = 0;
    const today = new Date().toISOString().split("T")[0];
    (installments || []).forEach(inst => {
      const cb = Number(inst.currentBalance != null ? inst.currentBalance : inst.balanceDue || 0);
      (inst.receipts || []).forEach(rec => {
        if (typeof window.isWriteOffReceipt === "function" ? window.isWriteOffReceipt(rec) : false) return;
        paid += Number(rec.receiptValue || 0);
        add += Number(rec.additionalValue || 0);
        disc += Number(rec.discountValue || 0);
        net += Number(rec.netReceiptValue || 0);
      });
      const dueDate = String(inst.dueDate || inst.originalDueDate || "").slice(0, 10);
      if (cb > 0.009 && dueDate && dueDate < today) {
        const withAdd = Number(inst.currentBalanceWithAddition != null ? inst.currentBalanceWithAddition : NaN);
        due += Number.isFinite(withAdd) && withAdd > 0.009 ? withAdd : cb;
      } else if (cb > 0.009) upcoming += cb;
    });
    if (net <= 0.009 && paid > 0) net = Math.max(0, paid + add - disc);
    return { kpiPago: paid, kpiAcrescimo: add, kpiDesconto: disc, kpiLiquido: net, recebido: net, kpiVencidas: due, kpiAVencer: upcoming };
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
    const received = Number(kpis.recebido != null ? kpis.recebido : kpis.kpiLiquido) || 0;
    const quitado = aReceber <= 0.009 && received > 0.009 && (!u.contractValue || received >= Number(u.contractValue) * 0.8);
    const value = Number(kpis.kpiTotalContrato) > 0.009
      ? kpis.kpiTotalContrato
      : (u.contractValue != null ? Number(u.contractValue) : (received + aReceber));
    return {
      ...u,
      receivableBillId: u.receivableBillId || bill.billReceivableId || bill.receivableBillId || null,
      outstandingBalance: aReceber > 0.009 ? aReceber : (quitado ? 0 : u.outstandingBalance),
      receivedAmount: u.receivedLocked && !quitado && aReceber <= 0.009 ? u.receivedAmount : received,
      receivedLocked: true,
      contractValue: value || u.contractValue,
      quitado: aReceber > 0.009 && !(u.quitado || u.relFin === "quitado") ? false : (u.quitado || quitado),
      quitacaoDate: this.sealQuitacao({
        ...u,
        quitado: aReceber > 0.009 && !(u.quitado || u.relFin === "quitado") ? false : (u.quitado || quitado)
      }, this.lastBaixaFromInstallments(installments)),
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
    if ((g.hasOpen || g.remaining > 0.009) && !(u.quitado || u.relFin === "quitado")) {
      const received = g.paid != null ? g.paid : u.receivedAmount;
      return {
        ...u,
        receivableBillId: u.receivableBillId || g.billId,
        outstandingBalance: g.remaining,
        presentDebitBalance: g.remaining,
        receivedAmount: received,
        receivedLocked: true,
        quitado: false,
        quitacaoDate: this.isoQuitacao(u.quitacaoDate),
        statementDone: true,
        finAt: new Date().toISOString()
      };
    }
    const paid = Number(g.paid) || 0;
    const contract = Number(u.contractValue) || 0;
    const lastBaixa = g.lastBaixa || null;
    if (paid <= 0.009) return u;
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
      quitacaoDate: this.sealQuitacao({ ...u, quitado: true }, lastBaixa),
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
      if (String(u.enterpriseId) !== String(ccId) || !this.isSoldUnit(u)) return u;
      if (this.isSettledUnit(u)) {
        if (this.isoQuitacao(u.quitacaoDate)) return u;
        const g = this.pickExtractForUnit(u, byBill);
        if (!g || !g.lastBaixa) return u;
        const next = { ...u, quitado: true, quitacaoDate: this.sealQuitacao({ ...u, quitado: true }, g.lastBaixa) };
        if (next.quitacaoDate !== u.quitacaoDate) marked += 1;
        return next;
      }
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
    const bid = String(b.id || b.receivableBillId || b.billReceivableId || "").replace(/^B-/, "").split("-")[0];
    const uBill = String(u.receivableBillId || "").replace(/^B-/, "").split("-")[0];
    if (uBill && bid && uBill === bid) return true;
    const sale = String(u.contractId || u.saleId || "");
    const bSale = String(b.saleId || b.salesContractId || b.contractId || "");
    if (sale && bSale && sale === bSale) return true;
    const num = this.displayContract(u);
    if (num && [b.document, b.documentNumber, b.contractNumber, b.salesContractNumber, b.number].some(d => this.docMatchesContract(d, num))) {
      return true;
    }
    const bEnt = String(b.enterpriseId || b.costCenterId || "");
    if (bEnt && String(u.enterpriseId) !== bEnt) return false;
    const bName = b.unityName || b.unitName || b.unit || "";
    const uk = this.cleanUnitKey(u.name, u.enterpriseId);
    const bk = this.cleanUnitKey(bName, bEnt || u.enterpriseId);
    if (uk && bk && uk === bk) return true;
    if (this.unitNameMatches(bName, u.name)) return true;
    return false;
  },

  pickStatementForUnit(u, statements, bills) {
    const list = statements || [];
    const mine = (bills || []).filter(b => this.billMatchesEstoqueUnit(b, u));
    const byRb = list.filter(s => {
      const sid = String(s.billReceivableId || s.receivableBillId || s.id || "").replace(/^B-/, "").split("-")[0];
      const uBill = String(u.receivableBillId || "").replace(/^B-/, "").split("-")[0];
      if (uBill && sid && uBill === sid) return true;
      return mine.some(b => String(b.id || b.receivableBillId || "").replace(/^B-/, "").split("-")[0] === sid);
    });
    // Mais de um título da unidade (repactuação gera outro): vale o que ainda tem saldo, depois o que tem baixa.
    const peso = (s) => {
      const parc = (s && s.installments) || [];
      if (parc.some(i => Number(i.currentBalance != null ? i.currentBalance : i.balanceDue || 0) > 0.009)) return 2;
      return parc.some(i => (i.receipts || []).length) ? 1 : 0;
    };
    if (byRb.length) return byRb.slice().sort((a, b) => peso(b) - peso(a))[0];
    const byDoc = list.find(s => this.billMatchesUnit(s, u) || this.billMatchesEstoqueUnit(s, u));
    if (byDoc) return byDoc;
    return null;
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
      next.quitacaoDate = this.sealQuitacao(u, bill && (bill.payOffDate || bill.payoffDate));
      if (bill && this.classifyReceivableBill(bill) === "quitado") next.quitadoEvidencia = true;
      this.quitacaoDoTitulo(next, bill);
    } else if (status === "distratado") {
      next.quitado = false;
      next.quitacaoDate = null;
      next.situation = u.situation || "Distratado";
    } else {
      next.quitado = false;
      next.quitacaoDate = this.isoQuitacao(u.quitacaoDate);
      if (status === "inadimplente") {
        const ov = this.overdueValue(next);
        if (ov > 0.009 && next.outstandingBalance == null) next.outstandingBalance = ov;
      }
    }
    return next;
  },

  applyFichaMoney(u, installments, status, rb, quitadoNoSienge) {
    const kpis = this.kpisFromInstallments(installments);
    const aReceber = (Number(kpis.kpiVencidas) || 0) + (Number(kpis.kpiAVencer) || 0);
    const received = Number(kpis.recebido != null ? kpis.recebido : kpis.kpiLiquido) || 0;
    let fin = status;
    if (kpis.kpiVencidas <= 0.009 && kpis.kpiAVencer <= 0.009) {
      // Título zerado sem nenhum recebimento (ex.: repactuado em outro título) não é quitação.
      const prova = received > 0.009 || quitadoNoSienge || !!(rb && (rb.payOffDate || rb.payoffDate));
      fin = prova ? "quitado" : (status && status !== "quitado" ? status : "adimplente");
    }
    else if (kpis.kpiVencidas > 0.009) fin = "inadimplente";
    else if (aReceber > 0.009) fin = "adimplente";
    const next = this.applyRelFin(u, fin, rb);
    next.receivedAmount = received;
    next.receivedLocked = true;
    next.outstandingBalance = aReceber;
    next.presentDebitBalance = aReceber;
    next.kpiVencidas = kpis.kpiVencidas;
    next.kpiAVencer = kpis.kpiAVencer;
    next.kpiPago = kpis.kpiPago;
    next.kpiAcrescimo = kpis.kpiAcrescimo;
    next.kpiDesconto = kpis.kpiDesconto;
    next.kpiLiquido = kpis.kpiLiquido;
    if (Number(kpis.kpiTotalContrato) > 0.009) next.contractValue = kpis.kpiTotalContrato;
    if (fin === "quitado") {
      next.quitado = true;
      next.outstandingBalance = 0;
      next.presentDebitBalance = 0;
      next.quitacaoDate = this.sealQuitacao(
        { ...u, ...next, quitado: true },
        rb && (rb.payOffDate || rb.payoffDate),
        this.lastBaixaFromInstallments(installments)
      );
      this.quitacaoDoTitulo(next, rb);
    }
    next.pmp3m = this.pmpLastMonths(installments, 3);
    next.openParcelas = next.quitado ? [] : this.openParcelasFromInstallments(installments);
    if (rb && (rb.clientName || rb.customerName || rb.name)) {
      next.customerName = rb.clientName || rb.customerName || rb.name;
    }
    return next;
  },

  pmpLastMonths(installments, months) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (months || 3));
    const cut = cutoff.toISOString().split("T")[0];
    let days = 0;
    let n = 0;
    (installments || []).forEach(inst => {
      const due = String(inst.dueDate || inst.originalDueDate || "").slice(0, 10);
      (inst.receipts || []).forEach(rec => {
        const t = String(rec.type || rec.receiptType || rec.receiptTypeId || rec.typeId || "").toLowerCase();
        if (t.includes("distrato") || t.includes("cancel") || t === "3" || t === "7") return;
        const pay = this.isoDate(rec.date || rec.receiptDate || rec.paymentDate || rec.netReceiptDate);
        if (!pay || pay < cut || !due) return;
        const diff = Math.round((new Date(pay + "T12:00:00") - new Date(due + "T12:00:00")) / 86400000);
        if (!Number.isFinite(diff)) return;
        days += diff;
        n += 1;
      });
    });
    return n ? Math.round(days / n) : 0;
  },

  openParcelasFromInstallments(installments) {
    const today = new Date().toISOString().split("T")[0];
    const horizon = new Date();
    horizon.setMonth(horizon.getMonth() + 18);
    const lim = horizon.toISOString().split("T")[0];
    const out = [];
    (installments || []).forEach(inst => {
      const cb = Number(inst.currentBalance != null ? inst.currentBalance : inst.balanceDue || 0);
      const due = String(inst.dueDate || inst.originalDueDate || "").slice(0, 10);
      if (cb <= 0.009 || !due || due > lim) return;
      out.push({ due, val: cb, overdue: due < today });
    });
    out.sort((a, b) => String(a.due).localeCompare(String(b.due)));
    return out.slice(0, 24);
  },

  /** null = falhou no Sienge (o cliente continua pendente); [] = consultado e sem dados. */
  async fetchStatementsCached(customerId) {
    const id = String(customerId || "");
    if (!id) return [];
    if (!this.state.stCache) this.state.stCache = {};
    if (this.state.stCache[id]) return this.state.stCache[id];
    if (typeof window.siengeFetchWithRetry !== "function") return null;
    try {
      const res = await window.siengeFetchWithRetry(`/customer-financial-statements?customerId=${encodeURIComponent(id)}&includeSubJudice=true&includeRemadeInstallments=N&includeRenegotiation=N`, 3);
      const rows = this.flattenStatements(res);
      this.state.stCache[id] = rows;
      return rows;
    } catch (e) {
      if (Number(e && e.status) === 404) {
        this.state.stCache[id] = [];
        return [];
      }
      console.warn("[Estoque] extrato ficha", id, e);
      return null;
    }
  },

  async fetchReceivableBillsCached(customerId) {
    const id = String(customerId || "");
    if (!id) return [];
    if (!this.state.rbCache) this.state.rbCache = {};
    if (this.state.rbCache[id]) return this.state.rbCache[id];
    if (typeof window.siengeFetchWithRetry !== "function") return null;
    try {
      const res = await window.siengeFetchWithRetry(`/accounts-receivable/receivable-bills?customerId=${encodeURIComponent(id)}&limit=100&offset=0`, 3);
      const rows = this.extractRows(res);
      this.state.rbCache[id] = rows;
      return rows;
    } catch (e) {
      if (Number(e && e.status) === 404) {
        this.state.rbCache[id] = [];
        return [];
      }
      console.warn("[Estoque] receivable-bills", id, e);
      return null;
    }
  },

  async applyRelacionamentoBatimento(ccId, opts) {
    this.buildDefaulterIndex();
    const sold = this.state.units.filter(u => String(u.enterpriseId) === String(ccId) && this.isFinanceUnit(u));
    const byCust = new Map();
    sold.forEach(u => {
      if (this.isSettledUnit(u) || !this.isActiveFinance(u)) return;
      if (!u.customerId) return;
      const id = String(u.customerId);
      if (!byCust.has(id)) byCust.set(id, []);
      byCust.get(id).push(u);
    });
    const refreshSet = opts && opts.custIdsToRefresh ? opts.custIdsToRefresh : null;
    let custIds = [...byCust.keys()];
    if (refreshSet) custIds = custIds.filter((id) => refreshSet.has(String(id)));
    const today = this.todayStr();
    const label = opts && opts.label ? opts.label + " · " : "";
    let marked = 0;
    let failed = 0;
    let done = 0;
    const applyCustomer = (customerId, bills, statements) => {
      const unitIds = new Set(byCust.get(customerId).map(u => String(u.id)));
      this.state.units = this.state.units.map(u => {
        if (!unitIds.has(String(u.id))) return u;
        if (this.isSettledUnit(u) || !this.isActiveFinance(u)) return u;
        const mine = bills.filter(b => this.billMatchesEstoqueUnit(b, u));
        const stmt = this.pickStatementForUnit(u, statements, bills);
        const statusTitulos = this.classifyUnitBills(mine);
        const status = statusTitulos
          || (this.isInadimplente(u) ? "inadimplente" : this.defaultFinanceStatus(u));
        const rb = mine
          .filter(b => this.classifyReceivableBill(b) === status)
          .sort((a, b) => String(b.payOffDate || "").localeCompare(String(a.payOffDate || "")))[0]
          || mine[0]
          || null;
        let next;
        if (stmt && (stmt.installments || []).length) {
          marked += 1;
          next = this.applyFichaMoney(u, stmt.installments, status || "adimplente", rb || stmt, statusTitulos === "quitado");
        } else if (mine.length) {
          marked += 1;
          next = this.applyRelFin(u, status, rb);
        } else {
          next = { ...u, relFin: u.relFin || status, statementDone: true };
        }
        return { ...next, censusAt: today };
      });
    };
    const CONC = 3;
    for (let i = 0; i < custIds.length; i += CONC) {
      if (this.state.stopSync) break;
      const batch = custIds.slice(i, i + CONC);
      this.setProgress(`${label}Ficha ${Math.min(i + CONC, custIds.length)}/${custIds.length} — ${failed ? failed + " falha(s) no Sienge, ficam para a próxima rodada" : "ativos adimplentes e inadimplentes"}…`, (Math.min(i + CONC, custIds.length) / Math.max(custIds.length, 1)) * 100);
      const results = await Promise.all(batch.map(async (customerId) => {
        const [bills, statements] = await Promise.all([
          this.fetchReceivableBillsCached(customerId),
          this.fetchStatementsCached(customerId)
        ]);
        return { customerId, bills, statements };
      }));
      results.forEach(({ customerId, bills, statements }) => {
        if (bills == null || statements == null) {
          failed += 1;
          return;
        }
        applyCustomer(customerId, bills, statements);
      });
      done += batch.length;
      if (done % 30 < CONC) {
        this.saveCache();
        this.renderTable();
      }
      if (done % 60 < CONC) {
        try { await this.saveFirebaseCc(ccId); } catch (e) { console.warn("[Estoque] gravação parcial", ccId, e); }
      }
      await this.sleep(this.BATIMENTO_AUTO_PAUSED ? 220 : 60);
    }
    this.saveCache();
    await this.saveFirebaseCc(ccId);
    this.renderTable();
    this._batimentoFailed = (this._batimentoFailed || 0) + failed;
    return marked;
  },

  /* ---------- Conferência com o Contas a Receber do Sienge (extrato histórico do centro de custo) ---------- */
  async fetchExtratoCc(ccId) {
    const path = (s, e) => `/bulk-data/v1/customer-extract-history?startDueDate=${s}&endDueDate=${e}&costCenterId=${encodeURIComponent(ccId)}`
      + "&includeRemadeInstallments=false&includeCanceledInstallments=false&includeRevokedInstallments=false&includeRenegotiatedDischarge=false";
    const get = async (s, e, depth) => {
      try {
        return this.extractRows(await window.siengeFetchWithRetry(path(s, e), 2));
      } catch (err) {
        const sy = Number(s.slice(0, 4));
        const ey = Number(e.slice(0, 4));
        if (Number(err && err.status) !== 507 || depth > 6 || ey - sy < 1) throw err;
        const mid = Math.floor((sy + ey) / 2);
        const left = await get(s, `${mid}-12-31`, depth + 1);
        const right = await get(`${mid + 1}-01-01`, e, depth + 1);
        return left.concat(right);
      }
    };
    return get("1996-01-01", `${new Date().getFullYear() + 30}-12-31`, 0);
  },

  agruparExtratoCc(rows) {
    const hoje = this.todayStr();
    const map = {};
    (rows || []).forEach((r) => {
      if (!r || r.billReceivableId == null) return;
      const id = String(r.billReceivableId);
      const b = map[id] || (map[id] = { id, cliente: r.customer || {}, units: [], document: r.document || "", revoked: r.revokedBillReceivableDate || "", parcelas: {} });
      (r.units || []).forEach((x) => {
        if (x && x.id != null && !b.units.some((y) => y.id === String(x.id))) b.units.push({ id: String(x.id), name: x.name || "" });
      });
      (r.installments || []).forEach((p) => { if (p) b.parcelas[String(p.id) + "|" + String(p.dueDate || "")] = p; });
    });
    return Object.values(map).map((b) => {
      let aberto = 0;
      let vencido = 0;
      let vencidoComAcrescimo = 0;
      let recebido = 0;
      let ultimaBaixa = "";
      const abertas = [];
      Object.values(b.parcelas).forEach((p) => {
        const saldo = Number(p.currentBalance) || 0;
        const due = String(p.dueDate || "").slice(0, 10);
        if (saldo > 0.009) {
          aberto += saldo;
          const atrasada = !!due && due < hoje;
          if (atrasada) {
            vencido += saldo;
            vencidoComAcrescimo += Number(p.currentBalanceWithAddition) > saldo ? Number(p.currentBalanceWithAddition) : saldo;
          }
          abertas.push({ due, val: saldo, overdue: atrasada });
        }
        (p.receipts || []).forEach((rc) => {
          if (/distrat|cancel|reparcel|repactu/i.test(String(rc && rc.type || ""))) return;
          recebido += Number(rc.netReceipt != null ? rc.netReceipt : rc.value) || 0;
          const d = String(rc.date || "").slice(0, 10);
          if (d > ultimaBaixa) ultimaBaixa = d;
        });
      });
      abertas.sort((x, y) => x.due.localeCompare(y.due));
      return { ...b, aberto, vencido, vencidoComAcrescimo, recebido, ultimaBaixa, nParcelas: Object.keys(b.parcelas).length, abertas: abertas.slice(0, 24) };
    });
  },

  /** Recalcula as unidades do centro pelo extrato do Sienge e guarda o confronto Sienge × Integra. */
  async conferirComSienge(ccId) {
    if (typeof window.siengeFetchWithRetry !== "function") return null;
    this.setProgress(`Conferindo ${ccId} com o Contas a Receber do Sienge…`);
    const bills = this.agruparExtratoCc(await this.fetchExtratoCc(ccId));
    const vivos = bills.filter((b) => !b.revoked && b.nParcelas > 0);
    const agora = new Date().toISOString();
    const hoje = this.todayStr();
    const usados = new Set();
    const semTitulo = [];
    const distratadosNovos = [];
    let reabertos = 0;
    let quitadosNovos = 0;
    const revogados = bills.filter((b) => b.revoked);
    const daUnidade = (lista, u, rb) => {
      const porId = lista.filter((b) => b.units.some((x) => x.id === String(u.id)) || (rb && b.id === rb));
      return porId.length ? porId : lista.filter((b) => b.units.some((x) => this.unitNameMatches(x.name, u.name)));
    };
    this.state.units = this.state.units.map((u) => {
      if (String(u.enterpriseId) !== String(ccId) || !this.isFinanceUnit(u)) return u;
      const rb = String(u.receivableBillId || "").replace(/^B-/, "").split("-")[0];
      const mine = daUnidade(vivos, u, rb);
      if (u.distratoTitulo && mine.length) {
        u = { ...u, relFin: null, distratoTitulo: null, distratoData: null };
      }
      const fin0 = this.financialStatus(u);
      if (fin0 === "Distratado") return u;
      if (!mine.length) {
        if (fin0 !== "Ativo adimplente" && fin0 !== "Ativo inadimplente") return u;
        const rev = daUnidade(revogados, u, rb).sort((a, b) => String(b.revoked).localeCompare(String(a.revoked)))[0];
        if (rev) {
          distratadosNovos.push({ unidade: u.name, titulo: rev.id, cliente: (rev.cliente && rev.cliente.name) || u.customerName || "", data: String(rev.revoked).slice(0, 10) });
          return {
            ...u,
            relFin: "distratado",
            quitado: false,
            quitadoEvidencia: false,
            outstandingBalance: 0,
            presentDebitBalance: 0,
            kpiVencidas: 0,
            kpiAVencer: 0,
            openParcelas: [],
            distratoTitulo: rev.id,
            distratoData: String(rev.revoked).slice(0, 10),
            finAt: agora,
            siengeConferidoEm: agora
          };
        }
        semTitulo.push({ unidade: u.name, contrato: this.displayContract(u) || "", situacao: fin0, cliente: u.customerName || "" });
        return u;
      }
      mine.forEach((b) => usados.add(b.id));
      const aberto = mine.reduce((t, b) => t + b.aberto, 0);
      const vencido = mine.reduce((t, b) => t + b.vencido, 0);
      const vencidoAdd = mine.reduce((t, b) => t + b.vencidoComAcrescimo, 0);
      const recebido = mine.reduce((t, b) => t + b.recebido, 0);
      const principal = mine.slice().sort((a, b) => b.aberto - a.aberto || b.recebido - a.recebido)[0];
      const base = {
        ...u,
        receivableBillId: principal.id,
        customerId: u.customerId || (principal.cliente && principal.cliente.id != null ? String(principal.cliente.id) : u.customerId),
        customerName: (principal.cliente && principal.cliente.name) || u.customerName,
        receivedAmount: recebido,
        receivedLocked: true,
        statementDone: true,
        censusAt: hoje,
        finAt: agora,
        siengeConferidoEm: agora
      };
      if (aberto > 0.009) {
        if (fin0 === "Quitado") reabertos += 1;
        return {
          ...base,
          relFin: vencido > 0.009 ? "inadimplente" : "adimplente",
          quitado: false,
          quitacaoDate: null,
          quitacaoFonte: null,
          quitadoEvidencia: false,
          outstandingBalance: aberto,
          presentDebitBalance: aberto,
          kpiVencidas: vencido > 0.009 ? vencidoAdd : 0,
          kpiAVencer: Math.max(0, aberto - vencido),
          openParcelas: mine.reduce((l, b) => l.concat(b.abertas), []).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 24)
        };
      }
      if (recebido <= 0.009) return u;
      if (fin0 !== "Quitado") quitadosNovos += 1;
      const ultima = mine.map((b) => b.ultimaBaixa).filter(Boolean).sort().pop() || null;
      return {
        ...base,
        relFin: "quitado",
        quitado: true,
        quitadoEvidencia: true,
        outstandingBalance: 0,
        presentDebitBalance: 0,
        kpiVencidas: 0,
        kpiAVencer: 0,
        openParcelas: [],
        quitacaoDate: (u.quitacaoFonte === "sienge" && this.isoQuitacao(u.quitacaoDate)) || this.isoQuitacao(ultima) || this.sealQuitacao({ ...u, quitado: true })
      };
    });
    const doCc = this.state.units.filter((u) => String(u.enterpriseId) === String(ccId));
    const p = this.portfolioOf(doCc);
    const comSaldo = vivos.filter((b) => b.aberto > 0.009);
    this.state.conferencia = {
      ccId: String(ccId),
      at: agora,
      sienge: {
        aReceber: comSaldo.reduce((t, b) => t + b.aberto, 0),
        vencido: comSaldo.reduce((t, b) => t + b.vencido, 0),
        vencidoAdd: comSaldo.reduce((t, b) => t + b.vencidoComAcrescimo, 0),
        titulosVencidos: comSaldo.filter((b) => b.vencido > 0.009).length,
        titulos: comSaldo.length,
        clientes: new Set(comSaldo.map((b) => String((b.cliente && b.cliente.id) || b.id))).size,
        quitados: vivos.filter((b) => b.aberto <= 0.009 && b.recebido > 0.009).length
      },
      integra: { aReceber: p.aReceber, atraso: p.atraso, vencido: p.vencido, inadimplentes: p.inadimplentes, ativos: p.ativos, quitados: p.quitados, semSaldo: p.semSaldo },
      semUnidade: comSaldo.filter((b) => !usados.has(b.id)).map((b) => ({
        titulo: b.id, cliente: (b.cliente && b.cliente.name) || "", unidades: b.units.map((x) => x.name).join(", "), aberto: b.aberto
      })),
      semTitulo,
      distratadosNovos,
      reabertos,
      quitadosNovos
    };
    this.saveCache();
    await this.saveFirebaseCc(ccId);
    return this.state.conferencia;
  },

  conferenciaHtml() {
    const c = this.state.conferencia;
    const emp = this.requireEmpForApiHeavy();
    if (!c || !emp || c.ccId !== String(emp)) return "";
    const dif = c.integra.aReceber - c.sienge.aReceber;
    const temVencido = c.integra.vencido != null;
    const difVenc = temVencido ? c.integra.vencido - c.sienge.vencido : 0;
    const bateSaldo = Math.abs(dif) < 0.05;
    const bateVenc = Math.abs(difVenc) < 0.05;
    const bate = bateSaldo && bateVenc && !(c.semTitulo || []).length && !(c.semUnidade || []).length;
    const acresc = (c.sienge.vencidoAdd || 0) - (c.sienge.vencido || 0);
    const hora = new Date(c.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    const lista = (titulo, itens, linha) => itens.length ? `<details class="est-conf-det"><summary>${titulo} <b>${itens.length}</b></summary><ul>${itens.slice(0, 60).map(linha).join("")}</ul></details>` : "";
    return `<div class="est-conf ${bate ? "is-ok" : "is-bad"}">
      <div class="est-conf-h">
        <strong>Conferência com o Contas a Receber do Sienge · ${esc(c.ccId)}</strong>
        <small>${hora} · ${c.reabertos} reaberto(s) · ${c.quitadosNovos} quitado(s)${(c.distratadosNovos || []).length ? ` · ${c.distratadosNovos.length} distratado(s)` : ""} pela conferência</small>
      </div>
      <div class="est-conf-grid">
        <div><label>Sienge · a receber</label><b>${this.money(c.sienge.aReceber)}</b><small>${c.sienge.titulos} título(s) de ${c.sienge.clientes} cliente(s)</small>
          <small>Vencido (principal) <b>${this.money(c.sienge.vencido)}</b>${c.sienge.titulosVencidos != null ? ` em ${c.sienge.titulosVencidos} título(s)` : ""}${acresc > 0.009 ? ` · com juros e multa ${this.money(c.sienge.vencidoAdd)}` : ""}</small></div>
        <div><label>Integra · a receber</label><b>${this.money(c.integra.aReceber)}</b><small>${c.integra.ativos} ativo(s) · ${c.integra.quitados} quitado(s)${c.integra.semSaldo ? ` · ${c.integra.semSaldo} sem saldo` : ""}</small>
          ${temVencido ? `<small>Vencido (principal) <b>${this.money(c.integra.vencido)}</b> em ${c.integra.inadimplentes} contrato(s) · em atraso com juros e multa ${this.money(c.integra.atraso)}</small>` : ""}</div>
        <div><label>Diferença</label><b>${bate ? "Bate" : (bateSaldo ? "Saldo bate" : this.money(dif))}</b>
          <small>${bateSaldo ? "A receber igual ao Sienge" : "A receber diferente do Sienge"}${temVencido ? (bateVenc ? " · vencido igual" : ` · vencido difere ${this.money(difVenc)}`) : ""}</small>
          ${(c.semTitulo || []).length || (c.semUnidade || []).length ? `<small>Há unidades ou títulos sem par: veja abaixo</small>` : ""}</div>
      </div>
      ${lista("Unidades distratadas no Sienge (passaram para Distratado)", c.distratadosNovos || [], (i) => `<li>${esc(i.unidade)} · título ${esc(i.titulo)}${i.cliente ? " · " + esc(i.cliente) : ""}${i.data ? " · distrato " + esc(i.data.split("-").reverse().join("/")) : ""}</li>`)}
      ${lista("Títulos com saldo no Sienge sem unidade no Integra", c.semUnidade, (i) => `<li>Título ${esc(i.titulo)} · ${esc(i.cliente)}${i.unidades ? " · " + esc(i.unidades) : ""} · ${this.money(i.aberto)}</li>`)}
      ${lista("Unidades ativas no Integra sem título no Sienge", c.semTitulo, (i) => `<li>${esc(i.unidade)}${i.contrato ? " · contrato " + esc(i.contrato) : ""}${i.cliente ? " · " + esc(i.cliente) : ""} · ${esc(i.situacao)}</li>`)}
    </div>`;
  },

  async batimentoFinanceiro(opts) {
    opts = opts || {};
    const isAuto = !!opts.auto;
    try {
      if (this.state._autoFinanceRunning) {
        if (!isAuto) this.setProgress("O batimento já está rodando. Acompanhe o progresso acima.");
        return;
      }
      const today = this.todayStr();
      if (isAuto && this.state.batimentoDate === today && this.state.batimentoDone && !this.hasActivePending()) return;
      if (this.state.loading) {
        this.setProgress("O batimento já está em andamento.");
        return;
      }
      if (!this.state.units.length) await this.init();
      if (!this.state.units.length) {
        alert("Não há estoque salvo. Use Atualizar unidades uma vez.");
        return;
      }
      const empSel = this.requireEmpForApiHeavy();
      if (empSel === null) return;
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

      const forceFull = !isAuto;
      if (forceFull && empSel) {
        // Só o empreendimento filtrado: limpa o cache dos clientes dele e mantém o resto.
        const st = this.state.stCache || {};
        const rbc = this.state.rbCache || {};
        this.state.units.forEach((u) => {
          if (String(u.enterpriseId) !== empSel || !u.customerId) return;
          delete st[String(u.customerId)];
          delete rbc[String(u.customerId)];
        });
        this.state.stCache = st;
        this.state.rbCache = rbc;
      } else if (forceFull) {
        this.state.stCache = {};
        this.state.rbCache = {};
      }
      const pendenteNoEscopo = () => (this.state.units || []).some((u) => {
        if (empSel && String(u.enterpriseId) !== empSel) return false;
        return this.isActiveFinance(u) && !(u.statementDone && (u.receivedLocked || u.censusAt));
      });

      this.state._autoFinanceRunning = true;
      this.state.stopSync = false;
      this.setBusy(true);
      this.buildDefaulterIndex();
      this.stampFilaOnUnits(empSel);
      this.sealInferredFinance(empSel);
      this.renderTable();
      await this.enrichContracts({ quiet: true, keepBusy: true });
      if (this.state.stopSync) return;
      this.buildDefaulterIndex();
      this.stampFilaOnUnits(empSel);
      this.sealInferredFinance(empSel);
      this._batimentoFailed = 0;
      // Com empreendimento filtrado, reconsulta todos os ativos dele (teste completo), não só os pendentes.
      const planned = this.collectActiveCustomers(empSel, { onlyPending: !empSel });
      this._censusStillOpen = pendenteNoEscopo();

      let custIdsToRefreshByCc = planned.byCc;
      if (custIdsToRefreshByCc.size) {
        const impacted = new Set([...custIdsToRefreshByCc.keys()].map(String));
        ccIds = ccIds.filter(id => impacted.has(String(id)));
      } else {
        ccIds = [];
      }

      const stampedPre = 0;
      let marked = 0;
      if (ccIds.length && custIdsToRefreshByCc.size) {
        for (let i = 0; i < ccIds.length; i++) {
          if (this.state.stopSync) break;
          const ccId = ccIds[i];
          const ativosN = this.state.units.filter(u => String(u.enterpriseId) === String(ccId) && this.isActiveFinance(u)).length;
          this.setProgress(`Batimento ${i + 1}/${ccIds.length} — ${ccId} (${ativosN} ativos)…`, ((i + 1) / ccIds.length) * 100);
          const refreshSet = custIdsToRefreshByCc.get(String(ccId)) || null;
          marked += await this.applyRelacionamentoBatimento(ccId, {
            custIdsToRefresh: refreshSet,
            includeSettled: false,
            label: `Empreendimento ${i + 1}/${ccIds.length} (${ccId})`
          });
        }
      } else if (!this.state.stopSync) {
        this.setProgress("Base classificada. Nenhum contrato ativo adimplente ou inadimplente pendente de ficha.");
      }
      const stamped = forceFull
        ? this.stampFilaOnUnits(empSel, { onlyWithoutStatement: true })
        : stampedPre;
      let conferencia = null;
      if (empSel && !this.state.stopSync) {
        try {
          conferencia = await this.conferirComSienge(empSel);
        } catch (e) {
          console.warn("[Estoque] conferência com o Sienge", e);
        }
      }
      this._censusStillOpen = pendenteNoEscopo();
      this.sealInferredFinance(empSel);
      const inScope = u => !empSel || String(u.enterpriseId) === empSel;
      const qtdQ = this.state.units.filter(u => inScope(u) && this.financialStatus(u) === "Quitado").length;
      const qtdI = this.state.units.filter(u => inScope(u) && this.financialStatus(u) === "Ativo inadimplente").length;
      const qtdA = this.state.units.filter(u => inScope(u) && this.financialStatus(u) === "Ativo adimplente").length;
      this.paintEmpSelect();
      let day = this.todayStr();
      if (empSel) {
        // Teste de um empreendimento: grava só ele e não marca o dia como concluído.
        this.saveCache();
        await this.saveFirebaseCc(empSel);
      } else {
        day = await this.persistTodayResult({ markDone: !this._censusStillOpen });
      }
      const pendentes = (this.state.units || []).filter((u) => inScope(u) && this.isActiveFinance(u) && this.unitNeedsCensus(u)).length;
      let extra;
      if (this.state.stopSync) extra = ` Interrompido. ${pendentes} contrato(s) ativo(s) ainda não consultado(s) — rode de novo que ele continua de onde parou.`;
      else if (this._censusStillOpen) extra = ` ${pendentes} contrato(s) ativo(s) ainda não consultado(s)${this._batimentoFailed ? " (" + this._batimentoFailed + " falha(s) no Sienge)" : ""} — rode de novo que ele continua só nesses.`;
      else if (empSel) extra = conferencia
        ? ` Conferido com o Sienge: a receber ${this.money(conferencia.sienge.aReceber)} no Sienge × ${this.money(conferencia.integra.aReceber)} no Integra.`
        : " Não consegui ler o extrato do Sienge para a conferência.";
      else extra = " Todos os contratos ativos foram consultados. Base do dia gravada (estoque + caixa).";
      this.setProgress(`Batimento (${ccIds.length || 0} empreendimento(s)): ${qtdQ} quitados · ${qtdI} inadimplentes · ${qtdA} adimplentes · ${marked} ficha(s) · ${stamped} pela fila.${extra} ${day.split("-").reverse().join("/")}.`);
    } catch (e) {
      console.error("[Estoque] batimento", e);
      alert("Erro no batimento: " + (e.message || e));
    } finally {
      this.setBusy(false);
      this.state._autoFinanceRunning = false;
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
      const sealed = this.sealQuitacao({ ...u, quitado: true });
      if (sealed && sealed !== u.quitacaoDate) {
        u.quitado = true;
        u.quitacaoDate = sealed;
        this.state.units[idx] = u;
        this.saveCache();
      }
      this.setProgress("Contrato quitado — data de quitação mantida.");
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
          if (present === 0 && u.statementDone && Number(u.receivedAmount) > 0.009) {
            u.quitado = true;
            u.relFin = u.relFin || "quitado";
            u.quitacaoDate = this.sealQuitacao({ ...u, quitado: true });
          }
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
      if (this.requireEmpForApiHeavy() === null) return;
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

    this.state.stopSync = false;
    this.setProgress("Carregando a última classificação para não perder o batimento…");
    this._prevQuitados = await this.previousFinanceUnits();
    if (!empSel) {
      this.state.units = [];
      this.state.ccDone = [];
      this.state.complete = false;
      this.state.fetchedAt = null;
    }

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
    EstoqueComercialApp.init().then(() => {
      // Automaticamente tenta deixar o batimento do dia pronto.
      EstoqueComercialApp.autoStartDailyBatimento().catch(() => {});
    }).catch(() => {});
  }
});
