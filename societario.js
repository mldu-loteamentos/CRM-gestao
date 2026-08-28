// Módulo Societário — Estrutura Societária (sócios, SPEs e participações)

const SocietarioApp = {
  STORAGE_KEY: "crm_estrutura_societaria_v1",
  FIRESTORE_DOC: "estrutura_societaria",
  graph: { hubId: "", entities: [], links: [], notes: [] },
  selectedId: null,
  selectedLinkId: null,
  panel: "none",

  uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  defaultGraph() {
    const e = (id, name, kind, extra) => ({ id, name, kind, note: "", companyId: "", partnerId: "", ...(extra || {}) });
    const entities = [
      e("ent_ml", "MOURA LEITE", "pj"),
      e("ent_soma", "SOMA", "pj"),
      e("ent_oca", "OCA", "pj"),
      e("ent_prf", "PR&F", "pj"),
      e("ent_paulo", "PAULO", "pf"),
      e("ent_fabio", "FABIO", "pf"),
      e("ent_felipe", "FELIPE", "pf"),
      e("ent_andre", "ANDRÉ", "pf"),
      e("ent_ellenco", "ELLENCO & MOURA LEITE", "pj"),
      e("ent_vercellino", "VERCELLINO", "pj"),
      e("ent_mles", "MLES EMPREENDIMENTOS", "pj"),
      e("ent_aracari", "ARAÇARI SPE", "pj"),
      e("ent_ypes", "LOTEADORA YPÊS IV", "pj"),
      e("ent_reserva_ypes", "RESERVA DOS YPES IV", "pj"),
      e("ent_novo", "NOVO HORIZONTE SPE", "pj"),
      e("ent_parque", "PARQUE CIDADE II", "pj", { note: "SPE criada, mas o empreendimento segue em fase de projeto." }),
      e("ent_mirante", "MIRANTE DOS RAMOS", "pj"),
      e("ent_reserva_ramos", "RESERVA DOS RAMOS", "pj")
    ];
    const L = (from, to, pct, note) => ({ id: this.uid("lnk"), from, to, pct, note: note || "" });
    const links = [
      L("ent_soma", "ent_ml", 29.49),
      L("ent_oca", "ent_ml", 29.49),
      L("ent_prf", "ent_ml", 29.49),
      L("ent_paulo", "ent_ml", 2.89),
      L("ent_fabio", "ent_ml", 2.89),
      L("ent_felipe", "ent_ml", 2.89),
      L("ent_andre", "ent_ml", 2.89),
      L("ent_ml", "ent_ellenco", 50),
      L("ent_ellenco", "ent_vercellino", 55.5),
      L("ent_ml", "ent_mles", 33),
      L("ent_ml", "ent_aracari", 50),
      L("ent_ml", "ent_ypes", 35),
      L("ent_ypes", "ent_reserva_ypes", 68),
      L("ent_ml", "ent_novo", 100),
      L("ent_ml", "ent_parque", 25),
      L("ent_ml", "ent_mirante", 35),
      L("ent_mirante", "ent_reserva_ramos", 64.5)
    ];
    return {
      hubId: "ent_ml",
      entities,
      links,
      notes: [
        { id: "n1", text: "Moura Leite tem 50% na ELLENCO & Moura Leite, que por sua vez tem 55,5% na VERCELLINO. Receita das vendas lote esta Vercellino; receita Ellenco via equivalência patrimonial da Vercellino." },
        { id: "n2", text: "Moura Leite tem 35% na LOTEADORA YPÊS IV, que por sua vez tem 68% na RESERVA DOS YPÊS IV." },
        { id: "n3", text: "Moura Leite tem 100% na NOVO HORIZONTE SPE." },
        { id: "n4", text: "Moura Leite tem 35% na Mirante dos Ramos, que por sua vez tem 64,5% na Reserva dos Ramos. Receita será equivalência patrimonial." }
      ]
    };
  },

  entity(id) {
    return (this.graph.entities || []).find(e => e.id === id) || null;
  },

  companies() {
    return (window.AppState && AppState.companies) || [];
  },

  partners() {
    const app = window.ParametrizacaoParceiroApp;
    if (!app || !Array.isArray(app.items)) return [];
    return app.items;
  },

  async init() {
    if (window.ParametrizacaoParceiroApp && !ParametrizacaoParceiroApp.items.length) {
      try { await ParametrizacaoParceiroApp.loadItems(); } catch (e) {}
    }
    await this.load();
    this.render();
  },

  async load() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "null"); } catch (e) { local = null; }
    this.graph = this.normalize(local);
    if (window.firebaseDb && window.firebaseCollections) {
      try {
        const { doc, getDoc } = window.firebaseCollections;
        const snap = await getDoc(doc(window.firebaseDb, "config", this.FIRESTORE_DOC));
        if (snap.exists()) {
          const data = snap.data();
          const raw = data.graph || data;
          if (raw && Array.isArray(raw.entities) && raw.entities.length) this.graph = this.normalize(raw);
        }
      } catch (e) {
        console.warn("[Societário] Firestore indisponível, usando cache local.", e);
      }
    }
    if (!this.graph.entities.length) this.graph = this.defaultGraph();
  },

  normalize(raw) {
    if (!raw || typeof raw !== "object") return this.defaultGraph();
    const entities = Array.isArray(raw.entities) ? raw.entities.map(e => ({
      id: e.id || this.uid("ent"),
      name: String(e.name || "Sem nome"),
      kind: e.kind === "pf" ? "pf" : "pj",
      note: e.note || "",
      companyId: e.companyId != null ? String(e.companyId) : "",
      partnerId: e.partnerId || ""
    })) : [];
    const links = Array.isArray(raw.links) ? raw.links.map(l => ({
      id: l.id || this.uid("lnk"),
      from: l.from,
      to: l.to,
      pct: Number(l.pct) || 0,
      note: l.note || ""
    })) : [];
    const notes = Array.isArray(raw.notes) ? raw.notes.map(n => ({
      id: n.id || this.uid("n"),
      text: String(n.text || "")
    })) : [];
    const hubId = raw.hubId && entities.some(e => e.id === raw.hubId) ? raw.hubId : (entities[0] && entities[0].id) || "";
    return { hubId, entities, links, notes };
  },

  persist() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.graph));
    if (window.firebaseDb && window.firebaseCollections) {
      const { doc, setDoc } = window.firebaseCollections;
      setDoc(doc(window.firebaseDb, "config", this.FIRESTORE_DOC), {
        graph: this.graph,
        updatedAt: new Date().toISOString()
      }).catch(e => console.warn("[Societário] Falha ao gravar no Firestore", e));
    }
  },

  ownersOf(id) {
    return (this.graph.links || []).filter(l => l.to === id);
  },

  childrenOf(id) {
    return (this.graph.links || []).filter(l => l.from === id);
  },

  fmtPct(n) {
    const v = Number(n) || 0;
    return v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + "%";
  },

  nodeBox(ent, opts) {
    const hub = opts && opts.hub;
    const kind = ent.kind === "pf" ? "PF" : "PJ";
    const kindBg = ent.kind === "pf" ? "#1e3a5f" : "#0f3d2e";
    const bg = hub ? "#105436" : (ent.kind === "pf" ? "#1d4ed8" : "#166534");
    const sel = this.selectedId === ent.id ? "outline: 3px solid #f59e0b; outline-offset: 2px;" : "";
    const w = hub ? "min-width:200px;padding:14px 22px;font-size:1.05rem;" : "min-width:132px;padding:10px 12px;font-size:0.78rem;";
    return `<button type="button" onclick="SocietarioApp.selectEntity('${ent.id}')" style="${sel} ${w} cursor:pointer;border:none;border-radius:4px;background:${bg};color:#fff;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;box-shadow:0 2px 6px rgba(0,0,0,0.18);">
      ${this.esc(ent.name)}
      ${hub ? "" : `<div style="margin-top:4px;font-size:0.62rem;font-weight:700;opacity:0.9;background:${kindBg};display:inline-block;padding:1px 6px;border-radius:3px;">${kind}</div>`}
    </button>`;
  },

  edgeLabel(link) {
    const sel = this.selectedLinkId === link.id ? "background:#f59e0b;color:#1c1917;" : "background:#fff;color:#105436;";
    return `<button type="button" onclick="event.stopPropagation();SocietarioApp.selectLink('${link.id}')" style="${sel} border:1px solid #105436;border-radius:12px;padding:2px 8px;font-size:0.72rem;font-weight:800;cursor:pointer;margin:4px 0;">${this.fmtPct(link.pct)}</button>`;
  },

  renderBranch(parentId, depth) {
    const kids = this.childrenOf(parentId);
    if (!kids.length) return "";
    return `<div style="display:flex;justify-content:center;gap:${depth === 0 ? "18px" : "12px"};flex-wrap:wrap;align-items:flex-start;margin-top:0;">
      ${kids.map(link => {
        const child = this.entity(link.to);
        if (!child) return "";
        return `<div style="display:flex;flex-direction:column;align-items:center;min-width:120px;">
          <div style="width:2px;height:18px;background:#105436;"></div>
          ${this.edgeLabel(link)}
          <div style="width:2px;height:10px;background:#105436;"></div>
          ${this.nodeBox(child)}
          ${this.renderBranch(child.id, depth + 1)}
        </div>`;
      }).join("")}
    </div>`;
  },

  renderChart() {
    const hub = this.entity(this.graph.hubId);
    if (!hub) return `<div style="padding:40px;text-align:center;color:#64748b;">Cadastre uma empresa e defina-a como centro da estrutura.</div>`;
    const owners = this.ownersOf(hub.id);
    const pj = owners.filter(l => (this.entity(l.from) || {}).kind !== "pf");
    const pf = owners.filter(l => (this.entity(l.from) || {}).kind === "pf");
    const ownerRow = (list) => {
      if (!list.length) return "";
      return `<div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        ${list.map(link => {
          const ent = this.entity(link.from);
          if (!ent) return "";
          return `<div style="display:flex;flex-direction:column;align-items:center;">
            ${this.nodeBox(ent)}
            <div style="width:2px;height:10px;background:#105436;"></div>
            ${this.edgeLabel(link)}
          </div>`;
        }).join("")}
      </div>`;
    };
    return `
      <div style="overflow:auto;padding:12px 8px 24px;">
        ${ownerRow(pj)}
        ${pj.length && pf.length ? `<div style="height:12px;"></div>` : ""}
        ${ownerRow(pf)}
        ${owners.length ? `<div style="display:flex;justify-content:center;"><div style="width:2px;height:22px;background:#105436;"></div></div>` : ""}
        <div style="display:flex;justify-content:center;margin:4px 0 8px;">${this.nodeBox(hub, { hub: true })}</div>
        ${this.renderBranch(hub.id, 0)}
      </div>`;
  },

  renderLegend() {
    return `<div style="display:flex;gap:10px;align-items:center;font-size:0.72rem;font-weight:700;color:#334155;">
      <span style="background:#166534;color:#fff;padding:3px 8px;border-radius:4px;">PJ — Pessoa jurídica</span>
      <span style="background:#1d4ed8;color:#fff;padding:3px 8px;border-radius:4px;">PF — Pessoa física</span>
    </div>`;
  },

  collectChartIds() {
    const seen = new Set();
    const hubId = this.graph.hubId;
    const walkDown = (id) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      this.childrenOf(id).forEach(l => walkDown(l.to));
    };
    walkDown(hubId);
    this.ownersOf(hubId).forEach(l => seen.add(l.from));
    return seen;
  },

  renderOrphans() {
    const inChart = this.collectChartIds();
    const orphans = (this.graph.entities || []).filter(e => !inChart.has(e.id));
    if (!orphans.length) return "";
    return `<div style="margin-top:16px;">
      <div style="font-size:0.75rem;font-weight:800;color:#105436;text-transform:uppercase;">Empresas ainda sem ligação no organograma</div>
      <p style="font-size:0.75rem;color:#64748b;margin:4px 0 8px;">Use “+ Interligação” para conectar ao centro ou a outra empresa.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">${orphans.map(e => this.nodeBox(e)).join("")}</div>
    </div>`;
  },

  renderNotes() {
    const fromEntities = (this.graph.entities || []).filter(e => (e.note || "").trim());
    const fromLinks = (this.graph.links || []).filter(l => (l.note || "").trim());
    const list = (this.graph.notes || []).filter(n => n.text);
    if (!fromEntities.length && !fromLinks.length && !list.length) {
      return `<div style="font-size:0.82rem;color:#64748b;">Nenhuma nota. Clique numa empresa ou use “+ Nota”.</div>`;
    }
    const cards = [
      ...fromEntities.map(e => `<div style="background:#f8fafc;border-left:3px solid #105436;padding:8px 10px;border-radius:4px;font-size:0.8rem;color:#334155;"><strong>${this.esc(e.name)}:</strong> ${this.esc(e.note)}</div>`),
      ...fromLinks.map(l => {
        const a = this.entity(l.from);
        const b = this.entity(l.to);
        return `<div style="background:#f0fdf4;border-left:3px solid #166534;padding:8px 10px;border-radius:4px;font-size:0.8rem;color:#334155;"><strong>${this.esc(a && a.name)} → ${this.esc(b && b.name)} (${this.fmtPct(l.pct)}):</strong> ${this.esc(l.note)}</div>`;
      }),
      ...list.map(n => `<div style="background:#fff7ed;border-left:3px solid #ea580c;padding:8px 10px;border-radius:4px;font-size:0.8rem;color:#334155;display:flex;justify-content:space-between;gap:8px;">
        <span>${this.esc(n.text)}</span>
        <button type="button" onclick="SocietarioApp.removeNote('${n.id}')" style="border:none;background:none;color:#9a3412;cursor:pointer;font-weight:700;">×</button>
      </div>`)
    ];
    return `<div style="display:grid;gap:8px;">${cards.join("")}</div>`;
  },

  companyOptions(selected) {
    return `<option value="">— sem vínculo Sienge —</option>` +
      this.companies().map(c => `<option value="${this.esc(c.id)}" ${String(c.id) === String(selected) ? "selected" : ""}>${this.esc(c.id)} — ${this.esc(c.name)}</option>`).join("");
  },

  partnerOptions(selected) {
    return `<option value="">— sem vínculo na parametrização —</option>` +
      this.partners().map(p => `<option value="${this.esc(p.id)}" ${p.id === selected ? "selected" : ""}>${this.esc(p.partnerName)} (${this.esc(p.companyName || p.companyId)}) · ${p.kind === "sociedade" ? "Sociedade" : "Parceria"}</option>`).join("");
  },

  entityOptions(selected, skip) {
    return (this.graph.entities || [])
      .filter(e => e.id !== skip)
      .map(e => `<option value="${e.id}" ${e.id === selected ? "selected" : ""}>${this.esc(e.name)}</option>`)
      .join("");
  },

  renderPanel() {
    if (this.panel === "entity") {
      const ent = this.entity(this.selectedId) || { id: "", name: "", kind: "pj", note: "", companyId: "", partnerId: "" };
      const isNew = !ent.id;
      return this.panelWrap("Empresa / pessoa", `
        <label style="${this.lbl}">Nome
          <input id="soc-ent-name" class="form-control" value="${this.esc(ent.name)}">
        </label>
        <label style="${this.lbl}">Tipo
          <select id="soc-ent-kind" class="form-control">
            <option value="pj" ${ent.kind !== "pf" ? "selected" : ""}>Pessoa jurídica (PJ)</option>
            <option value="pf" ${ent.kind === "pf" ? "selected" : ""}>Pessoa física (PF)</option>
          </select>
        </label>
        <label style="${this.lbl}">Empresa Sienge
          <select id="soc-ent-company" class="form-control">${this.companyOptions(ent.companyId)}</select>
        </label>
        <label style="${this.lbl}">Parceiro / sócio (parametrização)
          <select id="soc-ent-partner" class="form-control">${this.partnerOptions(ent.partnerId)}</select>
        </label>
        <label style="${this.lbl}">Nota
          <textarea id="soc-ent-note" class="form-control" rows="3">${this.esc(ent.note)}</textarea>
        </label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button type="button" class="btn btn-primary" onclick="SocietarioApp.saveEntity()">${isNew ? "Incluir" : "Salvar"}</button>
          ${!isNew ? `<button type="button" class="btn btn-outline" onclick="SocietarioApp.setHub('${ent.id}')">Definir como centro</button>` : ""}
          ${!isNew ? `<button type="button" class="btn btn-outline" style="color:#b91c1c;border-color:#fecaca;" onclick="SocietarioApp.deleteEntity('${ent.id}')">Excluir</button>` : ""}
        </div>
      `);
    }
    if (this.panel === "link") {
      const link = (this.graph.links || []).find(l => l.id === this.selectedLinkId) || { from: this.graph.hubId, to: "", pct: 0, note: "" };
      const isNew = !this.selectedLinkId || !(this.graph.links || []).some(l => l.id === this.selectedLinkId);
      return this.panelWrap("Interligação (participação)", `
        <p style="font-size:0.78rem;color:#64748b;margin:0 0 8px;">Quem detém participação → em qual empresa/pessoa, e o percentual.</p>
        <label style="${this.lbl}">De (sócio / holding)
          <select id="soc-lnk-from" class="form-control">${this.entityOptions(link.from)}</select>
        </label>
        <label style="${this.lbl}">Para (participada)
          <select id="soc-lnk-to" class="form-control">${this.entityOptions(link.to, link.from)}</select>
        </label>
        <label style="${this.lbl}">Percentual
          <input id="soc-lnk-pct" class="form-control" type="number" min="0" max="100" step="0.01" value="${link.pct || 0}">
        </label>
        <label style="${this.lbl}">Nota da ligação
          <textarea id="soc-lnk-note" class="form-control" rows="2">${this.esc(link.note)}</textarea>
        </label>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button type="button" class="btn btn-primary" onclick="SocietarioApp.saveLink()">${isNew ? "Incluir" : "Salvar"}</button>
          ${!isNew ? `<button type="button" class="btn btn-outline" style="color:#b91c1c;border-color:#fecaca;" onclick="SocietarioApp.deleteLink('${link.id}')">Excluir</button>` : ""}
        </div>
      `);
    }
    if (this.panel === "note") {
      return this.panelWrap("Nova nota da estrutura", `
        <textarea id="soc-note-text" class="form-control" rows="4" placeholder="Ex.: Moura Leite tem 50% na Ellenco, que por sua vez tem 55,5% na Vercellino..."></textarea>
        <button type="button" class="btn btn-primary" style="margin-top:8px;" onclick="SocietarioApp.saveNote()">Salvar nota</button>
      `);
    }
    return `<div style="padding:16px;color:#64748b;font-size:0.85rem;">
      Clique numa caixa para editar a empresa/pessoa, ou no percentual para ajustar a ligação.
    </div>`;
  },

  lbl: "display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#334155;margin-bottom:10px;",

  panelWrap(title, inner) {
    return `<div style="padding:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong style="color:#105436;">${this.esc(title)}</strong>
        <button type="button" onclick="SocietarioApp.closePanel()" style="border:none;background:none;cursor:pointer;font-size:1.1rem;color:#64748b;">×</button>
      </div>
      ${inner}
    </div>`;
  },

  render() {
    const root = document.getElementById("estrutura-societaria-root");
    if (!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 120px);min-height:520px;background:#f4f6f4;border-radius:8px;overflow:hidden;border:1px solid #d1e3d6;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;background:#105436;color:#fff;">
          <div>
            <div style="font-size:1.05rem;font-weight:800;letter-spacing:0.06em;">ESTRUTURA SOCIETÁRIA</div>
            <div style="font-size:0.75rem;opacity:0.85;">Sócios acima · participações e SPEs abaixo · percentuais nas ligações</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="SocietarioApp.openNewEntity()" style="background:#fff;color:#105436;font-weight:700;">+ Empresa / pessoa</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SocietarioApp.openNewLink()" style="background:#fff;color:#105436;font-weight:700;">+ Interligação</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SocietarioApp.openNewNote()" style="background:#fff;color:#105436;font-weight:700;">+ Nota</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SocietarioApp.importPartners()" style="background:#ea580c;border:none;color:#fff;font-weight:700;">Vincular parametrização</button>
          </div>
        </div>
        <div style="display:flex;flex:1;min-height:0;">
          <div style="flex:1;overflow:auto;background:#eef6f1;">
            ${this.renderChart()}
            <div style="padding:8px 16px 16px;">
              ${this.renderOrphans()}
              ${this.renderLegend()}
              <div style="margin-top:14px;font-size:0.75rem;font-weight:800;color:#105436;text-transform:uppercase;">Notas</div>
              <div style="margin-top:8px;">${this.renderNotes()}</div>
            </div>
          </div>
          <aside style="width:320px;max-width:40%;background:#fff;border-left:1px solid #d1e3d6;overflow:auto;">
            ${this.renderPanel()}
          </aside>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  selectEntity(id) {
    this.selectedId = id;
    this.selectedLinkId = null;
    this.panel = "entity";
    this.render();
  },

  selectLink(id) {
    this.selectedLinkId = id;
    this.selectedId = null;
    this.panel = "link";
    this.render();
  },

  openNewEntity() {
    this.selectedId = "";
    this.selectedLinkId = null;
    this.panel = "entity";
    this.render();
  },

  openNewLink() {
    this.selectedLinkId = "";
    this.selectedId = null;
    this.panel = "link";
    this.render();
  },

  openNewNote() {
    this.panel = "note";
    this.render();
  },

  closePanel() {
    this.panel = "none";
    this.selectedId = null;
    this.selectedLinkId = null;
    this.render();
  },

  saveEntity() {
    const name = (document.getElementById("soc-ent-name").value || "").trim();
    if (!name) { alert("Informe o nome."); return; }
    const kind = document.getElementById("soc-ent-kind").value === "pf" ? "pf" : "pj";
    const companyId = document.getElementById("soc-ent-company").value;
    const partnerId = document.getElementById("soc-ent-partner").value;
    const note = document.getElementById("soc-ent-note").value || "";
    const company = this.companies().find(c => String(c.id) === String(companyId));
    if (this.selectedId && this.entity(this.selectedId)) {
      const ent = this.entity(this.selectedId);
      ent.name = name;
      ent.kind = kind;
      ent.companyId = companyId;
      ent.partnerId = partnerId;
      ent.note = note;
      if (company && company.name && !ent.name) ent.name = company.name;
    } else {
      const id = this.uid("ent");
      this.graph.entities.push({ id, name, kind, companyId, partnerId, note });
      if (!this.graph.hubId) this.graph.hubId = id;
      this.selectedId = id;
    }
    this.persist();
    this.render();
  },

  setHub(id) {
    this.graph.hubId = id;
    this.persist();
    this.render();
  },

  deleteEntity(id) {
    if (id === this.graph.hubId) {
      alert("Defina outro centro antes de excluir esta empresa.");
      return;
    }
    if (!confirm("Excluir esta empresa/pessoa e as interligações ligadas a ela?")) return;
    this.graph.entities = this.graph.entities.filter(e => e.id !== id);
    this.graph.links = this.graph.links.filter(l => l.from !== id && l.to !== id);
    this.selectedId = null;
    this.panel = "none";
    this.persist();
    this.render();
  },

  saveLink() {
    const from = document.getElementById("soc-lnk-from").value;
    const to = document.getElementById("soc-lnk-to").value;
    const pct = Number(document.getElementById("soc-lnk-pct").value);
    const note = document.getElementById("soc-lnk-note").value || "";
    if (!from || !to) { alert("Selecione origem e destino."); return; }
    if (from === to) { alert("A ligação precisa ser entre duas empresas diferentes."); return; }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { alert("Percentual entre 0 e 100."); return; }
    const existing = (this.graph.links || []).find(l => l.id === this.selectedLinkId);
    if (existing) {
      existing.from = from;
      existing.to = to;
      existing.pct = pct;
      existing.note = note;
    } else {
      const dup = this.graph.links.find(l => l.from === from && l.to === to);
      if (dup) {
        dup.pct = pct;
        dup.note = note || dup.note;
      } else {
        this.graph.links.push({ id: this.uid("lnk"), from, to, pct, note });
      }
    }
    this.persist();
    this.panel = "none";
    this.selectedLinkId = null;
    this.render();
  },

  deleteLink(id) {
    if (!confirm("Remover esta interligação?")) return;
    this.graph.links = this.graph.links.filter(l => l.id !== id);
    this.selectedLinkId = null;
    this.panel = "none";
    this.persist();
    this.render();
  },

  saveNote() {
    const text = (document.getElementById("soc-note-text").value || "").trim();
    if (!text) { alert("Escreva a nota."); return; }
    this.graph.notes.push({ id: this.uid("n"), text });
    this.persist();
    this.panel = "none";
    this.render();
  },

  removeNote(id) {
    this.graph.notes = (this.graph.notes || []).filter(n => n.id !== id);
    this.persist();
    this.render();
  },

  findOrCreateEntity(name, kind, extra) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return null;
    let ent = this.graph.entities.find(e => String(e.name).trim().toLowerCase() === key);
    if (!ent) {
      ent = { id: this.uid("ent"), name: String(name).trim(), kind: kind === "pf" ? "pf" : "pj", note: "", companyId: "", partnerId: "", ...(extra || {}) };
      this.graph.entities.push(ent);
    } else if (extra) {
      if (extra.companyId) ent.companyId = extra.companyId;
      if (extra.partnerId) ent.partnerId = extra.partnerId;
    }
    return ent;
  },

  importPartners() {
    const items = this.partners();
    if (!items.length) {
      alert("Não há parcerias/sociedades na Parametrização de Parceiro. Cadastre-as lá e tente de novo.");
      return;
    }
    let added = 0;
    items.forEach(p => {
      const companyEnt = this.findOrCreateEntity(p.companyName || ("Empresa " + p.companyId), "pj", { companyId: String(p.companyId || "") });
      const looksCnpj = String((p.creditor && p.creditor.cpfCnpj) || "").replace(/\D/g, "").length > 11;
      const partnerEnt = this.findOrCreateEntity(p.partnerName, looksCnpj || p.kind === "sociedade" ? "pj" : "pf", { partnerId: p.id });
      if (!companyEnt || !partnerEnt) return;
      const pct = Number((p.creditor && p.creditor.sharePct) || p.defaultPartnerShare) || 0;
      const exists = this.graph.links.some(l => l.from === partnerEnt.id && l.to === companyEnt.id);
      if (!exists && companyEnt.id !== partnerEnt.id) {
        this.graph.links.push({
          id: this.uid("lnk"),
          from: partnerEnt.id,
          to: companyEnt.id,
          pct,
          note: p.kind === "sociedade" ? "Sociedade (parametrização de parceiros)" : "Parceria (parametrização de parceiros)"
        });
        added++;
      }
    });
    this.persist();
    this.render();
    alert(added ? `${added} interligação(ões) importada(s) da parametrização.` : "As empresas da parametrização já estavam na estrutura.");
  }
};

window.SocietarioApp = SocietarioApp;
