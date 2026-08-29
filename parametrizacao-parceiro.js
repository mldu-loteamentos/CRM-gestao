// Parametrização de Parceiro — várias obras, matriz DFC e credor (título a pagar)

const ParametrizacaoParceiroApp = {
  STORAGE_KEY: "crm_parcerias_v1",
  items: [],
  selectedId: null,
  selectedObraCode: "",
  detailTab: "geral",
  categories: [],
  ccSearch: "",
  loadingCats: false,
  creditorQuery: "",
  creditorHits: [],
  creditorSearching: false,
  _creditorTimer: null,
  _creditorIndex: null,
  _bankLoading: false,
  expanded: null,

  obraFromCc(id) {
    const digits = String(id || "").replace(/\D/g, "");
    if (digits.length >= 3) return digits.slice(0, -2);
    return digits || "";
  },

  allCostCenters() {
    return (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) ||
      (window.MOCK_DATA && window.MOCK_DATA.COST_CENTERS) || [];
  },

  costCentersOfObra(obra, companyId) {
    const prefix = String(obra || "");
    if (!prefix) return [];
    return this.allCostCenters().filter(cc => {
      if (companyId && cc.companyId != null && String(cc.companyId) !== String(companyId)) return false;
      return this.obraFromCc(cc.id) === prefix;
    });
  },

  companies() {
    return (window.AppState && AppState.companies) || [];
  },

  cobrancaInternaIds() {
    if (typeof getConfiguredInternalCompanyIds === "function") {
      return getConfiguredInternalCompanyIds().map(String);
    }
    try {
      const custom = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
      return Object.entries(custom)
        .filter(([, c]) => c && (c.cobranca_interna === 1 || c.cobranca_interna === true || c.cobranca_interna === "1"))
        .map(([id, c]) => String(c.company_id ?? c.id ?? id));
    } catch (e) {
      return [];
    }
  },

  eligibleCompanies() {
    const ids = new Set(this.cobrancaInternaIds());
    return this.companies()
      .filter(c => ids.has(String(c.id)))
      .sort((a, b) => Number(a.id) - Number(b.id));
  },

  isSociedade(p) {
    return String((p && p.kind) || "parceria") === "sociedade";
  },

  /** Grupos DFC que não entram no rateio de parceria (nem os nós internos). */
  PARCERIA_HIDDEN_DFC_ITEMS: [2, 6, 7, 8, 10, 11, 12],

  dfcItemNumber(node) {
    const s = String((node && (node.code || node.codigo || node.name || node.nome)) || "").trim();
    const m = s.match(/^(\d{1,2})\b/);
    return m ? parseInt(m[1], 10) : null;
  },

  isDfcHiddenForParceria(p, node) {
    if (this.isSociedade(p) || !node) return false;
    const n = this.dfcItemNumber(node);
    return n != null && this.PARCERIA_HIDDEN_DFC_ITEMS.includes(n);
  },

  normalizeItem(p) {
    if (!p) return p;
    p.kind = p.kind === "sociedade" ? "sociedade" : "parceria";
    if (!Array.isArray(p.obras)) p.obras = [];
    if (!p.obras.length && (p.obraCode || (p.costCenters && p.costCenters.length))) {
      p.obras = [{
        code: String(p.obraCode || ""),
        defaultPartnerShare: Number(p.defaultPartnerShare) || 0,
        costCenters: p.costCenters || [],
        accountShares: p.accountShares || {},
        naNodes: p.naNodes || {},
        naAccounts: p.naAccounts || {},
        inAccounts: p.inAccounts || {}
      }];
    }
    p.obras.forEach(o => {
      o.code = String(o.code || "");
      o.defaultPartnerShare = Number(o.defaultPartnerShare);
      if (!Number.isFinite(o.defaultPartnerShare)) o.defaultPartnerShare = Number(p.defaultPartnerShare) || 0;
      o.costCenters = o.costCenters || [];
      o.accountShares = o.accountShares || {};
      o.naNodes = o.naNodes || {};
      o.naAccounts = o.naAccounts || {};
      o.inAccounts = o.inAccounts || {};
    });
    p.creditor = p.creditor || { id: "", name: "", cpfCnpj: "", sharePct: "", paymentDay: "", bankInfo: null };
    p.creditor.paymentDay = p.creditor.paymentDay == null ? "" : p.creditor.paymentDay;
    p.creditor.bankList = p.creditor.bankList || [];
    p.obraCode = p.obras.map(o => o.code).filter(Boolean).join(", ");
    const first = p.obras[0];
    p.defaultPartnerShare = first ? first.defaultPartnerShare : (Number(p.defaultPartnerShare) || 0);
    p.costCenters = (p.obras || []).flatMap(o => o.costCenters || []);
    return p;
  },

  obrasOf(p) {
    return (p && p.obras) || [];
  },

  current() {
    const p = this.items.find(x => x.id === this.selectedId) || null;
    return p ? this.normalizeItem(p) : null;
  },

  currentObra(p) {
    const part = p || this.current();
    if (!part) return null;
    const obras = this.obrasOf(part);
    return obras.find(o => String(o.code) === String(this.selectedObraCode)) || obras[0] || null;
  },

  selectObra(code) {
    this.selectedObraCode = String(code || "");
    this.ccSearch = "";
    this.render();
  },

  setDetailTab(tab) {
    this.detailTab = tab || "geral";
    this.render();
    if (this.detailTab === "credor") this.ensureCreditorBank();
  },

  partnerPct(part, key) {
    if (this.isSociedade(part)) return 0;
    const obra = this.currentObra(part);
    if (!obra) return 0;
    if (this.isNA(part, key)) return 0;
    if (obra.accountShares && Object.prototype.hasOwnProperty.call(obra.accountShares, key)) {
      const n = Number(obra.accountShares[key]);
      return Number.isFinite(n) ? n : Number(obra.defaultPartnerShare) || 0;
    }
    return Number(obra.defaultPartnerShare) || 0;
  },

  dfcDefaultGroups() {
    if (typeof PlanoFinanceiroApp !== "undefined" && typeof PlanoFinanceiroApp.dfcTemplateGroups === "function") {
      return PlanoFinanceiroApp.dfcTemplateGroups();
    }
    return [];
  },

  dfcVisao() {
    let visoes = [];
    try { visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]") || []; } catch (e) { visoes = []; }
    if (typeof PlanoFinanceiroApp !== "undefined" && Array.isArray(PlanoFinanceiroApp.visoes) && PlanoFinanceiroApp.visoes.length) {
      visoes = PlanoFinanceiroApp.visoes;
    }
    const visao = visoes.find(v => v.id === "dfc_default") || visoes.find(v => /dfc/i.test(v.name || "")) || visoes[0];
    const groups = visao && Array.isArray(visao.groups) && visao.groups.length ? visao.groups : this.dfcDefaultGroups();
    return { name: (visao && visao.name) || "DFC Padrão", groups };
  },

  catName(id) {
    const c = (this.categories || []).find(x => String(x.id || x._id) === String(id));
    return (c && (c._name || c.name || c.description)) || "";
  },

  dfcGroups() {
    return this.dfcVisao().groups || [];
  },

  accountParentId(accId) {
    const g = this.dfcGroups().find(g => (g.accounts || []).map(String).includes(String(accId)));
    return g ? g.id : null;
  },

  nodeAncestors(nodeId) {
    const groups = this.dfcGroups();
    const ids = [];
    let cur = groups.find(g => g.id === nodeId);
    while (cur && cur.parentId) {
      ids.push(cur.parentId);
      cur = groups.find(g => g.id === cur.parentId);
    }
    return ids;
  },

  subtreeAccountIds(nodeId) {
    const groups = this.dfcGroups();
    const ids = [];
    const walk = (id) => {
      const n = groups.find(g => g.id === id);
      if (!n) return;
      (n.accounts || []).forEach(a => ids.push(String(a)));
      groups.filter(g => g.parentId === id).forEach(ch => walk(ch.id));
    };
    walk(nodeId);
    return ids;
  },

  subtreeNodeIds(nodeId) {
    const groups = this.dfcGroups();
    const ids = [];
    const walk = (id) => {
      ids.push(id);
      groups.filter(g => g.parentId === id).forEach(ch => walk(ch.id));
    };
    walk(nodeId);
    return ids;
  },

  hasAncestorNA(part, nodeId) {
    const obra = this.currentObra(part);
    if (!obra) return false;
    return this.nodeAncestors(nodeId).some(a => obra.naNodes && obra.naNodes[a]);
  },

  isAccountNA(part, accId) {
    const obra = this.currentObra(part);
    if (!obra) return false;
    const parent = this.accountParentId(accId);
    const ancs = parent ? [parent].concat(this.nodeAncestors(parent)) : [];
    const ancestorNA = ancs.some(a => obra.naNodes && obra.naNodes[a]);
    if (ancestorNA) return !(obra.inAccounts && obra.inAccounts[accId]);
    return !!(obra.naAccounts && obra.naAccounts[accId]);
  },

  isNA(part, key, ancestors) {
    const groups = this.dfcGroups();
    const isAcc = groups.some(g => (g.accounts || []).map(String).includes(String(key)));
    if (isAcc) return this.isAccountNA(part, key);
    const obra = this.currentObra(part);
    if (!obra) return false;
    if (obra.naNodes && obra.naNodes[key]) return true;
    if ((ancestors || []).some(a => obra.naNodes && obra.naNodes[a])) return true;
    return this.hasAncestorNA(part, key);
  },

  groupAccountStats(part, nodeId) {
    const accs = this.subtreeAccountIds(nodeId);
    const inCount = accs.filter(id => !this.isAccountNA(part, id)).length;
    return {
      total: accs.length,
      inCount,
      allIn: accs.length > 0 && inCount === accs.length,
      allOut: accs.length === 0 ? this.isNA(part, nodeId) : inCount === 0,
      partial: accs.length > 0 && inCount > 0 && inCount < accs.length
    };
  },

  toggleNA(key, isAccount) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!obra) return;
    obra.naNodes = obra.naNodes || {};
    obra.naAccounts = obra.naAccounts || {};
    obra.inAccounts = obra.inAccounts || {};
    if (isAccount) {
      if (this.isAccountNA(p, key)) {
        const parent = this.accountParentId(key);
        const ancs = parent ? [parent].concat(this.nodeAncestors(parent)) : [];
        const ancestorNA = ancs.some(a => obra.naNodes && obra.naNodes[a]);
        if (ancestorNA) obra.inAccounts[key] = true;
        delete obra.naAccounts[key];
      } else {
        const parent = this.accountParentId(key);
        const ancs = parent ? [parent].concat(this.nodeAncestors(parent)) : [];
        const ancestorNA = ancs.some(a => obra.naNodes && obra.naNodes[a]);
        if (ancestorNA) delete obra.inAccounts[key];
        else {
          obra.naAccounts[key] = true;
          delete obra.inAccounts[key];
        }
      }
    } else if (obra.naNodes[key]) {
      this.setSubtreeNA(key, false);
      return;
    } else if (this.hasAncestorNA(p, key)) {
      this.includeSubtree(key);
      return;
    } else {
      this.setSubtreeNA(key, true);
      return;
    }
    this.persist();
    this.renderKeepScroll();
  },

  setSubtreeNA(nodeId, out) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!obra) return;
    obra.naNodes = obra.naNodes || {};
    obra.naAccounts = obra.naAccounts || {};
    obra.inAccounts = obra.inAccounts || {};
    const accs = this.subtreeAccountIds(nodeId);
    const nodes = this.subtreeNodeIds(nodeId);
    if (out) {
      obra.naNodes[nodeId] = true;
      nodes.forEach(id => { if (id !== nodeId) delete obra.naNodes[id]; });
      accs.forEach(id => {
        delete obra.inAccounts[id];
        delete obra.naAccounts[id];
      });
    } else {
      nodes.forEach(id => delete obra.naNodes[id]);
      accs.forEach(id => {
        delete obra.inAccounts[id];
        delete obra.naAccounts[id];
      });
    }
    this.persist();
    this.renderKeepScroll();
  },

  includeSubtree(nodeId) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!obra) return;
    obra.inAccounts = obra.inAccounts || {};
    obra.naAccounts = obra.naAccounts || {};
    this.subtreeAccountIds(nodeId).forEach(id => {
      obra.inAccounts[id] = true;
      delete obra.naAccounts[id];
    });
    this.persist();
    this.renderKeepScroll();
  },

  excludeSubtreeExceptions(nodeId) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!obra) return;
    obra.inAccounts = obra.inAccounts || {};
    this.subtreeAccountIds(nodeId).forEach(id => delete obra.inAccounts[id]);
    this.persist();
    this.renderKeepScroll();
  },

  toggleExpand(id, scope) {
    this.closeNodeFoldMenu();
    this.expanded = this.expanded || new Set();
    const visao = this.dfcVisao();
    const groups = (visao && visao.groups) || [];
    const node = groups.find(g => String(g.id) === String(id));
    const sid = String(id);
    const nextOpen = !this.expanded.has(sid);
    const apply = (nid) => {
      if (nextOpen) this.expanded.add(String(nid));
      else this.expanded.delete(String(nid));
    };
    if (scope === "level" && node) {
      groups
        .filter(g => String(g.parentId || "") === String(node.parentId || ""))
        .forEach(g => apply(g.id));
    } else {
      apply(id);
    }
    this.renderKeepScroll();
  },

  closeNodeFoldMenu() {
    const el = document.getElementById("pp-node-fold-menu");
    if (el) el.remove();
    if (this._foldMenuCloser) {
      document.removeEventListener("click", this._foldMenuCloser);
      this._foldMenuCloser = null;
    }
  },

  openNodeFoldMenu(event, id) {
    event.preventDefault();
    event.stopPropagation();
    this.closeNodeFoldMenu();
    this.expanded = this.expanded || new Set();
    const expanded = this.expanded.has(String(id));
    const menu = document.createElement("div");
    menu.id = "pp-node-fold-menu";
    menu.style.cssText = "position:fixed;z-index:9999;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,0.12);min-width:200px;padding:6px;";
    const r = event.currentTarget.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + "px";
    menu.style.left = r.left + "px";
    menu.innerHTML = `
      <button type="button" onclick="ParametrizacaoParceiroApp.toggleExpand('${id}', 'this')" style="display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#1e293b;">${expanded ? "Recolher apenas este" : "Expandir apenas este"}</button>
      <button type="button" onclick="ParametrizacaoParceiroApp.toggleExpand('${id}', 'level')" style="display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#1e293b;">${expanded ? "Recolher o nível inteiro" : "Expandir o nível inteiro"}</button>
    `;
    document.body.appendChild(menu);
    this._foldMenuCloser = () => this.closeNodeFoldMenu();
    setTimeout(() => document.addEventListener("click", this._foldMenuCloser), 0);
  },

  proxyUrl(path) {
    const host = window.location.hostname;
    const isLocal = !host || host === "localhost" || host === "127.0.0.1";
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const origin = isLocal ? `http://localhost:${port}` : "";
    let p = String(path || "");
    if (!p.startsWith("/")) p = "/" + p;
    if (p.startsWith("/sienge-proxy")) p = "/api" + p;
    return origin + p;
  },

  async init() {
    await this.loadItems();
    this.render();
    this.loadCategories();
  },

  async loadItems() {
    let local = [];
    try { local = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "[]") || []; } catch (e) { local = []; }
    this.items = Array.isArray(local) ? local : [];
    if (window.firebaseDb && window.firebaseCollections) {
      try {
        const { doc, getDoc } = window.firebaseCollections;
        const snap = await getDoc(doc(window.firebaseDb, "config", "partner_parametrizations"));
        if (snap.exists()) {
          const raw = snap.data().list;
          const cloud = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (Array.isArray(cloud) && cloud.length) this.items = cloud;
        }
      } catch (e) {
        console.warn("[Parcerias] Firestore indisponível, usando cache local.", e);
      }
    }
    this.items.forEach(p => this.normalizeItem(p));
    if (this.items.length && !this.selectedId) this.selectedId = this.items[0].id;
    const cur = this.current();
    if (cur && !this.selectedObraCode && cur.obras[0]) this.selectedObraCode = cur.obras[0].code;
  },

  persist() {
    this.items.forEach(p => this.normalizeItem(p));
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.items));
    if (window.firebaseDb && window.firebaseCollections) {
      const { doc, setDoc } = window.firebaseCollections;
      setDoc(doc(window.firebaseDb, "config", "partner_parametrizations"), {
        list: JSON.stringify(this.items),
        updatedAt: Date.now()
      }, { merge: true }).catch(err => console.warn("[Parcerias] Falha ao sincronizar", err));
    }
  },

  async loadCategories() {
    this.loadingCats = true;
    this.render();
    try {
      if (window.SiengeApiService && typeof SiengeApiService.getPaymentCategories === "function") {
        this.categories = await SiengeApiService.getPaymentCategories() || [];
      }
    } catch (e) {
      console.warn("[Parcerias] Plano financeiro:", e);
      this.categories = [];
    }
    this.categories.forEach(c => {
      c._id = String(c.id || "");
      c._name = c.name || c.description || c.financialCategoryName || "";
      c._type = String(c.type || c.financialCategoryType || "");
    });
    const idSet = new Set(this.categories.map(c => c._id));
    this.categories.forEach(c => {
      let depth = 0;
      for (let i = 1; i < c._id.length; i++) {
        if (idSet.has(c._id.substring(0, i))) depth++;
      }
      c._depth = depth;
      c._isTotal = /total/i.test(c._type);
    });
    this.categories.sort((a, b) => a._id.localeCompare(b._id, "pt-BR", { numeric: true }));
    this.loadingCats = false;
    this.render();
  },

  startNew() {
    this.selectedId = "__new__";
    this.ccSearch = "";
    this.render();
  },

  seedCostCenters(obra, companyId, ccId) {
    const siblings = this.costCentersOfObra(obra, companyId);
    return (siblings.length ? siblings : [{ id: ccId, name: ccId }]).map(cc => ({
      id: String(cc.id),
      name: cc.name || String(cc.id),
      inAccount: true
    }));
  },

  makeObra(code, share, costCenters) {
    return {
      code: String(code || ""),
      defaultPartnerShare: Number(share) || 0,
      costCenters: costCenters || [],
      accountShares: {},
      naNodes: {},
      naAccounts: {},
      inAccounts: {}
    };
  },

  createFromForm() {
    const companyId = document.getElementById("pp-new-company").value;
    const partnerName = (document.getElementById("pp-new-partner").value || "").trim();
    const kindEl = document.querySelector('input[name="pp-new-kind"]:checked');
    const kind = (kindEl && kindEl.value) === "sociedade" ? "sociedade" : "parceria";
    if (!companyId || !partnerName) {
      alert("Informe a empresa e o nome do parceiro ou sócio.");
      return;
    }
    const company = this.companies().find(c => String(c.id) === String(companyId));
    const existing = this.items.find(p =>
      String(p.companyId) === String(companyId) &&
      String(p.partnerName || "").trim().toLowerCase() === partnerName.toLowerCase()
    );
    if (existing) {
      this.normalizeItem(existing);
      existing.kind = kind;
      this.selectedId = existing.id;
      this.selectedObraCode = (existing.obras[0] && existing.obras[0].code) || "";
      this.persist();
      this.render();
      return;
    }
    const item = {
      id: "par_" + Date.now(),
      companyId: String(companyId),
      companyName: company ? company.name : `Empresa ${companyId}`,
      partnerName,
      kind,
      obras: [],
      creditor: { id: "", name: "", cpfCnpj: "", sharePct: "" },
      createdAt: new Date().toISOString()
    };
    this.normalizeItem(item);
    this.items.push(item);
    this.selectedId = item.id;
    this.selectedObraCode = "";
    this.persist();
    this.render();
  },

  addObraFromForm() {
    const p = this.current();
    if (!p) return;
    const ccId = (document.getElementById("pp-add-obra-cc") && document.getElementById("pp-add-obra-cc").value || "").trim();
    const shareEl = document.getElementById("pp-add-obra-share");
    const share = this.isSociedade(p) ? 0 : Number((shareEl || {}).value);
    if (!ccId) {
      alert("Informe um centro de custo da nova obra.");
      return;
    }
    if (!this.isSociedade(p) && (!Number.isFinite(share) || share < 0 || share > 100)) {
      alert("O rateio da obra deve estar entre 0 e 100%.");
      return;
    }
    const obra = this.obraFromCc(ccId);
    if (p.obras.some(o => String(o.code) === String(obra))) {
      alert(`A obra ${obra} já está nesta parceria.`);
      this.selectedObraCode = obra;
      this.render();
      return;
    }
    const seed = this.seedCostCenters(obra, p.companyId, ccId);
    p.obras.push(this.makeObra(obra, share, seed));
    this.selectedObraCode = obra;
    this.detailTab = "centros";
    this.persist();
    this.render();
  },

  duplicateObra() {
    const p = this.current();
    const src = this.currentObra(p);
    if (!p || !src) return;
    const destRaw = (document.getElementById("pp-dup-obra") && document.getElementById("pp-dup-obra").value || "").trim();
    if (!destRaw) {
      alert("Informe o código da obra destino (ex.: 134) ou um C.C. dela (ex.: 13400).");
      return;
    }
    const destCode = destRaw.replace(/\D/g, "").length <= 3 ? destRaw.replace(/\D/g, "") : this.obraFromCc(destRaw);
    if (!destCode) {
      alert("Não foi possível identificar a obra destino.");
      return;
    }
    if (String(destCode) === String(src.code)) {
      alert("Escolha uma obra diferente da atual.");
      return;
    }
    const cloneShares = JSON.parse(JSON.stringify(src.accountShares || {}));
    const cloneNaN = JSON.parse(JSON.stringify(src.naNodes || {}));
    const cloneNaA = JSON.parse(JSON.stringify(src.naAccounts || {}));
    const cloneInA = JSON.parse(JSON.stringify(src.inAccounts || {}));
    let dest = p.obras.find(o => String(o.code) === String(destCode));
    if (!dest) {
      const seed = this.seedCostCenters(destCode, p.companyId, destRaw);
      dest = this.makeObra(destCode, src.defaultPartnerShare, seed);
      p.obras.push(dest);
    }
    dest.defaultPartnerShare = src.defaultPartnerShare;
    dest.accountShares = cloneShares;
    dest.naNodes = cloneNaN;
    dest.naAccounts = cloneNaA;
    dest.inAccounts = cloneInA;
    this.selectedObraCode = destCode;
    this.persist();
    this.render();
  },

  removeObra(code) {
    const p = this.current();
    if (!p) return;
    if (p.obras.length <= 1) {
      alert("A parceria precisa de ao menos uma obra. Exclua a parceria se quiser remover tudo.");
      return;
    }
    if (!confirm(`Remover a obra ${code} desta parceria?`)) return;
    p.obras = p.obras.filter(o => String(o.code) !== String(code));
    this.selectedObraCode = p.obras[0].code;
    this.persist();
    this.render();
  },

  select(id) {
    this.selectedId = id;
    this.ccSearch = "";
    const p = this.current();
    this.selectedObraCode = p && p.obras[0] ? p.obras[0].code : "";
    this.creditorQuery = "";
    this.creditorHits = [];
    this.detailTab = "geral";
    this.render();
  },

  updateField(field, value) {
    const p = this.current();
    if (!p) return;
    if (field === "partnerName") p.partnerName = value;
    if (field === "kind") p.kind = value === "sociedade" ? "sociedade" : "parceria";
    this.persist();
    this.render();
  },

  updateObraShare(value) {
    const obra = this.currentObra();
    if (!obra) return;
    const n = Number(value);
    obra.defaultPartnerShare = Number.isFinite(n) ? n : 0;
    this.persist();
    this.renderListOnly();
    const p = this.current();
    document.querySelectorAll("[data-pp-placeholder]").forEach(el => {
      el.setAttribute("placeholder", String(obra.defaultPartnerShare));
    });
    if (p) this.render();
  },

  clearCreditor() {
    const p = this.current();
    if (!p) return;
    p.creditor = { id: "", name: "", cpfCnpj: "", paymentDay: "", bankInfo: null, bankList: [] };
    this.creditorQuery = "";
    this.creditorHits = [];
    this.persist();
    this.render();
  },

  pickCreditorByIndex(i) {
    const c = this.creditorHits[Number(i)];
    if (!c) return;
    this.pickCreditor(c.id, c.name, c.cpfCnpj);
  },

  pickCreditor(id, name, doc) {
    const p = this.current();
    if (!p) return;
    const day = p.creditor && p.creditor.paymentDay;
    p.creditor = {
      id: String(id || ""),
      name: String(name || ""),
      cpfCnpj: String(doc || ""),
      paymentDay: day == null ? "" : day,
      bankInfo: null,
      bankList: [],
      bankLoaded: false
    };
    this.creditorQuery = "";
    this.creditorHits = [];
    this.persist();
    this.render();
    this.ensureCreditorBank();
  },

  updatePaymentDay(value) {
    const p = this.current();
    if (!p) return;
    p.creditor = p.creditor || {};
    const n = parseInt(String(value).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 31) {
      p.creditor.paymentDay = "";
    } else {
      p.creditor.paymentDay = n;
    }
    this.persist();
  },

  isDefaultBank(b) {
    const f = b && b.defaultFlag;
    return f === true || f === "S" || f === "s" || f === "Y" || f === "1" || f === 1;
  },

  accountTypeLabel(t) {
    const s = String(t || "").toUpperCase();
    if (t && typeof t === "object") return t.description || t.name || t.id || "";
    if (s === "C" || s === "CHECKING") return "Conta corrente";
    if (s === "P" || s === "SAVING" || s === "SAVINGS") return "Poupança";
    if (s === "I" || s === "INVESTMENT") return "Investimento";
    return t || "—";
  },

  async fetchCreditorBanks(creditorId) {
    const id = String(creditorId || "").trim();
    if (!id) return [];
    if (typeof SiengeApiService !== "undefined" && typeof SiengeApiService.getCreditorBankInformations === "function") {
      return SiengeApiService.getCreditorBankInformations(id);
    }
    const headers = { Authorization: typeof getBasicAuthHeader === "function" ? getBasicAuthHeader() : "" };
    const res = await fetch(this.proxyUrl(`/sienge-proxy/creditors/${encodeURIComponent(id)}/bank-informations?limit=200&offset=0`), { headers });
    if (!res.ok) return [];
    const json = await res.json();
    const list = json.results || json.data || [];
    return Array.isArray(list) ? list : [];
  },

  async ensureCreditorBank() {
    const p = this.current();
    if (!p || !p.creditor || !p.creditor.id) return;
    if (this._bankLoading) return;
    if (p.creditor.bankLoaded) return;
    this._bankLoading = true;
    this.render();
    try {
      const list = await this.fetchCreditorBanks(p.creditor.id);
      const cur = this.current();
      if (!cur || !cur.creditor || String(cur.creditor.id) !== String(p.creditor.id)) return;
      cur.creditor.bankList = list;
      const chosenId = cur.creditor.bankId;
      const picked = (chosenId && list.find(b => String(b.id) === String(chosenId)))
        || list.find(b => this.isDefaultBank(b))
        || list[0]
        || null;
      cur.creditor.bankInfo = picked;
      cur.creditor.bankId = picked && picked.id != null ? picked.id : "";
      cur.creditor.bankLoaded = true;
      this.persist();
    } catch (e) {
      console.warn("[Parcerias] Dados bancários do credor:", e);
      const cur = this.current();
      if (cur && cur.creditor) cur.creditor.bankLoaded = true;
    } finally {
      this._bankLoading = false;
      this.render();
    }
  },

  refreshCreditorBank() {
    const p = this.current();
    if (!p || !p.creditor) return;
    p.creditor.bankLoaded = false;
    this.ensureCreditorBank();
  },

  selectCreditorBank(bankId) {
    const p = this.current();
    if (!p || !p.creditor) return;
    const list = p.creditor.bankList || [];
    const picked = list.find(b => String(b.id) === String(bankId)) || null;
    p.creditor.bankId = picked && picked.id != null ? picked.id : "";
    p.creditor.bankInfo = picked;
    this.persist();
    this.render();
  },

  onCreditorSearch(val) {
    this.creditorQuery = val;
    clearTimeout(this._creditorTimer);
    this._creditorTimer = setTimeout(() => this.runCreditorSearch(val), 280);
  },

  normSearch(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  },

  mapCreditor(raw, fallbackId) {
    if (!raw) return null;
    let src = raw;
    if (typeof raw.raw_data === "string") {
      try { src = { ...JSON.parse(raw.raw_data), ...raw }; } catch (e) {}
    }
    const id = src.id || src.creditorId || fallbackId || "";
    const name = src.name || src.nome || raw.name || raw.nome || src.fantasyName || src.tradeName
      || src.corporateName || src.companyName || src.creditorName || "";
    const cpfCnpj = src.cpfCnpj || src.cnpj || src.cpf || src.document || raw.cpfCnpj || "";
    if (!id && !name) return null;
    return { id: String(id), name: String(name), cpfCnpj: String(cpfCnpj) };
  },

  creditorMatches(c, qRaw) {
    const q = this.normSearch(qRaw);
    const digits = String(qRaw || "").replace(/\D/g, "");
    if (!q && digits.length < 3) return false;
    const name = this.normSearch(c.name);
    const doc = String(c.cpfCnpj || "").replace(/\D/g, "");
    const id = String(c.id || "");
    const terms = q.split(/\s+/).filter(Boolean);
    const nameOk = terms.length && terms.every(t => name.includes(t));
    const docOk = digits.length >= 3 && doc.includes(digits);
    const idOk = q && id.toLowerCase().includes(q);
    return nameOk || docOk || idOk;
  },

  async loadFirebaseCreditors() {
    if (this._creditorIndex && this._creditorIndex.length) return this._creditorIndex;
    const out = [];
    const seen = new Set();
    const push = (mapped) => {
      if (!mapped || mapped.id === "") return;
      if (seen.has(mapped.id)) return;
      seen.add(mapped.id);
      out.push(mapped);
    };

    if (window.firebaseDb && window.firebaseCollections && window.firebaseCollections.getDocs) {
      const { collection, getDocs } = window.firebaseCollections;
      for (const col of ["sienge_creditors", "creditors"]) {
        try {
          const snap = await getDocs(collection(window.firebaseDb, col));
          snap.forEach(d => push(this.mapCreditor(d.data(), d.id)));
          if (out.length) break;
        } catch (e) {}
      }
    }

    if (!out.length) {
      try {
        const headers = { Authorization: typeof getBasicAuthHeader === "function" ? getBasicAuthHeader() : "" };
        let offset = 0;
        const limit = 200;
        for (let page = 0; page < 50; page++) {
          const res = await fetch(this.proxyUrl(`/sienge-proxy/creditors?limit=${limit}&offset=${offset}`), { headers });
          if (!res.ok) break;
          const json = await res.json();
          const rows = json.results || json.resultSet || json.data || [];
          if (!rows.length) break;
          rows.forEach(r => push(this.mapCreditor(r)));
          if (rows.length < limit) break;
          offset += limit;
        }
      } catch (e) {
        console.warn("[Parcerias] Falha ao carregar base de credores:", e);
      }
    }

    this._creditorIndex = out;
    return out;
  },

  async runCreditorSearch(val) {
    const q = String(val || "").trim();
    const digits = q.replace(/\D/g, "");
    const box = document.getElementById("pp-cred-sugg");
    if (q.length < 2 && digits.length < 3) {
      this.creditorHits = [];
      if (box) box.innerHTML = "";
      return;
    }
    this.creditorSearching = true;
    const loading = this._creditorIndex && this._creditorIndex.length
      ? "Buscando credor..."
      : "Carregando base de credores...";
    if (box) box.innerHTML = `<div style="padding:8px 10px;font-size:0.78rem;color:#64748b;">${loading}</div>`;
    const index = await this.loadFirebaseCreditors();
    const hits = index.filter(c => this.creditorMatches(c, q)).slice(0, 15);
    this.creditorHits = hits;
    this.creditorSearching = false;
    if (box) box.innerHTML = this.creditorSuggHtml();
  },

  creditorSuggHtml() {
    if (!this.creditorHits.length) {
      return this.creditorQuery
        ? `<div style="padding:8px 10px;font-size:0.78rem;color:#94a3b8;">Nenhum credor encontrado.</div>`
        : "";
    }
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;margin-top:4px;background:#fff;overflow:hidden;max-height:240px;overflow-y:auto;">
      ${this.creditorHits.map((c, idx) => {
        const name = this.esc(c.name);
        const doc = this.esc(c.cpfCnpj || "");
        const id = this.esc(c.id);
        return `<button type="button" onclick="ParametrizacaoParceiroApp.pickCreditorByIndex(${idx})"
          style="display:block;width:100%;text-align:left;border:none;background:#fff;padding:8px 10px;cursor:pointer;font-size:0.8rem;border-bottom:1px solid #f1f5f9;">
          <strong>${name}</strong> <span style="color:#94a3b8;">ID ${id}</span>
          <div style="font-size:0.72rem;color:#64748b;">${doc || "sem CPF/CNPJ"}</div>
        </button>`;
      }).join("")}
    </div>`;
  },

  renderListOnly() {
    const list = document.getElementById("pp-list");
    if (list) list.innerHTML = this.listHtml();
    if (window.lucide) lucide.createIcons();
  },

  setCcInAccount(ccId, checked) {
    const obra = this.currentObra();
    if (!obra) return;
    const row = obra.costCenters.find(c => String(c.id) === String(ccId));
    if (row) row.inAccount = !!checked;
    this.persist();
  },

  addCostCenter(ccId) {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!p || !obra) return;
    const id = String(ccId);
    if (obra.costCenters.some(c => String(c.id) === id)) return;
    const ccObra = this.obraFromCc(id);
    if (ccObra !== String(obra.code)) {
      if (!confirm(`O centro ${id} é da obra ${ccObra || "?"}. Incluir na obra ${obra.code}?`)) return;
    }
    const cc = this.allCostCenters().find(c => String(c.id) === id);
    obra.costCenters.push({ id, name: (cc && cc.name) || id, inAccount: true });
    this.ccSearch = "";
    this.persist();
    this.render();
  },

  removeCostCenter(ccId) {
    const obra = this.currentObra();
    if (!obra) return;
    obra.costCenters = obra.costCenters.filter(c => String(c.id) !== String(ccId));
    this.persist();
    this.render();
  },

  importObraCenters() {
    const p = this.current();
    const obra = this.currentObra(p);
    if (!p || !obra) return;
    this.costCentersOfObra(obra.code, p.companyId).forEach(cc => {
      if (!obra.costCenters.some(x => String(x.id) === String(cc.id))) {
        obra.costCenters.push({ id: String(cc.id), name: cc.name || String(cc.id), inAccount: true });
      }
    });
    this.persist();
    this.render();
  },

  setAccountShare(accountId, value) {
    const obra = this.currentObra();
    if (!obra) return;
    obra.accountShares = obra.accountShares || {};
    const raw = String(value).trim();
    if (raw === "") {
      delete obra.accountShares[accountId];
    } else {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) return;
      obra.accountShares[accountId] = Math.max(0, Math.min(100, n));
    }
    this.persist();
    const pct = this.partnerPct(this.current(), accountId);
    document.querySelectorAll(`[data-pp-pct="${accountId}"]`).forEach(el => { el.textContent = pct.toFixed(1) + "%"; });
    document.querySelectorAll(`[data-pp-bar="${accountId}"]`).forEach(el => { el.style.width = pct + "%"; });
  },

  applyDefaultToAll() {
    const obra = this.currentObra();
    if (!obra) return;
    obra.accountShares = {};
    this.persist();
    this.render();
  },

  removeCurrent() {
    const p = this.current();
    if (!p) return;
    if (!confirm(`Excluir a parceria de ${p.partnerName}?`)) return;
    this.items = this.items.filter(x => x.id !== p.id);
    this.selectedId = this.items[0] ? this.items[0].id : null;
    this.selectedObraCode = "";
    this.persist();
    this.render();
  },

  list() {
    return this.items;
  },

  listHtml() {
    if (!this.items.length) {
      return `<div style="padding:16px;color:#94a3b8;font-size:0.8rem;">Nenhuma prestação de contas cadastrada.</div>`;
    }
    return this.items.map(raw => {
      const p = this.normalizeItem(raw);
      const active = p.id === this.selectedId;
      const nCc = (p.obras || []).reduce((acc, o) => acc + (o.costCenters || []).filter(c => c.inAccount).length, 0);
      const obras = (p.obras || []).map(o => o.code).filter(Boolean).join(", ") || "—";
      const tipo = this.isSociedade(p) ? "Sociedade" : "Parceria";
      const shares = this.isSociedade(p)
        ? "distribuição de lucro"
        : ([...new Set((p.obras || []).map(o => o.defaultPartnerShare + "%"))].join(" / ") || "sem rateio");
      return `<button onclick="ParametrizacaoParceiroApp.select('${p.id}')"
        style="width:100%;text-align:left;border:1.5px solid ${active ? "#105436" : "#e5e7eb"};background:${active ? "#e8f5ee" : "#fff"};color:${active ? "#105436" : "#334155"};border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
        <div style="font-weight:800;font-size:0.82rem;">${this.esc(p.partnerName)}</div>
        <div style="font-size:0.72rem;opacity:0.8;margin-top:2px;">${tipo} · Obras ${this.esc(obras)} · ${nCc} C.C. · ${this.esc(shares)}</div>
      </button>`;
    }).join("");
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  captureScroll() {
    const ids = ["pp-tree-scroll", "pp-detail-scroll", "pp-list"];
    const pos = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) pos[id] = el.scrollTop;
    });
    const main = document.querySelector(".main-content");
    if (main) pos.main = main.scrollTop;
    pos.win = window.scrollY || document.documentElement.scrollTop || 0;
    return pos;
  },

  restoreScroll(pos) {
    if (!pos) return;
    const apply = () => {
      ["pp-tree-scroll", "pp-detail-scroll", "pp-list"].forEach(id => {
        const el = document.getElementById(id);
        if (el && pos[id] != null) el.scrollTop = pos[id];
      });
      const main = document.querySelector(".main-content");
      if (main && pos.main != null) main.scrollTop = pos.main;
      if (pos.win != null) window.scrollTo(0, pos.win);
    };
    apply();
    requestAnimationFrame(apply);
  },

  renderKeepScroll() {
    this._keepScrollPos = this.captureScroll();
    this.render();
  },

  render() {
    const root = document.getElementById("parametrizacao-parceiro-root");
    if (!root) return;
    const p = this.selectedId === "__new__" ? null : this.current();
    if (p && !this.selectedObraCode && p.obras[0]) this.selectedObraCode = p.obras[0].code;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 85px);font-family:inherit;">
        <div style="background:#105436;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-radius:12px 12px 0 0;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="handshake" style="width:18px;height:18px;color:#fff;"></i>
            </div>
            <div>
              <h2 style="margin:0;color:#fff;font-size:1.15rem;font-weight:600;">Parametrização de Parceiro</h2>
              <p style="margin:2px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Prestação de contas · parceria com rateio ou sociedade (SPE) · credor para título a pagar</p>
            </div>
          </div>
        </div>
        <div style="display:flex;flex:1;min-height:0;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <div style="width:260px;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;flex-shrink:0;">
            <div style="padding:12px;border-bottom:1px solid #f1f5f9;">
              <button onclick="ParametrizacaoParceiroApp.startNew()" class="btn btn-primary" style="width:100%;height:34px;font-size:0.8rem;">
                <i data-lucide="plus" style="width:14px;"></i> Nova prestação de contas
              </button>
            </div>
            <div id="pp-list" style="flex:1;overflow:auto;padding:10px;">${this.listHtml()}</div>
          </div>
          <div id="pp-detail-scroll" style="flex:1;overflow:auto;padding:16px 18px;min-width:0;">
            ${this.selectedId === "__new__" ? this.newFormHtml() : (p ? this.detailHtml(p) : this.emptyHtml())}
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    if (this._keepScrollPos) {
      const pos = this._keepScrollPos;
      this._keepScrollPos = null;
      this.restoreScroll(pos);
    }
  },

  emptyHtml() {
    return `<div class="crm-card" style="padding:40px;text-align:center;color:#64748b;">
      Cadastre uma prestação de contas. Informe se é parceria (rateio por obra) ou sociedade (SPE, sem rateio).
    </div>`;
  },

  newFormHtml() {
    const companies = this.eligibleCompanies();
    const field = "font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;min-width:0;width:100%;";
    const input = "width:100%;max-width:100%;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;";
    return `<div class="crm-card" style="padding:20px;max-width:560px;width:100%;overflow:hidden;box-sizing:border-box;">
      <h3 style="margin:0 0 6px;color:var(--color-primary);">Nova prestação de contas</h3>
      <p style="margin:0 0 16px;color:#64748b;font-size:0.82rem;line-height:1.45;">
        Informe a empresa (cobrança interna), o nome e se é <strong>parceria</strong> ou <strong>sociedade</strong>.
        Centro de custo e percentual ficam para depois, por obra — cada uma tem o próprio rateio.
        Em sociedade não há rateio: o que ocorre na SPE é dos sócios, via distribuição de lucro.
      </p>
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0;">
        <label style="${field}">Empresa
          <select id="pp-new-company" style="${input}">
            ${companies.map(c => `<option value="${c.id}">${c.id} — ${this.esc(c.name)}</option>`).join("") || '<option value="">Nenhuma empresa com cobrança interna</option>'}
          </select>
        </label>
        <label style="${field}">Parceiro / sócio
          <input id="pp-new-partner" placeholder="Nome do parceiro ou sócio" style="${input}">
        </label>
        <div>
          <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:6px;">Tipo</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;color:#334155;">
              <input type="radio" name="pp-new-kind" value="parceria" checked> Parceria
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;color:#334155;">
              <input type="radio" name="pp-new-kind" value="sociedade"> Sociedade
            </label>
          </div>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="ParametrizacaoParceiroApp.createFromForm()">Criar prestação de contas</button>
        <button class="btn btn-cancel" onclick="ParametrizacaoParceiroApp.selectedId=ParametrizacaoParceiroApp.items[0]&&ParametrizacaoParceiroApp.items[0].id;ParametrizacaoParceiroApp.render()">Cancelar</button>
      </div>
    </div>`;
  },

  detailHtml(p) {
    const obra = this.currentObra(p);
    const inAccount = ((obra && obra.costCenters) || []).filter(c => c.inAccount);
    const sociedade = this.isSociedade(p);
    const tab = this.detailTab || "geral";
    const nObras = (p.obras || []).length;
    const nCc = (p.obras || []).reduce((acc, o) => acc + (o.costCenters || []).filter(c => c.inAccount).length, 0);
    const credOk = !!(p.creditor && p.creditor.id);
    const btn = (id, label, extra) =>
      `<button type="button" class="customer-tab-btn ${tab === id ? "active" : ""}" onclick="ParametrizacaoParceiroApp.setDetailTab('${id}')">${label}${extra || ""}</button>`;
    let body = "";
    if (tab === "credor") body = this.credorTabHtml(p);
    else if (tab === "obras") body = this.obrasTabHtml(p, obra, sociedade);
    else if (tab === "centros") body = obra ? this.obraDetailHtml(p, obra, inAccount) : this.needObraHtml();
    else if (tab === "rateio") body = (obra || sociedade) ? this.matrixHtml(p) : this.needObraHtml();
    else body = this.geralTabHtml(p, sociedade);
    return `
      <div style="display:flex;flex-direction:column;gap:0;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;">Empresa ${this.esc(p.companyId)}</div>
            <div style="font-size:1.05rem;font-weight:800;color:#0f172a;">${this.esc(p.companyName)}</div>
            <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">${this.esc(p.partnerName)} · ${sociedade ? "Sociedade" : "Parceria"}</div>
          </div>
        </div>
        <div class="ficha-tabs-menu" style="margin-bottom:14px;">
          ${btn("geral", "Geral")}
          ${btn("credor", "Credor", credOk ? ` <span style="opacity:0.85;font-size:0.7rem;">✓</span>` : "")}
          ${btn("obras", "Obras", nObras ? ` <span style="opacity:0.85;font-size:0.7rem;">${nObras}</span>` : "")}
          ${btn("centros", "Centros de custo", nCc ? ` <span style="opacity:0.85;font-size:0.7rem;">${nCc}</span>` : "")}
          ${btn("rateio", sociedade ? "Sociedade" : "Rateio DFC")}
        </div>
        ${body}
      </div>
    `;
  },

  needObraHtml() {
    return `<div class="crm-card" style="padding:28px;text-align:center;color:#64748b;">
      Inclua uma obra na aba <strong>Obras</strong> para configurar centros de custo e rateio.
      <div style="margin-top:12px;"><button class="btn btn-primary" onclick="ParametrizacaoParceiroApp.setDetailTab('obras')">Ir para Obras</button></div>
    </div>`;
  },

  obraChipsHtml(p, sociedade) {
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
      ${(p.obras || []).map(o => {
        const on = String(o.code) === String(this.selectedObraCode);
        const label = sociedade ? ("Obra " + o.code) : ("Obra " + o.code + " · " + o.defaultPartnerShare + "%");
        return `<button type="button" onclick="ParametrizacaoParceiroApp.selectObra('${this.esc(o.code)}')"
          style="border:1.5px solid ${on ? "#105436" : "#e2e8f0"};background:${on ? "#105436" : "#fff"};color:${on ? "#fff" : "#334155"};border-radius:999px;padding:6px 12px;font-size:0.78rem;font-weight:800;cursor:pointer;">
          ${this.esc(label)}
        </button>`;
      }).join("") || `<span style="font-size:0.78rem;color:#94a3b8;">Nenhuma obra ainda. Inclua pelo centro de custo.</span>`}
    </div>`;
  },

  geralTabHtml(p, sociedade) {
    return `
      <div class="crm-card" style="padding:16px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <h3 style="margin:0 0 4px;font-size:0.95rem;color:var(--color-primary);">Dados gerais</h3>
            <p style="margin:0;font-size:0.78rem;color:#64748b;">Nome do parceiro e o tipo da prestação de contas.</p>
          </div>
          <button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.removeCurrent()" style="color:#dc2626;border-color:#fecaca;">Excluir</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;min-width:0;">
          <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;min-width:0;">Parceiro / sócio
            <input value="${this.esc(p.partnerName)}" onchange="ParametrizacaoParceiroApp.updateField('partnerName', this.value)"
              style="width:100%;max-width:100%;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;">
          </label>
          <div>
            <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:6px;">Tipo</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${sociedade ? "#e2e8f0" : "#105436"};background:${sociedade ? "#fff" : "#e8f5ee"};border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;">
                <input type="radio" name="pp-kind" ${sociedade ? "" : "checked"} onchange="ParametrizacaoParceiroApp.updateField('kind','parceria')"> Parceria
              </label>
              <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${sociedade ? "#105436" : "#e2e8f0"};background:${sociedade ? "#e8f5ee" : "#fff"};border-radius:8px;padding:8px 12px;cursor:pointer;font-size:0.82rem;font-weight:700;">
                <input type="radio" name="pp-kind" ${sociedade ? "checked" : ""} onchange="ParametrizacaoParceiroApp.updateField('kind','sociedade')"> Sociedade
              </label>
            </div>
            <p style="margin:8px 0 0;font-size:0.78rem;color:#64748b;line-height:1.4;">
              ${sociedade
                ? "Sociedade: não aplica rateio. Tudo que ocorre na SPE é de responsabilidade dos sócios, com distribuição de lucro."
                : "Parceria: cada centro de custo pode ter rateio próprio. Percentuais são definidos por obra, não neste cadastro inicial."}
            </p>
          </div>
        </div>
      </div>
    `;
  },

  credorTabHtml(p) {
    const cred = p.creditor || {};
    const banks = cred.bankList || [];
    const bank = cred.bankInfo || null;
    const day = cred.paymentDay == null ? "" : cred.paymentDay;
    const bankRow = (b) => {
      const on = bank && String(b.id) === String(bank.id);
      const acc = `${b.accountNumber || ""}${b.checkDigit ? "-" + b.checkDigit : ""}`;
      return `<label style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border:1px solid ${on ? "#a7f3d0" : "#e2e8f0"};background:${on ? "#ecfdf5" : "#fff"};border-radius:8px;cursor:pointer;margin-bottom:8px;">
        <input type="radio" name="pp-cred-bank" ${on ? "checked" : ""} onchange="ParametrizacaoParceiroApp.selectCreditorBank('${this.esc(String(b.id))}')" style="margin-top:3px;">
        <span style="font-size:0.8rem;line-height:1.4;color:#334155;">
          <strong>${this.esc(b.bank || "")} ${this.esc(b.nameOfBank || "")}</strong>
          ${this.isDefaultBank(b) ? `<span style="margin-left:6px;font-size:0.65rem;font-weight:800;color:#105436;background:#d1fae5;padding:1px 6px;border-radius:99px;">Padrão Sienge</span>` : ""}
          <span style="display:block;color:#64748b;">Ag. ${this.esc(b.agency || "—")} · Conta ${this.esc(acc)} · ${this.esc(this.accountTypeLabel(b.accountType))}</span>
          <span style="display:block;color:#64748b;">Forma: ${this.esc(b.paymentForm || "—")} · Favorecido: ${this.esc(b.nameOfRecipient || cred.name || "—")}</span>
          <span style="display:block;color:#64748b;">Doc.: ${this.esc(b.cpf || b.cnpj || cred.cpfCnpj || "—")}</span>
        </span>
      </label>`;
    };
    return `
      <div class="crm-card" style="padding:16px;">
        <h3 style="margin:0 0 4px;font-size:0.95rem;color:var(--color-primary);">Credor (título a pagar)</h3>
        <p style="margin:0 0 12px;font-size:0.78rem;color:#64748b;">Busque o credor por nome, CPF ou CNPJ, como na consulta de clientes. Os dados bancários vêm do cadastro do Sienge (mesmo GET do assistente de contas a pagar).</p>
        ${cred.id ? `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:10px 12px;">
            <div>
              <div style="font-weight:800;color:#065f46;">${this.esc(cred.name)}</div>
              <div style="font-size:0.75rem;color:#047857;">ID ${this.esc(cred.id)} · ${this.esc(cred.cpfCnpj || "sem documento")}</div>
            </div>
            <button type="button" onclick="ParametrizacaoParceiroApp.clearCreditor()" style="border:none;background:transparent;color:#dc2626;cursor:pointer;font-size:0.78rem;">Trocar</button>
          </div>
          <label style="display:flex;flex-direction:column;gap:4px;margin-top:14px;max-width:220px;font-size:0.75rem;font-weight:700;color:#475569;">Dia do pagamento
            <input type="number" min="1" max="31" placeholder="1 a 31" value="${this.esc(day)}"
              onchange="ParametrizacaoParceiroApp.updatePaymentDay(this.value)"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
            <span style="font-weight:500;color:#94a3b8;">Dia do mês em que o título a pagar será gerado.</span>
          </label>
          <div style="margin-top:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <h4 style="margin:0;font-size:0.85rem;color:#0f172a;">Dados bancários do credor</h4>
              <button type="button" class="btn btn-outline" onclick="ParametrizacaoParceiroApp.refreshCreditorBank()" style="height:28px;font-size:0.72rem;">Atualizar do Sienge</button>
            </div>
            ${this._bankLoading ? `<div style="font-size:0.78rem;color:#64748b;">Buscando GET /creditors/${this.esc(cred.id)}/bank-informations…</div>` : ""}
            ${!this._bankLoading && !banks.length && cred.bankLoaded ? `<div style="font-size:0.78rem;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;">Nenhuma conta bancária cadastrada neste credor no Sienge.</div>` : ""}
            ${banks.map(bankRow).join("")}
          </div>
        ` : `
          <input placeholder="Buscar credor por nome, CPF ou CNPJ" value="${this.esc(this.creditorQuery)}"
            oninput="ParametrizacaoParceiroApp.onCreditorSearch(this.value)"
            style="width:100%;max-width:520px;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
          <div id="pp-cred-sugg">${this.creditorSuggHtml()}</div>
        `}
      </div>
    `;
  },

  obrasTabHtml(p, obra, sociedade) {
    return `
      <div class="crm-card" style="padding:16px;overflow:hidden;">
        <h3 style="margin:0 0 8px;font-size:0.95rem;color:var(--color-primary);">Obras deste terrenista</h3>
        ${this.obraChipsHtml(p, sociedade)}
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end;">
          <label style="font-size:0.72rem;font-weight:700;color:#475569;min-width:180px;flex:1;">Adicionar obra (C.C.)
            <input id="pp-add-obra-cc" placeholder="Ex.: 13400" style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;">
          </label>
          ${sociedade ? "" : `<label style="font-size:0.72rem;font-weight:700;color:#475569;width:140px;">Rateio desta obra (%)
            <input id="pp-add-obra-share" type="number" min="0" max="100" step="0.01" value="${obra ? obra.defaultPartnerShare : 50}" style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;">
          </label>`}
          <button class="btn btn-primary" onclick="ParametrizacaoParceiroApp.addObraFromForm()" style="height:34px;font-size:0.78rem;">Incluir obra</button>
        </div>
        ${sociedade ? "" : `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-top:10px;">
          <label style="font-size:0.72rem;font-weight:700;color:#475569;min-width:180px;flex:1;">Duplicar rateio da obra ${this.esc(obra && obra.code)} para
            <input id="pp-dup-obra" placeholder="134 ou 13400" style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;box-sizing:border-box;">
          </label>
          <button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.duplicateObra()" style="height:34px;font-size:0.78rem;">Duplicar parametrização</button>
          ${p.obras.length > 1 ? `<button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.removeObra('${this.esc(obra && obra.code)}')" style="height:34px;font-size:0.78rem;color:#dc2626;">Remover obra</button>` : ""}
        </div>`}
        ${sociedade && p.obras.length > 1 ? `<div style="margin-top:10px;"><button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.removeObra('${this.esc(obra && obra.code)}')" style="height:34px;font-size:0.78rem;color:#dc2626;">Remover obra</button></div>` : ""}
      </div>
    `;
  },

  obraDetailHtml(p, obra, inAccount) {
    const sociedade = this.isSociedade(p);
    return `
      <div class="crm-card" style="padding:16px;overflow:hidden;">
        ${this.obraChipsHtml(p, sociedade)}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0;font-size:0.95rem;color:var(--color-primary);">Centros de custo da obra ${this.esc(obra.code)}</h3>
            <p style="margin:4px 0 0;font-size:0.78rem;color:#64748b;">${sociedade
              ? "Sociedade: os centros entram na conta da SPE, sem rateio."
              : "Marque os que entram na conta. " + inAccount.length + " ativo(s). Rateio padrão desta obra: " + obra.defaultPartnerShare + "%."}</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            ${sociedade ? "" : `<label style="font-size:0.72rem;font-weight:700;color:#475569;">% padrão
              <input type="number" min="0" max="100" step="0.01" value="${obra.defaultPartnerShare}"
                onchange="ParametrizacaoParceiroApp.updateObraShare(this.value)"
                style="width:80px;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;font-weight:800;">
            </label>`}
            <button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.importObraCenters()" style="height:34px;font-size:0.78rem;">Trazer irmãos da obra</button>
          </div>
        </div>
        <table class="custom-table" style="margin-top:12px;font-size:0.82rem;">
          <thead><tr><th>C.C.</th><th>Nome</th><th style="text-align:center;">Entra na conta</th><th></th></tr></thead>
          <tbody>
            ${(obra.costCenters || []).map(cc => `<tr>
              <td style="font-weight:800;">${this.esc(cc.id)}</td>
              <td>${this.esc(cc.name)}</td>
              <td style="text-align:center;">
                <input type="checkbox" ${cc.inAccount ? "checked" : ""} onchange="ParametrizacaoParceiroApp.setCcInAccount('${cc.id}', this.checked)">
              </td>
              <td style="text-align:right;"><button onclick="ParametrizacaoParceiroApp.removeCostCenter('${cc.id}')" style="border:none;background:transparent;color:#dc2626;cursor:pointer;">remover</button></td>
            </tr>`).join("") || `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px;">Nenhum centro de custo</td></tr>`}
          </tbody>
        </table>
        <div style="margin-top:10px;max-width:420px;">
          <input placeholder="Adicionar outro C.C. (ex. 13301)" value="${this.esc(this.ccSearch)}"
            oninput="ParametrizacaoParceiroApp.ccSearch=this.value;const b=document.getElementById('pp-cc-sugg');if(b)b.innerHTML=ParametrizacaoParceiroApp.ccSuggHtml();"
            style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
          <div id="pp-cc-sugg">${this.ccSuggHtml()}</div>
        </div>
      </div>
    `;
  },

  ccSuggHtml() {
    const p = this.current();
    const q = (this.ccSearch || "").toLowerCase().trim();
    if (!q || !p) return "";
    const sugg = this.allCostCenters().filter(cc =>
      (!p.companyId || cc.companyId == null || String(cc.companyId) === String(p.companyId)) &&
      (String(cc.id).includes(q) || String(cc.name || "").toLowerCase().includes(q))
    ).slice(0, 10);
    if (!sugg.length) return "";
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;margin-top:4px;background:#fff;overflow:hidden;">
      ${sugg.map(cc => `<button onclick="ParametrizacaoParceiroApp.addCostCenter('${cc.id}')"
        style="display:block;width:100%;text-align:left;border:none;background:#fff;padding:8px 10px;cursor:pointer;font-size:0.8rem;border-bottom:1px solid #f1f5f9;">
        <strong>${cc.id}</strong> — ${this.esc(cc.name || "")} <span style="color:#94a3b8;">obra ${this.obraFromCc(cc.id)}</span>
      </button>`).join("")}
    </div>`;
  },

  rateioControlsHtml(p, key, isAccount, ancestorNA, naSelf, partial) {
    if (this.isSociedade(p)) return "";
    const obra = this.currentObra(p);
    const iconBtn = (title, onclick, lucideName, color) =>
      `<button type="button" title="${title}" onclick="event.stopPropagation();${onclick}"
        style="width:26px;height:26px;border:none;background:transparent;color:${color};cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;">
        <i data-lucide="${lucideName}" style="width:14px;height:14px;"></i>
      </button>`;
    const pill = (text, extra) =>
      `<span style="font-size:0.65rem;font-weight:800;letter-spacing:0.3px;text-transform:uppercase;color:#94a3b8;background:#f1f5f9;border:1px solid #e2e8f0;padding:3px 8px;border-radius:99px;">${text}${extra || ""}</span>`;

    if (isAccount) {
      if (this.isAccountNA(p, key)) {
        return `<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
          ${pill("Fora")}
          ${iconBtn("Incluir no rateio", `ParametrizacaoParceiroApp.toggleNA('${key}', true)`, "undo-2", "#105436")}
        </div>`;
      }
    } else if (partial) {
      const stats = this.groupAccountStats(p, key);
      return `<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
        ${pill("Parcial", ` · ${stats.inCount}/${stats.total}`)}
        ${iconBtn("Incluir todas as contas deste grupo", `ParametrizacaoParceiroApp.includeSubtree('${key}')`, "check", "#105436")}
        ${iconBtn("Deixar todas fora", naSelf
          ? `ParametrizacaoParceiroApp.excludeSubtreeExceptions('${key}')`
          : `ParametrizacaoParceiroApp.setSubtreeNA('${key}', true)`, "ban", "#94a3b8")}
        ${naSelf ? iconBtn("Incluir o grupo inteiro de novo", `ParametrizacaoParceiroApp.setSubtreeNA('${key}', false)`, "undo-2", "#105436") : ""}
      </div>`;
    } else if (naSelf || ancestorNA) {
      const stats = this.groupAccountStats(p, key);
      if (stats.allIn && stats.total) {
        const pct = this.partnerPct(p, key);
        return `<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${pill("Exceção")}
          <span style="font-size:0.72rem;font-weight:800;color:#105436;min-width:42px;font-variant-numeric:tabular-nums;">${pct.toFixed(1)}%</span>
          ${iconBtn("Deixar o grupo fora", `ParametrizacaoParceiroApp.excludeSubtreeExceptions('${key}')`, "ban", "#94a3b8")}
        </div>`;
      }
      return `<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
        ${pill(naSelf ? "Fora" : "Fora (herda)")}
        ${iconBtn(naSelf ? "Incluir o grupo no rateio" : "Incluir todas as contas deste grupo", naSelf
          ? `ParametrizacaoParceiroApp.setSubtreeNA('${key}', false)`
          : `ParametrizacaoParceiroApp.includeSubtree('${key}')`, "undo-2", "#105436")}
        ${naSelf ? iconBtn("Incluir contas uma a uma (mantém o grupo fora)", `ParametrizacaoParceiroApp.includeSubtree('${key}')`, "check", "#105436") : ""}
      </div>`;
    }

    const custom = obra && obra.accountShares && Object.prototype.hasOwnProperty.call(obra.accountShares, key);
    const pct = this.partnerPct(p, key);
    const def = obra ? obra.defaultPartnerShare : 0;
    return `<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <div style="width:72px;height:6px;border-radius:99px;background:#e2e8f0;overflow:hidden;" title="Parceiro ${pct.toFixed(0)}% · Moura Leite ${(100 - pct).toFixed(0)}%">
        <div data-pp-bar="${this.esc(key)}" style="width:${pct}%;height:100%;background:#105436;"></div>
      </div>
      <input type="number" min="0" max="100" step="0.01" value="${custom ? pct : ""}" placeholder="${def}" data-pp-placeholder
        title="Percentual do parceiro nesta obra. Vazio herda o padrão (${def}%)."
        onclick="event.stopPropagation()"
        onchange="ParametrizacaoParceiroApp.setAccountShare('${key}', this.value)"
        style="width:58px;height:26px;border:1px solid ${custom ? "#105436" : "#e2e8f0"};border-radius:6px;text-align:right;padding:0 6px;font-size:0.75rem;font-weight:700;">
      <span data-pp-pct="${this.esc(key)}" style="font-size:0.72rem;font-weight:800;color:#105436;min-width:42px;font-variant-numeric:tabular-nums;">${pct.toFixed(1)}%</span>
      <button type="button" title="Fora da parceria" onclick="event.stopPropagation();ParametrizacaoParceiroApp.${isAccount ? `toggleNA('${key}', true)` : `setSubtreeNA('${key}', true)`}"
        style="width:26px;height:26px;border:none;background:transparent;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;"
        onmouseover="this.style.color='#ef4444';this.style.background='#fef2f2'" onmouseout="this.style.color='#94a3b8';this.style.background='transparent'">
        <i data-lucide="ban" style="width:14px;height:14px;"></i>
      </button>
    </div>`;
  },

  matrixHtml(p) {
    if (this.isSociedade(p)) {
      return `<div class="crm-card" style="padding:18px;background:#f8fafc;">
        <h3 style="margin:0 0 6px;font-size:0.95rem;color:var(--color-primary);">Sem rateio — sociedade</h3>
        <p style="margin:0;font-size:0.82rem;color:#64748b;line-height:1.45;">
          Nesta SPE não se aplica percentual por centro de custo. O resultado da operação é dos sócios e segue distribuição de lucro.
        </p>
      </div>`;
    }
    const visao = this.dfcVisao();
    const groups = visao.groups || [];
    const obra = this.currentObra(p);
    this.expanded = this.expanded || new Set();
    const roots = groups.filter(g => !g.parentId && !this.isDfcHiddenForParceria(p, g));
    const body = roots.map(n => this.dfcNodeRows(p, n, groups, 0, [])).join("");
    const def = obra ? obra.defaultPartnerShare : 0;
    return `
      <div>
        ${this.obraChipsHtml(p, false)}
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;min-height:360px;">
        <div style="padding:10px 15px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <span style="font-weight:700;font-size:0.9rem;color:#1e293b;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="folder-tree" style="width:16px;height:16px;"></i>
              Rateio DFC — obra ${this.esc(obra && obra.code)} · ${this.esc(visao.name)}
            </span>
            <div style="font-size:0.72rem;color:#64748b;margin-top:3px;">
              Contas 1.xxx entram como receita (positivo) e 2.xxx como despesa (negativo) na prestação de contas. Campo em branco herda ${def}%.
              Desmarcar um grupo tira todas as contas; dá para incluir de volta uma a uma (o grupo fica Parcial) ou usar o ícone de check para incluir todas.
            </div>
          </div>
          <button type="button" onclick="ParametrizacaoParceiroApp.applyDefaultToAll()"
            style="padding:4px 10px;background:#105436;color:#fff;border:none;border-radius:4px;font-size:0.75rem;cursor:pointer;white-space:nowrap;">
            Usar padrão em todas
          </button>
        </div>
        <div id="pp-tree-scroll" style="flex:1;overflow:auto;padding:15px;background:#fff;">
          ${body || `<div style="text-align:center;color:#94a3b8;padding:28px;font-size:0.85rem;">DFC Padrão sem nós. Configure em Plano Financeiro e Visões.</div>`}
        </div>
      </div>
      </div>
    `;
  },

  dfcNodeRows(p, node, groups, level, ancestors) {
    const children = groups.filter(g => g.parentId === node.id && !this.isDfcHiddenForParceria(p, g));
    const accounts = node.accounts || [];
    const hasKids = children.length > 0 || accounts.length > 0;
    const expanded = this.expanded.has(String(node.id));
    const naSelf = !!(this.currentObra(p) && this.currentObra(p).naNodes && this.currentObra(p).naNodes[node.id]);
    const ancestorNA = ancestors.some(a => this.currentObra(p) && this.currentObra(p).naNodes && this.currentObra(p).naNodes[a]);
    const stats = this.groupAccountStats(p, node.id);
    const partial = stats.partial;
    const na = (ancestorNA || naSelf) && !partial && !stats.allIn;

    let bg = "#fff", borderLeft = "#cbd5e1", icon = "folder";
    if (node.type === "total_n1" || level === 0) { bg = "#f8fafc"; borderLeft = "#0f766e"; icon = "layers"; }
    if (node.type === "totalizadora") { bg = "#fff"; borderLeft = "#3b82f6"; icon = "folder-open"; }
    if (node.type === "resultado") { bg = "#fff"; borderLeft = "#eab308"; icon = "file-text"; }
    if (na) { bg = "#f8fafc"; borderLeft = "#cbd5e1"; }

    const chevron = hasKids
      ? `<div style="display:flex;align-items:center;gap:0;position:relative;">
           <button type="button" onclick="ParametrizacaoParceiroApp.toggleExpand('${node.id}', 'this')" title="Recolher / expandir este"
             style="background:none;border:none;cursor:pointer;padding:0;color:#64748b;display:flex;align-items:center;">
             <i data-lucide="${expanded ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i>
           </button>
           <button type="button" onclick="ParametrizacaoParceiroApp.openNodeFoldMenu(event, '${node.id}')" title="Recolher este ou o nível inteiro"
             style="background:none;border:none;cursor:pointer;padding:0 2px;color:#94a3b8;display:flex;align-items:center;">
             <i data-lucide="chevrons-up-down" style="width:12px;height:12px;"></i>
           </button>
         </div>`
      : `<span style="width:14px;"></span>`;

    let html = `
      <div style="margin-left:${level * 20}px;margin-bottom:5px;opacity:${na ? 0.72 : 1};">
        <div style="background:${bg};border:1px solid #e2e8f0;border-left:4px solid ${borderLeft};border-radius:6px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 1px 2px rgba(0,0,0,0.02);">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
            ${chevron}
            <i data-lucide="${icon}" style="width:14px;height:14px;color:${borderLeft};flex-shrink:0;"></i>
            <span style="font-weight:${node.type === "total_n1" || level === 0 ? "700" : "600"};font-size:0.85rem;color:#1e293b;">${this.esc(node.name)}</span>
          </div>
          ${this.rateioControlsHtml(p, node.id, false, ancestorNA, naSelf, partial)}
        </div>
    `;

    if (expanded) {
      children.forEach(ch => { html += this.dfcNodeRows(p, ch, groups, level + 1, ancestors.concat(node.id)); });
      if (accounts.length) {
        html += `<div style="margin-left:28px;margin-top:5px;margin-bottom:10px;display:flex;flex-direction:column;gap:4px;padding-left:10px;border-left:2px solid #e2e8f0;">`;
        accounts.forEach(accId => {
          const naAcc = this.isAccountNA(p, accId);
          html += `
            <div style="background:#fff;border:1px solid #cbd5e1;padding:4px 8px;border-radius:4px;font-size:0.75rem;display:flex;justify-content:space-between;align-items:center;gap:8px;opacity:${naAcc ? 0.72 : 1};">
              <div style="min-width:0;"><strong style="color:#0f172a;">${this.esc(accId)}</strong> <span style="color:#64748b;">${this.esc(this.catName(accId))}</span></div>
              ${this.rateioControlsHtml(p, accId, true, false, naAcc, false)}
            </div>`;
        });
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  }
};

window.ParametrizacaoParceiroApp = ParametrizacaoParceiroApp;
window.obraFromCostCenter = (id) => ParametrizacaoParceiroApp.obraFromCc(id);
