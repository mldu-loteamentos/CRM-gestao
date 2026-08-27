// Parametrização de Parceiro — obra, centros de custo e matriz DFC (% do parceiro)

const ParametrizacaoParceiroApp = {
  STORAGE_KEY: "crm_parcerias_v1",
  items: [],
  selectedId: null,
  categories: [],
  collapsed: new Set(),
  ccSearch: "",
  loadingCats: false,

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

  current() {
    return this.items.find(p => p.id === this.selectedId) || null;
  },

  partnerPct(part, key) {
    if (!part) return 0;
    if (this.isNA(part, key)) return 0;
    if (part.accountShares && Object.prototype.hasOwnProperty.call(part.accountShares, key)) {
      const n = Number(part.accountShares[key]);
      return Number.isFinite(n) ? n : Number(part.defaultPartnerShare) || 0;
    }
    return Number(part.defaultPartnerShare) || 0;
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

  isNA(part, key, ancestors) {
    if (!part) return false;
    if (part.naAccounts && part.naAccounts[key]) return true;
    if (part.naNodes && part.naNodes[key]) return true;
    return (ancestors || []).some(a => part.naNodes && part.naNodes[a]);
  },

  toggleNA(key, isAccount) {
    const p = this.current();
    if (!p) return;
    p.naNodes = p.naNodes || {};
    p.naAccounts = p.naAccounts || {};
    const bag = isAccount ? p.naAccounts : p.naNodes;
    if (bag[key]) delete bag[key];
    else bag[key] = true;
    this.persist();
    this.render();
  },

  toggleExpand(id) {
    this.expanded = this.expanded || new Set();
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.render();
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
    if (this.items.length && !this.selectedId) this.selectedId = this.items[0].id;
  },

  persist() {
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

  createFromForm() {
    const companyId = document.getElementById("pp-new-company").value;
    const partnerName = (document.getElementById("pp-new-partner").value || "").trim();
    const ccId = (document.getElementById("pp-new-cc").value || "").trim();
    const share = Number(document.getElementById("pp-new-share").value);
    if (!companyId || !partnerName || !ccId) {
      alert("Informe empresa, parceiro e um centro de custo da obra.");
      return;
    }
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      alert("O rateio padrão do parceiro deve estar entre 0 e 100%.");
      return;
    }
    const company = this.companies().find(c => String(c.id) === String(companyId));
    const obra = this.obraFromCc(ccId);
    const siblings = this.costCentersOfObra(obra, companyId);
    const seed = (siblings.length ? siblings : [{ id: ccId, name: ccId }]).map(cc => ({
      id: String(cc.id),
      name: cc.name || String(cc.id),
      inAccount: true
    }));
    const item = {
      id: "par_" + Date.now(),
      companyId: String(companyId),
      companyName: company ? company.name : `Empresa ${companyId}`,
      partnerName,
      obraCode: obra,
      defaultPartnerShare: share,
      costCenters: seed,
      accountShares: {},
      createdAt: new Date().toISOString()
    };
    this.items.push(item);
    this.selectedId = item.id;
    this.persist();
    this.render();
  },

  select(id) {
    this.selectedId = id;
    this.ccSearch = "";
    this.render();
  },

  updateField(field, value) {
    const p = this.current();
    if (!p) return;
    if (field === "defaultPartnerShare") {
      const n = Number(value);
      p.defaultPartnerShare = Number.isFinite(n) ? n : 0;
    } else if (field === "partnerName") {
      p.partnerName = value;
    }
    this.persist();
    this.renderListOnly();
  },

  renderListOnly() {
    const list = document.getElementById("pp-list");
    if (list) list.innerHTML = this.listHtml();
    if (window.lucide) lucide.createIcons();
  },

  setCcInAccount(ccId, checked) {
    const p = this.current();
    if (!p) return;
    const row = p.costCenters.find(c => String(c.id) === String(ccId));
    if (row) row.inAccount = !!checked;
    this.persist();
  },

  addCostCenter(ccId) {
    const p = this.current();
    if (!p) return;
    const id = String(ccId);
    if (p.costCenters.some(c => String(c.id) === id)) return;
    if (this.obraFromCc(id) !== String(p.obraCode)) {
      if (!confirm(`O centro ${id} pertence à obra ${this.obraFromCc(id) || "?"} e a parceria é da obra ${p.obraCode}. Incluir mesmo assim?`)) return;
    }
    const cc = this.allCostCenters().find(c => String(c.id) === id);
    p.costCenters.push({ id, name: (cc && cc.name) || id, inAccount: true });
    this.ccSearch = "";
    this.persist();
    this.render();
  },

  removeCostCenter(ccId) {
    const p = this.current();
    if (!p) return;
    p.costCenters = p.costCenters.filter(c => String(c.id) !== String(ccId));
    this.persist();
    this.render();
  },

  importObraCenters() {
    const p = this.current();
    if (!p) return;
    const siblings = this.costCentersOfObra(p.obraCode, p.companyId);
    siblings.forEach(cc => {
      if (!p.costCenters.some(x => String(x.id) === String(cc.id))) {
        p.costCenters.push({ id: String(cc.id), name: cc.name || String(cc.id), inAccount: true });
      }
    });
    this.persist();
    this.render();
  },

  setAccountShare(accountId, value) {
    const p = this.current();
    if (!p) return;
    if (!p.accountShares) p.accountShares = {};
    const raw = String(value).trim();
    if (raw === "") {
      delete p.accountShares[accountId];
    } else {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) return;
      p.accountShares[accountId] = Math.max(0, Math.min(100, n));
    }
    this.persist();
    const pct = this.partnerPct(p, accountId);
    document.querySelectorAll(`[data-pp-pct="${accountId}"]`).forEach(el => { el.textContent = pct.toFixed(1) + "%"; });
    document.querySelectorAll(`[data-pp-bar="${accountId}"]`).forEach(el => { el.style.width = pct + "%"; });
  },

  applyDefaultToAll() {
    const p = this.current();
    if (!p) return;
    p.accountShares = {};
    this.persist();
    this.render();
  },

  removeCurrent() {
    const p = this.current();
    if (!p) return;
    if (!confirm(`Excluir a parceria de ${p.partnerName} (obra ${p.obraCode})?`)) return;
    this.items = this.items.filter(x => x.id !== p.id);
    this.selectedId = this.items[0] ? this.items[0].id : null;
    this.persist();
    this.render();
  },

  list() {
    return this.items;
  },

  listHtml() {
    if (!this.items.length) {
      return `<div style="padding:16px;color:#94a3b8;font-size:0.8rem;">Nenhuma parceria cadastrada.</div>`;
    }
    return this.items.map(p => {
      const active = p.id === this.selectedId;
      const nCc = (p.costCenters || []).filter(c => c.inAccount).length;
      return `<button onclick="ParametrizacaoParceiroApp.select('${p.id}')"
        style="width:100%;text-align:left;border:1.5px solid ${active ? "#105436" : "#e5e7eb"};background:${active ? "#e8f5ee" : "#fff"};color:${active ? "#105436" : "#334155"};border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
        <div style="font-weight:800;font-size:0.82rem;">${this.esc(p.partnerName)}</div>
        <div style="font-size:0.72rem;opacity:0.8;margin-top:2px;">Obra ${this.esc(p.obraCode)} · ${nCc} C.C. na conta · ${p.defaultPartnerShare}%</div>
      </button>`;
    }).join("");
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  render() {
    const root = document.getElementById("parametrizacao-parceiro-root");
    if (!root) return;
    const p = this.selectedId === "__new__" ? null : this.current();
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 85px);font-family:inherit;">
        <div style="background:#105436;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-radius:12px 12px 0 0;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="handshake" style="width:18px;height:18px;color:#fff;"></i>
            </div>
            <div>
              <h2 style="margin:0;color:#fff;font-size:1.15rem;font-weight:600;">Parametrização de Parceiro</h2>
              <p style="margin:2px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Obra + centros de custo + matriz DFC (% que o parceiro paga em cada conta)</p>
            </div>
          </div>
        </div>
        <div style="display:flex;flex:1;min-height:0;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <div style="width:260px;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;flex-shrink:0;">
            <div style="padding:12px;border-bottom:1px solid #f1f5f9;">
              <button onclick="ParametrizacaoParceiroApp.startNew()" class="btn btn-primary" style="width:100%;height:34px;font-size:0.8rem;">
                <i data-lucide="plus" style="width:14px;"></i> Nova parceria
              </button>
            </div>
            <div id="pp-list" style="flex:1;overflow:auto;padding:10px;">${this.listHtml()}</div>
          </div>
          <div style="flex:1;overflow:auto;padding:16px 18px;">
            ${this.selectedId === "__new__" ? this.newFormHtml() : (p ? this.detailHtml(p) : this.emptyHtml())}
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  emptyHtml() {
    return `<div class="crm-card" style="padding:40px;text-align:center;color:#64748b;">
      Cadastre uma parceria para definir a obra, os centros de custo que entram na conta e o % do parceiro em cada conta do DFC.
    </div>`;
  },

  newFormHtml() {
    const companies = this.companies();
    return `<div class="crm-card" style="padding:20px;max-width:720px;">
      <h3 style="margin:0 0 6px;color:var(--color-primary);">Nova parceria</h3>
      <p style="margin:0 0 16px;color:#64748b;font-size:0.82rem;">
        Informe um centro de custo da obra. Ex.: <strong>13600</strong> e <strong>13601</strong> pertencem à obra <strong>136</strong> — os irmãos são sugeridos automaticamente.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;">Empresa
          <select id="pp-new-company" style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
            ${companies.map(c => `<option value="${c.id}">${c.id} — ${this.esc(c.name)}</option>`).join("") || '<option value="1">1</option>'}
          </select>
        </label>
        <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;">Parceiro
          <input id="pp-new-partner" placeholder="Nome do parceiro" style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
        </label>
        <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;">Centro de custo da obra
          <input id="pp-new-cc" placeholder="Ex.: 13600" list="pp-cc-list" style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
          <datalist id="pp-cc-list">${this.allCostCenters().slice(0, 400).map(cc => `<option value="${cc.id}">${this.esc(cc.name || "")}</option>`).join("")}</datalist>
        </label>
        <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;">Rateio padrão do parceiro (%)
          <input id="pp-new-share" type="number" min="0" max="100" step="0.01" value="50" style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
        </label>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="ParametrizacaoParceiroApp.createFromForm()">Criar parceria</button>
        <button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.selectedId=ParametrizacaoParceiroApp.items[0]&&ParametrizacaoParceiroApp.items[0].id;ParametrizacaoParceiroApp.render()">Cancelar</button>
      </div>
    </div>`;
  },

  detailHtml(p) {
    const inAccount = (p.costCenters || []).filter(c => c.inAccount);
    const q = (this.ccSearch || "").toLowerCase();
    const sugg = q
      ? this.allCostCenters().filter(cc =>
          (!p.companyId || cc.companyId == null || String(cc.companyId) === String(p.companyId)) &&
          (String(cc.id).includes(q) || String(cc.name || "").toLowerCase().includes(q))
        ).slice(0, 10)
      : [];
    return `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="crm-card" style="padding:16px;">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
            <div>
              <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;">Empresa ${this.esc(p.companyId)}</div>
              <div style="font-size:1.05rem;font-weight:800;color:#0f172a;">${this.esc(p.companyName)}</div>
            </div>
            <button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.removeCurrent()" style="color:#dc2626;border-color:#fecaca;">Excluir</button>
          </div>
          <div style="display:grid;grid-template-columns:1.4fr 0.8fr 0.8fr;gap:12px;margin-top:14px;">
            <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;">Parceiro
              <input value="${this.esc(p.partnerName)}" onchange="ParametrizacaoParceiroApp.updateField('partnerName', this.value)"
                style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;">Obra
              <input value="${this.esc(p.obraCode)}" disabled style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;background:#f8fafc;font-weight:800;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;flex-direction:column;gap:4px;">Rateio padrão do parceiro (%)
              <input type="number" min="0" max="100" step="0.01" value="${p.defaultPartnerShare}"
                onchange="ParametrizacaoParceiroApp.updateField('defaultPartnerShare', this.value)"
                style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
            </label>
          </div>
        </div>

        <div class="crm-card" style="padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div>
              <h3 style="margin:0;font-size:0.95rem;color:var(--color-primary);">Centros de custo da obra ${this.esc(p.obraCode)}</h3>
              <p style="margin:4px 0 0;font-size:0.78rem;color:#64748b;">Marque os que entram na conta da parceria. ${inAccount.length} ativo(s).</p>
            </div>
            <button class="btn btn-secondary" onclick="ParametrizacaoParceiroApp.importObraCenters()" style="height:34px;font-size:0.78rem;">Trazer irmãos da obra</button>
          </div>
          <table class="custom-table" style="margin-top:12px;font-size:0.82rem;">
            <thead><tr><th>C.C.</th><th>Nome</th><th style="text-align:center;">Entra na conta</th><th></th></tr></thead>
            <tbody>
              ${(p.costCenters || []).map(cc => `<tr>
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
            <input placeholder="Adicionar outro C.C. (ex. 13601)" value="${this.esc(this.ccSearch)}"
              oninput="ParametrizacaoParceiroApp.ccSearch=this.value;const b=document.getElementById('pp-cc-sugg');if(b)b.innerHTML=ParametrizacaoParceiroApp.ccSuggHtml();"
              style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
            <div id="pp-cc-sugg">${this.ccSuggHtml()}</div>
          </div>
        </div>

        ${this.matrixHtml(p)}
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

  rateioControlsHtml(p, key, isAccount, ancestorNA, naSelf) {
    if (ancestorNA) {
      return `<span style="font-size:0.65rem;font-weight:800;letter-spacing:0.3px;text-transform:uppercase;color:#94a3b8;">Fora (herda)</span>`;
    }
    if (naSelf) {
      return `<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
        <span style="font-size:0.65rem;font-weight:800;letter-spacing:0.3px;text-transform:uppercase;color:#94a3b8;background:#f1f5f9;border:1px solid #e2e8f0;padding:3px 8px;border-radius:99px;">Fora</span>
        <button type="button" title="Incluir no rateio" onclick="event.stopPropagation();ParametrizacaoParceiroApp.toggleNA('${key}', ${!!isAccount})"
          style="width:26px;height:26px;border:none;background:transparent;color:#105436;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;">
          <i data-lucide="undo-2" style="width:14px;height:14px;"></i>
        </button>
      </div>`;
    }
    const custom = p.accountShares && Object.prototype.hasOwnProperty.call(p.accountShares, key);
    const pct = this.partnerPct(p, key);
    return `<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <div style="width:72px;height:6px;border-radius:99px;background:#e2e8f0;overflow:hidden;" title="Parceiro ${pct.toFixed(0)}% · Moura Leite ${(100 - pct).toFixed(0)}%">
        <div data-pp-bar="${this.esc(key)}" style="width:${pct}%;height:100%;background:#105436;"></div>
      </div>
      <input type="number" min="0" max="100" step="0.01" value="${custom ? pct : ""}" placeholder="${p.defaultPartnerShare}"
        title="Percentual do parceiro. Vazio herda o padrão (${p.defaultPartnerShare}%)."
        onclick="event.stopPropagation()"
        onchange="ParametrizacaoParceiroApp.setAccountShare('${key}', this.value)"
        style="width:58px;height:26px;border:1px solid ${custom ? "#105436" : "#e2e8f0"};border-radius:6px;text-align:right;padding:0 6px;font-size:0.75rem;font-weight:700;">
      <span data-pp-pct="${this.esc(key)}" style="font-size:0.72rem;font-weight:800;color:#105436;min-width:42px;font-variant-numeric:tabular-nums;">${pct.toFixed(1)}%</span>
      <button type="button" title="Fora da parceria" onclick="event.stopPropagation();ParametrizacaoParceiroApp.toggleNA('${key}', ${!!isAccount})"
        style="width:26px;height:26px;border:none;background:transparent;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;"
        onmouseover="this.style.color='#ef4444';this.style.background='#fef2f2'" onmouseout="this.style.color='#94a3b8';this.style.background='transparent'">
        <i data-lucide="ban" style="width:14px;height:14px;"></i>
      </button>
    </div>`;
  },

  matrixHtml(p) {
    const visao = this.dfcVisao();
    const groups = visao.groups || [];
    this.expanded = this.expanded || new Set(groups.map(g => g.id));
    const roots = groups.filter(g => !g.parentId);
    const body = roots.map(n => this.dfcNodeRows(p, n, groups, 0, [])).join("");
    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;min-height:360px;">
        <div style="padding:10px 15px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <span style="font-weight:700;font-size:0.9rem;color:#1e293b;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="folder-tree" style="width:16px;height:16px;"></i>
              Estrutura da Visão — ${this.esc(visao.name)}
            </span>
            <div style="font-size:0.72rem;color:#64748b;margin-top:3px;">
              Campo em branco herda ${p.defaultPartnerShare}%. A barra é a parte do parceiro. O ícone de bloqueio tira o nó da conta.
            </div>
          </div>
          <button type="button" onclick="ParametrizacaoParceiroApp.applyDefaultToAll()"
            style="padding:4px 10px;background:#105436;color:#fff;border:none;border-radius:4px;font-size:0.75rem;cursor:pointer;white-space:nowrap;">
            Usar padrão em todas
          </button>
        </div>
        <div style="flex:1;overflow:auto;padding:15px;background:#fff;">
          ${body || `<div style="text-align:center;color:#94a3b8;padding:28px;font-size:0.85rem;">DFC Padrão sem nós. Configure em Plano Financeiro e Visões.</div>`}
        </div>
      </div>
    `;
  },

  dfcNodeRows(p, node, groups, level, ancestors) {
    const children = groups.filter(g => g.parentId === node.id);
    const accounts = node.accounts || [];
    const hasKids = children.length > 0 || accounts.length > 0;
    const expanded = !this.expanded || this.expanded.has(node.id);
    const naSelf = !!(p.naNodes && p.naNodes[node.id]);
    const ancestorNA = ancestors.some(a => p.naNodes && p.naNodes[a]);
    const na = ancestorNA || naSelf;

    let bg = "#fff", borderLeft = "#cbd5e1", icon = "folder";
    if (node.type === "total_n1" || level === 0) { bg = "#f8fafc"; borderLeft = "#0f766e"; icon = "layers"; }
    if (node.type === "totalizadora") { bg = "#fff"; borderLeft = "#3b82f6"; icon = "folder-open"; }
    if (node.type === "resultado") { bg = "#fff"; borderLeft = "#eab308"; icon = "file-text"; }
    if (na) { bg = "#f8fafc"; borderLeft = "#cbd5e1"; }

    const chevron = hasKids
      ? `<button type="button" onclick="ParametrizacaoParceiroApp.toggleExpand('${node.id}')" style="background:none;border:none;cursor:pointer;padding:0;color:#64748b;display:flex;align-items:center;">
           <i data-lucide="${expanded ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i>
         </button>`
      : `<span style="width:14px;"></span>`;

    let html = `
      <div style="margin-left:${level * 20}px;margin-bottom:5px;opacity:${na ? 0.72 : 1};">
        <div style="background:${bg};border:1px solid #e2e8f0;border-left:4px solid ${borderLeft};border-radius:6px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 1px 2px rgba(0,0,0,0.02);">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
            ${chevron}
            <i data-lucide="${icon}" style="width:14px;height:14px;color:${borderLeft};flex-shrink:0;"></i>
            <span style="font-weight:${node.type === "total_n1" || level === 0 ? "700" : "600"};font-size:0.85rem;color:#1e293b;">${this.esc(node.name)}</span>
          </div>
          ${this.rateioControlsHtml(p, node.id, false, ancestorNA, naSelf)}
        </div>
    `;

    if (expanded) {
      children.forEach(ch => { html += this.dfcNodeRows(p, ch, groups, level + 1, ancestors.concat(node.id)); });
      if (accounts.length) {
        html += `<div style="margin-left:28px;margin-top:5px;margin-bottom:10px;display:flex;flex-direction:column;gap:4px;padding-left:10px;border-left:2px solid #e2e8f0;">`;
        accounts.forEach(accId => {
          const naAccSelf = !!(p.naAccounts && p.naAccounts[accId]);
          const naAcc = na || naAccSelf;
          html += `
            <div style="background:#fff;border:1px solid #cbd5e1;padding:4px 8px;border-radius:4px;font-size:0.75rem;display:flex;justify-content:space-between;align-items:center;gap:8px;opacity:${naAcc ? 0.72 : 1};">
              <div style="min-width:0;"><strong style="color:#0f172a;">${this.esc(accId)}</strong> <span style="color:#64748b;">${this.esc(this.catName(accId))}</span></div>
              ${this.rateioControlsHtml(p, accId, true, na, naAccSelf)}
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
