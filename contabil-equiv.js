/* Contábil · contas de equivalência por empresa e lançamento no Sienge. */
const ContabilEquiv = {
  state: {
    companies: [],
    empresaId: "",
    contas: [],
    lancamentos: [],
    lendo: false,
    lendoLanc: false,
    progresso: 30,
    erro: "",
    msg: "",
    empresas: {},
    lancados: {},
    informados: {},
    updatedAt: 0,
    busca: "",
    gestaoComp: "",
    rascunho: null,
    vinculos: null,
    cacheContas: {},
    cacheLanc: {}
  },
  _lido: false,

  esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  podeLancar() {
    if (window.isCrmSuperAdmin && window.isCrmSuperAdmin()) return true;
    if (typeof window.hasCrmPerm !== "function") return false;
    return window.hasCrmPerm("sub_contabil_geral_config_editar") === true
      || window.hasCrmPerm("sub_contabil_geral_demonstracoes_editar") === true;
  },

  cfgDa(id) {
    return (this.state.empresas || {})[String(id)] || null;
  },

  jaLancado(id, chave) {
    return !!(this.state.lancados && this.state.lancados[String(id) + "@" + chave]);
  },

  /* Investida → controladora. A Ellenco entra por último: o resultado dela já soma a Vercellino. */
  CADEIA: [
    { origem: "13", destino: "12", pct: 55.5, apelidoOrigem: "VERCELLINO", apelidoDestino: "ELLENCO", nomeOrigem: "Vercellino", nomeDestino: "Ellenco", perdas: "4.1.03.01.002", mep: "1.2.02.01.003", receitas: "4.1.03.01.001" },
    { origem: "5", destino: "1", pct: 66, apelidoOrigem: "MLES", apelidoDestino: "MOURA LEITE", nomeOrigem: "MLES", nomeDestino: "Moura Leite", perdas: "4.1.03.01.002", mep: "1.2.02.02.003", receitas: "4.1.03.01.001" },
    { origem: "6", destino: "1", pct: 55, apelidoOrigem: "ARAÇARI", apelidoDestino: "MOURA LEITE", nomeOrigem: "Araçari", nomeDestino: "Moura Leite", perdas: "4.1.03.01.002", mep: "1.2.02.01.002", receitas: "4.1.03.01.001" },
    { origem: "32", destino: "1", pct: 100, apelidoOrigem: "NOVO HORIZONTE", apelidoDestino: "MOURA LEITE", nomeOrigem: "Novo Horizonte", nomeDestino: "Moura Leite", perdas: "4.1.03.01.002", mep: "1.2.02.08.002", receitas: "4.1.03.01.001" },
    { origem: "17", destino: "1", pct: 35, apelidoOrigem: "PARQUE CIDADE", apelidoDestino: "MOURA LEITE", nomeOrigem: "Parque Cidade II", nomeDestino: "Moura Leite", perdas: "4.1.03.01.002", mep: "1.2.02.05.002", receitas: "4.1.03.01.001" },
    { origem: "36", destino: "1", pct: 0, apelidoOrigem: "TAGUAÍ", apelidoDestino: "MOURA LEITE", nomeOrigem: "Taguaí", nomeDestino: "Moura Leite", perdas: "4.1.03.01.002", mep: "1.2.02.10.001", receitas: "4.1.03.01.001" },
    { origem: "12", destino: "1", pct: 50, apelidoOrigem: "ELLENCO", apelidoDestino: "MOURA LEITE", nomeOrigem: "Ellenco", nomeDestino: "Moura Leite", perdas: "4.1.03.01.002", mep: "1.2.02.03.002", receitas: "4.1.03.01.001" }
  ],

  /* Lucro: crédito fixo (reduzida 1815). Prejuízo: débito fixo (reduzida 1838). O outro lado é a conta de ajuste de cada investida. */
  CONTA_LUCRO: "4.1.03.01.001",
  REDUZIDA_LUCRO: "1815",
  CONTA_PREJUIZO: "4.1.03.01.002",
  REDUZIDA_PREJUIZO: "1838",

  /* Pares do modelo enviado. O id acompanha o nome no Sienge quando a lista de empresas já carregou. */
  modelo() {
    const linhas = [
      { origem: "13", destino: "12", debitoLucro: "1.2.02.01.003", creditoPrejuizo: "1.2.02.01.003", apelidoOrigem: "VERCELLINO", apelidoDestino: "ELLENCO" },
      { origem: "5", destino: "1", debitoLucro: "1.2.02.01.002", creditoPrejuizo: "1.2.02.01.002", apelidoOrigem: "MLES", apelidoDestino: "MOURA LEITE" },
      { origem: "6", destino: "1", debitoLucro: "1.2.02.01.002", creditoPrejuizo: "1.2.02.01.002", apelidoOrigem: "ARAÇARI", apelidoDestino: "MOURA LEITE" },
      { origem: "32", destino: "1", debitoLucro: "1.2.02.05.002", creditoPrejuizo: "1.2.02.05.002", apelidoOrigem: "NOVO HORIZONTE", apelidoDestino: "MOURA LEITE" },
      { origem: "17", destino: "1", debitoLucro: "1.2.02.05.002", creditoPrejuizo: "1.2.02.05.002", apelidoOrigem: "PARQUE CIDADE", apelidoDestino: "MOURA LEITE" },
      { origem: "36", destino: "1", debitoLucro: "1.2.02.10.001", creditoPrejuizo: "1.2.02.10.001", apelidoOrigem: "TAGUAÍ", apelidoDestino: "MOURA LEITE" },
      { origem: "12", destino: "1", debitoLucro: "1.2.02.01.002", creditoPrejuizo: "1.2.02.01.002", apelidoOrigem: "ELLENCO", apelidoDestino: "MOURA LEITE" }
    ];
    return linhas.map((v) => {
      const origem = this.casarEmpresa(v.origem, v.apelidoOrigem);
      const destino = this.casarEmpresa(v.destino, v.apelidoDestino);
      return {
        origem: origem,
        destino: destino,
        debitoLucro: v.debitoLucro,
        creditoPrejuizo: v.creditoPrejuizo,
        evento: this.eventoSalvo(destino),
        apelidoOrigem: v.apelidoOrigem,
        apelidoDestino: v.apelidoDestino
      };
    });
  },

  casarEmpresa(id, apelido) {
    const lista = this.state.companies || [];
    const alvo = this.fold(apelido);
    const pref = lista.find((c) => String(c.id) === String(id));
    if (!lista.length || (pref && alvo && this.fold(pref.nome).indexOf(alvo) >= 0)) return String(id);
    const outro = lista.find((c) => alvo && this.fold(c.nome).indexOf(alvo) >= 0);
    return outro ? String(outro.id) : String(id);
  },

  eventoSalvo(id) {
    const cfg = this.cfgDa(id);
    return cfg && Number(cfg.evento) > 0 ? String(cfg.evento) : "";
  },

  passos() {
    const lista = Array.isArray(this.state.vinculos) ? this.state.vinculos : this.modelo();
    return this.ordenarCadeia(lista.filter((v) => v && (v.origem || v.destino)));
  },

  /* A investida que também é destino de outro passo entra depois, para o resultado dela já incluir a equivalência recebida. */
  ordenarCadeia(lista) {
    const rest = lista.slice();
    const out = [];
    let guard = 0;
    while (rest.length && guard < 40) {
      guard += 1;
      const idx = rest.findIndex((v) => !rest.some((o) => o !== v && String(o.destino) === String(v.origem)));
      out.push(rest.splice(idx >= 0 ? idx : 0, 1)[0]);
    }
    return out;
  },

  apelidoDe(id) {
    const c = (this.state.companies || []).find((x) => String(x.id) === String(id));
    const nome = c && c.nome ? this.fold(c.nome) : "";
    return nome.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  },

  nomeCurto(id, fallback) {
    const emp = window.EmpresasApp;
    const custom = emp && typeof emp.customOf === "function" ? emp.customOf(id) : null;
    let nome = custom && custom.nome_usual ? String(custom.nome_usual).trim() : "";
    if (!nome) nome = String(fallback || "").trim();
    if (!nome) {
      const c = (this.state.companies || []).find((x) => String(x.id) === String(id));
      nome = c && c.nome ? String(c.nome).trim() : "";
    }
    nome = nome.replace(/\s+/g, " ").trim();
    const letras = nome.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (letras && letras === letras.toUpperCase()) {
      nome = nome.toLowerCase().replace(/(^|[\s\-])([a-zà-ÿ])/g, (m, sep, letra) => sep + letra.toUpperCase());
      nome = nome.replace(/\b(Spe|Ltda|Sa|Me|Epp)\b/g, (s) => s.toUpperCase());
    }
    return nome || String(fallback || id || "");
  },

  complemento(nome, pct, chave) {
    const p = String(chave || "").split("-");
    const comp = p.length >= 2 ? (p[1] + "/" + p[0]) : String(chave || "");
    const pctTxt = Number(pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return "valor referente ajuste de equivalencia patrimonial " + nome + " de " + pctTxt + "% - comp. " + comp;
  },

  passoKey(destino, origem, chave) {
    return String(destino) + "@" + String(origem) + "@" + chave;
  },

  jaPasso(destino, origem, chave) {
    return !!(this.state.lancados && this.state.lancados[this.passoKey(destino, origem, chave)]);
  },

  notaHtml(chave) {
    if (!chave) return "";
    const sufixo = "@" + chave;
    const itens = [];
    Object.keys(this.state.lancados || {}).forEach((k) => {
      if (k.slice(-sufixo.length) !== sufixo) return;
      const rec = this.state.lancados[k];
      if (rec && rec.rotulo) itens.push(rec.rotulo);
    });
    if (!itens.length) return "";
    return `<p class="ctb-ok">Equivalência desta competência já gerada: ${this.esc(itens.join(" · "))}</p>`;
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  },

  entidade(id, apelido) {
    const app = window.SocietarioApp;
    const g = app && app.graph;
    if (!g || !Array.isArray(g.entities)) return null;
    const porId = g.entities.find((e) => String(e.companyId || "") === String(id));
    if (porId) return porId;
    if (String(id) === "1" && g.hubId) {
      const hub = g.entities.find((e) => e.id === g.hubId);
      if (hub) return hub;
    }
    const alvo = this.fold(apelido);
    if (!alvo) return null;
    return g.entities.find((e) => this.fold(e.name).indexOf(alvo) >= 0) || null;
  },

  pctDoPasso(passo) {
    const g = window.SocietarioApp && SocietarioApp.graph;
    const a = this.entidade(passo.destino, passo.apelidoDestino);
    const b = this.entidade(passo.origem, passo.apelidoOrigem);
    if (g && a && b && a.id !== b.id) {
      const link = (g.links || []).find((l) => (l.from === a.id && l.to === b.id) || (l.from === b.id && l.to === a.id));
      const pct = link ? Number(link.pct) : 0;
      if (pct > 0) return pct;
      if (Array.isArray(g.links) && g.links.length) return 0;
    }
    return Number(passo.pct) || 0;
  },

  empresasGestao() {
    const emp = window.EmpresasApp;
    const doDre = window.ContabilApp && ContabilApp.state && ContabilApp.state.companies;
    const lista = (doDre && doDre.length) ? doDre : (this.state.companies || []);
    if (!emp || typeof emp.flagOn !== "function") return [];
    return lista.filter((c) => emp.flagOn(emp.customOf(c.id), "gestao_elenco"));
  },

  pctGestao(id) {
    const vinc = (this.state.vinculos || []).find((v) => String(v.origem) === String(id));
    return this.pctDoPasso({
      origem: String(id),
      destino: vinc && vinc.destino ? String(vinc.destino) : "1",
      pct: 0,
      apelidoOrigem: (vinc && vinc.apelidoOrigem) || this.apelidoDe(id),
      apelidoDestino: (vinc && vinc.apelidoDestino) || "MOURA LEITE"
    });
  },

  lerValor(raw) {
    const txt = String(raw == null ? "" : raw).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    if (!txt || txt === "-" || txt === "+") return null;
    const n = Number(txt);
    return Number.isFinite(n) ? n : null;
  },

  salvarInformado(id, chave, campo, valor) {
    if (!this.state.informados) this.state.informados = {};
    const key = String(id) + "@" + chave;
    const rec = this.state.informados[key] || { valor: "", mep: "" };
    rec[campo] = String(valor || "").trim();
    this.state.informados[key] = rec;
    this.persistir().catch(() => {});
  },

  gestaoChave() {
    if (/^\d{4}-\d{2}$/.test(String(this.state.gestaoComp || ""))) return this.state.gestaoComp;
    const de = window.ContabilApp && ContabilApp.state && ContabilApp.state.de;
    if (/^\d{4}-\d{2}$/.test(String(de || ""))) return de;
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  },

  setGestaoComp(valor) {
    this.state.gestaoComp = String(valor || "");
    this.render();
  },

  gestaoHtml(chave) {
    const alvos = this.empresasGestao();
    if (!chave || !alvos.length) return "";
    const linhas = alvos.map((c) => {
      const rec = (this.state.informados || {})[String(c.id) + "@" + chave] || {};
      const pct = this.pctGestao(c.id);
      const pctTxt = pct > 0 ? (Number(pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "% na Moura Leite") : "sem percentual no organograma";
      const vinc = (this.state.vinculos || []).find((v) => String(v.origem) === String(c.id));
      const conta = vinc && vinc.debitoLucro ? ("ajuste " + vinc.debitoLucro) : "sem vínculo na tabela acima";
      return `<label class="ctb-gestao-linha"><span>${this.esc(c.id + " - " + c.nome)} · ${this.esc(pctTxt)} · ${this.esc(conta)}</span>
        <input type="text" inputmode="decimal" value="${this.esc(rec.valor || "")}" placeholder="Lucro ou prejuízo" onchange="ContabilEquiv.salvarInformado('${this.esc(c.id)}','${this.esc(chave)}','valor', this.value)">
      </label>`;
    }).join("");
    return `<div class="ctb-gestao"><p>Gestão Ellenco: a operadora é a empresa 28, Reserva dos Ramos. A Ellenco apura o resultado e devolve o valor. Informe só o lucro (positivo) ou o prejuízo (negativo) da competência. A conta sai do vínculo salvo acima e o percentual sai do organograma. O lançamento vai para a empresa de destino desse vínculo.</p>
      <div class="ctb-campo">
        <label for="ctb-eq-gestao-comp">Competência</label>
        <input type="month" id="ctb-eq-gestao-comp" value="${this.esc(chave)}" onchange="ContabilEquiv.setGestaoComp(this.value)">
      </div>
      ${linhas}</div>`;
  },

  incluirGestao(app, chave, linhas, faltas, pulos, nomeEmp, fim, partes) {
    this.empresasGestao().forEach((c) => {
      const rec = (this.state.informados || {})[String(c.id) + "@" + chave] || {};
      const resultado = this.lerValor(rec.valor);
      const pct = this.pctGestao(c.id);
      const nome = nomeEmp(c.id, c.nome);
      if (resultado == null) return;
      const pctTxt = Number(pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
      if (!(pct > 0)) {
        faltas.push(nome + " sem percentual no organograma");
        return;
      }
      const signed = Math.round(resultado * pct) / 100;
      if (Math.abs(signed) < 0.01) return;
      const vinc = (this.state.vinculos || []).find((v) => String(v.origem) === String(c.id));
      const debitoVar = vinc ? String(vinc.debitoLucro || "").trim() : "";
      const creditoVar = vinc ? String(vinc.creditoPrejuizo || "").trim() : "";
      if (!debitoVar || !creditoVar) {
        faltas.push(nome + " sem vínculo na parametrização");
        return;
      }
      const destino = vinc && vinc.destino ? String(vinc.destino) : "1";
      const titulo = c.nome + " " + pctTxt + " → " + nomeEmp(destino, "Moura Leite");
      if (this.jaPasso(destino, c.id, chave)) {
        pulos.push(titulo);
        return;
      }
      const evento = Number(vinc && vinc.evento) || Number((this.cfgDa(destino) || {}).evento);
      if (!(evento > 0)) {
        faltas.push(nomeEmp(destino, "destino") + " ainda não tem lançamento de equivalência anterior para repetir o evento do Sienge");
        return;
      }
      const lucro = signed > 0;
      linhas.push({
        companyId: Number(destino),
        origem: String(c.id),
        empresa: nomeEmp(destino, "Moura Leite"),
        chave: chave,
        rotulo: titulo,
        date: fim,
        amount: Math.round(Math.abs(signed) * 100) / 100,
        tipo: lucro ? "lucro" : "prejuízo",
        debitAccountId: lucro ? debitoVar : this.CONTA_PREJUIZO,
        creditAccountId: lucro ? this.CONTA_LUCRO : creditoVar,
        eventId: evento,
        description: this.complemento(this.nomeCurto(c.id, c.nome), pct, chave),
        resultado: resultado,
        pct: pct
      });
    });
  },

  aplicar(data) {
    if (!data || typeof data !== "object") return;
    this.state.empresas = data.empresas && typeof data.empresas === "object" ? data.empresas : {};
    this.state.lancados = data.lancados && typeof data.lancados === "object" ? data.lancados : {};
    this.state.informados = data.informados && typeof data.informados === "object" ? data.informados : (this.state.informados || {});
    if (Array.isArray(data.vinculos)) this.state.vinculos = data.vinculos;
    this.state.updatedAt = Number(data.updatedAt) || 0;
  },

  async garantirConfig() {
    if (this._lido) return;
    try {
      const raw = localStorage.getItem("crm_ctb_equiv");
      if (raw) this.aplicar(JSON.parse(raw));
    } catch (e) {}
    try {
      const fc = window.firebaseCollections;
      if (window.firebaseDb && fc && fc.getDoc && fc.doc) {
        const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", "ctb_equiv"));
        if (snap && typeof snap.exists === "function" && snap.exists()) {
          const data = snap.data() || {};
          if ((Number(data.updatedAt) || 0) >= (this.state.updatedAt || 0)) this.aplicar(data);
        }
      }
    } catch (e) {}
    this._lido = true;
  },

  async persistir() {
    this.state.updatedAt = Date.now();
    const payload = {
      empresas: this.state.empresas || {},
      lancados: this.state.lancados || {},
      informados: this.state.informados || {},
      vinculos: this.state.vinculos || [],
      updatedAt: this.state.updatedAt
    };
    try { localStorage.setItem("crm_ctb_equiv", JSON.stringify(payload)); } catch (e) {}
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc || !fc.doc) return false;
    await fc.setDoc(fc.doc(window.firebaseDb, "config", "ctb_equiv"), payload, { merge: true });
    return true;
  },

  async init() {
    await this.garantirConfig();
    if (!this.state.companies.length) await this.carregarEmpresas();
    if (!Array.isArray(this.state.vinculos)) this.state.vinculos = this.modelo();
    const socio = window.SocietarioApp;
    if (socio && typeof socio.load === "function" && !(socio.graph && Array.isArray(socio.graph.links) && socio.graph.links.length)) {
      try { await socio.load(); } catch (e) {}
    }
    this.render();
  },

  async carregarEmpresas() {
    try {
      const api = window.SiengeApiService;
      const res = api && api.getCompanies ? await api.getCompanies() : [];
      const lista = Array.isArray(res) ? res : ((res && res.results) || []);
      this.state.companies = lista.map((c) => ({
        id: String(c.id != null ? c.id : c.companyId),
        nome: String(c.name || c.corporateName || c.companyName || c.tradeName || "").trim()
      })).filter((c) => c.id && c.id !== "undefined");
    } catch (e) {
      this.state.erro = "Não consegui listar as empresas. " + ((e && e.message) || "");
    }
  },

  setEmpresa(id) {
    this.state.empresaId = String(id || "");
    this.state.rascunho = null;
    this.state.erro = "";
    this.state.msg = "";
    this.state.busca = "";
    this.state.contas = (this.state.cacheContas || {})[this.state.empresaId] || [];
    this.state.lancamentos = (this.state.cacheLanc || {})[this.state.empresaId] || [];
    this.render();
  },

  lerFormulario() {
    const lucro = document.getElementById("ctb-eq-lucro");
    if (!lucro) return;
    const prej = document.getElementById("ctb-eq-prej");
    const ajuste = document.getElementById("ctb-eq-ajuste");
    const evento = document.getElementById("ctb-eq-evento");
    this.state.rascunho = {
      empresaId: this.state.empresaId,
      lucro: lucro.value,
      prejuizo: prej ? prej.value : "",
      ajuste: ajuste ? ajuste.value : "",
      evento: evento ? evento.value : ""
    };
  },

  valorCampo(campo, salvo) {
    const r = this.state.rascunho;
    if (r && r.empresaId === this.state.empresaId && r[campo] != null) return r[campo];
    return salvo || "";
  },

  lerConta(raw) {
    const codigo = String(raw.uniqueNumber || raw.accountNumber || raw.code || raw.number || "").trim();
    const nome = String(raw.name || raw.description || raw.accountName || "").trim();
    const id = raw.id != null ? String(raw.id) : "";
    return { id: id, codigo: codigo || id, nome: nome || codigo || id };
  },

  ehEquiv(conta) {
    const app = window.ContabilApp;
    const nome = app && app.norm ? app.norm(conta.nome) : String(conta.nome || "").toUpperCase();
    const cod = app && app.dreNorm ? app.dreNorm(conta.codigo) : String(conta.codigo || "");
    if (/PARTICIP|MEP|EQUIVAL|EQUIV/.test(nome)) return true;
    if (cod.indexOf("4.1.3") === 0) return true;
    if (cod.indexOf("1.2.2.1") === 0) return true;
    return false;
  },

  ordenar(lista) {
    const app = window.ContabilApp;
    return (lista || []).slice().sort((a, b) => {
      if (app && app.compararCodigo) return app.compararCodigo(a.codigo, b.codigo);
      return String(a.codigo).localeCompare(String(b.codigo));
    });
  },

  async verContas() {
    this.lerFormulario();
    const id = this.state.empresaId;
    if (!id) {
      this.state.erro = "Escolha a empresa.";
      this.render();
      return;
    }
    const api = window.SiengeApiService;
    if (!api || typeof api.getAccountancyAccounts !== "function") {
      this.state.erro = "A lista de contas não está disponível. Atualize a página com Ctrl+F5.";
      this.render();
      return;
    }
    this.state.lendo = true;
    this.state.erro = "";
    this.state.msg = "";
    this.state.progresso = 25;
    this.render();
    try {
      const brutos = await api.getAccountancyAccounts(id);
      const contas = this.ordenar(brutos.map((c) => this.lerConta(c)).filter((c) => c.codigo && this.ehEquiv(c)));
      this.state.contas = contas;
      this.state.cacheContas[id] = contas;
      this.state.msg = contas.length
        ? (contas.length + " contas de equivalência nesta empresa.")
        : "Não achei conta de participação, MEP ou classe 4.1.03. Inclua pelo código.";
    } catch (e) {
      this.state.erro = "O Sienge não devolveu o plano de contas. " + ((e && e.message) || "");
    }
    this.state.lendo = false;
    this.state.progresso = 100;
    this.render();
  },

  async incluirCodigo() {
    this.lerFormulario();
    const id = this.state.empresaId;
    const campo = document.getElementById("ctb-eq-codigo");
    const cod = campo ? String(campo.value || "").trim() : "";
    if (!id || !cod) {
      this.state.erro = "Escolha a empresa e informe o código da conta.";
      this.render();
      return;
    }
    const api = window.SiengeApiService;
    if (!api || typeof api.buscarContaContabil !== "function") return;
    this.state.lendo = true;
    this.state.erro = "";
    this.render();
    try {
      const lista = await api.buscarContaContabil(id, cod);
      const achadas = (lista || []).map((c) => this.lerConta(c)).filter((c) => c.codigo);
      if (!achadas.length) {
        this.state.erro = "O Sienge não devolveu a conta " + cod + " nesta empresa.";
      } else {
        const mapa = new Map((this.state.contas || []).map((c) => [c.codigo, c]));
        achadas.forEach((c) => mapa.set(c.codigo, c));
        this.state.contas = this.ordenar([...mapa.values()]);
        this.state.cacheContas[id] = this.state.contas;
        this.state.msg = "Conta incluída na lista.";
      }
    } catch (e) {
      this.state.erro = "Não consegui buscar a conta. " + ((e && e.message) || "");
    }
    this.state.lendo = false;
    this.render();
  },

  filtrar(q) {
    this.state.busca = q;
    const alvo = String(q || "").toUpperCase();
    document.querySelectorAll("#contabil-config-root tr[data-nome]").forEach((tr) => {
      const blob = tr.getAttribute("data-nome") || "";
      tr.style.display = !alvo || blob.indexOf(alvo) >= 0 ? "" : "none";
    });
  },

  lerVinculos() {
    const linhas = document.querySelectorAll("#ctb-eq-vincos tr[data-i]");
    if (!linhas.length) return;
    const lista = [];
    linhas.forEach((tr) => {
      const i = Number(tr.getAttribute("data-i"));
      const anterior = (this.state.vinculos || [])[i] || {};
      const val = (nome) => {
        const el = tr.querySelector("[data-c='" + nome + "']");
        return el ? String(el.value || "").trim() : "";
      };
      lista.push({
        origem: val("origem"),
        destino: val("destino"),
        debitoLucro: val("debitoLucro"),
        creditoPrejuizo: val("creditoPrejuizo"),
        evento: val("evento") || anterior.evento || "",
        apelidoOrigem: anterior.apelidoOrigem || "",
        apelidoDestino: anterior.apelidoDestino || ""
      });
    });
    this.state.vinculos = lista;
  },

  trocarEmpresa(i, lado, id) {
    this.lerVinculos();
    const row = (this.state.vinculos || [])[i];
    if (!row) return;
    row[lado] = String(id || "");
    const apelido = this.apelidoDe(id);
    if (lado === "origem") row.apelidoOrigem = apelido || row.apelidoOrigem;
    else row.apelidoDestino = apelido || row.apelidoDestino;
    if (lado === "destino" && !row.evento) row.evento = this.eventoSalvo(id);
    this.render({ semLer: true });
    this.gravar();
  },

  agendarGravar() {
    clearTimeout(this._gravar);
    this._gravar = setTimeout(() => this.gravar(), 400);
  },

  pintarStatus() {
    const el = document.getElementById("ctb-eq-status");
    if (el) el.textContent = this.state.msg || "";
  },

  espelharEmpresas() {
    if (!this.state.empresas) this.state.empresas = {};
    (this.state.vinculos || []).forEach((v) => {
      if (!v.destino) return;
      const emp = (this.state.companies || []).find((c) => String(c.id) === String(v.destino));
      const atual = this.state.empresas[String(v.destino)] || {};
      const patch = {
        lucro: this.CONTA_LUCRO,
        prejuizo: this.CONTA_PREJUIZO,
        ajuste: v.debitoLucro || atual.ajuste || "",
        nome: emp ? emp.nome : (atual.nome || ""),
        updatedAt: Date.now()
      };
      const ev = parseInt(String(v.evento || atual.evento || ""), 10);
      if (ev > 0) patch.evento = ev;
      this.state.empresas[String(v.destino)] = Object.assign({}, atual, patch);
    });
  },

  async gravar() {
    if (document.getElementById("ctb-eq-vincos")) this.lerVinculos();
    this.espelharEmpresas();
    this.state.msg = "Salvando…";
    this.pintarStatus();
    try {
      const nuvem = await this.persistir();
      this.state.msg = nuvem ? "Salvo" : "Salvo neste navegador. A nuvem não respondeu.";
    } catch (e) {
      this.state.msg = "Salvo neste navegador. A nuvem não respondeu.";
    }
    this.pintarStatus();
  },

  incluirVinculo() {
    this.lerVinculos();
    if (!Array.isArray(this.state.vinculos)) this.state.vinculos = [];
    this.state.vinculos.push({
      origem: "",
      destino: "",
      debitoLucro: "",
      creditoPrejuizo: "",
      evento: "",
      apelidoOrigem: "",
      apelidoDestino: ""
    });
    this.state.erro = "";
    this.render({ semLer: true });
    this.gravar();
  },

  async excluirVinculo(i) {
    this.lerVinculos();
    const row = (this.state.vinculos || [])[i];
    if (!row) return;
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Excluir este vínculo da parametrização?")
      : window.confirm("Excluir este vínculo da parametrização?");
    if (!ok) return;
    this.state.vinculos.splice(i, 1);
    this.state.erro = "";
    this.render({ semLer: true });
    this.gravar();
  },

  salvar() {
    return this.gravar();
  },

  usarPartida(valor) {
    this.lerVinculos();
    const id = String(this.state.empresaId || "");
    let n = 0;
    (this.state.vinculos || []).forEach((v) => {
      if (id && String(v.destino) === id) {
        v.evento = String(valor);
        n += 1;
      }
    });
    this.state.msg = n
      ? ("Partida " + valor + " preenchida nas linhas cujo destino é a empresa " + id + ".")
      : "Escolha a empresa de destino em Consultar e clique de novo na partida.";
    this.render({ semLer: true });
  },

  async verLancamentos() {
    this.lerFormulario();
    const id = this.state.empresaId;
    if (!id) {
      this.state.erro = "Escolha a empresa.";
      this.render();
      return;
    }
    const api = window.SiengeApiService;
    if (!api || typeof api.getAccountancyEntries !== "function") {
      this.state.erro = "A consulta de lançamentos não está disponível. Atualize a página com Ctrl+F5.";
      this.render();
      return;
    }
    this.state.lendoLanc = true;
    this.state.erro = "";
    this.state.progresso = 20;
    this.render();
    const hoje = new Date();
    const achados = [];
    try {
      for (let i = 0; i < 6; i++) {
        const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const ini = ref.getFullYear() + "-" + String(ref.getMonth() + 1).padStart(2, "0") + "-01";
        const fimDia = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        const fim = ref.getFullYear() + "-" + String(ref.getMonth() + 1).padStart(2, "0") + "-" + String(fimDia).padStart(2, "0");
        const lista = await api.getAccountancyEntries(id, ini, fim);
        (lista || []).forEach((raw) => {
          const item = this.lerLancamento(raw);
          if (this.lancamentoEquiv(item)) achados.push(item);
        });
        this.state.progresso = Math.round(20 + ((i + 1) / 6) * 70);
        if (achados.length >= 40) break;
        if (i < 5) await new Promise((r) => setTimeout(r, 300));
      }
      achados.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      this.state.lancamentos = achados.slice(0, 40);
      this.state.cacheLanc[id] = this.state.lancamentos;
      if (!this.state.lancamentos.length) {
        this.state.msg = "Não achei lançamento de equivalência nos últimos meses desta empresa.";
      }
    } catch (e) {
      this.state.erro = "O Sienge não devolveu os lançamentos. " + ((e && e.message) || "");
    }
    this.state.lendoLanc = false;
    this.state.progresso = 100;
    this.render();
  },

  lerLancamento(raw) {
    return {
      date: String(raw.date || raw.entryDate || "").slice(0, 10),
      amount: Math.abs(Number(raw.amount != null ? raw.amount : raw.value) || 0),
      debit: String(raw.debitAccountId || raw.debitAccount || ""),
      credit: String(raw.creditAccountId || raw.creditAccount || ""),
      description: String(raw.description || raw.history || raw.entryDescription || ""),
      eventId: raw.eventId != null ? raw.eventId : (raw.entryEventId != null ? raw.entryEventId : ""),
      batch: raw.entryBatchId != null ? String(raw.entryBatchId) : ""
    };
  },

  lancamentoEquiv(item) {
    const blob = (item.description + " " + item.debit + " " + item.credit).toUpperCase();
    if (/EQUIVAL|PARTICIP|MEP/.test(blob)) return true;
    const contas = [this.CONTA_LUCRO, this.CONTA_PREJUIZO];
    (this.state.vinculos || []).forEach((v) => {
      if (v.debitoLucro) contas.push(v.debitoLucro);
      if (v.creditoPrejuizo) contas.push(v.creditoPrejuizo);
    });
    const cfg = this.cfgDa(this.state.empresaId);
    if (cfg) contas.push(cfg.lucro, cfg.prejuizo, cfg.ajuste);
    return contas.some((c) => c && (item.debit === c || item.credit === c));
  },

  opcoes(escolhida) {
    const lista = (this.state.contas || []).slice();
    if (escolhida && !lista.some((c) => c.codigo === escolhida)) {
      lista.unshift({ codigo: escolhida, nome: "" });
    }
    const opts = ['<option value="">Selecione</option>'];
    lista.forEach((c) => {
      const rotulo = c.codigo + (c.nome ? (" — " + c.nome) : "");
      opts.push('<option value="' + this.esc(c.codigo) + '"' + (c.codigo === escolhida ? " selected" : "") + ">" + this.esc(rotulo) + "</option>");
    });
    return opts.join("");
  },

  opcoesEmpresa(escolhida) {
    const opts = ['<option value="">Selecione</option>'];
    const lista = this.state.companies || [];
    lista.forEach((c) => {
      opts.push('<option value="' + this.esc(c.id) + '"' + (String(c.id) === String(escolhida) ? " selected" : "") + ">" + this.esc(c.id + " - " + c.nome) + "</option>");
    });
    if (escolhida && !lista.some((c) => String(c.id) === String(escolhida))) {
      opts.push('<option value="' + this.esc(escolhida) + '" selected>' + this.esc(escolhida) + "</option>");
    }
    return opts.join("");
  },

  render(opcoes) {
    const root = document.getElementById("contabil-config-root");
    if (!root) return;
    if ((!opcoes || !opcoes.semLer) && document.getElementById("ctb-eq-vincos")) this.lerVinculos();
    const s = this.state;
    if (!Array.isArray(s.vinculos)) s.vinculos = this.modelo();
    const rolagem = root.querySelector(".cc-scroll");
    const topo = rolagem ? rolagem.scrollTop : 0;
    const vinculosHtml = (s.vinculos || []).map((v, i) => {
      const pct = this.pctDoPasso(v);
      const pctTxt = pct > 0
        ? (Number(pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%")
        : "sem vínculo";
      return `<tr data-i="${i}">
        <td class="cc-nome"><select data-c="origem" onchange="ContabilEquiv.trocarEmpresa(${i},'origem',this.value)">${this.opcoesEmpresa(v.origem)}</select></td>
        <td class="cc-nome"><select data-c="destino" onchange="ContabilEquiv.trocarEmpresa(${i},'destino',this.value)">${this.opcoesEmpresa(v.destino)}</select></td>
        <td class="is-center">${this.esc(pctTxt)}</td>
        <td><input type="text" data-c="debitoLucro" value="${this.esc(v.debitoLucro || "")}" placeholder="1.2.02.01.002" oninput="ContabilEquiv.agendarGravar()"></td>
        <td class="cc-conta"><div class="ctb-fixo">${this.esc(this.CONTA_LUCRO)}<small>reduzida ${this.esc(this.REDUZIDA_LUCRO)}</small></div></td>
        <td class="cc-conta"><div class="ctb-fixo">${this.esc(this.CONTA_PREJUIZO)}<small>reduzida ${this.esc(this.REDUZIDA_PREJUIZO)}</small></div></td>
        <td><input type="text" data-c="creditoPrejuizo" value="${this.esc(v.creditoPrejuizo || "")}" placeholder="1.2.02.01.002" oninput="ContabilEquiv.agendarGravar()"></td>
        <td class="ctb-acoes is-center"><button type="button" class="tvig-ico is-danger" title="Excluir" onclick="ContabilEquiv.excluirVinculo(${i})"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button></td>
      </tr>`;
    }).join("");
    root.innerHTML = `<div class="cc-page ctb-eq-page">
      <div class="cc-toolbar">
        <p class="ctb-eq-help">No lucro, a creditada é ${this.esc(this.CONTA_LUCRO)} (reduzida ${this.esc(this.REDUZIDA_LUCRO)}). No prejuízo, a debitada é ${this.esc(this.CONTA_PREJUIZO)} (reduzida ${this.esc(this.REDUZIDA_PREJUIZO)}). O percentual vem do organograma. Cada alteração já fica salva.</p>
        <div class="cc-toolbar-actions">
          <span id="ctb-eq-status" class="ctb-eq-status">${this.esc(s.msg || "")}</span>
          <button type="button" class="btn btn-primary cc-atualizar" onclick="ContabilEquiv.incluirVinculo()">Incluir vínculo</button>
        </div>
      </div>
      ${s.erro ? `<p class="ctb-eq-status" style="color:#b91c1c;margin:0 0 8px;">${this.esc(s.erro)}</p>` : ""}
      <div class="cc-scroll">
        <table class="cc-table ctb-eq" id="ctb-eq-vincos">
          <colgroup>
            <col style="width:22%"><col style="width:22%"><col style="width:90px">
            <col style="width:14%"><col style="width:12%"><col style="width:12%"><col style="width:14%"><col style="width:42px">
          </colgroup>
          <thead>
            <tr>
              <th>Empresa de origem</th>
              <th>Empresa de destino</th>
              <th class="is-center">Organograma</th>
              <th>Lucro · debitada</th>
              <th>Lucro · creditada</th>
              <th>Prejuízo · debitada</th>
              <th>Prejuízo · creditada</th>
              <th class="is-center"></th>
            </tr>
          </thead>
          <tbody>${vinculosHtml || `<tr><td colspan="8" style="text-align:center;padding:30px;">Nenhum vínculo. Inclua a empresa de origem e a de destino.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
    const nova = root.querySelector(".cc-scroll");
    if (nova) nova.scrollTop = topo;
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  },

  hist(chave) {
    const p = String(chave || "").split("-");
    if (p.length < 2) return "Lote equivalencia";
    return "Lote equivalencia " + p[1] + "-" + String(p[0]).slice(2);
  },

  mesesDe(app, janela) {
    if (janela.faixa && janela.faixa.length) {
      return janela.faixa.map((f) => {
        const ym = app.chaveMes(f.ano, f.mes);
        return { chave: ym, rotulo: f.rotulo || (app.nomeMes(f.mes) + "/" + f.ano), fim: app.fimDoMes(ym) };
      });
    }
    return (janela.meses || []).map((m) => {
      const ym = app.chaveMes(janela.ano, m);
      return { chave: ym, rotulo: app.nomeMes(m) + "/" + janela.ano, fim: app.fimDoMes(ym) };
    });
  },

  montarPlano(app, chave) {
    const nomeEmp = (id, fallback) => {
      const emp = (app.state.companies || []).find((c) => String(c.id) === String(id));
      return emp && emp.nome ? (id + " - " + emp.nome) : (id + " - " + fallback);
    };
    const p = String(chave || "").split("-");
    const rotulo = p.length >= 2 ? (app.nomeMes(Number(p[1])) + "/" + p[0]) : chave;
    const fim = app.fimDoMes(chave);
    const linhas = [];
    const faltas = [];
    const pulos = [];
    const semResultado = [];
    const extras = {};
    const bloqueado = {};
    const vistos = {};
    const gestaoIds = {};
    this.empresasGestao().forEach((c) => { gestaoIds[String(c.id)] = true; });
    this.passos().forEach((passo) => {
      if (gestaoIds[String(passo.origem)]) return;
      const nomeOrigem = nomeEmp(passo.origem, passo.apelidoOrigem || passo.origem);
      const nomeDestino = nomeEmp(passo.destino, passo.apelidoDestino || passo.destino);
      const pct = this.pctDoPasso(passo);
      const pctTxt = Number(pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
      const titulo = nomeOrigem + " " + pctTxt + " → " + nomeDestino;
      if (bloqueado[passo.origem]) {
        pulos.push(titulo + " aguarda o lançamento que entra nessa origem");
        return;
      }
      const base = app.liquidoEmpresa(passo.origem, chave);
      if (base == null) {
        semResultado.push(nomeOrigem);
        bloqueado[passo.destino] = true;
        return;
      }
      if (!(pct > 0)) {
        faltas.push(nomeOrigem + " sem percentual no organograma");
        return;
      }
      const debitoVar = String(passo.debitoLucro || passo.mep || "").trim();
      const creditoVar = String(passo.creditoPrejuizo || passo.mep || "").trim();
      if (!debitoVar || !creditoVar) {
        faltas.push(nomeOrigem + " sem a conta de ajuste");
        return;
      }
      const resultado = Math.round((base + (extras[passo.origem] || 0)) * 100) / 100;
      const signed = Math.round(resultado * pct) / 100;
      if (Math.abs(signed) < 0.01) return;
      if (this.jaPasso(passo.destino, passo.origem, chave)) {
        pulos.push(titulo);
        return;
      }
      const evento = Number(passo.evento) || Number((this.cfgDa(passo.destino) || {}).evento);
      if (!(evento > 0)) {
        bloqueado[passo.destino] = true;
        if (!vistos[passo.destino]) {
          vistos[passo.destino] = true;
          faltas.push(nomeDestino + " ainda não tem lançamento de equivalência anterior para repetir o evento do Sienge");
        }
        return;
      }
      extras[passo.destino] = Math.round(((extras[passo.destino] || 0) + signed) * 100) / 100;
      const lucro = signed > 0;
      linhas.push({
        companyId: Number(passo.destino),
        origem: passo.origem,
        empresa: nomeDestino,
        chave: chave,
        rotulo: titulo,
        date: fim,
        amount: Math.round(Math.abs(signed) * 100) / 100,
        tipo: lucro ? "lucro" : "prejuízo",
        debitAccountId: lucro ? debitoVar : this.CONTA_PREJUIZO,
        creditAccountId: lucro ? this.CONTA_LUCRO : creditoVar,
        eventId: evento,
        description: this.complemento(this.nomeCurto(passo.origem, passo.apelidoOrigem), pct, chave),
        resultado: resultado,
        pct: pct
      });
    });
    this.incluirGestao(app, chave, linhas, faltas, pulos, nomeEmp, fim, p);
    if (!linhas.length && semResultado.length) return { erro: "Não li o resultado destas empresas na competência:\n" + semResultado.join("\n") };
    if (!linhas.length && faltas.length) return { erro: "Não lancei a equivalência:\n" + faltas.join("\n") };
    if (!linhas.length && pulos.length) return { erro: "Esta competência já foi lançada:\n" + pulos.join("\n") };
    if (!linhas.length) return { erro: "Nesta competência o resultado dessas empresas não deu lucro nem prejuízo." };
    const texto = [
      "Vou lançar a equivalência de " + rotulo + ", em reais. O percentual é o do organograma. A linha de participação da controladora no DRE não entra neste lançamento.",
      ""
    ].concat(linhas.map((l) => l.rotulo + " · resultado " + app.money(l.resultado) + " · " + l.tipo + " " + app.money(l.amount) + "\nNa empresa " + l.empresa + " · débito " + l.debitAccountId + " · crédito " + l.creditAccountId + " · " + app.dataBr(l.date) + "\n" + l.description));
    if (semResultado.length) texto.push("", "Não li o resultado, então não lanço:", semResultado.join("\n"));
    if (faltas.length) texto.push("", "Sem o percentual ou sem um lançamento anterior, não lanço:", faltas.join("\n"));
    if (pulos.length) texto.push("", "Já lançado nesta competência, não repito:", pulos.join("\n"));
    return { linhas: linhas, texto: texto.join("\n") };
  },

  payload(linha) {
    return {
      amount: linha.amount,
      companyId: linha.companyId,
      date: linha.date,
      eventId: linha.eventId,
      debitAccountId: linha.debitAccountId,
      creditAccountId: linha.creditAccountId,
      description: linha.description,
      entryType: "N"
    };
  },

  msgDe(res) {
    if (!res) return "Lançamento criado no Sienge.";
    if (typeof res === "string") return res;
    if (res.successMessage) return String(res.successMessage);
    if (res.clientMessage) return String(res.clientMessage);
    return "Lançamento criado no Sienge.";
  },

  textoErro(e) {
    const msg = (e && e.message) || "o Sienge não respondeu.";
    return msg.length > 500 ? msg.slice(0, 500) : msg;
  },

  bate(lista, linha) {
    return (lista || []).some((raw) => {
      const item = this.lerLancamento(raw);
      if (item.date !== linha.date) return false;
      if (Math.abs(item.amount - linha.amount) > 0.02) return false;
      if (item.description && !/equival/i.test(item.description)) return false;
      return true;
    });
  },

  marcar(linha, msg) {
    if (!this.state.lancados) this.state.lancados = {};
    this.state.lancados[this.passoKey(linha.companyId, linha.origem, linha.chave)] = {
      em: Date.now(),
      valor: linha.amount,
      tipo: linha.tipo,
      msg: msg,
      rotulo: linha.rotulo,
      origem: linha.origem,
      destino: String(linha.companyId)
    };
  },

  auditar(linha, status, summary) {
    if (!window.AuditService || typeof AuditService.logEvent !== "function") return;
    const u = AuditService.currentUser ? AuditService.currentUser() : {};
    AuditService.logEvent({
      module: "Contábil",
      action: "Lançar equivalência",
      status: status,
      summary: summary,
      user: u.name || "",
      userEmail: u.email || "",
      enterpriseId: String(linha.companyId),
      customerLabel: linha.empresa
    });
  },

  resumo(app, linha, msg) {
    return "Equivalência " + linha.tipo + " da empresa " + linha.empresa + " em " + linha.rotulo + ": " + app.money(linha.amount) + " · débito " + linha.debitAccountId + " · crédito " + linha.creditAccountId + " · " + linha.description + " · " + msg;
  },

  async enviar(linhas) {
    const api = window.SiengeApiService;
    const app = window.ContabilApp;
    if (!api || typeof api.postAccountancyEntry !== "function") {
      alert("O lançamento no Sienge não está disponível. Atualize a página com Ctrl+F5.");
      return;
    }
    const porEmp = {};
    linhas.forEach((l) => {
      const id = String(l.companyId);
      if (!porEmp[id]) porEmp[id] = [];
      porEmp[id].push(l);
    });
    const feitos = [];
    const erros = [];
    const pulos = [];
    const falhou = {};
    const ids = Object.keys(porEmp);
    for (let i = 0; i < ids.length; i++) {
      const grupo = porEmp[ids[i]];
      const datas = grupo.map((l) => l.date).slice().sort();
      let existentes = null;
      try {
        existentes = await api.getAccountancyEntries(ids[i], datas[0].slice(0, 7) + "-01", datas[datas.length - 1]);
      } catch (e) {
        existentes = null;
      }
      for (let j = 0; j < grupo.length; j++) {
        const linha = grupo[j];
        if (falhou[String(linha.origem)]) {
          erros.push(linha.rotulo + ": não lancei, porque a equivalência anterior desta cadeia não foi gerada.");
          continue;
        }
        if (existentes && this.bate(existentes, linha)) {
          this.marcar(linha, "já estava no Sienge");
          pulos.push(linha.empresa + " · " + linha.rotulo + " já estava no Sienge.");
          continue;
        }
        try {
          const res = await api.postAccountancyEntry(this.payload(linha));
          const msg = this.msgDe(res);
          this.marcar(linha, msg);
          this.auditar(linha, "ok", this.resumo(app, linha, msg));
          feitos.push(linha.empresa + " · " + linha.rotulo + ": " + msg);
        } catch (e) {
          const falha = this.textoErro(e);
          falhou[String(linha.companyId)] = true;
          this.auditar(linha, "erro", "Falha ao lançar equivalência de " + linha.empresa + " em " + linha.rotulo + ". " + falha);
          erros.push(linha.empresa + " · " + linha.rotulo + ": " + falha);
        }
        if (j < grupo.length - 1) await new Promise((r) => setTimeout(r, 400));
      }
    }
    try { await this.persistir(); } catch (e) {}
    const partes = [];
    if (feitos.length) partes.push(feitos.join("\n"));
    if (pulos.length) partes.push(pulos.join("\n"));
    if (erros.length) partes.push(erros.join("\n"));
    alert(partes.join("\n\n") || "Nenhum lançamento foi enviado.");
  },

  async descobrirEventos() {
    const api = window.SiengeApiService;
    if (!api || typeof api.getAccountancyEntries !== "function") return;
    const faltam = {};
    (this.state.vinculos || []).forEach((v) => {
      const ev = Number(v.evento) || Number((this.cfgDa(v.destino) || {}).evento);
      if (!(ev > 0) && v.destino) faltam[String(v.destino)] = true;
    });
    const ids = Object.keys(faltam);
    if (!ids.length) return;
    const hoje = new Date();
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k];
      let achado = 0;
      for (let i = 0; i < 8 && !achado; i++) {
        const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const mes = String(ref.getMonth() + 1).padStart(2, "0");
        const ini = ref.getFullYear() + "-" + mes + "-01";
        const fimDia = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        const fim = ref.getFullYear() + "-" + mes + "-" + String(fimDia).padStart(2, "0");
        let lista = [];
        try { lista = await api.getAccountancyEntries(id, ini, fim); } catch (e) { lista = []; }
        (lista || []).some((raw) => {
          const item = this.lerLancamento(raw);
          const n = Number(item.eventId);
          if (!(n > 0)) return false;
          const blob = (item.description + " " + item.debit + " " + item.credit).toUpperCase();
          if (/EQUIVAL|PARTICIP|MEP/.test(blob) || item.debit === this.CONTA_LUCRO || item.credit === this.CONTA_LUCRO || item.debit === this.CONTA_PREJUIZO || item.credit === this.CONTA_PREJUIZO) {
            achado = n;
            return true;
          }
          return false;
        });
      }
      if (!achado) continue;
      (this.state.vinculos || []).forEach((v) => {
        if (String(v.destino) === id && !(Number(v.evento) > 0)) v.evento = String(achado);
      });
      if (!this.state.empresas) this.state.empresas = {};
      this.state.empresas[id] = Object.assign({}, this.state.empresas[id] || {}, { evento: achado });
    }
    try { await this.persistir(); } catch (e) {}
  },

  async lancar() {
    if (!this.podeLancar()) {
      alert("Sem permissão para lançar a equivalência.");
      return;
    }
    const app = window.ContabilApp;
    if (!app || !app.state || app.state.lancando) return;
    const chave = app.state.de;
    if (!chave) {
      alert("Escolha a competência.");
      return;
    }
    await this.garantirConfig();
    if (!Array.isArray(this.state.vinculos)) this.state.vinculos = this.modelo();
    try { await this.descobrirEventos(); } catch (e) {}
    const socio = window.SocietarioApp;
    if (socio && typeof socio.load === "function" && !(socio.graph && Array.isArray(socio.graph.links) && socio.graph.links.length)) {
      try { await socio.load(); } catch (e) {}
    }
    const ids = [];
    this.passos().forEach((p) => { ids.push(p.origem, p.destino); });
    try {
      await app.garantirEmpresas(ids, chave);
    } catch (e) {
      alert("Não consegui ler o resultado das empresas. " + ((e && e.message) || ""));
      return;
    }
    const plano = this.montarPlano(app, chave);
    if (plano.erro) {
      alert(plano.erro);
      return;
    }
    if (!window.confirm(plano.texto)) return;
    app.state.lancando = true;
    app.render();
    try {
      await this.enviar(plano.linhas);
    } finally {
      app.state.lancando = false;
      if (document.getElementById("contabil-root")) app.render();
    }
  }
};

window.ContabilEquiv = ContabilEquiv;
