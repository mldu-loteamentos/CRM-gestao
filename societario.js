// Módulo Societário — Estrutura Societária (sócios, SPEs e participações)

const SocietarioApp = {
  STORAGE_KEY: "crm_estrutura_societaria_v1",
  SEED_KEY: "crm_estrutura_seed",
  /** Restaura o organograma limpo (antes do Vincular parametrização). */
  SEED: "1857",
  FIRESTORE_DOC: "estrutura_societaria",
  graph: { hubId: "", entities: [], links: [], notes: [] },
  selectedId: null,
  selectedLinkId: null,
  panel: "none",
  aba: "estrutura",
  empresaAba: "",
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

  cadastroPronto() {
    const st = window.EmpresasState;
    return !!(st && st.customFields && Object.keys(st.customFields).length && window.EmpresasApp);
  },

  flagEmpresa(company, field) {
    const app = window.EmpresasApp;
    if (!app || !company || typeof app.customOf !== "function") return false;
    return !!app.flagOn(app.customOf(company.id), field);
  },

  /** Empresa do organograma: gerida pelo grupo ou Gestão Ellenco no cadastro. */
  empresasDaEstrutura() {
    if (!this.cadastroPronto()) return [];
    return this.companies().filter((c) => this.flagEmpresa(c, "gerida_pelo_grupo") || this.flagEmpresa(c, "gestao_elenco"));
  },

  tokensNome(s) {
    const stop = { spe: 1, ltda: 1, sa: 1, me: 1, epp: 1, e: 1, de: 1, do: 1, da: 1, dos: 1, das: 1, empreendimento: 1, empreendimentos: 1, empreendedora: 1, imobiliario: 1, imobiliaria: 1 };
    return this.semAcento(s).split(" ").filter((t) => t && !stop[t] && t.length >= 4);
  },

  empresasEscolhiveis(atualId) {
    const lista = this.empresasDaEstrutura().slice();
    if (atualId && !lista.some((c) => String(c.id) === String(atualId))) {
      const extra = this.companies().find((c) => String(c.id) === String(atualId));
      if (extra) lista.push(extra);
    }
    const ocupadas = new Set(
      (this.graph.entities || [])
        .filter((e) => e.id !== this.selectedId && e.companyId)
        .map((e) => String(e.companyId))
    );
    return lista.filter((c) => String(c.id) === String(atualId || "") || !ocupadas.has(String(c.id)));
  },

  nomeCadastro(company) {
    const app = window.EmpresasApp;
    const custom = app && app.customOf ? app.customOf(company.id) : null;
    const usual = custom && String(custom.nome_usual || "").trim();
    return usual || String(company.tradeName || company.name || ("Empresa " + company.id)).trim();
  },

  mesmoNomeEmpresa(a, b) {
    const na = this.semAcento(a);
    const nb = this.semAcento(b);
    if (!na || !nb || na.length < 8 || nb.length < 8) return false;
    if (na === nb) return true;
    const curto = na.length <= nb.length ? na : nb;
    const longo = na.length <= nb.length ? nb : na;
    if (curto.length < 18) return false;
    return longo === curto || longo.startsWith(curto + " ");
  },

  ligacoes(id) {
    return (this.graph.links || []).filter((l) => l.from === id || l.to === id).length;
  },

  caixaQueFica(a, b) {
    if (a.id === this.graph.hubId) return a;
    if (b.id === this.graph.hubId) return b;
    const la = this.ligacoes(a.id);
    const lb = this.ligacoes(b.id);
    if (la !== lb) return la > lb ? a : b;
    return this.semAcento(a.name).length >= this.semAcento(b.name).length ? a : b;
  },

  redirecionarCaixa(saiId, fica) {
    const sai = this.entity(saiId);
    if (sai && !fica.companyId && sai.companyId) fica.companyId = sai.companyId;
    if (sai && !(fica.note || "").trim() && (sai.note || "").trim()) fica.note = sai.note;
    const vistos = new Set();
    this.graph.links = (this.graph.links || []).filter((l) => {
      if (l.from === saiId) l.from = fica.id;
      if (l.to === saiId) l.to = fica.id;
      if (l.from === l.to) return false;
      const key = l.from + ">" + l.to;
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    });
  },

  fundirCaixasRepetidas() {
    const ents = this.graph.entities || [];
    const cair = new Set();
    for (let i = 0; i < ents.length; i++) {
      const a = ents[i];
      if (!a || cair.has(a.id) || a.kind === "pf") continue;
      for (let j = i + 1; j < ents.length; j++) {
        const b = ents[j];
        if (!b || cair.has(b.id) || b.kind === "pf") continue;
        const mesmoId = a.companyId && String(a.companyId) === String(b.companyId);
        if (!mesmoId) continue;
        const fica = this.caixaQueFica(a, b);
        const sai = fica === a ? b : a;
        this.redirecionarCaixa(sai.id, fica);
        cair.add(sai.id);
        if (sai === a) break;
      }
    }
    if (!cair.size) return false;
    this.graph.entities = ents.filter((e) => e && !cair.has(e.id));
    if (this.selectedId && cair.has(this.selectedId)) this.selectedId = null;
    return true;
  },

  nomeUsualDaEmpresa(companyOrId) {
    const company = companyOrId && companyOrId.id != null
      ? companyOrId
      : this.companies().find((c) => String(c.id) === String(companyOrId));
    if (!company) return "";
    const app = window.EmpresasApp;
    const custom = app && app.customOf ? app.customOf(company.id) : null;
    const usual = custom && String(custom.nome_usual || "").trim();
    if (!usual || /^nome usual$/i.test(usual)) return "";
    return usual;
  },

  /** Nome da caixa: pessoa física continua com o nome dela. Empresa usa o nome usual do cadastro. */
  nomeExibido(ent) {
    if (!ent) return "";
    if (ent.kind !== "pf" && ent.companyId) {
      const usual = this.nomeUsualDaEmpresa(ent.companyId);
      if (usual) return usual;
      const c = this.companies().find((x) => String(x.id) === String(ent.companyId));
      if (c) return this.nomeCadastro(c);
    }
    return ent.name || "";
  },

  caixaDaEmpresa(companyId, excetoId) {
    if (!companyId) return null;
    return (this.graph.entities || []).find((e) => e.id !== excetoId && String(e.companyId || "") === String(companyId)) || null;
  },

  aplicarNomeDoCadastro(ent) {
    if (!ent || ent.kind === "pf" || !ent.companyId) return false;
    const c = this.companies().find((x) => String(x.id) === String(ent.companyId));
    if (!c) return false;
    const nome = this.nomeUsualDaEmpresa(c) || this.nomeCadastro(c);
    if (!nome || ent.name === nome) return false;
    ent.name = nome;
    return true;
  },

  tokensDistintos(s) {
    const stop = { spe: 1, ltda: 1, sa: 1, me: 1, epp: 1, e: 1, de: 1, do: 1, da: 1, dos: 1, das: 1, empreendimento: 1, empreendimentos: 1, empreendedora: 1, imobiliario: 1, imobiliaria: 1, participacoes: 1, participacao: 1, desenvolvimento: 1, urbanizacao: 1 };
    const romano = { i: 1, ii: 1, iii: 1, iv: 1, v: 1, vi: 1, vii: 1, viii: 1, ix: 1, x: 1 };
    return this.semAcento(s).split(" ").filter((t) => t && !stop[t] && (t.length >= 3 || romano[t] || /^\d+$/.test(t)));
  },

  conjuntoIgual(a, b) {
    if (!a.length || a.length !== b.length) return false;
    const set = new Set(b);
    return a.every((t) => set.has(t));
  },

  notaCaixaEmpresa(box, company) {
    const boxT = this.tokensDistintos(box && box.name);
    if (!boxT.length) return 0;
    const usualNome = this.nomeUsualDaEmpresa(company);
    const usual = this.tokensDistintos(usualNome);
    const legal = this.tokensDistintos([company.name, company.tradeName, company.corporateName].filter(Boolean).join(" "));
    if (usualNome && this.semAcento(box.name) === this.semAcento(usualNome)) return 100;
    if (this.conjuntoIgual(boxT, usual) || this.conjuntoIgual(boxT, legal)) return 90;
    const romano = { i: 1, ii: 1, iii: 1, iv: 1, v: 1, vi: 1, vii: 1, viii: 1, ix: 1, x: 1 };
    const cabe = (empT) => {
      if (!empT.length || !boxT.every((t) => empT.indexOf(t) >= 0)) return false;
      return !empT.some((t) => boxT.indexOf(t) < 0 && (romano[t] || /^\d+$/.test(t)));
    };
    if (cabe(usual) || cabe(legal)) return 70;
    return 0;
  },

  /** Liga a caixa sem cadastro só quando uma empresa ganha sozinha, e o II não herda o cadastro do I. */
  caixaUnicaDaEmpresa(company, usados) {
    const livres = (this.graph.entities || []).filter((e) => e && e.kind !== "pf" && !e.companyId && !(usados && usados.has(e.id)));
    const empresas = this.empresasDaEstrutura().filter((c) => !this.caixaDaEmpresa(c.id));
    let melhor = null;
    let melhorNota = 0;
    let empate = false;
    livres.forEach((box) => {
      const n = this.notaCaixaEmpresa(box, company);
      if (n < 70) return;
      const outra = empresas.reduce((m, c) => {
        if (String(c.id) === String(company.id)) return m;
        return Math.max(m, this.notaCaixaEmpresa(box, c));
      }, 0);
      if (outra >= n) return;
      if (n > melhorNota) {
        melhor = box;
        melhorNota = n;
        empate = false;
      } else if (n === melhorNota) {
        empate = true;
      }
    });
    return empate ? null : melhor;
  },

  entidadeDaEmpresa(company, usados) {
    const id = String(company.id);
    const porId = (this.graph.entities || []).find((e) => String(e.companyId || "") === id);
    if (porId) return porId;
    const usual = this.semAcento(this.nomeUsualDaEmpresa(company));
    const legal = this.semAcento(company.name || company.tradeName || company.corporateName);
    const candidatos = (this.graph.entities || []).filter((e) => {
      if (usados && usados.has(e.id)) return false;
      if (e.kind === "pf" || e.companyId) return false;
      const nome = this.semAcento(e.name);
      if (!nome) return false;
      if (usual && nome === usual) return true;
      return !!(legal && nome === legal);
    });
    return candidatos[0] || null;
  },

  sincronizarEmpresasCadastro() {
    if (this.aba === "parceria" || !this.cadastroPronto()) return;
    let mudou = this.fundirCaixasRepetidas();
    (this.graph.entities || []).forEach((ent) => {
      if (this.aplicarNomeDoCadastro(ent)) mudou = true;
    });
    const novas = [];
    const usados = new Set();
    this.empresasDaEstrutura().forEach((c) => {
      if (this.caixaDaEmpresa(c.id)) {
        const dona = this.caixaDaEmpresa(c.id);
        if (dona) usados.add(dona.id);
        return;
      }
      const existente = this.entidadeDaEmpresa(c, usados) || this.caixaUnicaDaEmpresa(c, usados);
      if (existente) {
        usados.add(existente.id);
        if (!existente.companyId) {
          existente.companyId = String(c.id);
          mudou = true;
        }
        if (this.aplicarNomeDoCadastro(existente)) mudou = true;
        return;
      }
      novas.push(c);
    });
    const presas = (this.graph.entities || []).filter((e) => e && e.kind !== "pf" && e.companyId);
    const cair = new Set();
    (this.graph.entities || []).forEach((solta) => {
      if (!solta || solta.kind === "pf" || solta.companyId || cair.has(solta.id)) return;
      const nome = this.semAcento(solta.name);
      if (nome.length < 4) return;
      const dona = presas.find((p) => this.semAcento(this.nomeExibido(p)) === nome || this.semAcento(p.name) === nome);
      if (!dona || dona.id === solta.id) return;
      this.redirecionarCaixa(solta.id, dona);
      cair.add(solta.id);
    });
    if (cair.size) {
      this.graph.entities = (this.graph.entities || []).filter((e) => e && !cair.has(e.id));
      if (this.selectedId && cair.has(this.selectedId)) this.selectedId = null;
      mudou = true;
    }
    if (novas.length) {
      const ys = (this.graph.entities || []).map((e) => Number(e.y) || 0);
      const y = (ys.length ? Math.max.apply(null, ys) : 40) + 130;
      novas.forEach((c, i) => {
        this.graph.entities.push({
          id: this.uid("ent"),
          name: this.nomeCadastro(c),
          kind: "pj",
          color: this.defaultKindColor("pj"),
          note: "",
          companyId: String(c.id),
          partnerId: "",
          x: 80 + (i % 6) * 196,
          y: y + Math.floor(i / 6) * 118
        });
      });
      mudou = true;
    }
    if (mudou) this.persist();
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
    let seed = "";
    try { seed = localStorage.getItem(this.SEED_KEY) || ""; } catch (e) { seed = ""; }
    if (seed !== this.SEED) {
      this.graph = this.defaultGraph();
      this.ensurePositions();
      this.persist();
      try { localStorage.setItem(this.SEED_KEY, this.SEED); } catch (e) {}
      return;
    }
    let local = null;
    try { local = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "null"); } catch (e) { local = null; }
    const localAt = local && local.updatedAt ? Date.parse(local.updatedAt) || 0 : 0;
    this.graph = this.normalize(local);
    if (window.firebaseDb && window.firebaseCollections) {
      try {
        const { doc, getDoc } = window.firebaseCollections;
        const snap = await getDoc(doc(window.firebaseDb, "config", this.FIRESTORE_DOC));
        if (snap.exists()) {
          const data = snap.data();
          const raw = data.graph || data;
          const remoteAt = Date.parse((data && data.updatedAt) || (raw && raw.updatedAt) || "") || 0;
          if (raw && Array.isArray(raw.entities) && raw.entities.length && remoteAt >= localAt) this.graph = this.normalize(raw);
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
      color: /^#[0-9a-fA-F]{6}$/.test(String(e.color || "")) ? e.color : "",
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
      text: String(n.text || ""),
      entityId: n.entityId || ""
    })) : [];
    const hubId = raw.hubId && entities.some(e => e.id === raw.hubId) ? raw.hubId : (entities[0] && entities[0].id) || "";
    return { hubId, entities, links, notes };
  },

  persist() {
    const updatedAt = new Date().toISOString();
    this.graph.updatedAt = updatedAt;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.graph));
    if (window.firebaseDb && window.firebaseCollections) {
      const { doc, setDoc } = window.firebaseCollections;
      setDoc(doc(window.firebaseDb, "config", this.FIRESTORE_DOC), {
        graph: this.graph,
        updatedAt: updatedAt
      }).catch(e => console.warn("[Societário] Falha ao gravar no Firestore", e));
    }
  },

  empresaParaCaixa(id) {
    const listas = [
      this.companies() || [],
      (window.ContabilApp && ContabilApp.state && ContabilApp.state.companies) || [],
      (window.ContabilEquiv && ContabilEquiv.state && ContabilEquiv.state.companies) || []
    ];
    let bruto = null;
    listas.forEach((lista) => {
      if (bruto) return;
      bruto = (lista || []).find((c) => String(c.id) === String(id)) || null;
    });
    const nome = bruto ? String(bruto.name || bruto.nome || bruto.tradeName || bruto.corporateName || "") : "";
    return {
      id: String(id),
      name: nome || ("Empresa " + id),
      tradeName: bruto && bruto.tradeName ? bruto.tradeName : "",
      corporateName: bruto && bruto.corporateName ? bruto.corporateName : ""
    };
  },

  garantirCaixaEmpresa(companyId) {
    const id = String(companyId || "");
    if (!id) return null;
    const existente = this.caixaDaEmpresa(id);
    if (existente) return existente;
    const company = this.empresaParaCaixa(id);
    const ys = (this.graph.entities || []).map((e) => Number(e.y) || 0);
    const y = (ys.length ? Math.max.apply(null, ys) : 40) + 130;
    const caixa = {
      id: this.uid("ent"),
      name: this.nomeCadastro(company),
      kind: "pj",
      color: this.defaultKindColor("pj"),
      note: "",
      companyId: id,
      partnerId: "",
      x: 80,
      y: y
    };
    this.graph.entities.push(caixa);
    return caixa;
  },

  /* Vínculo nascido na configuração: De = destino (holding), Para = origem (participada). */
  aplicarVinculosConfig(lista) {
    const espera = this._orgSync || Promise.resolve();
    const job = espera.then(() => this._aplicarVinculosConfig(lista));
    this._orgSync = job.catch(() => {});
    return job;
  },

  async _aplicarVinculosConfig(lista) {
    const pares = (lista || []).filter((v) => v && v.origem && v.destino && String(v.origem) !== String(v.destino));
    if (!pares.length) return;
    if (!this.graph || !Array.isArray(this.graph.entities) || !this.graph.entities.length) {
      try { await this.load(); } catch (e) {}
    }
    if (!this.graph || !Array.isArray(this.graph.entities)) return;
    let mudou = false;
    pares.forEach((v) => {
      const origem = String(v.origem);
      const destino = String(v.destino);
      const de = this.garantirCaixaEmpresa(destino);
      const para = this.garantirCaixaEmpresa(origem);
      if (!de || !para || de.id === para.id) return;
      const atual = (this.graph.links || []).find((l) => l.to === para.id);
      if (atual) {
        if (atual.from !== de.id) {
          atual.from = de.id;
          mudou = true;
        }
        return;
      }
      let pct = 0;
      const cadeia = window.ContabilEquiv && Array.isArray(ContabilEquiv.CADEIA) ? ContabilEquiv.CADEIA : [];
      const conhecido = cadeia.find((p) => String(p.origem) === origem && String(p.destino) === destino);
      if (conhecido && Number(conhecido.pct) > 0) pct = Number(conhecido.pct);
      this.graph.links.push({ id: this.uid("lnk"), from: de.id, to: para.id, pct: pct, note: "" });
      mudou = true;
    });
    if (!mudou) return;
    this.persist();
    if (document.getElementById("soc-canvas")) this.render();
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
    this.subirFilhasDasHoldings(hubId);
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
    let maxX = 520;
    let maxY = 280;
    ents.forEach((e) => {
      maxX = Math.max(maxX, (Number(e.x) || 0) + this.NODE_W + 40);
      maxY = Math.max(maxY, (Number(e.y) || 0) + this.NODE_H + 52);
    });
    return { w: maxX, h: maxY };
  },

  fitCanvas() {
    if (this._drag || this._connect) return;
    const wrap = document.getElementById("soc-canvas-wrap");
    const canvas = document.getElementById("soc-canvas");
    if (!wrap || !canvas) return;
    const size = this.canvasSize();
    canvas.style.width = size.w + "px";
    canvas.style.height = size.h + "px";
    const availW = Math.max(240, wrap.clientWidth - 20);
    const availH = Math.max(180, wrap.clientHeight - 20);
    let scale = Math.min(availW / size.w, availH / size.h, 1);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    scale = Math.round(scale * 1000) / 1000;
    this.fitScale = scale;
    canvas.style.zoom = String(scale);
  },

  bindFit() {
    const wrap = document.getElementById("soc-canvas-wrap");
    if (this._fitObs) {
      this._fitObs.disconnect();
      this._fitObs = null;
    }
    if (!wrap || typeof ResizeObserver === "undefined") return;
    this._fitObs = new ResizeObserver(() => this.fitCanvas());
    this._fitObs.observe(wrap);
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
        <span class="soc-node-name">${this.esc(this.nomeExibido(ent))}</span>
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
      const tra = this.tracoDaLigacao(a, b);
      const sel = this.selectedLinkId === link.id;
      const stroke = sel ? "#f59e0b" : "#105436";
      parts.push(`<path d="${tra.d}" fill="none" stroke="${stroke}" stroke-width="${sel ? 3.5 : 2.2}" marker-end="url(#soc-arrow)"/>`);
      const mx = tra.lx;
      const my = tra.ly;
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
    const sx = r.width / (canvas.offsetWidth || r.width || 1);
    const sy = r.height / (canvas.offsetHeight || r.height || 1);
    return {
      x: (ev.clientX - r.left) / (sx || 1),
      y: (ev.clientY - r.top) / (sy || 1)
    };
  },

  nodeAtPoint(pt) {
    let hit = null;
    (this.graph.entities || []).forEach((ent) => {
      const x = Number(ent.x) || 0;
      const y = Number(ent.y) || 0;
      if (pt.x >= x - 18 && pt.x <= x + this.NODE_W + 18 && pt.y >= y - 18 && pt.y <= y + this.NODE_H + 22) hit = ent.id;
    });
    return hit;
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
          const target = ev.target && ev.target.closest && ev.target.closest("#soc-canvas .soc-node");
          let toId = target ? target.getAttribute("data-id") : null;
          const sobCursor = this.nodeAtPoint(this.canvasPoint(ev));
          if (sobCursor && sobCursor !== this._connect.from) toId = sobCursor;
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
          if (moved) {
            this.persist();
            this.fitCanvas();
          } else this.selectEntity(draggedId, true);
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
    const a = this.entity(from);
    const b = this.entity(to);
    if ((a && a.kind === "pf") || (b && b.kind === "pf")) {
      alert("Pessoa física não entra na interligação. Escolha duas empresas do cadastro.");
      return;
    }
    const dup = (this.graph.links || []).find(l => l.from === from && l.to === to);
    if (dup) {
      this.selectLink(dup.id);
      return;
    }
    this.selectedLinkId = "";
    this.selectedId = null;
    this.panel = "link";
    this._pendingLink = { from, to, pct: 0, note: "" };
    this._linkFrom = from || "";
    this._linkTo = to || "";
    this.linkFromOpen = false;
    this.linkToOpen = false;
    this.linkFromQuery = "";
    this.linkToQuery = "";
    this.render();
  },

  idsDaLigacao(link) {
    const de = this.entity(link && link.from);
    const para = this.entity(link && link.to);
    return {
      de: de && de.companyId ? String(de.companyId) : "",
      para: para && para.companyId ? String(para.companyId) : ""
    };
  },

  ehCentro(ent) {
    return !!(ent && (ent.id === this.graph.hubId || String(ent.companyId) === "1"));
  },

  filhoDoCentro(id) {
    return (this.graph.links || []).some((l) => l.from === this.graph.hubId && l.to === id);
  },

  /* A Moura Leite continua dona única. Uma holding pode ligar de novo uma empresa que já é da Moura Leite. */
  participadaOcupada(companyId, excetoLinkId, deId) {
    const id = String(companyId || "");
    if (!id) return false;
    const de = deId ? this.entity(deId) : null;
    const holding = de && !this.ehCentro(de);
    return (this.graph.links || []).some((l) => {
      if (excetoLinkId && l.id === excetoLinkId) return false;
      if (this.idsDaLigacao(l).para !== id) return false;
      if (holding) {
        const dono = this.entity(l.from);
        if (dono && this.ehCentro(dono)) return false;
      }
      return true;
    });
  },

  borda(ent, lado) {
    const x = (Number(ent.x) || 0) + this.NODE_W / 2;
    const y = Number(ent.y) || 0;
    return lado === "top" ? { x: x, y: y } : { x: x, y: y + this.NODE_H };
  },

  tracoDaLigacao(de, para) {
    const cp = this.nodeCenter(para);
    const sobe = cp.y < Number(de.y);
    const p1 = this.borda(de, sobe ? "top" : "bottom");
    const p2 = this.borda(para, sobe ? "bottom" : "top");
    if (sobe && !this.ehCentro(de)) return this.tracoPorFora(de, para);
    const c1y = p1.y + (p2.y - p1.y) * 0.35;
    const c2y = p1.y + (p2.y - p1.y) * 0.65;
    return {
      d: `M ${p1.x} ${p1.y} C ${p1.x} ${c1y}, ${p2.x} ${c2y}, ${p2.x} ${p2.y}`,
      lx: (p1.x + p2.x) / 2,
      ly: (p1.y + p2.y) / 2
    };
  },

  tracoPorFora(de, para) {
    const sai = this.borda(de, "bottom");
    const entra = this.borda(para, "bottom");
    const desce = sai.y + 16;
    const xs = (this.graph.entities || []).map((e) => Number(e.x) || 0);
    const minX = xs.length ? Math.min.apply(null, xs) : 40;
    const maxR = xs.length ? Math.max.apply(null, xs) + this.NODE_W : 400;
    const gutter = sai.x < (minX + maxR) / 2 ? Math.max(8, minX - 28) : maxR + 28;
    const d = `M ${sai.x} ${sai.y} L ${sai.x} ${desce} L ${gutter} ${desce} L ${gutter} ${entra.y} L ${entra.x} ${entra.y}`;
    return { d: d, lx: (gutter + entra.x) / 2, ly: entra.y };
  },

  colocarFileiraAcima(de, row) {
    if (!de || !row || !row.length) return;
    const gap = 28;
    const total = row.length * this.NODE_W + (row.length - 1) * gap;
    let start = (Number(de.x) || 40) + this.NODE_W / 2 - total / 2;
    if (start < 8) start = 8;
    row.forEach((e, i) => {
      e.x = start + i * (this.NODE_W + gap);
      e.y = 16;
    });
  },

  abrirFaixaDoTopo(idsNoTopo) {
    const faixa = 16 + this.NODE_H + 28;
    let menor = Infinity;
    (this.graph.entities || []).forEach((e) => {
      if (!e || idsNoTopo.has(e.id)) return;
      menor = Math.min(menor, Number(e.y) || 0);
    });
    if (!Number.isFinite(menor) || menor >= faixa) return;
    const empurra = faixa - menor;
    (this.graph.entities || []).forEach((e) => {
      if (!e || idsNoTopo.has(e.id)) return;
      e.y = (Number(e.y) || 0) + empurra;
    });
  },

  subirFilhasDasHoldings(parentId) {
    const grupos = [];
    const vistos = new Set();
    const visitar = (id) => {
      if (!id || vistos.has(id)) return;
      vistos.add(id);
      if (id !== this.graph.hubId) {
        const parent = this.entity(id);
        const acima = this.childrenOf(id)
          .map((l) => this.entity(l.to))
          .filter((e) => e && !this.filhoDoCentro(e.id) && !this.ehCentro(e));
        if (parent && acima.length) grupos.push({ parent: parent, acima: acima });
      }
      this.childrenOf(id).forEach((l) => visitar(l.to));
    };
    visitar(parentId);
    if (!grupos.length) return;
    const ids = new Set();
    grupos.forEach((g) => g.acima.forEach((e) => ids.add(e.id)));
    this.abrirFaixaDoTopo(ids);
    grupos.forEach((g) => this.colocarFileiraAcima(g.parent, g.acima));
  },

  parJaInterligado(deId, paraId, excetoLinkId) {
    const de = String(deId || "");
    const para = String(paraId || "");
    if (!de || !para) return false;
    return (this.graph.links || []).some((l) => {
      if (excetoLinkId && l.id === excetoLinkId) return false;
      const ids = this.idsDaLigacao(l);
      return ids.de === de && ids.para === para;
    });
  },

  opcoesLigacao(lado) {
    const atualId = lado === "para" ? this._linkTo : this._linkFrom;
    const itens = [];
    (this.graph.entities || []).forEach((e) => {
      if (!e || e.kind === "pf" || !e.companyId) return;
      if (lado === "para" && this.participadaOcupada(e.companyId, this.selectedLinkId, this._linkFrom) && e.id !== atualId) return;
      const c = this.companies().find((x) => String(x.id) === String(e.companyId));
      const completo = c
        ? String(c.name || c.tradeName || c.corporateName || this.nomeExibido(e))
        : this.nomeExibido(e);
      itens.push({
        id: e.id,
        order: Number(e.companyId),
        label: String(e.companyId) + " - " + completo.toLocaleUpperCase("pt-BR")
      });
    });
    return itens;
  },

  vinculosEquivalencia() {
    const eq = window.ContabilEquiv;
    if (eq && Array.isArray(eq.state && eq.state.vinculos) && eq.state.vinculos.length) return eq.state.vinculos;
    try {
      const raw = JSON.parse(localStorage.getItem("crm_ctb_equiv") || "null");
      if (raw && Array.isArray(raw.vinculos)) return raw.vinculos;
    } catch (e) {}
    return [];
  },

  contasDaLigacao(fromId, toId) {
    const vazio = { debitoLucro: "", creditoLucro: "", debitoPrejuizo: "", creditoPrejuizo: "" };
    const de = this.entity(fromId);
    const para = this.entity(toId);
    if (!de || !para || !de.companyId || !para.companyId) return vazio;
    const origem = String(para.companyId);
    const destino = String(de.companyId);
    const row = this.vinculosEquivalencia().find((v) => String(v.origem) === origem && String(v.destino) === destino)
      || this.vinculosEquivalencia().find((v) => String(v.origem) === origem);
    if (!row) return vazio;
    return {
      debitoLucro: row.debitoLucro || "",
      creditoLucro: row.creditoLucro || "",
      debitoPrejuizo: row.debitoPrejuizo || "",
      creditoPrejuizo: row.creditoPrejuizo || ""
    };
  },

  paintLinkPicks() {
    if (!window.MlEmpresaFilter) return;
    const pintar = (boxId, filterId, campo, openKey, queryKey, lado) => {
      const itens = this.opcoesLigacao(lado);
      const box = document.getElementById(boxId);
      if (!box) return;
      const atual = this[campo] ? String(this[campo]) : "";
      box.innerHTML = MlEmpresaFilter.html({
        id: filterId,
        label: "Empresa",
        items: itens,
        selectedIds: atual ? [atual] : [],
        open: !!this[openKey],
        query: this[queryKey] || "",
        emptyMeansAll: false,
        emptyLabel: "Selecione a empresa",
        single: true
      });
      MlEmpresaFilter.bind(filterId, {
        toggleOpen: () => {
          this[openKey] = !this[openKey];
          this.paintLinkPicks();
        },
        setQuery: (q) => {
          this[queryKey] = q || "";
          const list = document.getElementById(filterId + "-list");
          if (!list) return;
          const escolhido = this[campo] ? [String(this[campo])] : [];
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: filterId,
            items: itens,
            selectedIds: escolhido,
            query: this[queryKey],
            single: true
          });
        },
        toggleId: (id, on) => {
          this[campo] = on ? String(id) : "";
          this[openKey] = false;
          this.paintLinkPicks();
          this.preencherContasLigacao();
        },
        selectAll: () => {},
        selectNone: () => {
          this[campo] = "";
          this.paintLinkPicks();
          this.preencherContasLigacao();
        }
      });
    };
    pintar("soc-lnk-from-box", "soc-lnk-from", "_linkFrom", "linkFromOpen", "linkFromQuery", "de");
    pintar("soc-lnk-to-box", "soc-lnk-to", "_linkTo", "linkToOpen", "linkToQuery", "para");
  },

  preencherContasLigacao() {
    const contas = this.contasDaLigacao(this._linkFrom, this._linkTo);
    const lucroCred = (window.ContabilEquiv && ContabilEquiv.CONTA_LUCRO) || "4.1.03.01.001";
    const prejDeb = (window.ContabilEquiv && ContabilEquiv.CONTA_PREJUIZO) || "4.1.03.01.002";
    const por = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.value = valor;
    };
    por("soc-lnk-deb-lucro", contas.debitoLucro);
    por("soc-lnk-cred-lucro", contas.creditoLucro || lucroCred);
    por("soc-lnk-deb-prej", contas.debitoPrejuizo || prejDeb);
    por("soc-lnk-cred-prej", contas.creditoPrejuizo);
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

  semAcento(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  },

  notaMenciona(text, ent) {
    const nome = this.semAcento(ent && ent.name);
    if (nome.length < 8) return false;
    return this.semAcento(text).includes(nome);
  },

  /** Notas da empresa clicada. Sem seleção, a faixa some para liberar o organograma. */
  notasHtml() {
    const ent = this.entity(this.selectedId);
    if (!ent) return "";
    const cards = [];
    if ((ent.note || "").trim()) {
      cards.push(`<article class="soc-note soc-note-ent"><strong>${this.esc(this.nomeExibido(ent))}</strong><span>${this.esc(ent.note)}</span></article>`);
    }
    (this.graph.links || []).forEach((l) => {
      if ((l.from !== ent.id && l.to !== ent.id) || !(l.note || "").trim()) return;
      const a = this.entity(l.from);
      const b = this.entity(l.to);
      cards.push(`<article class="soc-note soc-note-link"><strong>${this.esc(this.nomeExibido(a))} → ${this.esc(this.nomeExibido(b))} (${this.fmtPct(l.pct)})</strong><span>${this.esc(l.note)}</span></article>`);
    });
    (this.graph.notes || []).forEach((n) => {
      if (!n.text) return;
      const dela = n.entityId ? n.entityId === ent.id : this.notaMenciona(n.text, ent);
      if (!dela) return;
      cards.push(`<article class="soc-note soc-note-free"><span>${this.esc(n.text)}</span><button type="button" class="soc-note-x" title="Excluir nota" onclick="SocietarioApp.removeNote('${n.id}')">×</button></article>`);
    });
    if (!cards.length) return "";
    return `<div class="soc-notes"><div class="soc-notes-title">Notas · ${this.esc(this.nomeExibido(ent))}</div><div class="soc-notes-grid">${cards.join("")}</div></div>`;
  },

  paintCompanyPick() {
    const box = document.getElementById("soc-company-box");
    if (!box || !window.MlEmpresaFilter) return;
    const items = this.empresasEscolhiveis(this._companyId).map((c) => ({
      id: String(c.id),
      label: c.id + " - " + String(c.name || c.corporateName || c.tradeName || "").toLocaleUpperCase("pt-BR")
    }));
    const selected = this._companyId ? [String(this._companyId)] : [];
    box.innerHTML = MlEmpresaFilter.html({
      id: "soc-emp",
      label: "Empresa Sienge",
      items: items,
      selectedIds: selected,
      open: !!this.companyPickOpen,
      query: this.companyPickQuery || "",
      emptyMeansAll: false,
      emptyLabel: "Sem vínculo",
      single: true
    });
    MlEmpresaFilter.bind("soc-emp", {
      toggleOpen: () => {
        this.companyPickOpen = !this.companyPickOpen;
        this.paintCompanyPick();
      },
      setQuery: (q) => {
        this.companyPickQuery = q || "";
        const list = document.getElementById("soc-emp-list");
        if (!list) return;
        list.innerHTML = MlEmpresaFilter.listHtml({
          id: "soc-emp",
          items: items,
          selectedIds: this._companyId ? [String(this._companyId)] : [],
          query: this.companyPickQuery,
          single: true
        });
      },
      toggleId: (id, on) => {
        if (on && this.caixaDaEmpresa(id, this.selectedId)) {
          alert("Essa empresa já está em outra caixa. Cada cadastro só pode aparecer uma vez.");
          this.paintCompanyPick();
          return;
        }
        this._companyId = on ? String(id) : "";
        this.paintCompanyPick();
        this.atualizarNomeUsual();
      },
      selectAll: () => {},
      selectNone: () => {
        this._companyId = "";
        this.paintCompanyPick();
        this.atualizarNomeUsual();
      }
    });
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
        <p style="font-size:0.78rem;color:#64748b;margin:0 0 10px;line-height:1.4;">Pessoa física leva o nome digitado. Empresa mostra o nome usual do cadastro, e cada cadastro só entra em uma caixa.</p>
        <label id="soc-nome-pf" style="${this.lbl}${ent.kind === "pf" ? "" : "display:none;"}">Nome
          ${this.hint("Nome da pessoa física que aparece na caixa azul.")}
          <input id="soc-ent-name" class="form-control" value="${this.esc(ent.kind === "pf" ? ent.name : "")}">
        </label>
        <div id="soc-nome-pj" style="${this.lbl}${ent.kind === "pf" ? "display:none;" : ""}">Nome na caixa
          ${this.hint("Vem do nome usual do cadastro de empresas. Não se digita aqui.")}
          <div id="soc-nome-usual" class="form-control" style="background:#f8fafc;">${this.esc(this.nomeUsualDaEmpresa(ent.companyId) || "Escolha a empresa abaixo")}</div>
        </div>
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
        <label style="${this.lbl}${ent.kind === "pf" ? "display:none;" : ""}">Empresa Sienge
          ${this.hint("Uma empresa do cadastro por caixa. O nome usual dela é o que aparece no organograma.")}
          <div id="soc-company-box"></div>
        </label>
        <label style="${this.lbl}">Parceiro / sócio (parametrização)
          ${this.hint("Opcional. Liga esta caixa a um sócio já cadastrado em Parametrização de Parceiros.")}
          <select id="soc-ent-partner" class="form-control">${this.partnerOptions(ent.partnerId)}</select>
        </label>
        <label style="${this.lbl}">Nota
          ${this.hint("Texto desta empresa. Aparece embaixo só quando a caixa está selecionada.")}
          <textarea id="soc-ent-note" class="form-control" rows="3">${this.esc(ent.note)}</textarea>
        </label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button type="button" class="btn btn-primary" onclick="SocietarioApp.saveEntity()" title="Grava o quadradinho no organograma">${isNew ? "Incluir" : "Salvar"}</button>
          ${!isNew && ent.kind !== "pf" && ent.companyId ? `<button type="button" class="btn btn-outline" onclick="SocietarioApp.interligarDesde('${ent.id}')" title="Abre a interligação com esta empresa já escolhida. Uma holding também liga empresas em que a Moura Leite já participa.">Interligar</button>` : ""}
          ${!isNew ? `<button type="button" class="btn btn-outline" onclick="SocietarioApp.setHub('${ent.id}')" title="A empresa do centro do organograma (caixa principal)">Definir como centro</button>` : ""}
          ${!isNew ? `<button type="button" class="btn btn-outline" style="color:#b91c1c;border-color:#fecaca;" onclick="SocietarioApp.deleteEntity('${ent.id}')" title="Remove a caixa e as ligações ligadas a ela">Excluir</button>` : ""}
        </div>
      `);
    }
    if (this.panel === "note") {
      const dona = this.entity(this.selectedId);
      return this.panelWrap("Nova nota da estrutura", `
        ${dona ? `<p style="margin:0 0 8px;font-size:0.78rem;color:#334155;">Nota de <strong>${this.esc(this.nomeExibido(dona))}</strong>. Ela aparece só com esta empresa selecionada.</p>` : this.hint("Clique antes na empresa que recebe a nota.")}
        <textarea id="soc-note-text" class="form-control" rows="4" placeholder="Ex.: Moura Leite tem 50% na Ellenco, que por sua vez tem 55,5% na Vercellino..."></textarea>
        <button type="button" class="btn btn-primary" style="margin-top:8px;" onclick="SocietarioApp.saveNote()">Salvar nota</button>
      `);
    }
    return "";
  },

  linkModalHtml() {
    if (this.panel !== "link") return "";
    const existing = (this.graph.links || []).find(l => l.id === this.selectedLinkId);
    const link = existing || this._pendingLink || { from: this._linkFrom || "", to: this._linkTo || "", pct: 0, note: "" };
    const isNew = !existing;
    const contas = this.contasDaLigacao(link.from, link.to);
    const lucroCred = (window.ContabilEquiv && ContabilEquiv.CONTA_LUCRO) || "4.1.03.01.001";
    const prejDeb = (window.ContabilEquiv && ContabilEquiv.CONTA_PREJUIZO) || "4.1.03.01.002";
    return `<div class="soc-link-modal" id="soc-link-modal">
      <div class="soc-link-dialog" role="dialog" aria-modal="true" aria-labelledby="soc-link-title">
        <div class="soc-link-head">
          <strong id="soc-link-title">Interligação (participação)</strong>
          <button type="button" class="btn btn-fechar" onclick="SocietarioApp.closePanel()">Fechar</button>
        </div>
        <p class="soc-link-help">Escolha duas empresas do cadastro, pelo nome completo, em ordem de id. Pessoa física não entra aqui. A holding pode participar de várias empresas, inclusive de uma que já é da Moura Leite. Essa empresa sobe para cima da holding, para a linha não atravessar as ligações da empresa 1. O mesmo par não se repete. As contas já entram na parametrização.</p>
        <div class="soc-link-grid">
          <div style="${this.lbl}">De (sócio / holding)
            ${this.hint("Quem possui a participação. Esta empresa pode aparecer em outras interligações.")}
            <div id="soc-lnk-from-box"></div>
          </div>
          <div style="${this.lbl}">Para (participada)
            ${this.hint("Quem recebe a participação. A Moura Leite liga cada uma uma vez. Uma holding pode ligar de novo uma empresa que já é da Moura Leite.")}
            <div id="soc-lnk-to-box"></div>
          </div>
        </div>
        <label style="${this.lbl}">Percentual
          ${this.hint("Quanto esta origem detém na participada.")}
          <input id="soc-lnk-pct" class="form-control" type="number" min="0" max="100" step="0.01" value="${link.pct || 0}">
        </label>
        <div class="soc-link-contas">
          <label style="${this.lbl}">Lucro · debitada
            ${this.hint("Conta debitada quando a participada der lucro.")}
            <input id="soc-lnk-deb-lucro" class="form-control" value="${this.esc(contas.debitoLucro)}" placeholder="1.2.02.01.002">
          </label>
          <label style="${this.lbl}">Lucro · creditada
            ${this.hint("Conta creditada no lucro. O padrão é a reduzida 1815.")}
            <input id="soc-lnk-cred-lucro" class="form-control" value="${this.esc(contas.creditoLucro || lucroCred)}">
          </label>
          <label style="${this.lbl}">Prejuízo · debitada
            ${this.hint("Conta debitada no prejuízo. O padrão é a reduzida 1838.")}
            <input id="soc-lnk-deb-prej" class="form-control" value="${this.esc(contas.debitoPrejuizo || prejDeb)}">
          </label>
          <label style="${this.lbl}">Prejuízo · creditada
            ${this.hint("Conta creditada quando a participada der prejuízo.")}
            <input id="soc-lnk-cred-prej" class="form-control" value="${this.esc(contas.creditoPrejuizo)}" placeholder="1.2.02.01.002">
          </label>
        </div>
        <label style="${this.lbl}">Nota da ligação
          ${this.hint("Opcional. Ex.: acordo de sócios, cláusula especial.")}
          <textarea id="soc-lnk-note" class="form-control" rows="2">${this.esc(link.note)}</textarea>
        </label>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button type="button" class="btn btn-primary" onclick="SocietarioApp.saveLink()">${isNew ? "Incluir" : "Salvar"}</button>
          ${!isNew ? `<button type="button" class="btn btn-outline" style="color:#b91c1c;border-color:#fecaca;" onclick="SocietarioApp.deleteLink('${link.id}')">Excluir</button>` : ""}
        </div>
      </div>
    </div>`;
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
    const pf = kindEl.value === "pf";
    const cur = String(colorEl.value || "").toLowerCase();
    const defaults = this.colorPresets().map(p => p.hex.toLowerCase());
    if (!cur || defaults.includes(cur)) colorEl.value = this.defaultKindColor(kindEl.value);
    const nomePf = document.getElementById("soc-nome-pf");
    const nomePj = document.getElementById("soc-nome-pj");
    const empresa = document.getElementById("soc-company-box");
    if (nomePf) nomePf.style.display = pf ? "" : "none";
    if (nomePj) nomePj.style.display = pf ? "none" : "";
    if (empresa && empresa.closest("label")) empresa.closest("label").style.display = pf ? "none" : "";
  },

  atualizarNomeUsual() {
    const el = document.getElementById("soc-nome-usual");
    if (!el) return;
    el.textContent = this.nomeUsualDaEmpresa(this._companyId) || "Escolha a empresa abaixo";
  },

  panelWrap(title, inner) {
    return `<div class="soc-panel">
      <div class="soc-panel-head">
        <strong>${this.esc(title)}</strong>
        <button type="button" class="btn btn-fechar" onclick="SocietarioApp.closePanel()">Fechar</button>
      </div>
      ${inner}
    </div>`;
  },

  setAba(id) {
    this.aba = id === "parceria" ? "parceria" : "estrutura";
    this.render();
  },

  setEmpresa(id) {
    this.empresaAba = String(id || "");
    this.render();
  },

  abasHtml() {
    const aba = this.aba === "parceria" ? "parceria" : "estrutura";
    const tab = (id, icon, label) => `<button type="button" role="tab" aria-selected="${aba === id}" class="ml-tab${aba === id ? " is-active" : ""}" onclick="SocietarioApp.setAba('${id}')"><i data-lucide="${icon}"></i> ${label}</button>`;
    return `<div class="ml-tabs soc-view-tabs" role="tablist">${tab("estrutura", "git-fork", "Estrutura societária")}${tab("parceria", "handshake", "Parceria / Sociedade")}</div>`;
  },

  parcerias() {
    const app = window.ParametrizacaoParceiroApp;
    if (!app || !Array.isArray(app.items)) return [];
    return app.items.map(p => (typeof app.normalizeItem === "function" ? app.normalizeItem(p) : p)).filter(Boolean);
  },

  empresasParceria() {
    const app = window.ParametrizacaoParceiroApp;
    const map = new Map();
    this.parcerias().forEach(p => {
      const id = String(p.companyId || "");
      if (!id) return;
      if (!map.has(id)) {
        const oficial = app && typeof app.nomeEmpresa === "function" ? app.nomeEmpresa(id) : "";
        const nome = (oficial && oficial !== "Empresa " + id) ? oficial : (p.companyName || oficial || ("Empresa " + id));
        map.set(id, { id, nome, itens: [] });
      }
      map.get(id).itens.push(p);
    });
    return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id) || a.nome.localeCompare(b.nome, "pt-BR"));
  },

  pctCurto(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "%";
  },

  ehPessoaJuridica(nome, doc) {
    const n = String(nome || "").toUpperCase();
    if (/LTDA|S\/A|S\.A\.|SPE|EIRELI|EMPREEND|PARTICIP/.test(n)) return true;
    return String(doc || "").replace(/\D/g, "").length > 11;
  },

  centroNoCadastro(id, companyId) {
    const dig = String(id || "").replace(/\D/g, "");
    if (!dig) return null;
    const app = window.ParametrizacaoParceiroApp;
    let cc = null;
    if (app && typeof app.catalogoCentros === "function") cc = app.catalogoCentros().get(dig) || null;
    if (!cc) {
      const lista = (window.CentrosCustoState && CentrosCustoState.costCenters) || (window.AppState && AppState.cachedCostCenters) || [];
      cc = lista.find((c) => String(c.id || "").replace(/\D/g, "") === dig) || null;
    }
    if (!cc) return null;
    const emp = app && typeof app.empresaDoCentro === "function" ? app.empresaDoCentro(cc) : String(cc.idCompany || cc.companyId || "");
    if (companyId && emp && emp !== String(companyId)) return { id: dig, nome: "", outraEmpresa: true };
    const nome = String(cc.name || "").trim();
    return { id: String(cc.id || dig).replace(/\D/g, "") || dig, nome: nome && nome !== dig ? nome : "" };
  },

  /* Nome do cadastro de centro de custo. A lista fixa antiga só entra quando o cadastro não tem o centro. */
  nomeCentro(id, fallback, companyId) {
    const cad = this.centroNoCadastro(id, companyId);
    if (cad && cad.outraEmpresa) return "";
    const doCadastro = cad && cad.nome ? cad.nome : "";
    const guardado = String(fallback || "").trim();
    const nome = doCadastro || (guardado && guardado !== String(id) ? guardado : "");
    if (nome) return nome;
    const known = typeof window.knownCostCenterName === "function" ? window.knownCostCenterName(id) : "";
    return known && known !== String(id) ? known : "";
  },

  ehDepartamento(nome) {
    const n = this.semAcento(nome);
    if (!n) return false;
    return /\bmarketing\b/.test(n) || /\bcomercial\b/.test(n) || /gestao d[ae] carteira/.test(n) || /carteira e estoque/.test(n);
  },

  ehCcParceria(cc, irmaos) {
    const papel = String(cc && cc.papel || "");
    if (papel === "terrenista") return true;
    const id = String(cc && cc.id || "");
    if (window.CentrosCustoApp && typeof CentrosCustoApp.isParceiro === "function" && CentrosCustoApp.isParceiro({ id, name: cc.name || "" })) return true;
    if (/01$/.test(id) && (irmaos || []).some(x => String(x.id) === id.slice(0, -2) + "00")) return true;
    return false;
  },

  centrosDaObra(obra, companyId) {
    const app = window.ParametrizacaoParceiroApp;
    const code = String((obra && obra.code) || "").replace(/\D/g, "");
    const papel = new Map();
    (obra && obra.costCenters || []).forEach((c) => {
      if (c && c.id) papel.set(String(c.id).replace(/\D/g, ""), c);
    });
    if (app && companyId && code && typeof app.costCentersOfObra === "function") {
      const cad = app.costCentersOfObra(code, companyId);
      if (cad.length) {
        return cad.map((c) => {
          const id = String(c.id).replace(/\D/g, "");
          const g = papel.get(id);
          if (g && g.inAccount === false) return null;
          return { id: id, name: c.name || (g && g.name) || "", papel: (g && g.papel) || "" };
        }).filter(Boolean);
      }
    }
    return (obra && obra.costCenters || []).filter((c) => c && c.id && c.inAccount !== false).map((c) => {
      const cad = this.centroNoCadastro(c.id, companyId);
      if (cad && cad.outraEmpresa) return null;
      return { id: String(c.id).replace(/\D/g, ""), name: (cad && cad.nome) || c.name || "", papel: c.papel || "" };
    }).filter(Boolean);
  },

  caixasDaObra(obra, companyId) {
    const todos = this.centrosDaObra(obra, companyId);
    const nomeDe = (c) => this.nomeCentro(c.id, c.name, companyId);
    const semDepto = todos.filter((c) => !this.ehDepartamento(nomeDe(c)) && !this.ehDepartamento(c.name));
    const base = semDepto.length ? semDepto : todos;
    const empre = base.filter((c) => !this.ehCcParceria(c, todos));
    const lista = empre.length ? empre : base;
    if (lista.length) {
      return lista.map((c) => ({ id: String(c.id), nome: nomeDe(c) }));
    }
    const code = String((obra && obra.code) || "").replace(/\D/g, "");
    if (!code) return [];
    const id = code.length >= 5 ? code : code + "00";
    const cad = this.centroNoCadastro(id, companyId);
    if (cad && cad.outraEmpresa) return [];
    return [{ id: (cad && cad.id) || id, nome: this.nomeCentro(id, "", companyId) }];
  },

  sociosDe(p) {
    const app = window.ParametrizacaoParceiroApp;
    if (!app || typeof app.isSociedade !== "function" || !app.isSociedade(p)) return [];
    return (p.socios || []).filter(s => s && (s.name || s.id));
  },

  caixaHtml(nome, extra, cls) {
    return `<div class="soc-tree-node ${cls}"><span class="soc-tree-name">${this.esc(nome)}</span>${extra || ""}</div>`;
  },

  centroDaPessoa(p, s) {
    const id = String((s && s.ccTitulo) || "").replace(/\D/g, "");
    if (id) {
      const cad = this.centroNoCadastro(id, p && p.companyId);
      if (cad && cad.outraEmpresa) return "—";
      const nome = this.nomeCentro(id, s.ccTituloNome, p && p.companyId);
      return (cad && cad.id ? cad.id : id) + (nome ? " — " + nome : "");
    }
    const ids = [];
    (p.obras || []).forEach(o => this.caixasDaObra(o, p && p.companyId).forEach(c => { if (ids.indexOf(c.id) < 0) ids.push(c.id); }));
    return ids.length ? ids.join(", ") : "—";
  },

  pessoasLista(p, titulo, pessoas) {
    if (!pessoas.length) return "";
    const linhas = pessoas.map(s => {
      const pct = s.sharePct === "" || s.sharePct == null ? "—" : this.pctCurto(s.sharePct);
      const cc = this.centroDaPessoa(p, s);
      const cel = cc && cc !== "—" ? cc : (s.name || s.id || "—");
      return `<tr><td>${this.esc(cel)}</td><td>${this.esc(pct)}</td></tr>`;
    }).join("");
    return `<section class="soc-lista"><h4>${this.esc(titulo)}</h4><table><thead><tr><th>Centro de custo</th><th>%</th></tr></thead><tbody>${linhas}</tbody></table></section>`;
  },

  listasDaParceria(p) {
    const app = window.ParametrizacaoParceiroApp;
    if (app && app.isSociedade && app.isSociedade(p)) return this.pessoasLista(p, "Sócios", this.sociosDe(p));
    return "";
  },

  sociosEmpreendedores(p) {
    const app = window.ParametrizacaoParceiroApp;
    let lista = app && typeof app.sociosPorPapel === "function" ? app.sociosPorPapel(p, "empreendedor") : [];
    if (!lista.length && app && typeof app.ehAracari === "function" && app.ehAracari(p) && Array.isArray(app.ARACARI_EMPREENDEDORES)) {
      lista = app.ARACARI_EMPREENDEDORES;
    }
    return lista.filter(s => s && (s.ccTitulo || s.name)).slice().sort((a, b) => (Number(b.sharePct) || 0) - (Number(a.sharePct) || 0) || String(a.ccTitulo || "").localeCompare(String(b.ccTitulo || ""), "pt-BR", { numeric: true }));
  },

  /* Centro do parceiro terrenista. Na Araçari é o 14202. Nas outras mistas, o centro marcado como terrenista ou o par do parceiro na obra. */
  centrosDoParceiro(p) {
    const app = window.ParametrizacaoParceiroApp;
    const aracari = app && typeof app.ehAracari === "function" && app.ehAracari(p);
    const dosSocios = new Set(this.sociosEmpreendedores(p).map(s => String(s.ccTitulo || "").replace(/\D/g, "")).filter(Boolean));
    const vistos = new Set();
    const out = [];
    const add = (id, nome) => {
      const dig = String(id || "").replace(/\D/g, "");
      if (!dig || vistos.has(dig) || dosSocios.has(dig)) return;
      if (aracari && (dig === "14201" || dig === "70600")) return;
      vistos.add(dig);
      out.push({ id: dig, nome: this.nomeCentro(dig, nome, p && p.companyId) });
    };
    (p.socios || []).forEach(s => {
      if (!s || !s.ccTitulo || !app || typeof app.papelSocio !== "function" || app.papelSocio(s) !== "terrenista") return;
      add(s.ccTitulo, s.ccTituloNome);
    });
    (p.obras || []).forEach(o => {
      const todos = (o.costCenters || []).filter(c => c && c.id);
      todos.forEach(c => {
        if (String(c.papel || "") === "terrenista") add(c.id, c.name);
        else if (!aracari && this.ehCcParceria(c, todos)) add(c.id, c.name);
      });
    });
    if (aracari) add("14202", "");
    return out.sort((a, b) => Number(a.id) - Number(b.id));
  },

  folhaCc(c) {
    const nome = c.nome ? `<small>${this.esc(c.nome)}</small>` : "";
    const pct = c.pct ? `<span class="soc-tree-pct">${this.esc(c.pct)}</span>` : "";
    return `<li>${pct}${this.caixaHtml(c.id, nome, "is-cc")}</li>`;
  },

  /* O centro da obra (a terra) não é o centro do sócio. Fica de fora quando os sócios já têm o centro deles. */
  socioEmpreendedorVisivel(p, s, todos) {
    const id = String((s && s.ccTitulo) || "").replace(/\D/g, "");
    if (!id) return !!(s && s.name);
    const comParte = (todos || []).filter((o) => Number(o.sharePct) > 0 && String(o.ccTitulo || "").replace(/\D/g, ""));
    if (comParte.length && !(Number(s.sharePct) > 0)) return false;
    const nome = this.nomeCentro(id, (s && s.ccTituloNome) || "", p && p.companyId);
    if (this.ehDepartamento(nome)) return false;
    const naObra = (p.obras || []).some((o) => (o.costCenters || []).some((c) => String(c.id || "").replace(/\D/g, "") === id));
    const outros = comParte.filter((o) => String(o.ccTitulo || "").replace(/\D/g, "") !== id);
    if (naObra && outros.length && !/^7/.test(id)) return false;
    return true;
  },

  /* Mista: empreendedor com a fatia restante e terrenista com o percentual do parceiro. Abaixo, o centro de cada sócio e o do parceiro. */
  ramosMistos(p) {
    const app = window.ParametrizacaoParceiroApp;
    const terr = app && typeof app.pctTerrenista === "function" ? Number(app.pctTerrenista(p)) || 0 : 0;
    const emp = Math.round((100 - terr) * 1000) / 1000;
    const todos = this.sociosEmpreendedores(p);
    const socios = todos.filter((s) => this.socioEmpreendedorVisivel(p, s, todos)).map((s) => {
      const id = String(s.ccTitulo || "").replace(/\D/g, "");
      const pct = Number(s.sharePct) > 0 ? this.pctCurto(s.sharePct) : "";
      const cad = id ? this.centroNoCadastro(id, p.companyId) : null;
      const codigo = (cad && cad.id) || id;
      if (codigo) return this.folhaCc({ id: codigo, nome: this.nomeCentro(codigo, s.ccTituloNome || s.name, p.companyId), pct: pct });
      return `<li>${pct ? `<span class="soc-tree-pct">${this.esc(pct)}</span>` : ""}${this.caixaHtml(s.name || "Sócio", "", "is-cc")}</li>`;
    });
    const doParceiro = this.centrosDoParceiro(p).map((c) => {
      const cad = this.centroNoCadastro(c.id, p.companyId);
      return {
        id: (cad && cad.id) || c.id,
        nome: this.nomeCentro(c.id, c.nome, p.companyId) || c.nome
      };
    });
    const pctTerr = doParceiro.length === 1 && terr > 0 ? this.pctCurto(terr) : "";
    const parceiro = doParceiro.map((c) => this.folhaCc({ id: c.id, nome: c.nome, pct: pctTerr }));
    const ramo = (titulo, pct, cls, filhos) => {
      const ul = filhos.length ? `<ul>${filhos.join("")}</ul>` : "";
      const selo = pct > 0 ? `<span class="soc-tree-pct">${this.esc(this.pctCurto(pct))}</span>` : "";
      return `<li>${selo}${this.caixaHtml(titulo, "", cls)}${ul}</li>`;
    };
    return `<ul class="soc-tree-split">${ramo("Empreendedor", emp, "is-pj", socios)}${ramo("Terrenista", terr, "is-terr", parceiro)}</ul>`;
  },

  colunaParceria(p) {
    const app = window.ParametrizacaoParceiroApp;
    const sociedade = app && app.isSociedade && app.isSociedade(p);
    const mista = app && app.isMista && app.isMista(p);
    const pj = this.ehPessoaJuridica(p.partnerName, p.creditor && p.creditor.cpfCnpj);
    const tipo = mista ? "Mista" : (sociedade ? "Sociedade" : "Parceria");
    const obras = (p.obras || []).slice().sort((a, b) => String(a.code).localeCompare(String(b.code), "pt-BR", { numeric: true }));
    let caixas = mista ? [] : obras.flatMap(o => this.caixasDaObra(o, p.companyId).map(c => ({ ...c, pct: sociedade || !(Number(o.defaultPartnerShare) > 0) ? "" : this.pctCurto(o.defaultPartnerShare) })));
    if (!mista && !caixas.length && sociedade) {
      const vistos = new Set();
      caixas = this.sociosDe(p).map((s) => {
        const id = String(s.ccTitulo || "").replace(/\D/g, "");
        if (!id || vistos.has(id)) return null;
        const cad = this.centroNoCadastro(id, p.companyId);
        if (cad && cad.outraEmpresa) return null;
        vistos.add(id);
        return { id: (cad && cad.id) || id, nome: this.nomeCentro(id, s.ccTituloNome || s.name, p.companyId), pct: Number(s.sharePct) > 0 ? this.pctCurto(s.sharePct) : "" };
      }).filter(Boolean);
    }
    const kids = mista
      ? this.ramosMistos(p)
      : (caixas.length
        ? `<ul>${caixas.map(c => `<li><span class="soc-tree-pct">${this.esc(c.pct)}</span>${this.caixaHtml(c.id, c.nome ? `<small>${this.esc(c.nome)}</small>` : "", "is-cc")}</li>`).join("")}</ul>`
        : "");
    return `<li><div class="soc-tree-lado"><div class="soc-tree-lado-titulo">${tipo}</div>${this.caixaHtml(p.partnerName || "Sem nome", "", pj ? "is-pj" : "is-pf")}${kids}${this.listasDaParceria(p)}</div></li>`;
  },

  parceriaHtml() {
    const empresas = this.empresasParceria();
    if (!empresas.length) {
      return `<div class="soc-page"><div class="soc-toolbar"><p class="soc-help">Nenhuma parceria ou sociedade na parametrização de parceiros.</p></div></div>`;
    }
    if (!empresas.some(e => e.id === this.empresaAba)) this.empresaAba = empresas[0].id;
    const atual = empresas.find(e => e.id === this.empresaAba) || empresas[0];
    const abas = empresas.map(e => {
      const on = e.id === atual.id;
      const rotulo = e.id + " — " + e.nome;
      return `<button type="button" role="tab" aria-selected="${on}" title="${this.esc(rotulo)}" class="ml-tab${on ? " is-active" : ""}" onclick="SocietarioApp.setEmpresa('${this.esc(e.id)}')"><i data-lucide="building-2"></i><span>${this.esc(rotulo)}</span></button>`;
    }).join("");
    const itens = atual.itens.slice().sort((a, b) => String(a.partnerName || "").localeCompare(String(b.partnerName || ""), "pt-BR"));
    return `<div class="soc-page">
      <div class="soc-toolbar">
        <p class="soc-help">A caixa de cima é a empresa, no centro da estrutura. Embaixo, cada parceria ou sociedade e os centros de custo com o percentual. Na mista, o empreendedor e o terrenista ficam separados, cada um com o seu centro de custo. Arraste o quadro para o lado para ver quem fica à direita.</p>
      </div>
      <div class="ml-tabs soc-emp-tabs" role="tablist">${abas}</div>
      <div class="soc-stage">
        <div class="soc-canvas-wrap">
          <div class="soc-tree">
            ${this.caixaHtml(atual.id + " — " + atual.nome, "", "is-company")}
            <ul>${itens.map(p => this.colunaParceria(p)).join("")}</ul>
          </div>
        </div>
      </div>
    </div>`;
  },

  bindParceriaPan() {
    const wrap = document.querySelector(".soc-shell.is-parceria .soc-canvas-wrap");
    if (!wrap) return;
    let drag = null;
    wrap.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest && ev.target.closest("button, a, input, textarea, select")) return;
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, l: wrap.scrollLeft, t: wrap.scrollTop, moved: false };
      wrap.setPointerCapture(ev.pointerId);
    });
    wrap.addEventListener("pointermove", (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      wrap.classList.add("is-panning");
      wrap.scrollLeft = drag.l - dx;
      wrap.scrollTop = drag.t - dy;
    });
    const solta = (ev) => {
      if (!drag || (ev && ev.pointerId !== drag.id)) return;
      drag = null;
      wrap.classList.remove("is-panning");
    };
    wrap.addEventListener("pointerup", solta);
    wrap.addEventListener("pointercancel", solta);
    requestAnimationFrame(() => {
      const company = wrap.querySelector(".soc-tree-node.is-company");
      if (!company || wrap.scrollWidth - wrap.clientWidth <= 1) return;
      const cr = company.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      wrap.scrollLeft += (cr.left + cr.width / 2) - (wr.left + wr.width / 2);
    });
  },

  render() {
    const root = document.getElementById("estrutura-societaria-root");
    if (!root) return;
    if (this.aba !== "parceria") this.sincronizarEmpresasCadastro();
    if (this.aba === "parceria") {
      root.innerHTML = `<div class="soc-shell is-parceria">${this.abasHtml()}${this.parceriaHtml()}</div>`;
      if (window.lucide) lucide.createIcons();
      this.bindParceriaPan();
      return;
    }
    this.ensurePositions();
    const wrap = document.getElementById("soc-canvas-wrap");
    const sx = wrap ? wrap.scrollLeft : 0;
    const sy = wrap ? wrap.scrollTop : 0;
    const size = this.canvasSize();
    const linkBtn = this.linkMode ? " is-on" : "";
    root.innerHTML = `
      <div class="soc-shell">${this.abasHtml()}
      <div class="soc-page">
        <div class="soc-toolbar">
          <p class="soc-help">Empresas geridas pelo grupo e da Gestão Ellenco entram aqui. Arraste as caixas, ligue pelos pontos e clique no percentual para editar a participação.</p>
          <div class="soc-toolbar-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick="SocietarioApp.openNewEntity()" title="Cria uma caixa de pessoa física ou de empresa que ainda não está no desenho.">Empresa / pessoa</button>
            <button type="button" class="btn btn-outline btn-sm soc-btn-link${linkBtn}" onclick="SocietarioApp.openNewLink()" title="Cria a participação entre duas caixas. Também dá para arrastar o ponto de uma caixa até a outra.">Interligação</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="SocietarioApp.resetLayout()" title="Reposiciona as caixas. As ligações e os percentuais permanecem.">Reorganizar</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="SocietarioApp.openNewNote()" title="Grava uma nota na empresa selecionada.">Nota</button>
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
            <div class="soc-foot${this.notasHtml() ? "" : " is-quiet"}">
              <div class="soc-legend">
                <span class="soc-chip is-pj">PJ Pessoa jurídica</span>
                <span class="soc-chip is-pf">PF Pessoa física</span>
                <span class="soc-legend-note">A cor padrão segue o tipo. Clique na caixa para ver a nota.</span>
              </div>
              ${this.notasHtml()}
            </div>
          </div>
        </div>
      </div>
      </div>
      ${this.entityModalHtml()}
      ${this.linkModalHtml()}`;
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
      this.fitCanvas();
      this.bindFit();
      if (this.panel === "entity") this.paintCompanyPick();
      if (this.panel === "link") this.paintLinkPicks();
    });
  },

  entityModalHtml() {
    if (this.panel !== "entity" && this.panel !== "note") return "";
    return `<div class="soc-link-modal" id="soc-ent-modal">
      <div class="soc-link-dialog soc-ent-dialog" role="dialog" aria-modal="true">${this.renderPanel()}</div>
    </div>`;
  },

  interligarDesde(id) {
    const ent = this.entity(id);
    if (!ent || ent.kind === "pf" || !ent.companyId) {
      alert("A interligação é entre empresas do cadastro. Pessoa física não entra.");
      return;
    }
    this.selectedLinkId = "";
    this.selectedId = null;
    this.panel = "link";
    this._pendingLink = null;
    this._linkFrom = ent.id;
    this._linkTo = "";
    this.linkFromOpen = false;
    this.linkToOpen = false;
    this.linkFromQuery = "";
    this.linkToQuery = "";
    this.render();
  },

  selectEntity(id, keepCanvas) {
    this.selectedId = id;
    const ent = this.entity(id);
    this._companyId = ent && ent.companyId ? String(ent.companyId) : "";
    this.companyPickOpen = false;
    this.companyPickQuery = "";
    this.selectedLinkId = null;
    this.panel = "entity";
    this.render();
  },

  selectLink(id) {
    const link = (this.graph.links || []).find((l) => l.id === id);
    this.selectedLinkId = id;
    this.selectedId = null;
    this.panel = "link";
    this._pendingLink = null;
    this._linkFrom = link ? link.from : "";
    this._linkTo = link ? link.to : "";
    this.linkFromOpen = false;
    this.linkToOpen = false;
    this.linkFromQuery = "";
    this.linkToQuery = "";
    this.render();
  },

  openNewEntity() {
    this.selectedId = "";
    this._companyId = "";
    this.companyPickOpen = false;
    this.companyPickQuery = "";
    this.selectedLinkId = null;
    this.panel = "entity";
    this.render();
  },

  openNewLink() {
    this.selectedLinkId = "";
    this.selectedId = null;
    this.panel = "link";
    this._pendingLink = null;
    this._linkFrom = "";
    this._linkTo = "";
    this.linkFromOpen = false;
    this.linkToOpen = false;
    this.linkFromQuery = "";
    this.linkToQuery = "";
    this.render();
  },

  openNewNote() {
    if (!this.entity(this.selectedId)) {
      alert("Clique na empresa que recebe a nota.");
      return;
    }
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
    const kind = document.getElementById("soc-ent-kind").value === "pf" ? "pf" : "pj";
    const colorRaw = (document.getElementById("soc-ent-color") && document.getElementById("soc-ent-color").value) || "";
    const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : this.defaultKindColor(kind);
    const partnerId = document.getElementById("soc-ent-partner").value;
    const note = document.getElementById("soc-ent-note").value || "";
    let companyId = "";
    let name = "";
    if (kind === "pf") {
      name = (document.getElementById("soc-ent-name").value || "").trim();
      if (!name) { alert("Informe o nome da pessoa."); return; }
    } else {
      companyId = this._companyId || "";
      if (!companyId) {
        alert("Escolha a empresa do cadastro. O nome da caixa é o nome usual dela.");
        return;
      }
      if (this.caixaDaEmpresa(companyId, this.selectedId)) {
        alert("Essa empresa já está em outra caixa. Cada cadastro só pode aparecer uma vez.");
        return;
      }
      const company = this.companies().find((c) => String(c.id) === String(companyId));
      name = this.nomeUsualDaEmpresa(companyId) || (company ? this.nomeCadastro(company) : "");
      if (!name) { alert("Essa empresa ainda não tem nome usual no cadastro."); return; }
    }
    const nova = !(this.selectedId && this.entity(this.selectedId));
    if (nova && kind === "pj") {
      const ok = this.empresasDaEstrutura().some((c) => String(c.id) === String(companyId));
      if (!ok) {
        alert("Empresa nova não é digitada aqui. No cadastro de empresas, ligue Gerida pelo grupo ou Gestão Ellenco. A caixa entra no organograma.");
        return;
      }
    }
    if (this.selectedId && this.entity(this.selectedId)) {
      const ent = this.entity(this.selectedId);
      ent.name = name;
      ent.kind = kind;
      ent.color = color;
      ent.companyId = companyId;
      ent.partnerId = partnerId;
      ent.note = note;
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
    const from = this._linkFrom || "";
    const to = this._linkTo || "";
    const pct = Number(document.getElementById("soc-lnk-pct").value);
    const note = document.getElementById("soc-lnk-note").value || "";
    const contas = {
      debitoLucro: (document.getElementById("soc-lnk-deb-lucro").value || "").trim(),
      creditoLucro: (document.getElementById("soc-lnk-cred-lucro").value || "").trim(),
      debitoPrejuizo: (document.getElementById("soc-lnk-deb-prej").value || "").trim(),
      creditoPrejuizo: (document.getElementById("soc-lnk-cred-prej").value || "").trim()
    };
    const de = this.entity(from);
    const para = this.entity(to);
    const existing = (this.graph.links || []).find(l => l.id === this.selectedLinkId);
    if (!from || !to) { alert("Selecione a empresa de origem e a de destino."); return; }
    if (from === to) { alert("A ligação precisa ser entre duas empresas diferentes."); return; }
    if (!de || !para || de.kind === "pf" || para.kind === "pf" || !de.companyId || !para.companyId) {
      alert("A interligação é só entre empresas do cadastro. Pessoa física não entra.");
      return;
    }
    if (String(de.companyId) === String(para.companyId)) {
      alert("A origem e o destino precisam ser cadastros diferentes.");
      return;
    }
    if (this.parJaInterligado(de.companyId, para.companyId, existing && existing.id)) {
      alert("Essas duas empresas já estão interligadas. O mesmo par de cadastros não se repete.");
      return;
    }
    if (this.participadaOcupada(para.companyId, existing && existing.id, de.id)) {
      const dona = this.ehCentro(de)
        ? "Essa participada já tem uma interligação. A Moura Leite liga cada empresa uma vez."
        : "Essa empresa já está interligada a outra holding. O mesmo par não se repete, e cada holding liga a sua.";
      alert(dona);
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { alert("Percentual entre 0 e 100."); return; }
    if (!contas.debitoLucro || !contas.creditoLucro || !contas.debitoPrejuizo || !contas.creditoPrejuizo) {
      alert("Informe a conta de débito e a de crédito do lucro e do prejuízo.");
      return;
    }
    let nova = false;
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
        nova = true;
      }
    }
    if (nova && !this.filhoDoCentro(para.id) && !this.ehCentro(de)) this.subirFilhasDasHoldings(this.graph.hubId);
    this._pendingLink = null;
    this.persist();
    const seguir = window.ContabilEquiv && typeof ContabilEquiv.receberDoOrganograma === "function"
      ? ContabilEquiv.receberDoOrganograma({
        origem: String(para.companyId),
        destino: String(de.companyId),
        debitoLucro: contas.debitoLucro,
        creditoLucro: contas.creditoLucro,
        debitoPrejuizo: contas.debitoPrejuizo,
        creditoPrejuizo: contas.creditoPrejuizo,
        apelidoOrigem: this.nomeExibido(para),
        apelidoDestino: this.nomeExibido(de)
      })
      : Promise.resolve();
    Promise.resolve(seguir).then(() => {
      this.panel = "none";
      this.selectedLinkId = null;
      this.render();
    });
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
    const ent = this.entity(this.selectedId);
    if (!ent) { alert("Clique na empresa que recebe a nota."); return; }
    this.graph.notes.push({ id: this.uid("n"), text, entityId: ent.id });
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
  }
};

window.SocietarioApp = SocietarioApp;
