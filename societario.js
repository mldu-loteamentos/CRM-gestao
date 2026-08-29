// Módulo Societário — Estrutura Societária (sócios, SPEs e participações)

const SocietarioApp = {
  STORAGE_KEY: "crm_estrutura_societaria_v1",
  FIRESTORE_DOC: "estrutura_societaria",
  graph: { hubId: "", entities: [], links: [], notes: [] },
  selectedId: null,
  selectedLinkId: null,
  panel: "none",
  linkMode: false,
  connectFrom: null,
  NODE_W: 168,
  NODE_H: 72,

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
    this.ensurePositions();
  },

  normalize(raw) {
    if (!raw || typeof raw !== "object") return this.defaultGraph();
    const entities = Array.isArray(raw.entities) ? raw.entities.map(e => ({
      id: e.id || this.uid("ent"),
      name: String(e.name || "Sem nome"),
      kind: e.kind === "pf" ? "pf" : "pj",
      note: e.note || "",
      companyId: e.companyId != null ? String(e.companyId) : "",
      partnerId: e.partnerId || "",
      x: e.x == null ? null : Number(e.x),
      y: e.y == null ? null : Number(e.y)
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

  countDescendants(id, seen) {
    const vis = seen || new Set();
    if (!id || vis.has(id)) return 1;
    vis.add(id);
    const kids = this.childrenOf(id);
    if (!kids.length) return 1;
    return kids.reduce((sum, l) => sum + this.countDescendants(l.to, vis), 0);
  },

  ensurePositions() {
    const ents = this.graph.entities || [];
    if (!ents.length) return;
    if (ents.some(e => e.x == null || e.y == null || Number.isNaN(e.x) || Number.isNaN(e.y))) {
      this.autoLayout(false);
    }
  },

  autoLayout(persistAfter) {
    const W = 196;
    const H = 118;
    const hubId = this.graph.hubId;
    const owners = this.ownersOf(hubId).map(l => this.entity(l.from)).filter(Boolean);
    owners.forEach((e, i) => {
      e.x = 80 + i * W;
      e.y = 48;
    });
    const hub = this.entity(hubId);
    if (hub) {
      const left = owners.length ? owners[0].x : 400;
      const right = owners.length ? owners[owners.length - 1].x : 400;
      hub.x = owners.length ? (left + right) / 2 : 420;
      hub.y = 200;
    }
    const visited = new Set([hubId]);
    const layoutKids = (parentId, depth, startX) => {
      const kids = this.childrenOf(parentId);
      let x = startX;
      kids.forEach(link => {
        const child = this.entity(link.to);
        if (!child || visited.has(child.id)) return;
        visited.add(child.id);
        const subW = Math.max(1, this.countDescendants(child.id));
        child.x = x + (subW * W) / 2 - this.NODE_W / 2;
        child.y = (hub ? hub.y : 200) + depth * H;
        layoutKids(child.id, depth + 1, x);
        x += subW * W;
      });
      return x;
    };
    layoutKids(hubId, 1, 40);
    const inChart = this.collectChartIds();
    const orphans = (this.graph.entities || []).filter(e => !inChart.has(e.id));
    const maxY = Math.max(280, ...this.graph.entities.map(e => Number(e.y) || 0));
    orphans.forEach((e, i) => {
      e.x = 80 + (i % 8) * W;
      e.y = maxY + 150 + Math.floor(i / 8) * H;
    });
    if (persistAfter !== false) this.persist();
  },

  canvasSize() {
    const ents = this.graph.entities || [];
    const maxX = Math.max(900, ...ents.map(e => (Number(e.x) || 0) + this.NODE_W + 80));
    const maxY = Math.max(700, ...ents.map(e => (Number(e.y) || 0) + this.NODE_H + 120));
    return { w: maxX, h: maxY };
  },

  nodeCenter(ent) {
    return {
      x: (Number(ent.x) || 0) + this.NODE_W / 2,
      y: (Number(ent.y) || 0) + this.NODE_H / 2
    };
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

  canvasNode(ent) {
    const hub = ent.id === this.graph.hubId;
    const kind = ent.kind === "pf" ? "PF" : "PJ";
    const kindBg = ent.kind === "pf" ? "#1e3a5f" : "#0f3d2e";
    const bg = hub ? "#105436" : (ent.kind === "pf" ? "#1d4ed8" : "#166534");
    const sel = this.selectedId === ent.id ? "box-shadow:0 0 0 3px #f59e0b,0 4px 12px rgba(0,0,0,0.2);" : "box-shadow:0 2px 8px rgba(0,0,0,0.18);";
    const x = Number(ent.x) || 40;
    const y = Number(ent.y) || 40;
    return `<div class="soc-node" data-id="${ent.id}" style="position:absolute;left:${x}px;top:${y}px;width:${this.NODE_W}px;z-index:2;cursor:grab;user-select:none;${sel}">
      <div class="soc-port" data-id="${ent.id}" title="Arraste até outra caixa para ligar" style="position:absolute;left:50%;top:-8px;transform:translateX(-50%);width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #105436;cursor:crosshair;z-index:3;"></div>
      <div class="soc-node-body" style="border-radius:6px;background:${bg};color:#fff;font-weight:800;letter-spacing:0.03em;text-transform:uppercase;padding:${hub ? "12px 10px" : "10px 10px 8px"};font-size:${hub ? "0.92rem" : "0.72rem"};text-align:center;line-height:1.25;">
        ${this.esc(ent.name)}
        ${hub ? `<div style="margin-top:4px;font-size:0.6rem;font-weight:700;opacity:0.85;">CENTRO</div>` : `<div style="margin-top:5px;font-size:0.6rem;font-weight:700;opacity:0.9;background:${kindBg};display:inline-block;padding:1px 6px;border-radius:3px;">${kind}</div>`}
      </div>
      <div class="soc-port" data-id="${ent.id}" title="Arraste até outra caixa para ligar" style="position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #105436;cursor:crosshair;z-index:3;"></div>
    </div>`;
  },

  redrawEdges() {
    const svg = document.getElementById("soc-edges");
    const labels = document.getElementById("soc-edge-labels");
    if (!svg || !labels) return;
    const size = this.canvasSize();
    svg.setAttribute("width", size.w);
    svg.setAttribute("height", size.h);
    svg.style.width = size.w + "px";
    svg.style.height = size.h + "px";
    const parts = [];
    const labelHtml = [];
    (this.graph.links || []).forEach(link => {
      const a = this.entity(link.from);
      const b = this.entity(link.to);
      if (!a || !b) return;
      const p1 = this.nodeCenter(a);
      const p2 = this.nodeCenter(b);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const c1y = p1.y + (p2.y - p1.y) * 0.35;
      const c2y = p1.y + (p2.y - p1.y) * 0.65;
      const sel = this.selectedLinkId === link.id;
      const stroke = sel ? "#f59e0b" : "#105436";
      parts.push(`<path d="M ${p1.x} ${p1.y} C ${p1.x} ${c1y}, ${p2.x} ${c2y}, ${p2.x} ${p2.y}" fill="none" stroke="${stroke}" stroke-width="${sel ? 3.5 : 2.2}" marker-end="url(#soc-arrow)"/>`);
      const bg = sel ? "#f59e0b" : "#fff";
      const color = sel ? "#1c1917" : "#105436";
      labelHtml.push(`<button type="button" class="soc-edge-pct" data-link="${link.id}" style="position:absolute;left:${mx}px;top:${my}px;transform:translate(-50%,-50%);z-index:4;border:1px solid #105436;border-radius:12px;padding:2px 8px;font-size:0.72rem;font-weight:800;cursor:pointer;background:${bg};color:${color};pointer-events:auto;">${this.fmtPct(link.pct)}</button>`);
    });
    if (this._tempLine) {
      parts.push(`<path d="M ${this._tempLine.x1} ${this._tempLine.y1} L ${this._tempLine.x2} ${this._tempLine.y2}" fill="none" stroke="#ea580c" stroke-width="2" stroke-dasharray="6 4"/>`);
    }
    svg.innerHTML = `<defs><marker id="soc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#105436"/></marker></defs>${parts.join("")}`;
    labels.innerHTML = labelHtml.join("");
    labels.querySelectorAll(".soc-edge-pct").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.selectLink(btn.getAttribute("data-link"));
      });
    });
  },

  canvasPoint(ev) {
    const canvas = document.getElementById("soc-canvas");
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  },

  bindCanvas() {
    const wrap = document.getElementById("soc-canvas-wrap");
    const canvas = document.getElementById("soc-canvas");
    if (!wrap || !canvas) return;
    this._drag = null;
    this._connect = null;
    this._moved = false;

    const startTrack = () => {
      const onMove = (ev) => {
        const pt = this.canvasPoint(ev);
        if (this._connect) {
          this._tempLine = { x1: this._connect.x1, y1: this._connect.y1, x2: pt.x, y2: pt.y };
          this.redrawEdges();
          return;
        }
        if (!this._drag) return;
        const ent = this.entity(this._drag.id);
        if (!ent) return;
        this._moved = true;
        ent.x = Math.max(8, pt.x - this._drag.dx);
        ent.y = Math.max(8, pt.y - this._drag.dy);
        const el = canvas.querySelector('.soc-node[data-id="' + this._drag.id + '"]');
        if (el) {
          el.style.left = ent.x + "px";
          el.style.top = ent.y + "px";
        }
        const size = this.canvasSize();
        canvas.style.width = size.w + "px";
        canvas.style.height = size.h + "px";
        this.redrawEdges();
      };
      const onUp = (ev) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (this._connect) {
          const target = ev.target && ev.target.closest && ev.target.closest(".soc-node");
          const toId = target ? target.getAttribute("data-id") : null;
          const from = this._connect.from;
          this._connect = null;
          this._tempLine = null;
          this.linkMode = false;
          this.redrawEdges();
          if (toId && from && toId !== from) this.beginLink(from, toId);
          return;
        }
        if (this._drag) {
          const node = canvas.querySelector('.soc-node[data-id="' + this._drag.id + '"]');
          if (node) {
            node.style.cursor = "grab";
            node.style.zIndex = "2";
          }
          const draggedId = this._drag.id;
          const moved = this._moved;
          this._drag = null;
          if (moved) this.persist();
          else this.selectEntity(draggedId, true);
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };

    canvas.querySelectorAll(".soc-node").forEach(node => {
      node.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        const id = node.getAttribute("data-id");
        if (ev.target.classList.contains("soc-port")) {
          ev.preventDefault();
          ev.stopPropagation();
          const pt = this.canvasPoint(ev);
          this._connect = { from: id, x1: pt.x, y1: pt.y };
          this.linkMode = true;
          startTrack();
          return;
        }
        ev.preventDefault();
        const ent = this.entity(id);
        if (!ent) return;
        const pt = this.canvasPoint(ev);
        this._drag = {
          id,
          dx: pt.x - (Number(ent.x) || 0),
          dy: pt.y - (Number(ent.y) || 0)
        };
        this._moved = false;
        node.style.cursor = "grabbing";
        node.style.zIndex = "8";
        startTrack();
      });
    });
  },

  beginLink(from, to) {
    const dup = (this.graph.links || []).find(l => l.from === from && l.to === to);
    if (dup) {
      this.selectLink(dup.id);
      return;
    }
    this.selectedLinkId = "";
    this.selectedId = null;
    this.panel = "link";
    this._pendingLink = { from, to, pct: 0, note: "" };
    this.render();
    requestAnimationFrame(() => {
      const fromEl = document.getElementById("soc-lnk-from");
      const toEl = document.getElementById("soc-lnk-to");
      if (fromEl) fromEl.value = from;
      if (toEl) toEl.value = to;
    });
  },

  toggleLinkMode() {
    this.linkMode = !this.linkMode;
    this.connectFrom = null;
    this.render();
  },

  resetLayout() {
    if (!confirm("Reorganizar o organograma automaticamente? As posições atuais serão substituídas.")) return;
    this.autoLayout(true);
    this.render();
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
      const existing = (this.graph.links || []).find(l => l.id === this.selectedLinkId);
      const link = existing || this._pendingLink || { from: this.graph.hubId, to: "", pct: 0, note: "" };
      const isNew = !existing;
      return this.panelWrap("Interligação (participação)", `
        <p style="font-size:0.78rem;color:#64748b;margin:0 0 8px;">Arraste o pontinho de uma caixa até outra, ou escolha origem e destino aqui.</p>
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
    return `<div style="padding:16px;color:#64748b;font-size:0.85rem;line-height:1.45;">
      <strong style="color:#105436;">Organograma dinâmico</strong>
      <ul style="margin:8px 0 0 16px;padding:0;">
        <li>Arraste as caixas para posicionar.</li>
        <li>Arraste o pontinho de uma caixa até outra para traçar a ligação.</li>
        <li>Clique no percentual para editar a participação.</li>
        <li>Clique na caixa (sem arrastar) para editar a empresa.</li>
      </ul>
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
    this.ensurePositions();
    const wrap = document.getElementById("soc-canvas-wrap");
    const sx = wrap ? wrap.scrollLeft : 0;
    const sy = wrap ? wrap.scrollTop : 0;
    const size = this.canvasSize();
    const linkBtn = this.linkMode
      ? "background:#ea580c;color:#fff;"
      : "background:#fff;color:#105436;";
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 120px);min-height:520px;background:#f4f6f4;border-radius:8px;overflow:hidden;border:1px solid #d1e3d6;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;background:#105436;color:#fff;">
          <div>
            <div style="font-size:1.05rem;font-weight:800;letter-spacing:0.06em;">ESTRUTURA SOCIETÁRIA</div>
            <div style="font-size:0.75rem;opacity:0.85;">Arraste as caixas · trace ligações pelos pontinhos · clique no % para editar</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="SocietarioApp.openNewEntity()" style="background:#fff;color:#105436;font-weight:700;">+ Empresa / pessoa</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SocietarioApp.openNewLink()" style="${linkBtn}font-weight:700;">+ Interligação</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SocietarioApp.resetLayout()" style="background:#fff;color:#105436;font-weight:700;">Reorganizar</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SocietarioApp.openNewNote()" style="background:#fff;color:#105436;font-weight:700;">+ Nota</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="SocietarioApp.importPartners()" style="background:#ea580c;border:none;color:#fff;font-weight:700;">Vincular parametrização</button>
          </div>
        </div>
        <div style="display:flex;flex:1;min-height:0;">
          <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
            <div id="soc-canvas-wrap" style="flex:1;overflow:auto;background-image:radial-gradient(#c5d9cc 1px, transparent 1px);background-size:18px 18px;background-color:#eef6f1;">
              <div id="soc-canvas" style="position:relative;width:${size.w}px;height:${size.h}px;">
                <svg id="soc-edges" style="position:absolute;left:0;top:0;z-index:1;pointer-events:none;"></svg>
                <div id="soc-edge-labels" style="position:absolute;left:0;top:0;right:0;bottom:0;z-index:4;pointer-events:none;"></div>
                ${(this.graph.entities || []).map(e => this.canvasNode(e)).join("")}
              </div>
            </div>
            <div style="padding:8px 16px 12px;background:#fff;border-top:1px solid #d1e3d6;max-height:28%;overflow:auto;">
              <div style="display:flex;gap:10px;align-items:center;font-size:0.72rem;font-weight:700;color:#334155;margin-bottom:8px;">
                <span style="background:#166534;color:#fff;padding:3px 8px;border-radius:4px;">PJ — Pessoa jurídica</span>
                <span style="background:#1d4ed8;color:#fff;padding:3px 8px;border-radius:4px;">PF — Pessoa física</span>
                <span style="color:#64748b;font-weight:600;">Arraste o pontinho branco de uma caixa até outra para criar a participação.</span>
              </div>
              <div style="font-size:0.75rem;font-weight:800;color:#105436;text-transform:uppercase;">Notas</div>
              <div style="margin-top:8px;">${this.renderNotes()}</div>
            </div>
          </div>
          <aside style="width:320px;max-width:40%;background:#fff;border-left:1px solid #d1e3d6;overflow:auto;">
            ${this.renderPanel()}
          </aside>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    requestAnimationFrame(() => {
      const w = document.getElementById("soc-canvas-wrap");
      if (w) {
        w.scrollLeft = sx;
        w.scrollTop = sy;
      }
      const labels = document.getElementById("soc-edge-labels");
      if (labels) labels.style.pointerEvents = "none";
      this.redrawEdges();
      this.bindCanvas();
    });
  },

  selectEntity(id, keepCanvas) {
    this.selectedId = id;
    this.selectedLinkId = null;
    this.panel = "entity";
    this.render();
  },

  selectLink(id) {
    this.selectedLinkId = id;
    this.selectedId = null;
    this.panel = "link";
    this._pendingLink = null;
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
    this._pendingLink = null;
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
    this._pendingLink = null;
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
      const size = this.canvasSize();
      const wrap = document.getElementById("soc-canvas-wrap");
      const id = this.uid("ent");
      this.graph.entities.push({
        id, name, kind, companyId, partnerId, note,
        x: (wrap ? wrap.scrollLeft : 0) + 80,
        y: (wrap ? wrap.scrollTop : 0) + 80
      });
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
    this._pendingLink = null;
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
      const n = this.graph.entities.length;
      ent = {
        id: this.uid("ent"),
        name: String(name).trim(),
        kind: kind === "pf" ? "pf" : "pj",
        note: "",
        companyId: "",
        partnerId: "",
        x: 80 + (n % 8) * 196,
        y: 80 + Math.floor(n / 8) * 118,
        ...(extra || {})
      };
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
    this.ensurePositions();
    this.persist();
    this.render();
    alert(added ? `${added} interligação(ões) importada(s) da parametrização.` : "As empresas da parametrização já estavam na estrutura.");
  }
};

window.SocietarioApp = SocietarioApp;
