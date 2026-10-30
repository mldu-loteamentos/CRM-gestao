/* Contábil · Configurações · de-para do plano financeiro para o plano contábil, por empresa e parceiro. */
const ContabilDepara = {
  state: {
    empresas: [],
    parceiros: [],
    empresaId: "",
    parceiroId: "",
    ccId: "",
    planos: [],
    contas: [],
    contasEmp: "",
    mapa: {},
    mapaLido: false,
    busca: "",
    ordem: "plano",
    dir: 1,
    lendo: false,
    msg: "",
    erro: "",
    progresso: 0
  },
  _timer: {},
  _salvarTimer: null,
  _listaPlano: "",

  esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  norm(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  },

  digitos(v) {
    return String(v || "").replace(/\D/g, "");
  },

  podeEditar() {
    if (window.isCrmSuperAdmin && window.isCrmSuperAdmin()) return true;
    if (typeof window.hasCrmPerm !== "function") return true;
    return window.hasCrmPerm("sub_contabil_geral_config_editar") === true;
  },

  siglaEmpresa(id, nome, trade) {
    let curto = "";
    try {
      const raw = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
      const item = raw[id] || Object.values(raw).find((x) => x && String(x.company_id != null ? x.company_id : x.id) === String(id));
      if (item && item.nome_usual) curto = String(item.nome_usual).trim();
    } catch (e) {}
    if (!curto && trade) curto = String(trade).trim();
    if (!curto) {
      const apelidos = { "1": "MLDU", "2": "CHÁCARA", "3": "TERRA DO ARAÇARI", "4": "TERRAS DE ITU", "5": "MLES", "6": "ARAÇARI", "12": "ELLENCO", "13": "VERCELLINO", "14": "PIRAPITINGUI", "17": "PARQUE CIDADE", "28": "RAMOS", "32": "NOVO HORIZONTE", "36": "TAGUAÍ" };
      curto = apelidos[String(id)] || "";
    }
    if (!curto) curto = String(nome || "").replace(/\s+(LTDA\.?|S\.?\s*A\.?|EIRELI|ME).*$/i, "").trim();
    return String(id) + " - " + (curto || ("Empresa " + id));
  },

  async garantir() {
    if (this._garantindo) return;
    const pronto = this.state.mapaLido && this.state.planos.length && this.state.empresas.length
      && this.state.contasEmp === String(this.state.empresaId) && this.state.contas.length;
    if (pronto) {
      this.pintar();
      return;
    }
    this._garantindo = true;
    this.state.erro = "";
    try {
      await this.carregarMapa();
      await this.carregarParceiros();
      await this.carregarPlano();
      this.escolherPadrao();
      await this.carregarContas(this.state.empresaId);
    } catch (e) {
      this.state.erro = (e && e.message) || "Não consegui abrir a parametrização.";
    }
    this.state.lendo = false;
    this._garantindo = false;
    this.pintar();
  },

  async carregarMapa() {
    if (this.state.mapaLido) return;
    let local = {};
    try { local = JSON.parse(localStorage.getItem("crm_depara_parceiro") || "{}") || {}; } catch (e) { local = {}; }
    let remoto = null;
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.getDoc) {
      try {
        const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", "depara_parceiro"));
        const existe = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
        if (existe) remoto = (snap.data() || {}).mapa || null;
      } catch (e) {}
    }
    this.state.mapa = remoto && typeof remoto === "object" ? remoto : (local.mapa || local || {});
    this.state.mapaLido = true;
  },

  async carregarParceiros() {
    const app = window.ParametrizacaoParceiroApp;
    if (app && typeof app.loadItems === "function" && !(app.items || []).length) {
      try { await app.loadItems(); } catch (e) {}
    }
    const itens = (app && app.items) || [];
    const empresas = new Map();
    const lista = [];
    itens.forEach((p) => {
      if (!p || !p.companyId || !p.id) return;
      const tipo = app && typeof app.kindOf === "function" ? app.kindOf(p) : String(p.kind || "parceria");
      if (tipo !== "parceria" && tipo !== "mista") return;
      const id = String(p.companyId);
      if (!empresas.has(id)) {
        const cat = ((window.AppState && AppState.companies) || []).find((c) => String(c.id) === id);
        empresas.set(id, {
          id: id,
          rotulo: this.siglaEmpresa(id, (cat && (cat.name || cat.companyName)) || p.companyName, cat && cat.tradeName)
        });
      }
      lista.push(p);
    });
    this.state.empresas = [...empresas.values()].sort((a, b) => Number(a.id) - Number(b.id));
    this.state.parceiros = lista;
  },

  async carregarPlano() {
    if (this.state.planos.length) return;
    const pf = window.PlanoFinanceiroApp;
    let brutos = pf && Array.isArray(pf.categories) && pf.categories.length ? pf.categories : [];
    if (!brutos.length && window.SiengeApiService && typeof SiengeApiService.getPaymentCategories === "function") {
      brutos = await SiengeApiService.getPaymentCategories() || [];
    }
    this.state.planos = (brutos || []).map((c) => ({
      id: String(c.id || c._id || ""),
      nome: String(c.name || c._name || c.description || c.financialCategoryName || ""),
      tipo: String(c.tpConta || c._type || c.type || c.financialCategoryType || ""),
      companyId: c.companyId != null ? String(c.companyId) : ""
    })).filter((c) => c.id);
  },

  ehResultado(c) {
    const t = String(c.tipo || "").toLowerCase();
    if (t === "t" || t.indexOf("total") >= 0 || t.indexOf("sintet") >= 0) return false;
    if (t === "r" || t.indexOf("result") >= 0 || t.indexOf("analit") >= 0) return true;
    const id = this.digitos(c.id);
    return !this.state.planos.some((o) => o !== c && this.digitos(o.id) !== id && this.digitos(o.id).indexOf(id) === 0 && id);
  },

  planosDaEmpresa(empresaId) {
    const todos = this.state.planos.filter((c) => this.ehResultado(c));
    const daEmp = todos.filter((c) => c.companyId && String(c.companyId) === String(empresaId));
    return daEmp.length ? daEmp : todos.filter((c) => !c.companyId);
  },

  formatarPlano(id) {
    const pf = window.PlanoFinanceiroApp;
    if (pf && typeof pf.formatAccountCode === "function" && (pf.categories || []).length) {
      const cat = pf.categories.find((c) => String(c.id) === String(id));
      if (cat) return pf.formatAccountCode(cat);
    }
    const raw = String(id || "").trim();
    if (raw.indexOf(".") >= 0) return raw.replace(/^\.+|\.+$/g, "");
    if (/^\d+$/.test(raw) && raw.length >= 3) {
      const first = raw.charAt(0);
      let rest = raw.slice(1);
      if (rest.length % 2 === 1) rest = "0" + rest;
      return [first].concat(rest.match(/.{1,2}/g) || []).join(".");
    }
    return raw;
  },

  escolherPadrao() {
    const empresas = this.state.empresas;
    if (!empresas.length) {
      this.state.empresaId = "";
      this.state.parceiroId = "";
      return;
    }
    if (!empresas.some((e) => e.id === this.state.empresaId)) this.state.empresaId = empresas[0].id;
    const pars = this.parceirosDa(this.state.empresaId);
    if (!pars.some((p) => p.id === this.state.parceiroId)) this.state.parceiroId = pars.length ? pars[0].id : "";
    this.escolherCentro();
  },

  parceiroAtual() {
    return this.state.parceiros.find((p) => p.id === this.state.parceiroId) || null;
  },

  /** Centros de custo ligados às obras desta parceria. */
  centrosDo(p) {
    if (!p) return [];
    const app = window.ParametrizacaoParceiroApp;
    const vistos = new Set();
    const lista = [];
    const por = (cc) => {
      if (!cc) return;
      const id = String(cc.id != null ? cc.id : cc).replace(/\D/g, "");
      if (!id || vistos.has(id)) return;
      vistos.add(id);
      lista.push({ id: id, nome: String(cc.name || cc.nome || "").trim() });
    };
    (p.obras || []).forEach((o) => {
      const ligados = o.costCenters || [];
      if (ligados.length) ligados.forEach(por);
      else if (app && typeof app.centrosDaObra === "function" && typeof app.ehCcParceiro === "function" && o.code) {
        app.centrosDaObra(o.code).filter((cc) => app.ehCcParceiro(cc)).forEach(por);
      }
    });
    if (!lista.length) (p.costCenters || []).forEach(por);
    lista.sort((a, b) => Number(a.id) - Number(b.id));
    return lista;
  },

  escolherCentro() {
    const lista = this.centrosDo(this.parceiroAtual());
    if (!lista.some((c) => c.id === this.state.ccId)) this.state.ccId = lista.length ? lista[0].id : "";
  },

  parceirosDa(empresaId) {
    return this.state.parceiros.filter((p) => String(p.companyId) === String(empresaId));
  },

  rotuloParceiro(p) {
    const nome = String(p.partnerName || "Parceiro").toUpperCase();
    const iguais = this.parceirosDa(p.companyId).filter((x) => String(x.partnerName || "").toUpperCase() === nome);
    if (iguais.length < 2) return nome;
    const obras = (p.obras || []).map((o) => o.code).filter(Boolean).join(", ");
    return obras ? (nome + " · " + obras) : nome;
  },

  async carregarContas(empresaId) {
    if (!empresaId) {
      this.state.contas = [];
      this.state.contasEmp = "";
      return;
    }
    if (this.state.contasEmp === String(empresaId) && this.state.contas.length) return;
    const api = window.SiengeApiService;
    if (!api || typeof api.getAccountancyAccounts !== "function") {
      this.state.erro = "A lista de contas contábeis não está disponível. Atualize a página com Ctrl+F5.";
      this.state.contas = [];
      this.state.contasEmp = String(empresaId);
      return;
    }
    const brutos = await api.getAccountancyAccounts(empresaId);
    const ler = window.ContabilEquiv && ContabilEquiv.lerConta ? (c) => ContabilEquiv.lerConta(c) : (c) => ({
      id: c.id != null ? String(c.id) : "",
      codigo: String(c.uniqueNumber || c.accountNumber || ""),
      nome: String(c.name || "")
    });
    this.state.contas = (brutos || []).map((raw) => {
      const base = ler(raw);
      const tipo = String(raw.accountType || raw.type || "");
      const analitica = /ANALYTICAL|^A$|ANALIT/i.test(tipo) || !tipo;
      return { id: base.id, codigo: base.codigo, nome: base.nome, analitica: analitica };
    }).filter((c) => c.codigo || c.id);
    this.state.contasEmp = String(empresaId);
    if (this.state.contas.length) {
      if (this.state.erro === "O Sienge não devolveu o plano contábil desta empresa.") this.state.erro = "";
    } else this.state.erro = "O Sienge não devolveu o plano contábil desta empresa.";
  },

  mapaDo(parceiroId) {
    const id = String(parceiroId || "");
    if (!this.state.mapa[id] || typeof this.state.mapa[id] !== "object") this.state.mapa[id] = {};
    const mapa = this.state.mapa[id];
    if (!mapa._porCc || typeof mapa._porCc !== "object") mapa._porCc = {};
    return mapa;
  },

  ehLinha(obj) {
    return !!(obj && typeof obj === "object" && ("codigo" in obj || "reduzida" in obj || "nome" in obj));
  },

  linha(planoId) {
    const mapa = this.mapaDo(this.state.parceiroId);
    const cc = String(this.state.ccId || "");
    const doCc = cc && mapa._porCc[cc] && mapa._porCc[cc][String(planoId)];
    if (this.ehLinha(doCc)) return doCc;
    const legado = mapa[String(planoId)];
    if (this.ehLinha(legado)) return legado;
    return { codigo: "", reduzida: "", nome: "" };
  },

  gravarLinha(planoId, dados) {
    const mapa = this.mapaDo(this.state.parceiroId);
    const cc = String(this.state.ccId || "");
    if (!cc) return;
    if (!mapa._porCc[cc] || typeof mapa._porCc[cc] !== "object") mapa._porCc[cc] = {};
    mapa._porCc[cc][String(planoId)] = {
      codigo: String(dados.codigo || ""),
      reduzida: String(dados.reduzida || ""),
      nome: String(dados.nome || "")
    };
    this.agendarSalvar();
  },

  agendarSalvar() {
    clearTimeout(this._salvarTimer);
    this._salvarTimer = setTimeout(() => this.salvar(), 400);
  },

  async salvar() {
    const dados = { mapa: this.state.mapa };
    try { localStorage.setItem("crm_depara_parceiro", JSON.stringify(dados)); } catch (e) {}
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc) return;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, "config", "depara_parceiro"), dados, { merge: true });
    } catch (e) {
      console.warn("[De-para] gravação", e);
    }
  },

  acharPorCodigo(texto) {
    const dig = this.digitos(texto);
    if (dig.length < 4) return null;
    const hits = this.state.contas.filter((c) => this.digitos(c.codigo) === dig);
    return hits.length === 1 ? hits[0] : null;
  },

  acharPorReduzida(texto) {
    const id = String(texto || "").trim();
    if (!id) return null;
    const hits = this.state.contas.filter((c) => String(c.id) === id);
    return hits.length === 1 ? hits[0] : null;
  },

  tokens(q) {
    return this.norm(q).split(/[^A-Z0-9]+/).filter((t) => t.length >= 2);
  },

  buscarNome(q) {
    const toks = this.tokens(q);
    if (!toks.length) return [];
    const hits = this.state.contas.filter((c) => {
      const nome = this.norm(c.nome);
      return toks.every((t) => nome.indexOf(t) >= 0);
    });
    hits.sort((a, b) => {
      if (a.analitica !== b.analitica) return a.analitica ? -1 : 1;
      const na = this.norm(a.nome);
      const nb = this.norm(b.nome);
      const pa = na.indexOf(toks[0]) === 0 ? 0 : 1;
      const pb = nb.indexOf(toks[0]) === 0 ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (na.length !== nb.length) return na.length - nb.length;
      return String(a.codigo).localeCompare(String(b.codigo), "pt-BR", { numeric: true });
    });
    return hits.slice(0, 12);
  },

  preencher(planoId, conta) {
    if (!conta) return;
    this.gravarLinha(planoId, { codigo: conta.codigo, reduzida: conta.id, nome: conta.nome });
    const tr = document.querySelector('#ctb-depara-tab tr[data-plano="' + CSS.escape(String(planoId)) + '"]');
    if (!tr) return;
    const contaEl = tr.querySelector(".ctb-dp-conta");
    const redEl = tr.querySelector(".ctb-dp-red");
    const nomeEl = tr.querySelector(".ctb-dp-nome");
    if (contaEl) contaEl.value = conta.codigo || "";
    if (redEl) redEl.value = conta.id || "";
    if (nomeEl && document.activeElement !== nomeEl) nomeEl.value = conta.nome || "";
    if (nomeEl && document.activeElement === nomeEl) nomeEl.value = conta.nome || "";
  },

  onConta(planoId, valor) {
    this.gravarLinha(planoId, Object.assign({}, this.linha(planoId), { codigo: valor }));
    clearTimeout(this._timer["c" + planoId]);
    this._timer["c" + planoId] = setTimeout(() => {
      const achou = this.acharPorCodigo(valor);
      if (achou) this.preencher(planoId, achou);
    }, 280);
  },

  onReduzida(planoId, valor) {
    this.gravarLinha(planoId, Object.assign({}, this.linha(planoId), { reduzida: valor }));
    const achou = this.acharPorReduzida(valor);
    if (achou) this.preencher(planoId, achou);
  },

  onNome(planoId, valor) {
    this.gravarLinha(planoId, Object.assign({}, this.linha(planoId), { nome: valor }));
    this._listaPlano = String(planoId);
    this.mostrarLista(planoId, this.buscarNome(valor));
  },

  mostrarLista(planoId, itens) {
    this._listaAtual = itens || [];
    this.fecharLista();
    if (!itens.length) return;
    const tr = document.querySelector('#ctb-depara-tab tr[data-plano="' + CSS.escape(String(planoId)) + '"]');
    const input = tr && tr.querySelector(".ctb-dp-nome");
    if (!input) return;
    const box = document.createElement("div");
    box.id = "ctb-depara-lista";
    box.className = "ctb-depara-lista";
    box.innerHTML = itens.map((c) =>
      `<button type="button"><strong>${this.esc(c.codigo)}</strong> <small>${this.esc(c.id)}</small><br>${this.esc(c.nome)}</button>`
    ).join("");
    box.querySelectorAll("button").forEach((btn, i) => {
      btn.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        this.escolher(planoId, i);
      });
    });
    document.body.appendChild(box);
    this._listaAtual = itens;
    const r = input.getBoundingClientRect();
    box.style.left = Math.max(8, r.left) + "px";
    box.style.top = (r.bottom + 4) + "px";
    box.style.width = Math.max(320, r.width) + "px";
  },

  escolher(planoId, indice) {
    const conta = (this._listaAtual || [])[indice];
    this.fecharLista();
    if (conta) this.preencher(planoId, conta);
  },

  fecharLista() {
    const box = document.getElementById("ctb-depara-lista");
    if (box) box.remove();
  },

  filtrar(q) {
    this.state.busca = q || "";
    const alvo = this.norm(q);
    document.querySelectorAll("#ctb-depara-tab tbody tr[data-busca]").forEach((tr) => {
      const blob = tr.getAttribute("data-busca") || "";
      tr.style.display = !alvo || blob.indexOf(alvo) >= 0 ? "" : "none";
    });
  },

  ordenar(campo) {
    if (this.state.ordem === campo) this.state.dir = this.state.dir === 1 ? -1 : 1;
    else {
      this.state.ordem = campo;
      this.state.dir = 1;
    }
    this.pintar();
  },

  async setEmpresa(id) {
    this.fecharLista();
    this.state.empresaId = String(id);
    this.state.busca = "";
    const pars = this.parceirosDa(id);
    this.state.parceiroId = pars.length ? pars[0].id : "";
    this.escolherCentro();
    this.pintar();
    await this.carregarContas(this.state.empresaId);
    this.pintar();
  },

  setParceiro(id) {
    this.fecharLista();
    this.state.parceiroId = String(id);
    this.state.busca = "";
    this.escolherCentro();
    this.pintar();
  },

  setCentro(id) {
    this.fecharLista();
    this.state.ccId = String(id || "");
    this.state.busca = "";
    this.pintar();
  },

  linhasOrdenadas() {
    const lista = this.planosDaEmpresa(this.state.empresaId).slice();
    const campo = this.state.ordem;
    const dir = this.state.dir === -1 ? -1 : 1;
    const app = window.ContabilApp;
    lista.sort((a, b) => {
      const la = this.linha(a.id);
      const lb = this.linha(b.id);
      let va = "";
      let vb = "";
      if (campo === "plano") { va = this.formatarPlano(a.id); vb = this.formatarPlano(b.id); }
      else if (campo === "planoNome") { va = a.nome; vb = b.nome; }
      else if (campo === "codigo") { va = la.codigo; vb = lb.codigo; }
      else if (campo === "reduzida") { va = la.reduzida; vb = lb.reduzida; }
      else { va = la.nome; vb = lb.nome; }
      let c = 0;
      if ((campo === "plano" || campo === "codigo") && app && app.compararCodigo) c = app.compararCodigo(va, vb);
      else c = String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" });
      return c * dir;
    });
    return lista;
  },

  pintar() {
    const root = document.getElementById("ctb-depara-root");
    if (!root) return;
    const s = this.state;
    const pode = this.podeEditar();
    const dis = pode ? "" : " disabled";
    const th = (campo, rotulo) =>
      `<th onclick="ContabilDepara.ordenar('${campo}')">${rotulo} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
    const empresas = s.empresas.map((e) =>
      `<button type="button" role="tab" aria-selected="${e.id === s.empresaId}" class="ml-tab${e.id === s.empresaId ? " is-active" : ""}" onclick="ContabilDepara.setEmpresa('${this.esc(e.id)}')"><i data-lucide="building-2"></i> ${this.esc(e.rotulo)}</button>`
    ).join("");
    const pars = this.parceirosDa(s.empresaId);
    const sub = pars.map((p) =>
      `<button type="button" role="tab" aria-selected="${p.id === s.parceiroId}" class="ml-tab${p.id === s.parceiroId ? " is-active" : ""}" onclick="ContabilDepara.setParceiro('${this.esc(p.id)}')"><i data-lucide="handshake"></i> ${this.esc(this.rotuloParceiro(p))}</button>`
    ).join("");
    const centros = this.centrosDo(this.parceiroAtual());
    const ccs = centros.map((c) => {
      const nome = c.nome ? (" " + c.nome) : "";
      return `<button type="button" role="tab" aria-selected="${c.id === s.ccId}" class="ml-tab${c.id === s.ccId ? " is-active" : ""}" onclick="ContabilDepara.setCentro('${this.esc(c.id)}')"><i data-lucide="landmark"></i> ${this.esc(c.id + nome)}</button>`;
    }).join("");
    const busca = this.norm(s.busca);
    const linhas = this.linhasOrdenadas().map((c) => {
      const m = this.linha(c.id);
      const cod = this.formatarPlano(c.id);
      const blob = this.norm(cod + " " + c.nome + " " + m.codigo + " " + m.reduzida + " " + m.nome);
      const esconde = busca && blob.indexOf(busca) < 0 ? " style=\"display:none;\"" : "";
      return `<tr data-plano="${this.esc(c.id)}" data-busca="${this.esc(blob)}"${esconde}>
        <td class="ctb-dp-cod">${this.esc(cod)}</td>
        <td>${this.esc(c.nome)}</td>
        <td><input class="ctb-depara-inp ctb-dp-conta" value="${this.esc(m.codigo)}"${dis} oninput="ContabilDepara.onConta('${this.esc(c.id)}', this.value)"></td>
        <td><input class="ctb-depara-inp ctb-dp-red" value="${this.esc(m.reduzida)}"${dis} oninput="ContabilDepara.onReduzida('${this.esc(c.id)}', this.value)"></td>
        <td><input class="ctb-depara-inp ctb-dp-nome" value="${this.esc(m.nome)}" placeholder="Buscar pelo nome"${dis} oninput="ContabilDepara.onNome('${this.esc(c.id)}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();ContabilDepara.escolher('${this.esc(c.id)}',0)}"></td>
      </tr>`;
    }).join("");
    const vazio = !s.empresas.length
      ? "Nenhuma parceria cadastrada. Ao criar uma em Prestação de contas → Configurações, a aba da empresa e a do parceiro aparecem aqui."
      : (!centros.length && s.parceiroId
        ? "Este parceiro ainda não tem centro de custo na parceria."
        : (!s.planos.length ? "O plano financeiro desta empresa ainda não carregou." : "Nenhuma conta de resultado neste filtro."));
    const tabela = s.empresas.length && centros.length;
    root.innerHTML = `<div class="cc-page ctb-depara">
      ${s.empresas.length ? `<div class="ml-tabs ctb-depara-tabs" role="tablist">${empresas}</div>` : ""}
      ${sub ? `<div class="ml-tabs ctb-depara-sub" role="tablist">${sub}</div>` : ""}
      ${ccs ? `<div class="ml-tabs ctb-depara-cc" role="tablist">${ccs}</div>` : ""}
      <p class="ctb-eq-help">Cada linha é uma conta de resultado do plano financeiro. A conta e a reduzida são as deste centro de custo. O número da conta preenche a reduzida e o nome. A reduzida preenche a conta e o nome.</p>
      ${s.erro ? `<p class="ctb-eq-status" style="color:#b91c1c;margin:0 0 8px;">${this.esc(s.erro)}</p>` : ""}
      ${tabela ? `<div style="margin:0 0 10px;max-width:360px;">
        <input type="search" class="ctb-depara-inp" value="${this.esc(s.busca)}" placeholder="Buscar no plano financeiro" oninput="ContabilDepara.filtrar(this.value)">
      </div>
      <div class="cc-scroll">
        <table class="cc-table ctb-eq" id="ctb-depara-tab">
          <thead><tr>
            ${th("plano", "Plano financeiro")}
            ${th("planoNome", "Nome")}
            ${th("codigo", "Conta")}
            ${th("reduzida", "Reduzida")}
            ${th("nome", "Nome da conta")}
          </tr></thead>
          <tbody>${linhas || `<tr><td colspan="5" style="text-align:center;padding:30px;">${this.esc(vazio)}</td></tr>`}</tbody>
        </table>
      </div>` : `<p class="ctb-eq-help">${this.esc(vazio)}</p>`}
    </div>`;
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  }
};

document.addEventListener("click", (ev) => {
  const lista = document.getElementById("ctb-depara-lista");
  if (!lista) return;
  if (ev.target.closest && (ev.target.closest("#ctb-depara-lista") || ev.target.closest(".ctb-dp-nome"))) return;
  ContabilDepara.fecharLista();
});

window.ContabilDepara = ContabilDepara;
