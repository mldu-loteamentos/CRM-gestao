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
    const bg = this.nodeColor(ent);
    const kindBg = this.darkenHex(bg, 0.22);
    const sel = this.selectedId === ent.id ? " is-selected" : "";
    const x = Number(ent.x) || 40;
    const y = Number(ent.y) || 40;
    return `<div class="soc-node${hub ? " is-hub" : ""}${sel}" data-id="${ent.id}" style="left:${x}px;top:${y}px;width:${this.NODE_W}px;">
      <div class="soc-port" data-id="${ent.id}" title="Arraste até outra caixa para ligar"></div>
      <div class="soc-node-body" style="background:${bg};">
        <span class="soc-node-name">${this.esc(ent.name)}</span>
        ${hub
          ? `<span class="soc-node-tag">Centro</span>`
          : `<span class="soc-node-kind" style="background:${kindBg};">${kind}</span>`}
      </div>
      <div class="soc-port soc-port-bottom" data-id="${ent.id}" title="Arraste até outra caixa para ligar"></div>
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
      labelHtml.push(`<button type="button" class="soc-edge-pct${sel ? " is-selected" : ""}" data-link="${link.id}" style="left:${mx}px;top:${my}px;background:${bg};color:${color};">${this.fmtPct(link.pct)}</button>`);
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
      return `<p class="soc-notes-empty">Nenhuma nota ainda. Clique numa empresa ou em Nota.</p>`;
    }
    const cards = [
      ...fromEntities.map(e => `<article class="soc-note soc-note-ent"><strong>${this.esc(e.name)}</strong><span>${this.esc(e.note)}</span></article>`),
      ...fromLinks.map(l => {
        const a = this.entity(l.from);
        const b = this.entity(l.to);
        return `<article class="soc-note soc-note-link"><strong>${this.esc(a && a.name)} → ${this.esc(b && b.name)} (${this.fmtPct(l.pct)})</strong><span>${this.esc(l.note)}</span></article>`;
      }),
      ...list.map(n => `<article class="soc-note soc-note-free"><span>${this.esc(n.text)}</span><button type="button" class="soc-note-x" title="Excluir nota" onclick="SocietarioApp.removeNote('${n.id}')">×</button></article>`)
    ];
    return `<div class="soc-notes-grid">${cards.join("")}</div>`;
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
        <p style="font-size:0.78rem;color:#64748b;margin:0 0 10px;line-height:1.4;">Inclui ou edita um quadradinho no organograma. PJ fica verde e PF azul, ou escolha outra cor abaixo.</p>
        <label style="${this.lbl}">Nome
          ${this.hint("Nome que aparece na caixa (empresa ou pessoa).")}
          <input id="soc-ent-name" class="form-control" value="${this.esc(ent.name)}">
        </label>
        <label style="${this.lbl}">Tipo
          ${this.hint("PJ = pessoa jurídica (empresa). PF = pessoa física (sócio). Isso também sugere a cor padrão.")}
          <select id="soc-ent-kind" class="form-control" onchange="SocietarioApp.onEntityKindChange()">
            <option value="pj" ${ent.kind !== "pf" ? "selected" : ""}>Pessoa jurídica (PJ)</option>
            <option value="pf" ${ent.kind === "pf" ? "selected" : ""}>Pessoa física (PF)</option>
          </select>
        </label>
        <div style="${this.lbl}">Cor da caixa
          ${this.hint("Mesma lógica de PF (azul) e PJ (verde). Pode marcar outra cor se quiser destacar um grupo.")}
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${this.colorSwatchesHtml(ent.color || this.defaultKindColor(ent.kind))}
            <input id="soc-ent-color" type="color" value="${this.esc(ent.color || this.defaultKindColor(ent.kind))}" title="Cor personalizada" style="width:42px;height:32px;padding:0;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;">
          </div>
        </div>
        <label style="${this.lbl}">Empresa Sienge
          ${this.hint("Opcional. Liga esta caixa a uma empresa do cadastro do CRM/Sienge.")}
          <select id="soc-ent-company" class="form-control">${this.companyOptions(ent.companyId)}</select>
        </label>
        <label style="${this.lbl}">Parceiro / sócio (parametrização)
          ${this.hint("Opcional. Liga esta caixa a um sócio já cadastrado em Parametrização de Parceiros.")}
          <select id="soc-ent-partner" class="form-control">${this.partnerOptions(ent.partnerId)}</select>
        </label>
        <label style="${this.lbl}">Nota
          ${this.hint("Texto livre sobre esta caixa. Também aparece na lista de notas embaixo.")}
          <textarea id="soc-ent-note" class="form-control" rows="3">${this.esc(ent.note)}</textarea>
        </label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button type="button" class="btn btn-primary" onclick="SocietarioApp.saveEntity()" title="Grava o quadradinho no organograma">${isNew ? "Incluir" : "Salvar"}</button>
          ${!isNew ? `<button type="button" class="btn btn-outline" onclick="SocietarioApp.setHub('${ent.id}')" title="A empresa do centro do organograma (caixa principal)">Definir como centro</button>` : ""}
          ${!isNew ? `<button type="button" class="btn btn-outline" style="color:#b91c1c;border-color:#fecaca;" onclick="SocietarioApp.deleteEntity('${ent.id}')" title="Remove a caixa e as ligações ligadas a ela">Excluir</button>` : ""}
        </div>
      `);
    }
    if (this.panel === "link") {
      const existing = (this.graph.links || []).find(l => l.id === this.selectedLinkId);
      const link = existing || this._pendingLink || { from: this.graph.hubId, to: "", pct: 0, note: "" };
      const isNew = !existing;
      return this.panelWrap("Interligação (participação)", `
        <p style="font-size:0.78rem;color:#64748b;margin:0 0 8px;line-height:1.4;">Traça a seta de participação: de quem detém o percentual para a empresa participada. Também dá para arrastar o pontinho branco de uma caixa até a outra.</p>
        <label style="${this.lbl}">De (sócio / holding)
          ${this.hint("Quem possui a participação (origem da seta).")}
          <select id="soc-lnk-from" class="form-control">${this.entityOptions(link.from)}</select>
        </label>
        <label style="${this.lbl}">Para (participada)
          ${this.hint("Empresa que recebe a participação (destino da seta).")}
          <select id="soc-lnk-to" class="form-control">${this.entityOptions(link.to, link.from)}</select>
        </label>
        <label style="${this.lbl}">Percentual
          ${this.hint("Quanto esta origem detém na participada. Clique no % da linha do organograma para editar depois.")}
          <input id="soc-lnk-pct" class="form-control" type="number" min="0" max="100" step="0.01" value="${link.pct || 0}">
        </label>
        <label style="${this.lbl}">Nota da ligação
          ${this.hint("Opcional. Ex.: acordo de sócios, cláusula especial.")}
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
        ${this.hint("Anota um texto geral da estrutura (não fica preso a uma caixa). Ex.: Moura Leite tem 50% na Ellenco...")}
        <textarea id="soc-note-text" class="form-control" rows="4" placeholder="Ex.: Moura Leite tem 50% na Ellenco, que por sua vez tem 55,5% na Vercellino..."></textarea>
        <button type="button" class="btn btn-primary" style="margin-top:8px;" onclick="SocietarioApp.saveNote()">Salvar nota</button>
      `);
    }
    return "";
  },

  lbl: "display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#334155;margin-bottom:10px;",

  hint(text) {
    return `<span style="display:block;font-size:0.72rem;font-weight:500;color:#64748b;line-height:1.35;">${this.esc(text)}</span>`;
  },

  defaultKindColor(kind) {
    return kind === "pf" ? "#1d4ed8" : "#166534";
  },

  nodeColor(ent) {
    const raw = String((ent && ent.color) || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
    if (ent && ent.id === this.graph.hubId) return "#105436";
    return this.defaultKindColor(ent && ent.kind);
  },

  darkenHex(hex, amount) {
    const h = String(hex || "").replace("#", "");
    if (h.length !== 6) return "#0f3d2e";
    const n = parseInt(h, 16);
    const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
    const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
    const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
  },

  colorPresets() {
    return [
      { hex: "#166534", label: "PJ" },
      { hex: "#1d4ed8", label: "PF" },
      { hex: "#105436", label: "Centro" },
      { hex: "#c2410c", label: "Laranja" },
      { hex: "#0f766e", label: "Verde-água" },
      { hex: "#6d28d9", label: "Roxo" },
      { hex: "#334155", label: "Cinza" }
    ];
  },

  colorSwatchesHtml(current) {
    const cur = String(current || "").toLowerCase();
    return this.colorPresets().map(p => {
      const on = cur === p.hex.toLowerCase();
      return `<button type="button" title="${this.esc(p.label)}" onclick="SocietarioApp.pickEntityColor('${p.hex}')"
        style="width:26px;height:26px;border-radius:6px;border:${on ? "2px solid #0f172a" : "1px solid rgba(15,23,42,0.25)"};background:${p.hex};cursor:pointer;padding:0;"></button>`;
    }).join("");
  },

  pickEntityColor(hex) {
    const el = document.getElementById("soc-ent-color");
    if (el) el.value = hex;
  },

  onEntityKindChange() {
    const kindEl = document.getElementById("soc-ent-kind");
    const colorEl = document.getElementById("soc-ent-color");
    if (!kindEl || !colorEl) return;
    const cur = String(colorEl.value || "").toLowerCase();
    const defaults = this.colorPresets().map(p => p.hex.toLowerCase());
    if (!cur || defaults.includes(cur)) {
      colorEl.value = this.defaultKindColor(kindEl.value);
    }
  },

  panelWrap(title, inner) {
    return `<div class="soc-panel">
      <div class="soc-panel-head">
        <strong>${this.esc(title)}</strong>
        <button type="button" class="soc-panel-x" title="Fechar" onclick="SocietarioApp.closePanel()">×</button>
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
    const linkBtn = this.linkMode ? " is-on" : "";
    const editing = this.panel && this.panel !== "none";
    root.innerHTML = `
      <div class="soc-page">
        <div class="soc-toolbar">
          <p class="soc-help">Arraste as caixas, ligue pelos pontos e clique no percentual para editar a participação.</p>
          <div class="soc-toolbar-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick="SocietarioApp.openNewEntity()" title="Cria uma caixa nova: empresa (PJ) ou pessoa física (PF).">Empresa / pessoa</button>
            <button type="button" class="btn btn-outline btn-sm soc-btn-link${linkBtn}" onclick="SocietarioApp.openNewLink()" title="Cria a participação entre duas caixas. Também dá para arrastar o ponto de uma caixa até a outra.">Interligação</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="SocietarioApp.resetLayout()" title="Reposiciona as caixas. As ligações e os percentuais permanecem.">Reorganizar</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="SocietarioApp.openNewNote()" title="Inclui um texto livre na lista de notas.">Nota</button>
            <button type="button" class="btn btn-sm soc-btn-import" onclick="SocietarioApp.importPartners()" title="Traz sócios e sociedades da Parametrização de Parceiros.">Vincular parametrização</button>
          </div>
        </div>
        <div class="soc-body">
          <div class="soc-stage">
            <div id="soc-canvas-wrap" class="soc-canvas-wrap">
              <div id="soc-canvas" class="soc-canvas" style="width:${size.w}px;height:${size.h}px;">
                <svg id="soc-edges" class="soc-edges"></svg>
                <div id="soc-edge-labels" class="soc-edge-labels"></div>
                ${(this.graph.entities || []).map(e => this.canvasNode(e)).join("")}
              </div>
            </div>
            <div class="soc-foot">
              <div class="soc-legend">
                <span class="soc-chip is-pj">PJ Pessoa jurídica</span>
                <span class="soc-chip is-pf">PF Pessoa física</span>
                <span class="soc-legend-note">A cor padrão segue o tipo. Clique na caixa para escolher outra.</span>
              </div>
              <div class="soc-notes">
                <div class="soc-notes-title">Notas</div>
                ${this.renderNotes()}
              </div>
            </div>
          </div>
          ${editing ? `<aside class="soc-aside">${this.renderPanel()}</aside>` : ""}
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
    const colorRaw = (document.getElementById("soc-ent-color") && document.getElementById("soc-ent-color").value) || "";
    const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : this.defaultKindColor(kind);
    const companyId = document.getElementById("soc-ent-company").value;
    const partnerId = document.getElementById("soc-ent-partner").value;
    const note = document.getElementById("soc-ent-note").value || "";
    const company = this.companies().find(c => String(c.id) === String(companyId));
    if (this.selectedId && this.entity(this.selectedId)) {
      const ent = this.entity(this.selectedId);
      ent.name = name;
      ent.kind = kind;
      ent.color = color;
      ent.companyId = companyId;
      ent.partnerId = partnerId;
      ent.note = note;
      if (company && company.name && !ent.name) ent.name = company.name;
    } else {
      const size = this.canvasSize();
      const wrap = document.getElementById("soc-canvas-wrap");
      const id = this.uid("ent");
      this.graph.entities.push({
        id, name, kind, color, companyId, partnerId, note,
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
        color: this.defaultKindColor(kind === "pf" ? "pf" : "pj"),
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
