// Prestação de Contas — DFC Padrão (cadastro de visões) × caixa/banco Sienge × parametrização de parceiro

const PrestacaoContasApp = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() === 0 ? 12 : new Date().getMonth(),
  companyId: "1",
  costCenterIds: ["13600", "13601"],
  selectionType: "M",
  partnershipId: "",
  ccSearch: "",
  loading: false,
  error: "",
  movements: [],
  lines: [],
  totals: { receitas: 0, custos: 0, despesas: 0, custosDespesas: 0, gco: 0 },
  expanded: new Set(),
  _expandInited: false,
  selectedAccount: null,
  accountMovements: [],
  accountIndex: {},
  unmatchedInfo: { total: 0, samples: [] },
  categories: [],

  init() {
    if (this.month === 12 && new Date().getMonth() === 0) this.year = new Date().getFullYear() - 1;
    const companies = (window.AppState && AppState.companies) || [];
    if (companies.length && !companies.some(c => String(c.id) === String(this.companyId))) {
      this.companyId = String(companies[0].id);
    }
    this.ensureDfcReady();
    this.ensureCategories();
    if (typeof ParametrizacaoParceiroApp !== "undefined" && (!ParametrizacaoParceiroApp.items || !ParametrizacaoParceiroApp.items.length)) {
      ParametrizacaoParceiroApp.loadItems().then(() => this.render()).catch(() => {});
    }
    this.render();
  },

  ensureDfcReady() {
    if (typeof PlanoFinanceiroApp === "undefined") return;
    if (!Array.isArray(PlanoFinanceiroApp.visoes) || !PlanoFinanceiroApp.visoes.length) {
      try {
        PlanoFinanceiroApp.visoes = JSON.parse(localStorage.getItem(PlanoFinanceiroApp.STORAGE_KEY || "crm_plano_visoes_v2") || "[]") || [];
      } catch (e) {
        PlanoFinanceiroApp.visoes = [];
      }
    }
    if (typeof PlanoFinanceiroApp.ensureDfcDefault === "function") PlanoFinanceiroApp.ensureDfcDefault();
  },

  async ensureCategories() {
    if (this.categories.length) return;
    try {
      if (typeof PlanoFinanceiroApp !== "undefined" && PlanoFinanceiroApp.categories && PlanoFinanceiroApp.categories.length) {
        this.categories = PlanoFinanceiroApp.categories;
        return;
      }
      if (window.SiengeApiService) {
        const cats = await SiengeApiService.getPaymentCategories();
        this.categories = (cats || []).map(c => ({ ...c, name: c.name || c.description || "" }));
      }
    } catch (e) {
      console.warn("[Prestação de Contas] Plano financeiro:", e);
    }
  },

  /** Mesma visão DFC Padrão do Fluxo de Caixa / cadastro de visões. */
  visao() {
    if (typeof FluxoCaixaApp !== "undefined" && typeof FluxoCaixaApp.visao === "function") {
      return FluxoCaixaApp.visao();
    }
    this.ensureDfcReady();
    if (typeof PlanoFinanceiroApp !== "undefined") {
      const dfc = (PlanoFinanceiroApp.visoes || []).find(v => v.id === "dfc_default");
      if (dfc) return dfc;
    }
    let visoes = [];
    try { visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]") || []; } catch (e) { visoes = []; }
    return visoes.find(v => v.id === "dfc_default") || visoes[0] || { groups: [] };
  },

  fc() {
    return typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : null;
  },

  normAccountKey(id) {
    const fc = this.fc();
    if (fc && fc.normAccountKey) return fc.normAccountKey(id);
    return String(id || "").replace(/\D/g, "");
  },

  formatAccountCode(id) {
    const fc = this.fc();
    if (fc && fc.formatAccountCode) {
      const prev = fc.categories;
      fc.categories = this.categories;
      const out = fc.formatAccountCode(id);
      fc.categories = prev;
      return out;
    }
    const raw = String(id || "").trim();
    if (raw.includes(".")) return raw;
    return raw;
  },

  catName(id) {
    const c = this.categories.find(x => String(x.id) === String(id));
    return (c && (c.name || c.description)) || "";
  },

  activePartnership() {
    if (!this.partnershipId || typeof ParametrizacaoParceiroApp === "undefined") return null;
    const p = (ParametrizacaoParceiroApp.items || []).find(x => x.id === this.partnershipId);
    return p ? ParametrizacaoParceiroApp.normalizeItem(p) : null;
  },

  applyPartnership(id) {
    this.partnershipId = id || "";
    if (!id || typeof ParametrizacaoParceiroApp === "undefined") {
      this.render();
      return;
    }
    const p = (ParametrizacaoParceiroApp.items || []).find(x => x.id === id);
    if (!p) { this.render(); return; }
    const part = ParametrizacaoParceiroApp.normalizeItem(p);
    this.companyId = String(part.companyId);
    const obras = Array.isArray(part.obras) && part.obras.length ? part.obras : [];
    this.costCenterIds = [...new Set(obras.flatMap(o => (o.costCenters || []).filter(c => c.inAccount).map(c => String(c.id))))];
    this.render();
  },

  periodBounds() {
    const y = Number(this.year);
    const m = Number(this.month);
    const last = new Date(y, m, 0).getDate();
    const pad = n => String(n).padStart(2, "0");
    return {
      start: `${y}-${pad(m)}-01`,
      end: `${y}-${pad(m)}-${pad(last)}`,
      label: new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    };
  },

  fmt(val) {
    return (Number(val) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  costCenters() {
    const all = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) ||
      (window.MOCK_DATA && window.MOCK_DATA.COST_CENTERS) || [];
    return all.filter(cc => !this.companyId || String(cc.companyId) === String(this.companyId) || cc.companyId == null);
  },

  ccSuggestionsHtml() {
    const q = (this.ccSearch || "").toLowerCase().trim();
    if (!q) return "";
    const suggestions = this.costCenters()
      .filter(cc => String(cc.id).includes(q) || String(cc.name || "").toLowerCase().includes(q))
      .slice(0, 12);
    if (!suggestions.length) return "";
    return `<div style="margin-top:6px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;max-width:480px;overflow:hidden;">
      ${suggestions.map(cc => `<button onclick="PrestacaoContasApp.addCostCenter('${cc.id}')"
        style="display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:#fff;cursor:pointer;font-size:0.8rem;border-bottom:1px solid #f1f5f9;">
        <strong>${cc.id}</strong> — ${cc.name || ""}
      </button>`).join("")}
    </div>`;
  },

  onCcSearch(val) {
    this.ccSearch = val;
    const box = document.getElementById("pc-cc-sugg");
    if (box) box.innerHTML = this.ccSuggestionsHtml();
  },

  addCostCenter(id) {
    const cid = String(id || "").trim();
    if (!cid || this.costCenterIds.includes(cid)) return;
    this.costCenterIds.push(cid);
    this.ccSearch = "";
    this.render();
  },

  removeCostCenter(id) {
    this.costCenterIds = this.costCenterIds.filter(x => String(x) !== String(id));
    this.render();
  },

  ignoredAccountKeys() {
    const set = new Set();
    const v = this.visao();
    (v.ignoredAccounts || []).forEach(id => {
      const sid = String(id || "").trim();
      if (!sid) return;
      set.add(sid);
      const nk = this.normAccountKey(sid);
      if (nk) set.add(nk);
    });
    return set;
  },

  signedAmount(node, categoryId, categoryName, amount, reducerFlag, categoryType, mov) {
    const fc = this.fc();
    if (fc && typeof fc.signedAmount === "function") {
      return fc.signedAmount(node, categoryId, categoryName, amount, reducerFlag, categoryType, mov);
    }
    const abs = Math.abs(Number(amount) || 0);
    const digits = String(categoryId || "").replace(/\D/g, "");
    return digits.charAt(0) === "2" ? -abs : abs;
  },

  isReducingAccount(categoryId, categoryName, node) {
    const fc = this.fc();
    if (fc && typeof fc.isReducingAccount === "function") {
      return fc.isReducingAccount(categoryId, categoryName, node);
    }
    return !!(node && node.redutora);
  },

  allocate(mov) {
    const fcApp = this.fc();
    if (fcApp && typeof fcApp.movAdvanceRole === "function" && fcApp.movAdvanceRole(mov) === "abatimento") {
      return [];
    }
    const amount = Number(mov.bankMovementAmount) || 0;
    const wanted = this.costCenterIds.map(String);
    let cats = Array.isArray(mov.financialCategories) ? mov.financialCategories : [];
    // Sem plano financeiro = transferência / aplicação — fora do DFC
    if (!cats.length) return [];
    if (wanted.length) {
      cats = cats.filter(fc => wanted.includes(String(fc.costCenterId)));
    }
    if (!cats.length) return [];

    const ignored = this.ignoredAccountKeys();
    const part = this.activePartnership();
    const PP = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : null;
    const shareEntries = (fcApp && typeof fcApp.categoryShareEntries === "function")
      ? fcApp.categoryShareEntries(cats)
      : cats.map((fc) => ({ fc, share: 1 / cats.length }));

    return shareEntries.map(({ fc, share }) => {
      const categoryId = String(fc.financialCategoryId || "").trim();
      if (!categoryId) return null;
      const nk = this.normAccountKey(categoryId);
      if (ignored.has(categoryId) || (nk && ignored.has(nk))) return null;

      let factor = 1;
      if (part && PP) {
        const obra = PP.obraForCostCenter(part, fc.costCenterId)
          || (part.obras && part.obras[0])
          || null;
        if (obra) {
          if (!PP.accountEntersPartnership(part, obra, categoryId)) return null;
          factor = PP.partnershipAmountFactor(part, obra, categoryId);
          if (!factor) return null;
        }
      }

      return {
        amount: amount * share * factor,
        categoryId,
        categoryName: fc.financialCategoryName || this.catName(fc.financialCategoryId) || "Sem nome",
        costCenterId: fc.costCenterId,
        costCenterName: fc.costCenterName,
        reducer: fc.financialCategoryReducer,
        categoryType: fc.financialCategoryType,
        mov
      };
    }).filter(Boolean);
  },

  buildTree(allocs) {
    this.ensureDfcReady();
    const visao = this.visao();
    const groups = (visao.groups || []).map(g => ({
      ...g,
      amount: 0,
      accountRows: []
    }));
    const byId = Object.fromEntries(groups.map(g => [g.id, g]));
    const part = this.activePartnership();
    const PP = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : null;

    const accToNode = {};
    groups.forEach(g => {
      (g.accounts || []).forEach(id => {
        const sid = String(id).trim();
        if (!sid) return;
        accToNode[sid] = g.id;
        const nk = this.normAccountKey(sid);
        if (nk) accToNode[nk] = g.id;
        const dotted = this.formatAccountCode(sid);
        if (dotted) {
          accToNode[dotted] = g.id;
          const nk2 = this.normAccountKey(dotted);
          if (nk2) accToNode[nk2] = g.id;
        }
      });
    });

    const unmatched = { total: 0, samples: [] };
    const accIndex = {};

    allocs.forEach(a => {
      const rawId = String(a.categoryId || "").trim();
      if (!rawId) return;
      const nk = this.normAccountKey(rawId);
      const dotted = this.formatAccountCode(rawId);
      const nid = accToNode[rawId] || (nk && accToNode[nk]) || (dotted && accToNode[dotted]) || null;
      if (!nid || !byId[nid]) {
        unmatched.total += Number(a.amount) || 0;
        if (unmatched.samples.length < 12) {
          unmatched.samples.push({ id: rawId, name: a.categoryName, amount: a.amount });
        }
        return;
      }
      const node = byId[nid];
      const amount = this.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov);
      node.amount += amount;

      const idxKey = nk || rawId;
      if (!accIndex[idxKey]) {
        accIndex[idxKey] = {
          id: rawId,
          displayId: this.formatAccountCode(rawId),
          name: a.categoryName,
          amount: 0,
          items: [],
          parentId: node.id,
          redutora: !!(node.redutora || this.isReducingAccount(a.categoryId, a.categoryName, node)
            || /^(S|SIM|TRUE|1|Y|R)$/i.test(String(a.reducer || "").trim()))
        };
      }
      accIndex[idxKey].amount += amount;
      accIndex[idxKey].name = a.categoryName || accIndex[idxKey].name;
      accIndex[idxKey].items.push({ ...a, amount });
    });
    this.unmatchedInfo = unmatched;
    this.accountIndex = accIndex;

    Object.values(accIndex).forEach(acc => {
      const node = byId[acc.parentId];
      if (node) node.accountRows.push(acc);
    });

    groups.forEach(g => {
      g.accountRows.sort((a, b) => String(a.displayId || a.id).localeCompare(String(b.displayId || b.id), "pt-BR", { numeric: true }));
    });

    // Rollup bottom-up
    const depthOf = (g) => {
      let d = 0, cur = g;
      while (cur && cur.parentId && byId[cur.parentId]) { d++; cur = byId[cur.parentId]; }
      return d;
    };
    [...groups].filter(g => g.type !== "formula").sort((a, b) => depthOf(b) - depthOf(a)).forEach(g => {
      const children = groups.filter(c => c.parentId === g.id && c.type !== "formula");
      children.forEach(ch => { g.amount += ch.amount; });
    });

    const sumNodes = (ids) => ids.reduce((s, id) => s + ((byId[id] && byId[id].amount) || 0), 0);
    const applySum = (id, parts) => {
      if (!byId[id]) return;
      byId[id].amount = sumNodes(parts);
    };
    applySum("g_03", ["g_04", "g_05"]);
    applySum("g_06", ["g_01", "g_02", "g_03"]);
    applySum("g_08", ["g_06", "g_07"]);
    applySum("g_10", ["g_08", "g_09"]);
    applySum("g_12", ["g_10", "g_11"]);

    const hideNode = (node) => {
      if (!part || !PP || !node) return false;
      return PP.isDfcHiddenForParceria(part, node);
    };

    if (!this._expandInited) {
      groups.filter(g => !g.parentId && g.type !== "formula").forEach(g => this.expanded.add(g.id));
      this._expandInited = true;
    }

    const rows = [];
    const pushNode = (node, level) => {
      if (hideNode(node)) return;
      const children = groups.filter(g => g.parentId === node.id && !hideNode(g));
      const hasKids = children.length > 0 || (node.accountRows && node.accountRows.length > 0);
      rows.push({
        id: node.id,
        code: node.code || "",
        name: node.name || "",
        amount: node.amount,
        level,
        hasKids,
        isAccount: false,
        isFormula: node.type === "formula",
        type: node.type
      });
      if (!this.expanded.has(node.id)) return;
      children.forEach(ch => pushNode(ch, level + 1));
      (node.accountRows || []).forEach(acc => {
        const code = acc.displayId || this.formatAccountCode(acc.id);
        const redFlag = acc.redutora ? " (−)" : "";
        rows.push({
          id: acc.id,
          code,
          name: `${acc.name || ""}${redFlag}`.trim(),
          amount: acc.amount,
          level: level + 1,
          isAccount: true,
          hasKids: false,
          parentId: node.id
        });
      });
    };
    groups.filter(g => !g.parentId).forEach(g => pushNode(g, 0));

    const receitas = (byId.g_01 && byId.g_01.amount) || 0;
    const custos = (byId.g_04 && byId.g_04.amount) || 0;
    const despesas = (byId.g_05 && byId.g_05.amount) || 0;
    const gco = (byId.g_06 && byId.g_06.amount) || (receitas + custos + despesas);
    const custosDespesas = custos + despesas;
    this.totals = { receitas, custos, despesas, custosDespesas, gco };
    this.lines = rows;
  },

  rebuildFromMovements() {
    const allocs = [];
    (this.movements || []).forEach(mov => this.allocate(mov).forEach(a => allocs.push(a)));
    this.buildTree(allocs);
  },

  async load() {
    if (!this.costCenterIds.length) {
      this.error = "Selecione ao menos um centro de custo / obra (ex.: 13600 e 13601).";
      this.render();
      return;
    }
    this.loading = true;
    this.error = "";
    this.selectedAccount = null;
    this.render();
    const { start, end } = this.periodBounds();
    try {
      await this.ensureCategories();
      this.ensureDfcReady();
      if (!window.SiengeApiService || typeof SiengeApiService.getBankMovements !== "function") {
        throw new Error("API de caixa e banco indisponível.");
      }
      this.movements = await SiengeApiService.getBankMovements(start, end, {
        selectionType: this.selectionType || "M",
        companyId: this.companyId,
        costCentersId: this.costCenterIds
      });
      this.rebuildFromMovements();
      if (!this.movements.length) {
        this.error = "Nenhum movimento de caixa/banco no período para os filtros selecionados.";
      } else if (this.unmatchedInfo && Math.abs(this.unmatchedInfo.total) > 0.005) {
        this.error = "";
      }
    } catch (err) {
      console.error("[Prestação de Contas]", err);
      this.error = err && err.message ? err.message : "Falha ao consultar a API de movimento bancário.";
      this.movements = [];
      this.lines = [];
    } finally {
      this.loading = false;
      this.render();
    }
  },

  toggle(id) {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.rebuildFromMovements();
    this.render();
  },

  openAccount(id) {
    this.selectedAccount = id;
    const nk = this.normAccountKey(id);
    const acc = (this.accountIndex && (this.accountIndex[id] || this.accountIndex[nk])) || null;
    this.accountMovements = acc ? acc.items : [];
    this.render();
  },

  render() {
    const root = document.getElementById("prestacao-contas-root");
    if (!root) return;
    const { start, end, label } = this.periodBounds();
    const companies = (window.AppState && AppState.companies) || [];
    const ccs = this.costCenters();
    const partnerships = (typeof ParametrizacaoParceiroApp !== "undefined" && ParametrizacaoParceiroApp.items) || [];
    const monthLabel = label.charAt(0).toUpperCase() + label.slice(1);
    const ccNames = this.costCenterIds.map(id => {
      const cc = ccs.find(c => String(c.id) === String(id));
      return cc ? `${id} - ${cc.name}` : id;
    });
    const visao = this.visao();
    const unmatched = this.unmatchedInfo || { total: 0, samples: [] };
    const hasUnmatched = Math.abs(Number(unmatched.total) || 0) > 0.005;
    const part = this.activePartnership();

    root.innerHTML = `
      <div class="crm-card" style="padding: 1.2rem 1.4rem;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div>
            <h2 style="margin:0;color:var(--color-primary);font-size:1.15rem;display:flex;align-items:center;gap:8px;">
              <i data-lucide="receipt" style="width:20px;"></i> Prestação de Contas
            </h2>
            <p style="margin:6px 0 0;color:#64748b;font-size:0.82rem;">
              Visão <strong>${visao.name || "DFC Padrão"}</strong> (cadastro de visões) · Realizado · caixa/banco Sienge
              ${part ? ` · parceiro <strong>${part.partnerName || ""}</strong> (entra / não entra + %)` : ""}
            </p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button type="button" class="btn btn-outline" onclick="switchTab('plano-financeiro','Plano Financeiro e Visões')"
              style="height:38px;display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;">
              <i data-lucide="settings-2" style="width:14px;"></i> Visões DFC
            </button>
            <button class="btn btn-primary" onclick="PrestacaoContasApp.load()" ${this.loading ? "disabled" : ""}
              style="display:inline-flex;align-items:center;gap:8px;height:38px;">
              ${this.loading
                ? '<span style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span> Consultando Sienge...'
                : '<i data-lucide="refresh-cw" style="width:14px;"></i> Carregar DFC'}
            </button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#475569;">
            Mês
            <select id="pc-month" onchange="PrestacaoContasApp.month=Number(this.value)"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
              ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${this.month === i + 1 ? "selected" : ""}>${String(i + 1).padStart(2, "0")}</option>`).join("")}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#475569;">
            Ano
            <input type="number" value="${this.year}" onchange="PrestacaoContasApp.year=Number(this.value)"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#475569;grid-column:span 2;">
            Empresa
            <select onchange="PrestacaoContasApp.companyId=this.value;PrestacaoContasApp.render()"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
              ${companies.map(c => `<option value="${c.id}" ${String(c.id) === String(this.companyId) ? "selected" : ""}>${c.id} — ${c.name}</option>`).join("") || '<option value="1">1</option>'}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#475569;grid-column:span 2;">
            Seleção por data
            <select onchange="PrestacaoContasApp.selectionType=this.value"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
              <option value="M" ${this.selectionType === "M" ? "selected" : ""}>Movimento (caixa/banco)</option>
              <option value="P" ${this.selectionType === "P" ? "selected" : ""}>Pagamento / vencimento</option>
            </select>
          </label>
        </div>

        <div style="margin-top:12px;">
          ${partnerships.length ? `<label style="display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#475569;max-width:480px;margin-bottom:10px;">Parceria
            <select onchange="PrestacaoContasApp.applyPartnership(this.value)" style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
              <option value="">Selecionar parceria (opcional)</option>
              ${partnerships.map(p => {
                const obras = (p.obras && p.obras.map(o => o.code).filter(Boolean).join(", ")) || p.obraCode || "";
                return `<option value="${p.id}" ${this.partnershipId === p.id ? "selected" : ""}>${p.partnerName}${obras ? " · obras " + obras : ""}</option>`;
              }).join("")}
            </select>
          </label>` : ""}
          <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:6px;">Obra / centros de custo</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
            ${this.costCenterIds.map(id => `
              <span style="display:inline-flex;align-items:center;gap:6px;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:4px 8px;border-radius:999px;font-size:0.78rem;font-weight:700;">
                ${id}
                <button onclick="PrestacaoContasApp.removeCostCenter('${id}')" style="border:none;background:transparent;cursor:pointer;color:#065f46;font-size:1rem;line-height:1;">×</button>
              </span>`).join("") || '<span style="color:#94a3b8;font-size:0.8rem;">Nenhum centro selecionado</span>'}
          </div>
          <input type="text" placeholder="Buscar e adicionar centro de custo..." value="${this.ccSearch || ""}"
            oninput="PrestacaoContasApp.onCcSearch(this.value)"
            style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;width:100%;max-width:480px;font-size:0.85rem;">
          <div id="pc-cc-sugg">${this.ccSuggestionsHtml()}</div>
        </div>

        ${this.error ? `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:0.82rem;border:1px solid #fecaca;">${this.error}</div>` : ""}
        ${hasUnmatched ? `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:#fffbeb;color:#92400e;font-size:0.82rem;border:1px solid #fde68a;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <span><strong>${this.fmt(unmatched.total)}</strong> em contas ainda não alocadas na visão DFC Padrão.</span>
          <button type="button" class="btn btn-outline" style="height:32px;font-size:0.75rem;" onclick="switchTab('plano-financeiro','Plano Financeiro e Visões')">Alocar no Apoio</button>
        </div>` : ""}

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px;">
          ${this.kpi("Receitas", this.totals.receitas, "#16a34a")}
          ${this.kpi("Custos e despesas", this.totals.custosDespesas, "#dc2626")}
          ${this.kpi("GCO / Variação de caixa", this.totals.gco, "#0f172a")}
          ${this.kpi("Movimentos", this.movements.length, "#0369a1", true)}
        </div>

        <div class="crm-card" style="margin-top:12px;padding:0;overflow:hidden;">
          <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:800;color:#0f172a;">Demonstrativo — ${visao.name || "DFC Padrão"}</div>
              <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">
                Agrupado por obra · ${ccNames.join(" | ") || "—"} · ${start.split("-").reverse().join("/")} a ${end.split("-").reverse().join("/")}
              </div>
            </div>
            <div style="font-size:0.75rem;color:#64748b;text-transform:capitalize;">${monthLabel}</div>
          </div>
          <div class="table-container" style="max-height:calc(100vh - 280px);overflow:auto;box-shadow:none;">
            <table class="custom-table" style="font-size:0.82rem;">
              <thead>
                <tr>
                  <th style="width:140px;">Código</th>
                  <th>Conta</th>
                  <th style="text-align:right;">${monthLabel}</th>
                  <th style="text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${this.lines.length ? this.lines.map(row => this.renderRow(row)).join("") : `
                  <tr><td colspan="4" style="text-align:center;padding:28px;color:#94a3b8;">
                    ${this.loading ? "Carregando movimentos de caixa..." : "Clique em Carregar DFC para consultar o Sienge."}
                  </td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        ${this.selectedAccount ? this.renderAccountDetail() : ""}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  kpi(label, value, color, raw) {
    return `<div class="crm-card" style="padding:12px 14px;">
      <div style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;">${label}</div>
      <div style="font-size:1.25rem;font-weight:800;color:${color};margin-top:4px;">${raw ? value : this.fmt(value)}</div>
    </div>`;
  },

  renderRow(row) {
    const isBold = !row.isAccount;
    const color = row.isFormula ? "#0f172a" : (row.amount < 0 ? "#b91c1c" : "#0f172a");
    const bg = row.isFormula ? "#fff7ed" : (row.level === 0 && !row.isAccount ? "#f8fafc" : "#fff");
    const pad = 12 + (row.level || 0) * 16;
    const chevron = row.hasKids
      ? `<button onclick="PrestacaoContasApp.toggle('${row.id}')" style="border:none;background:transparent;cursor:pointer;padding:0 4px 0 0;color:#64748b;">
           <i data-lucide="${this.expanded.has(row.id) ? "chevron-down" : "chevron-right"}" style="width:14px;"></i>
         </button>`
      : "";
    const click = row.isAccount ? `onclick="PrestacaoContasApp.openAccount('${String(row.id).replace(/'/g, "\\'")}')" style="cursor:pointer;"` : "";
    return `<tr style="background:${bg};" ${click}>
      <td style="font-weight:${isBold ? 800 : 500};color:#64748b;white-space:nowrap;">${row.code || ""}</td>
      <td style="padding-left:${pad}px;font-weight:${isBold ? 800 : 500};">
        ${chevron}${row.name}
      </td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:${isBold ? 800 : 600};color:${color};">${this.fmt(row.amount)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:${isBold ? 800 : 600};color:${color};">${this.fmt(row.amount)}</td>
    </tr>`;
  },

  renderAccountDetail() {
    const nk = this.normAccountKey(this.selectedAccount);
    const acc = this.accountIndex && (this.accountIndex[this.selectedAccount] || this.accountIndex[nk]);
    if (!acc) return "";
    return `
      <div class="crm-card" style="margin-top:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;font-size:0.95rem;color:var(--color-primary);">${acc.displayId || acc.id} — ${acc.name}</h3>
          <button class="btn btn-cancel" onclick="PrestacaoContasApp.selectedAccount=null;PrestacaoContasApp.render()">Fechar</button>
        </div>
        <div class="table-container" style="box-shadow:none;max-height:280px;overflow:auto;">
          <table class="custom-table" style="font-size:0.8rem;">
            <thead><tr><th>Data</th><th>Histórico</th><th>Cliente / Credor</th><th>C.C.</th><th style="text-align:right;">Valor</th></tr></thead>
            <tbody>
              ${(acc.items || []).map(it => {
                const d = String((it.mov && (it.mov.bankMovementDate || it.mov.paymentDate)) || "").slice(0, 10).split("-").reverse().join("/");
                return `<tr>
                  <td>${d || "—"}</td>
                  <td>${(it.mov && (it.mov.bankMovementHistoricName || it.mov.documentIdentificationName)) || "—"}</td>
                  <td>${(it.mov && (it.mov.clientName || it.mov.creditorName)) || "—"}</td>
                  <td>${it.costCenterId || "—"}</td>
                  <td style="text-align:right;font-weight:700;color:${it.amount < 0 ? "#b91c1c" : "#16a34a"};">${this.fmt(it.amount)}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }
};

window.PrestacaoContasApp = PrestacaoContasApp;
