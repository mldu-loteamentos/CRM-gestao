const OrcamentoModuloApp = {
  telas: {
    "orcamento-forecast": {
      root: "orcamento-forecast-root",
      texto: "Revise os meses que ainda não aconteceram. O forecast entra no lugar desses meses do orçamento.",
      vazio: "Nenhum forecast foi aberto ainda."
    },
    "orcamento-acompanhamento": {
      root: "orcamento-acompanhamento-root",
      texto: "Acompanhe o orçado, o forecast e o realizado por empresa e por grupo do DFC.",
      vazio: "Ainda não há orçamento nem forecast para acompanhar."
    }
  },

  novo: {
    aba: "kardex",
    nuvem: "",
    companyId: "",
    ccId: "",
    anoDe: new Date().getFullYear(),
    anoAte: new Date().getFullYear() + 4,
    openEmp: false,
    openCc: false,
    qEmp: "",
    qCc: "",
    carregando: false,
    progresso: "",
    erro: "",
    resultado: null,
    clienteAberto: -1,
    anoAberto: "",
    filtroCelula: null
  },

  _bcb: {},
  _focus: {},
  _pendente: {},
  _indexadores: null,
  _distrato: null,

  bcbSeries: {
    IPCA: 433,
    IGPM: 189,
    "IGP-M": 189,
    "IPC-DI": 191,
    IPCDI: 191,
    INCC: 7456,
    "INCC-M": 7456,
    "INCC-DI": 192
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  dinheiro(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  numero(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  pct(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  },

  hojeIso() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  addDias(iso, dias) {
    const p = String(iso || "").slice(0, 10).split("-");
    if (p.length !== 3) return "";
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + (Number(dias) || 0));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  mesNome(n) {
    return ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][(Number(n) || 1) - 1] || "";
  },

  init(tabId) {
    if (tabId === "orcamento-novo") {
      this.renderNovo();
      this.carregarCadastro();
      return;
    }
    const tela = this.telas[tabId];
    if (!tela) return;
    const root = document.getElementById(tela.root);
    if (!root) return;
    root.innerHTML = `
      <p style="margin:0 0 12px;color:#475569;font-size:0.9rem;line-height:1.45;">${this.esc(tela.texto)}</p>
      <div class="crm-card" style="padding:28px;color:#64748b;">${this.esc(tela.vazio)}</div>`;
  },

  async carregarCadastro() {
    if (this._cadastro || !window.SiengeApiService || !window.AppState) return;
    this._cadastro = true;
    try {
      if (!AppState.cachedCompanies || !AppState.cachedCompanies.length) {
        AppState.cachedCompanies = await SiengeApiService.getCompanies();
      }
      if (!AppState.cachedCostCenters || !AppState.cachedCostCenters.length) {
        AppState.cachedCostCenters = await SiengeApiService.getCostCenters();
      }
    } catch (e) {
      this._cadastro = false;
      console.warn("[Orçamento] cadastro", e);
    }
    const root = document.getElementById("orcamento-novo-root");
    if (root && root.isConnected) this.renderNovo();
  },

  empresas() {
    const lista = (window.AppState && AppState.cachedCompanies) || [];
    return lista.map((c) => ({
      id: String(c.id),
      name: String(c.name || c.tradeName || "").toUpperCase()
    })).filter((c) => c.id);
  },

  empresaDoCentro(c) {
    if (!c) return "";
    const raw = c.idCompany != null && c.idCompany !== "" ? c.idCompany
      : (c.companyId != null && c.companyId !== "" ? c.companyId
        : (c.company && c.company.id != null ? c.company.id : ""));
    return raw === "" || raw == null ? "" : String(raw);
  },

  centros() {
    const emp = String(this.novo.companyId || "");
    if (!emp) return [];
    const lista = (window.AppState && AppState.cachedCostCenters) || [];
    return lista.filter((c) => this.empresaDoCentro(c) === emp).map((c) => ({
      id: String(c.id || c.costCenterId || ""),
      name: String(c.name || c.description || "").toUpperCase()
    })).filter((c) => c.id);
  },

  bindFiltros() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    MlEmpresaFilter.bind("orc-emp", {
      toggleOpen() {
        self.novo.openEmp = !self.novo.openEmp;
        if (self.novo.openEmp) self.novo.openCc = false;
        self.renderNovo();
      },
      setQuery(q) {
        self.novo.qEmp = q || "";
        const box = document.getElementById("orc-emp-list");
        if (box) {
          box.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-emp",
            items: self.empresas(),
            selectedIds: self.novo.companyId ? [self.novo.companyId] : [],
            query: self.novo.qEmp,
            single: true
          });
        }
      },
      toggleId(id, on) {
        if (!on) return;
        self.novo.companyId = String(id);
        self.novo.ccId = "";
        self.novo.openEmp = false;
        self.novo.qEmp = "";
        self.novo.resultado = null;
        self.novo.erro = "";
        self.renderNovo();
      },
      selectAll() {},
      selectNone() {}
    });
    const nouns = {
      singular: "centro de custo",
      plural: "centros de custo",
      none: "Nenhum centro de custo",
      noMatch: "Nenhum centro de custo com esse nome."
    };
    MlEmpresaFilter.bind("orc-cc", {
      toggleOpen() {
        if (!self.novo.companyId) return;
        self.novo.openCc = !self.novo.openCc;
        if (self.novo.openCc) self.novo.openEmp = false;
        self.renderNovo();
      },
      setQuery(q) {
        self.novo.qCc = q || "";
        const box = document.getElementById("orc-cc-list");
        if (box) {
          box.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-cc",
            items: self.centros(),
            selectedIds: self.novo.ccId ? [self.novo.ccId] : [],
            query: self.novo.qCc,
            single: true,
            nouns
          });
        }
      },
      toggleId(id, on) {
        if (!on) return;
        self.novo.ccId = String(id);
        self.novo.openCc = false;
        self.novo.qCc = "";
        self.novo.resultado = null;
        self.novo.erro = "";
        self.renderNovo();
      },
      selectAll() {},
      selectNone() {}
    });
  },

  renderNovo() {
    const root = document.getElementById("orcamento-novo-root");
    if (!root || !window.MlEmpresaFilter) {
      if (root) root.innerHTML = `<p style="color:#64748b;">Carregando o orçamento…</p>`;
      return;
    }
    const st = this.novo;
    const nounsCc = {
      singular: "centro de custo",
      plural: "centros de custo",
      none: "Nenhum centro de custo"
    };
    const empHtml = MlEmpresaFilter.html({
      id: "orc-emp",
      label: "Empresas",
      items: this.empresas(),
      selectedIds: st.companyId ? [st.companyId] : [],
      open: st.openEmp,
      query: st.qEmp,
      emptyMeansAll: false,
      emptyLabel: "Selecione a empresa",
      single: true
    });
    const ccHtml = MlEmpresaFilter.html({
      id: "orc-cc",
      label: "Centro de custo",
      items: this.centros(),
      selectedIds: st.ccId ? [st.ccId] : [],
      open: st.openCc,
      query: st.qCc,
      emptyMeansAll: false,
      emptyLabel: st.companyId ? "Selecione o centro de custo" : "Escolha a empresa antes",
      single: true,
      nouns: nounsCc
    });
    const pode = !!(st.companyId && st.ccId && st.anoAte >= st.anoDe && !st.carregando);
    const abasIds = ["kardex", "distrato", "vendas", "receita"];
    const aba = abasIds.indexOf(st.aba) >= 0 ? st.aba : "kardex";
    const leads = { kardex: this.textoKardex(), distrato: this.textoDistrato(), vendas: this.textoVendas(), receita: this.textoReajusteHoje() };
    const abas = [
      { id: "kardex", label: "Kardex", icon: "package" },
      { id: "distrato", label: "Distrato", icon: "file-minus" },
      { id: "vendas", label: "Vendas", icon: "wallet" },
      { id: "receita", label: "Receita", icon: "trending-up" }
    ].map((t) => `<button type="button" role="tab" aria-selected="${aba === t.id}" class="ml-tab${aba === t.id ? " is-active" : ""}" onclick="OrcamentoModuloApp.setAba('${t.id}')"><i data-lucide="${t.icon}"></i> ${t.label}</button>`).join("");
    root.innerHTML = `
      <div class="ml-tabs orc-novo-tabs" role="tablist">${abas}</div>
      <p class="orc-rec-lead">${this.esc(leads[aba])}</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:16px;">
        ${empHtml}
        ${ccHtml}
        <div class="form-group" style="margin:0;">
          <label>De</label>
          <input type="number" class="form-control" min="2000" max="2100" value="${this.esc(st.anoDe)}" style="width:110px;height:38px;"
            onchange="OrcamentoModuloApp.setAno('anoDe', this.value)">
        </div>
        <div class="form-group" style="margin:0;">
          <label>Até</label>
          <input type="number" class="form-control" min="2000" max="2100" value="${this.esc(st.anoAte)}" style="width:110px;height:38px;"
            onchange="OrcamentoModuloApp.setAno('anoAte', this.value)">
        </div>
        <button type="button" class="btn btn-primary" style="height:38px;" ${pode ? "" : "disabled"}
          onclick="OrcamentoModuloApp.montarReceita()">Montar receita</button>
        <span id="orc-nuvem" class="orc-nuvem">${this.esc(this.textoNuvem())}</span>
      </div>
      ${st.erro ? `<div style="margin:0 0 12px;padding:12px 14px;border-radius:8px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;">${this.esc(st.erro)}</div>` : ""}
      <div id="orc-receita-corpo">${this.corpoAtivo()}</div>`;
    this.bindFiltros();
    if (window.lucide) window.lucide.createIcons();
    this.garantirPlano();
    this.garantirRealizado();
  },

  setAno(campo, valor) {
    const n = parseInt(valor, 10);
    if (!Number.isFinite(n)) return;
    this.novo[campo] = n;
    this.novo.resultado = null;
    this.novo.erro = "";
    const btn = document.querySelector("#orcamento-novo-root .btn-primary");
    const st = this.novo;
    if (btn) btn.disabled = !(st.companyId && st.ccId && st.anoAte >= st.anoDe && !st.carregando);
    const corpo = document.getElementById("orc-receita-corpo");
    if (corpo && !st.carregando) corpo.innerHTML = this.corpoAtivo();
  },

  setAba(id) {
    if (["kardex", "distrato", "vendas", "receita"].indexOf(id) < 0) return;
    this.novo.aba = id;
    this.renderNovo();
  },

  corpoAtivo() {
    if (this.novo.carregando) return this.carregandoHtml();
    if (this.novo.aba === "kardex") return this.kardexHtml();
    if (this.novo.aba === "distrato") return this.distratoHtml();
    if (this.novo.aba === "vendas") return this.vendasHtml();
    return this.resultadoHtml();
  },

  textoKardex() {
    return "O estoque de janeiro de 2026 é o ponto de partida. Os meses já passados trazem as vendas e os distratos realizados. Deste mês em diante, o previsto soma com o que já aconteceu.";
  },

  textoDistrato() {
    return "Informe os distratos mês a mês, a partir deste ano. Quem cancela num mês não tem mais parcela nos meses seguintes. Um distrato novo soma com os que já tinham cancelado.";
  },

  textoVendas() {
    return "Cadastre cada plano com ticket médio, entrada, número de parcelas e juros ao mês. Depois informe quantas vendas daquele plano acontecem em cada mês. A entrada entra no mês da venda e a parcela começa no mês seguinte.";
  },

  textoNuvem() {
    if (this.novo.nuvem === "salvando") return "Salvando…";
    if (this.novo.nuvem === "salvo") return "Salvo";
    if (this.novo.nuvem === "neste navegador") return "Salvo neste navegador";
    return "";
  },

  pintarNuvem() {
    const el = document.getElementById("orc-nuvem");
    if (el) el.textContent = this.textoNuvem();
  },

  mesesCurto() {
    return ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  },

  mesesLongo() {
    return ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  },

  horizonte() {
    const hoje = this.hojeIso();
    const hy = Number(hoje.slice(0, 4));
    const hm = Number(hoje.slice(5, 7)) - 1;
    const de = Math.min(hy, Number(this.novo.anoDe) || hy);
    const ate = Math.max(de, Number(this.novo.anoAte) || de);
    return { de: de, ate: ate, hy: hy, hm: hm };
  },

  planoVazio() {
    return { distratos: {}, vendasQtd: {}, condicoes: { ticket: 0, plano: 0, juros: 0, entrada: 0 }, planos: [], em: "" };
  },

  normalizarPlano(raw) {
    const base = this.planoVazio();
    const src = raw && typeof raw === "object" ? raw : {};
    ["distratos", "vendasQtd"].forEach((chave) => {
      const mapa = src[chave];
      if (!mapa || typeof mapa !== "object") return;
      Object.keys(mapa).forEach((ano) => {
        if (!/^\d{4}$/.test(String(ano)) || !Array.isArray(mapa[ano])) return;
        base[chave][String(ano)] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => Math.max(0, parseInt(mapa[ano][i], 10) || 0));
      });
    });
    const c = src.condicoes || {};
    base.condicoes = {
      ticket: Math.max(0, Number(c.ticket) || 0),
      plano: Math.max(0, parseInt(c.plano, 10) || 0),
      juros: Math.max(0, Number(c.juros) || 0),
      entrada: Math.max(0, Number(c.entrada) || 0)
    };
    const lerMeses = (meses) => {
      const saida = {};
      const mapa = meses && typeof meses === "object" ? meses : {};
      Object.keys(mapa).forEach((ano) => {
        if (!/^\d{4}$/.test(String(ano)) || !Array.isArray(mapa[ano])) return;
        saida[String(ano)] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => Math.max(0, parseInt(mapa[ano][i], 10) || 0));
      });
      return saida;
    };
    const planos = [];
    if (Array.isArray(src.planos)) {
      src.planos.forEach((p, i) => {
        if (!p || typeof p !== "object") return;
        planos.push({
          id: String(p.id || ("p" + (i + 1))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || ("p" + (i + 1)),
          nome: String(p.nome || ("Plano " + (i + 1))).slice(0, 40),
          ticket: Math.max(0, Number(p.ticket) || 0),
          parcelas: Math.max(0, parseInt(p.parcelas, 10) || 0),
          entrada: Math.max(0, Number(p.entrada) || 0),
          juros: Math.max(0, Number(p.juros) || 0),
          meses: lerMeses(p.meses)
        });
      });
    }
    if (!planos.length && (base.condicoes.ticket || base.condicoes.plano || base.condicoes.entrada || base.condicoes.juros || Object.keys(base.vendasQtd).length)) {
      planos.push({
        id: "p1",
        nome: "Plano 1",
        ticket: base.condicoes.ticket,
        parcelas: base.condicoes.plano,
        entrada: base.condicoes.entrada,
        juros: base.condicoes.juros,
        meses: lerMeses(base.vendasQtd)
      });
    }
    base.planos = planos;
    base.em = String(src.em || "");
    return base;
  },

  lerPlanoLocal(cc) {
    try {
      const all = JSON.parse(localStorage.getItem("orc_plano_v1") || "{}");
      if (all && all[cc]) return this.normalizarPlano(all[cc]);
    } catch (e) {}
    try {
      const old = JSON.parse(localStorage.getItem("orc_distrato_v1") || "{}");
      if (old && old[cc]) return this.normalizarPlano({ distratos: old[cc] });
    } catch (e) {}
    return this.planoVazio();
  },

  gravarPlanoLocal(cc) {
    const plano = this._planos && this._planos[cc];
    if (!plano) return;
    let all = {};
    try { all = JSON.parse(localStorage.getItem("orc_plano_v1") || "{}") || {}; } catch (e) { all = {}; }
    all[cc] = plano;
    try { localStorage.setItem("orc_plano_v1", JSON.stringify(all)); } catch (e) {}
  },

  planoDoCc() {
    const cc = String(this.novo.ccId || "");
    if (!this._planos) this._planos = {};
    if (!cc) return this.planoVazio();
    if (!this._planos[cc]) this._planos[cc] = this.lerPlanoLocal(cc);
    return this._planos[cc];
  },

  garantirPlano() {
    const cc = String(this.novo.ccId || "");
    if (!cc || this._planoPedido === cc) return;
    this._planoPedido = cc;
    this.carregarPlano(cc);
  },

  async carregarPlano(cc) {
    const inicio = new Date().toISOString();
    const local = this.lerPlanoLocal(cc);
    if (!this._planos) this._planos = {};
    this._planos[cc] = local;
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db) {
      this.novo.nuvem = local.em ? "neste navegador" : "";
      this.pintarNuvem();
      return;
    }
    try {
      const snap = await fx.getDoc(fx.doc(db, "orcamento_empreendimento", cc));
      if (snap.exists()) {
        const atual = this._planos[cc];
        if (atual && atual.em && atual.em > inicio) return;
        const data = snap.data() || {};
        const nuvemEm = String(data.em || "");
        if (!local.em || (nuvemEm && nuvemEm >= local.em)) {
          this._planos[cc] = this.normalizarPlano(data);
          this.gravarPlanoLocal(cc);
        } else {
          this.salvarPlano();
        }
        this.novo.nuvem = "salvo";
      }
    } catch (e) {
      this.novo.nuvem = "neste navegador";
    }
    if (String(this.novo.ccId) === cc && !this.novo.carregando) this.renderNovo();
  },

  async salvarPlano() {
    const cc = String(this.novo.ccId || "");
    if (!cc) return;
    const plano = this.planoDoCc();
    plano.em = new Date().toISOString();
    this.gravarPlanoLocal(cc);
    this.novo.nuvem = "salvando";
    this.pintarNuvem();
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db) {
      this.novo.nuvem = "neste navegador";
      this.pintarNuvem();
      return;
    }
    try {
      await fx.setDoc(fx.doc(db, "orcamento_empreendimento", cc), {
        companyId: String(this.novo.companyId || ""),
        ccId: cc,
        distratos: plano.distratos,
        vendasQtd: plano.vendasQtd,
        condicoes: plano.condicoes,
        planos: plano.planos || [],
        em: plano.em
      }, { merge: true });
      this.novo.nuvem = "salvo";
    } catch (e) {
      this.novo.nuvem = "neste navegador";
    }
    this.pintarNuvem();
  },

  qtdLista(mapa, ano, mes) {
    const linha = mapa && mapa[String(ano)];
    const n = linha ? Number(linha[mes]) : 0;
    return n > 0 ? Math.round(n) : 0;
  },

  mesPrevisto(ano, mes) {
    const h = this.horizonte();
    return Number(ano) > h.hy || (Number(ano) === h.hy && Number(mes) >= h.hm);
  },

  qtdDistrato(ano, mes) {
    if (!this.mesPrevisto(ano, mes)) return 0;
    return this.qtdLista(this.planoDoCc().distratos, ano, mes);
  },

  qtdVenda(ano, mes) {
    if (!this.mesPrevisto(ano, mes)) return 0;
    return this.planosAtivos().reduce((s, p) => s + this.qtdPlano(p, ano, mes), 0);
  },

  planosAtivos() {
    const lista = this.planoDoCc().planos;
    return Array.isArray(lista) ? lista : [];
  },

  qtdPlano(p, ano, mes) {
    return this.qtdLista(p && p.meses, ano, mes);
  },

  acharPlano(id) {
    return this.planosAtivos().find((p) => p.id === String(id)) || null;
  },

  setPlanoCampo(id, campo, valor) {
    const p = this.acharPlano(id);
    if (!p) return;
    if (campo === "nome") p.nome = String(valor || "").slice(0, 40) || p.nome;
    else if (campo === "parcelas") p.parcelas = Math.max(0, parseInt(valor, 10) || 0);
    else p[campo] = Math.max(0, this.numeroCampo(valor));
    this.salvarPlano();
    this.renderNovo();
  },

  setPlanoQtd(id, ano, mes, valor) {
    const p = this.acharPlano(id);
    const mesN = Number(mes);
    if (!p || mesN < 0 || mesN > 11 || !this.mesPrevisto(ano, mesN)) return;
    if (!p.meses || typeof p.meses !== "object") p.meses = {};
    const chave = String(ano);
    if (!Array.isArray(p.meses[chave])) p.meses[chave] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    p.meses[chave][mesN] = Math.max(0, parseInt(valor, 10) || 0);
    this.salvarPlano();
    this.renderNovo();
  },

  adicionarPlano() {
    const cc = String(this.novo.ccId || "");
    if (!cc) return;
    const plano = this.planoDoCc();
    if (!Array.isArray(plano.planos)) plano.planos = [];
    const n = plano.planos.length + 1;
    plano.planos.push({
      id: "p" + Date.now().toString(36),
      nome: "Plano " + n,
      ticket: 0,
      parcelas: 0,
      entrada: 0,
      juros: 0,
      meses: {}
    });
    this.salvarPlano();
    this.renderNovo();
  },

  removerPlano(id) {
    const plano = this.planoDoCc();
    plano.planos = this.planosAtivos().filter((p) => p.id !== String(id));
    this.salvarPlano();
    this.renderNovo();
  },

  setQtd(qual, ano, mes, valor) {
    const cc = String(this.novo.ccId || "");
    const mesN = Number(mes);
    if (!cc || mesN < 0 || mesN > 11) return;
    const plano = this.planoDoCc();
    const chaveMapa = qual === "venda" ? "vendasQtd" : "distratos";
    if (!plano[chaveMapa] || typeof plano[chaveMapa] !== "object") plano[chaveMapa] = {};
    const chave = String(ano);
    if (!Array.isArray(plano[chaveMapa][chave])) plano[chaveMapa][chave] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    plano[chaveMapa][chave][mesN] = Math.max(0, parseInt(valor, 10) || 0);
    this.salvarPlano();
    this.renderNovo();
  },

  setDistrato(ano, mes, valor) {
    this.setQtd("distrato", ano, mes, valor);
  },

  setVenda(ano, mes, valor) {
    this.setQtd("venda", ano, mes, valor);
  },

  numeroCampo(v) {
    const s = String(v == null ? "" : v).trim().replace(/\s/g, "");
    if (!s) return 0;
    if (s.indexOf(",") >= 0) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
    return Number(s) || 0;
  },

  setCondicao(campo, valor) {
    const cc = String(this.novo.ccId || "");
    if (!cc) return;
    const plano = this.planoDoCc();
    const n = campo === "plano" ? Math.max(0, parseInt(valor, 10) || 0) : Math.max(0, this.numeroCampo(valor));
    plano.condicoes[campo] = n;
    this.salvarPlano();
    this.renderNovo();
  },

  condicoes() {
    return this.planoDoCc().condicoes || { ticket: 0, plano: 0, juros: 0, entrada: 0 };
  },

  parcelaMediaAtual() {
    const r = this.novo.resultado;
    return r ? Number(r.parcelaMedia) || 0 : 0;
  },

  qtdDistratoAntes(ano, mes) {
    const yAlvo = Number(ano);
    const mAlvo = Number(mes);
    const mapa = this.planoDoCc().distratos || {};
    let s = 0;
    Object.keys(mapa).forEach((y) => {
      const yi = Number(y);
      const linha = mapa[y] || [];
      for (let m = 0; m < 12; m++) {
        if (yi < yAlvo || (yi === yAlvo && m < mAlvo)) s += Math.max(0, Math.round(Number(linha[m]) || 0));
      }
    });
    return s;
  },

  abateMes(ano, mes) {
    const media = this.parcelaMediaAtual();
    const qtd = this.qtdDistratoAntes(ano, mes);
    if (!(qtd > 0) || !(media > 0)) return 0;
    return Math.round(qtd * media * 100) / 100;
  },

  parcelaPlano(saldo, n, jurosPct) {
    if (!(saldo > 0) || !(n > 0)) return 0;
    const i = (Number(jurosPct) || 0) / 100;
    if (!(i > 0)) return Math.round((saldo / n) * 100) / 100;
    const pot = Math.pow(1 + i, n);
    if (!(pot > 1)) return Math.round((saldo / n) * 100) / 100;
    return Math.round((saldo * i * pot / (pot - 1)) * 100) / 100;
  },

  vendasNoMes(ano, mes) {
    const alvo = Number(ano) * 12 + Number(mes);
    let total = 0;
    this.planosAtivos().forEach((p) => {
      const ticket = Number(p.ticket) || 0;
      const entrada = Math.min(Number(p.entrada) || 0, ticket > 0 ? ticket : Number(p.entrada) || 0);
      const n = Math.max(0, parseInt(p.parcelas, 10) || 0);
      const pmt = this.parcelaPlano(Math.max(0, ticket - entrada), n, p.juros);
      const meses = p.meses || {};
      Object.keys(meses).forEach((y) => {
        const yi = Number(y);
        const linha = meses[y] || [];
        for (let m = 0; m < 12; m++) {
          if (!this.mesPrevisto(yi, m)) continue;
          const qtd = Math.max(0, Math.round(Number(linha[m]) || 0));
          if (!(qtd > 0)) continue;
          const dist = alvo - (yi * 12 + m);
          if (dist === 0) total += qtd * entrada;
          else if (dist >= 1 && dist <= n) total += qtd * pmt;
        }
      });
    });
    return Math.round(total * 100) / 100;
  },

  garantirRealizado() {
    if (this._realEstado === "ok" || this._realEstado === "carregando") return;
    this._realEstado = "carregando";
    this.lerRealizado().then(() => {
      this._realEstado = "ok";
      if (!this.novo.carregando) this.renderNovo();
    }).catch(() => {
      this._realEstado = "ok";
      this._realMapa = this._realMapa || {};
    });
  },

  ccDoContrato(c) {
    const units = (c && (c.salesContractUnits || c.units)) || [];
    const first = units[0] || {};
    const unitId = String((c && (c.unitId || first.id || first.unitId)) || "");
    return String((c && (c.enterpriseId || c.costCenterId)) || first.enterpriseId || first.costCenterId || (unitId.indexOf("-") >= 0 ? unitId.split("-")[0] : ""));
  },

  qtyContrato(c) {
    const units = (c && (c.salesContractUnits || c.units)) || [];
    return units.length > 0 ? units.length : 1;
  },

  async lerRealizado() {
    const mapa = {};
    const por = (cc, ano, mes) => {
      if (!mapa[cc]) mapa[cc] = {};
      const k = ano + "-" + mes;
      if (!mapa[cc][k]) mapa[cc][k] = { vendas: 0, distratos: 0 };
      return mapa[cc][k];
    };
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (fx && db) {
      const snap = await fx.getDocs(fx.collection(db, "comercial_batimento"));
      const docs = [];
      snap.forEach((d) => docs.push(d));
      const byId = {};
      docs.forEach((d) => { byId[d.id] = d; });
      docs.forEach((d) => {
        if (!d.id || d.id.charAt(0) === "_" || /_p\d+$/.test(d.id)) return;
        const data = d.data() || {};
        if (data.year == null || data.month == null) return;
        let distratos = [];
        let vendas = [];
        try { distratos = JSON.parse(data.distratos || "[]"); } catch (e) { distratos = []; }
        if (data.splitVendas && Number(data.parts) > 0) {
          for (let i = 0; i < Number(data.parts); i++) {
            const part = byId[d.id + "_p" + i];
            let chunk = [];
            try { chunk = JSON.parse((part && part.data() && part.data().data) || "[]"); } catch (e) { chunk = []; }
            vendas = vendas.concat(chunk);
          }
        } else {
          try { vendas = JSON.parse(data.vendas || "[]"); } catch (e) { vendas = []; }
        }
        const ano = Number(data.year);
        const mes = Number(data.month) - 1;
        if (mes < 0 || mes > 11) return;
        const soma = (lista, tipo) => {
          (lista || []).forEach((c) => {
            const cc = this.ccDoContrato(c);
            if (!cc) return;
            por(cc, ano, mes)[tipo] += this.qtyContrato(c);
          });
        };
        soma(vendas, "vendas");
        soma(distratos, "distratos");
      });
    }
    this._realMapa = mapa;
  },

  qtdReal(ano, mes, tipo) {
    const cc = String(this.novo.ccId || "");
    const slot = this._realMapa && this._realMapa[cc] && this._realMapa[cc][Number(ano) + "-" + Number(mes)];
    if (!slot) return 0;
    return Math.max(0, Math.round(Number(tipo === "venda" ? slot.vendas : slot.distratos) || 0));
  },

  saldoInicial() {
    const h = this.horizonte();
    const est = this.estoqueAtual();
    let vendas = 0;
    let dist = 0;
    for (let ano = h.de; ano <= h.hy; ano++) {
      for (let mes = 0; mes < 12; mes++) {
        if (ano > h.hy || (ano === h.hy && mes > h.hm)) break;
        vendas += this.qtdReal(ano, mes, "venda");
        dist += this.qtdReal(ano, mes, "distrato");
      }
    }
    return { qtd: est.qtd - dist + vendas, hoje: est.qtd, origem: est.origem, vendas: vendas, dist: dist, ano: h.de };
  },

  liquidoAno(r, ano) {
    const cel = (r && r.grade && r.grade[ano]) || [];
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((mes) => (Number(cel[mes]) || 0) - this.abateMes(Number(ano), mes) + this.vendasNoMes(Number(ano), mes));
  },

  totalAbate(r) {
    const anos = Object.keys((r && r.grade) || {});
    let s = 0;
    anos.forEach((ano) => {
      for (let mes = 0; mes < 12; mes++) s += this.abateMes(Number(ano), mes);
    });
    return Math.round(s * 100) / 100;
  },

  totalVendasCaixa(r) {
    const anos = Object.keys((r && r.grade) || {});
    let s = 0;
    anos.forEach((ano) => {
      for (let mes = 0; mes < 12; mes++) s += this.vendasNoMes(Number(ano), mes);
    });
    return Math.round(s * 100) / 100;
  },

  estoqueAtual() {
    const cc = String(this.novo.ccId || "");
    if (!cc) return { qtd: 0, origem: "" };
    let units = [];
    const app = window.EstoqueComercialApp;
    if (app && app.state && Array.isArray(app.state.units) && app.state.units.length) units = app.state.units;
    if (!units.length) {
      try {
        const raw = JSON.parse(localStorage.getItem("crm_estoque_posicao_v1") || "null");
        units = raw && Array.isArray(raw.units) ? raw.units : [];
      } catch (e) {
        units = [];
      }
    }
    const qtd = units.filter((u) => u && String(u.enterpriseId) === cc && String(u.commercialStock || "").toUpperCase() === "D").length;
    return { qtd: qtd, origem: units.length ? "posicao" : "" };
  },

  pedirCentro() {
    if (this.novo.companyId && this.novo.ccId) return "";
    return `<div class="crm-card" style="padding:28px;color:#64748b;">Escolha a empresa e o centro de custo.</div>`;
  },

  cabecaGrade() {
    const meses = this.mesesCurto();
    const cols = `<col class="orc-rec-c-ano">${meses.map(() => "<col>").join("")}<col class="orc-rec-c-tot">`;
    return { meses: meses, cols: cols, head: `<thead><tr><th>Ano</th>${meses.map((m) => `<th class="is-right">${m}</th>`).join("")}<th class="is-right">Total</th></tr></thead>` };
  },

  celQtd(ano, mes, tipo) {
    const nomes = this.mesesLongo();
    const qtd = tipo === "venda" ? this.qtdVenda(ano, mes) : this.qtdDistrato(ano, mes);
    const fn = tipo === "venda" ? "setVenda" : "setDistrato";
    const rotulo = (tipo === "venda" ? "Vendas" : "Distratos") + " em " + nomes[mes] + " de " + ano;
    const marca = this.clsMes(ano, mes);
    if (tipo === "distrato" && !this.mesPrevisto(ano, mes)) return `<td class="is-right is-passado">—</td>`;
    return `<td class="${marca}"><input type="number" min="0" step="1" inputmode="numeric" class="orc-dist-qtd" aria-label="${this.esc(rotulo)}" value="${qtd > 0 ? qtd : ""}" onchange="OrcamentoModuloApp.${fn}(${ano}, ${mes}, this.value)"></td>`;
  },

  clsMes(ano, mes) {
    const h = this.horizonte();
    if (Number(ano) === h.hy && Number(mes) === h.hm) return "is-hoje";
    if (Number(ano) < h.hy || (Number(ano) === h.hy && Number(mes) < h.hm)) return "is-passado";
    return "";
  },

  celTexto(v, dinheiro, extra) {
    const marca = extra ? " " + extra : "";
    if (v == null || v === "") return `<td class="is-right${marca}">—</td>`;
    const n = Number(v) || 0;
    if (dinheiro && !(Math.abs(n) > 0.009)) return `<td class="is-right${marca}">—</td>`;
    const cls = n < -0.009 ? " is-neg" : "";
    const texto = dinheiro ? this.dinheiro(n) : String(Math.round(n));
    return `<td class="is-right${cls}${marca}">${this.esc(texto)}</td>`;
  },

  celReal(n, ano, mes) {
    const marca = this.clsMes(ano, mes);
    if (!(Number(n) > 0)) return `<td class="is-right is-real${marca ? " " + marca : ""}">—</td>`;
    return `<td class="is-right is-real${marca ? " " + marca : ""}">${Math.round(Number(n))}</td>`;
  },

  kardexHtml() {
    const vazio = this.pedirCentro();
    if (vazio) return vazio;
    const h = this.horizonte();
    const g = this.cabecaGrade();
    const abertura = this.saldoInicial();
    const est = this.estoqueAtual();
    let saldo = abertura.qtd;
    let blocos = "";
    let fimAno = saldo;
    let vendaRealAno = 0;
    let distRealAno = 0;
    for (let ano = h.de; ano <= h.ate; ano++) {
      const dr = [];
      const dp = [];
      const vr = [];
      const vp = [];
      const inicial = [];
      const finais = [];
      let sDr = 0;
      let sDp = 0;
      let sVr = 0;
      let sVp = 0;
      for (let mes = 0; mes < 12; mes++) {
        const rDist = this.qtdReal(ano, mes, "distrato");
        const rVenda = this.qtdReal(ano, mes, "venda");
        const pDist = this.qtdDistrato(ano, mes);
        const pVenda = this.qtdVenda(ano, mes);
        dr.push(rDist);
        dp.push(pDist);
        vr.push(rVenda);
        vp.push(pVenda);
        sDr += rDist;
        sDp += pDist;
        sVr += rVenda;
        sVp += pVenda;
        if (ano === h.hy) {
          vendaRealAno += rVenda;
          distRealAno += rDist;
        }
        inicial.push(saldo);
        saldo = saldo + rDist + pDist - rVenda - pVenda;
        finais.push(saldo);
      }
      if (ano === h.ate) fimAno = saldo;
      const linha = (rotulo, nota, tds, total, cls) => `<tr class="${cls || "orc-rec-det"}"><td class="orc-rec-ano-nome">${rotulo}<small>${nota}</small></td>${tds}<td class="is-right">${total}</td></tr>`;
      blocos += `<section class="orc-kardex-bloco">
        <div class="orc-kardex-titulo"><span>${ano}</span><span>${ano === h.de ? "Estoque inicial " + abertura.qtd : "Continua de " + inicial[0]}</span></div>
        <div class="cc-scroll orc-rec-meses">
          <table class="cc-table orc-rec-grade orc-dist-grade orc-kardex-grade">
            <colgroup>${g.cols}</colgroup>
            ${g.head}
            <tbody>
              ${linha("Distratos", "realizados", dr.map((v, mes) => this.celReal(v, ano, mes)).join(""), sDr || "—", "orc-rec-det")}
              ${linha("Distratos", "previstos", g.meses.map((_, mes) => this.celQtd(ano, mes, "distrato")).join(""), sDp || "—", "orc-rec-ano")}
              ${linha("Vendas", "realizadas", vr.map((v, mes) => this.celReal(v, ano, mes)).join(""), sVr || "—", "orc-rec-det")}
              ${linha("Vendas", "previstas", vp.map((v, mes) => this.celTexto(this.mesPrevisto(ano, mes) && v ? v : null, false, this.clsMes(ano, mes))).join(""), sVp || "—", "orc-rec-det is-venda")}
              ${linha("Estoque", "inicial", inicial.map((v, mes) => this.celTexto(v, false, this.clsMes(ano, mes))).join(""), "—", "orc-rec-det")}
              ${linha("Estoque", "final", finais.map((v, mes) => this.celTexto(v, false, this.clsMes(ano, mes))).join(""), finais[11], "orc-rec-det is-conta")}
            </tbody>
          </table>
        </div>
      </section>`;
    }
    const nota = est.origem
      ? "Janeiro de " + abertura.ano + " reconstitui o estoque de hoje: lotes disponíveis agora, mais as vendas já feitas neste ano, menos os distratos já feitos."
      : "A posição de estoque ainda não está neste navegador. O inicial de janeiro usa só as vendas e os distratos realizados. Abra a Posição de estoque para trazer os lotes disponíveis de hoje.";
    const espera = this._realEstado !== "ok" ? " Buscando vendas e distratos realizados…" : "";
    return `
      <div class="orc-rec-kpis">
        <div class="crm-card orc-rec-kpi"><span>Estoque em jan/${abertura.ano}</span><strong>${abertura.qtd}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Disponíveis hoje</span><strong>${est.qtd}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Vendas realizadas em ${h.hy}</span><strong>${vendaRealAno}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Distratos realizados em ${h.hy}</span><strong>${distRealAno}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Estoque no fim</span><strong>${fimAno}</strong></div>
      </div>
      <div class="orc-rec-focus">${this.esc(nota + espera)} O mês em curso está marcado. A venda prevista é a soma dos planos, na aba Vendas.</div>
      ${blocos}`;
  },

  distratoHtml() {
    const vazio = this.pedirCentro();
    if (vazio) return vazio;
    const h = this.horizonte();
    const g = this.cabecaGrade();
    const media = this.parcelaMediaAtual();
    const nMed = this.novo.resultado ? Number(this.novo.resultado.parcelasMedia) || 0 : 0;
    let linhas = "";
    let qtdPeriodo = 0;
    let abateReceita = 0;
    for (let ano = h.de; ano <= h.ate; ano++) {
      let somaQtd = 0;
      const abates = [];
      for (let mes = 0; mes < 12; mes++) {
        somaQtd += this.qtdDistrato(ano, mes);
        const abate = this.abateMes(ano, mes);
        abates.push(abate);
        if (ano >= Number(this.novo.anoDe) && ano <= Number(this.novo.anoAte)) abateReceita += abate;
      }
      qtdPeriodo += somaQtd;
      const somaAbate = abates.reduce((s, n) => s + n, 0);
      linhas += `<tr class="orc-rec-ano"><td class="orc-rec-ano-nome">${ano}<small>distratos</small></td>${g.meses.map((_, mes) => this.celQtd(ano, mes, "distrato")).join("")}<td class="is-right">${somaQtd > 0 ? somaQtd : "—"}</td></tr>`;
      linhas += `<tr class="orc-rec-det is-dist"><td class="orc-rec-ano-nome">Sai da receita<small>neste mês</small></td>${abates.map((v) => this.celTexto(v > 0 ? -v : 0, true)).join("")}<td class="is-right">${somaAbate > 0.009 ? this.esc(this.dinheiro(-somaAbate)) : "—"}</td></tr>`;
    }
    const nota = media > 0
      ? "Parcela média " + this.dinheiro(media) + ", média de " + nMed + " parcelas em aberto. Outubro tira essa parcela de novembro em diante. Novembro soma com outubro."
      : "Monte a receita para calcular a parcela média. A quantidade informada já fica salva.";
    return `
      <div class="orc-rec-kpis">
        <div class="crm-card orc-rec-kpi"><span>Parcela média</span><strong>${media > 0 ? this.esc(this.dinheiro(media)) : "—"}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Distratos no quadro</span><strong>${qtdPeriodo}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Sai da receita</span><strong class="orc-rec-dist">${this.esc(this.dinheiro(-abateReceita))}</strong></div>
      </div>
      <div class="orc-rec-focus">${this.esc(nota)}</div>
      <div class="cc-scroll orc-rec-meses">
        <table class="cc-table orc-rec-grade orc-dist-grade">
          <colgroup>${g.cols}</colgroup>
          ${g.head}
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  },

  campoPlano(id, campo, label, valor, inteiro) {
    const texto = !(Number(valor) > 0) ? "" : (inteiro ? String(parseInt(valor, 10) || 0) : this.numero(valor));
    return `<div class="form-group" style="margin:0;">
      <label>${label}</label>
      <input type="text" inputmode="decimal" class="form-control" style="width:130px;height:36px;" value="${this.esc(texto)}" onchange="OrcamentoModuloApp.setPlanoCampo('${id}','${campo}', this.value)">
    </div>`;
  },

  vendasHtml() {
    const vazio = this.pedirCentro();
    if (vazio) return vazio;
    const h = this.horizonte();
    const g = this.cabecaGrade();
    const planos = this.planosAtivos();
    const cards = planos.map((p) => {
      const saldo = Math.max(0, (Number(p.ticket) || 0) - Math.min(Number(p.entrada) || 0, Number(p.ticket) || 0));
      const parcela = this.parcelaPlano(saldo, p.parcelas, p.juros);
      return `<article class="orc-plano-card">
        <div class="orc-plano-head">
          <input type="text" class="form-control" style="width:180px;height:36px;font-weight:700;" value="${this.esc(p.nome)}" aria-label="Nome do plano" onchange="OrcamentoModuloApp.setPlanoCampo('${p.id}','nome', this.value)">
          <button type="button" class="orc-plano-remover" onclick="OrcamentoModuloApp.removerPlano('${p.id}')">Remover</button>
        </div>
        <div class="orc-vendas-cond">
          ${this.campoPlano(p.id, "ticket", "Ticket médio", p.ticket, false)}
          ${this.campoPlano(p.id, "entrada", "Entrada", p.entrada, false)}
          ${this.campoPlano(p.id, "parcelas", "Nº parcelas", p.parcelas, true)}
          ${this.campoPlano(p.id, "juros", "Juros % ao mês", p.juros, false)}
        </div>
        <p class="orc-plano-parcela">Parcela do saldo: ${this.esc(this.dinheiro(parcela))}</p>
      </article>`;
    }).join("");
    let linhas = "";
    let caixaPeriodo = 0;
    for (let ano = h.de; ano <= h.ate; ano++) {
      const caixa = [];
      let somaCaixa = 0;
      for (let mes = 0; mes < 12; mes++) {
        const v = this.vendasNoMes(ano, mes);
        caixa.push(v);
        somaCaixa += v;
        if (ano >= Number(this.novo.anoDe) && ano <= Number(this.novo.anoAte)) caixaPeriodo += v;
      }
      linhas += `<tr class="orc-rec-det"><td class="orc-rec-ano-nome">${ano}<small>realizadas</small></td>${g.meses.map((_, mes) => this.celReal(this.qtdReal(ano, mes, "venda"), ano, mes)).join("")}<td class="is-right">—</td></tr>`;
      planos.forEach((p) => {
        let soma = 0;
        const tds = g.meses.map((_, mes) => {
          const qtd = this.qtdPlano(p, ano, mes);
          soma += this.mesPrevisto(ano, mes) ? qtd : 0;
          if (!this.mesPrevisto(ano, mes)) return this.celReal(0, ano, mes);
          return `<td class="${this.clsMes(ano, mes)}"><input type="number" min="0" step="1" inputmode="numeric" class="orc-dist-qtd" aria-label="${this.esc(p.nome)} em ${ano}" value="${qtd > 0 ? qtd : ""}" onchange="OrcamentoModuloApp.setPlanoQtd('${p.id}', ${ano}, ${mes}, this.value)"></td>`;
        }).join("");
        linhas += `<tr class="orc-rec-ano"><td class="orc-rec-ano-nome">${this.esc(p.nome)}<small>vendas previstas</small></td>${tds}<td class="is-right">${soma > 0 ? soma : "—"}</td></tr>`;
      });
      linhas += `<tr class="orc-rec-det is-venda"><td class="orc-rec-ano-nome">Entra no caixa<small>entrada e parcelas</small></td>${caixa.map((v, mes) => this.celTexto(v, true, this.clsMes(ano, mes))).join("")}<td class="is-right">${somaCaixa > 0.009 ? this.esc(this.dinheiro(somaCaixa)) : "—"}</td></tr>`;
    }
    return `
      <div class="orc-planos">${cards || `<p class="orc-plano-parcela">Nenhum plano ainda. Cadastre o primeiro para informar as vendas.</p>`}</div>
      <button type="button" class="btn btn-outline orc-plano-add" onclick="OrcamentoModuloApp.adicionarPlano()">Adicionar plano</button>
      <div class="orc-rec-kpis">
        <div class="crm-card orc-rec-kpi"><span>Planos</span><strong>${planos.length}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Entra na receita do período</span><strong>${this.esc(this.dinheiro(caixaPeriodo))}</strong></div>
      </div>
      <div class="cc-scroll orc-rec-meses">
        <table class="cc-table orc-rec-grade orc-dist-grade orc-kardex-grade">
          <colgroup>${g.cols}</colgroup>
          ${g.head}
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  },

  carregandoHtml() {
    const pct = this.novo.progressoPct == null ? 35 : this.novo.progressoPct;
    return `<div class="ml-load" style="padding:28px 0;">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-status-text">${this.esc(this.novo.progresso || "Buscando o contas a receber…")}</div>
      <div class="ml-load-track"><div class="loading-progress-bar" style="width:${pct}%"></div></div>
    </div>`;
  },

  pintarProgresso(texto, pct) {
    this.novo.progresso = texto;
    this.novo.progressoPct = pct;
    const corpo = document.getElementById("orc-receita-corpo");
    if (corpo) corpo.innerHTML = this.carregandoHtml();
  },

  resultadoHtml() {
    const r = this.novo.resultado;
    if (!r) {
      return `<div class="crm-card" style="padding:28px;color:#64748b;">Escolha a empresa, o centro de custo e os anos. A receita é montada ao clicar em Montar receita.</div>`;
    }
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const cab = meses.map((m) => `<th class="is-right">${m}</th>`).join("");
    const cols = `<col class="orc-rec-c-ano">${meses.map(() => "<col>").join("")}<col class="orc-rec-c-tot">`;
    const indices = (r.indices || []).map((ix) => `<span>${this.esc(this.resumoIndice(ix))}</span>`).join("");
    const abate = this.totalAbate(r);
    const vendasNovas = this.totalVendasCaixa(r);
    const receita = (Number(r.total) || 0) - abate + vendasNovas;
    return `
      <div class="orc-rec-kpis">
        <div class="crm-card orc-rec-kpi"><span>Receita no período</span><strong>${this.esc(this.dinheiro(receita))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Principal</span><strong>${this.esc(this.dinheiro(r.principal || 0))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Reajuste</span><strong class="orc-rec-reaj">${this.esc(this.dinheiro(r.reajuste || 0))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Clientes</span><strong>${r.clientes.length}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Distrato</span><strong class="orc-rec-dist">${this.esc(this.dinheiro(-abate))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Vendas novas</span><strong>${this.esc(this.dinheiro(vendasNovas))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Fora, sub judice</span><strong>${r.subJudice} · ${this.esc(this.dinheiro(r.subJudiceValor))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Antes de ${this.esc(r.anoDe || "")}</span><strong>${this.esc(this.dinheiro(r.antes || 0))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Depois de ${this.esc(r.anoAte)}</span><strong>${this.esc(this.dinheiro(r.fora))}</strong></div>
      </div>
      ${indices ? `<div class="orc-rec-focus">${indices}</div>` : ""}
      <div class="cc-scroll orc-rec-meses">
        <table class="cc-table orc-rec-grade">
          <colgroup>${cols}</colgroup>
          <thead><tr><th>Ano</th>${cab}<th class="is-right">Total</th></tr></thead>
          <tbody id="orc-rec-anos">${this.gradeAnosHtml(r)}</tbody>
        </table>
      </div>
      <div id="orc-rec-filtro">${this.filtroBarraHtml()}</div>
      <div class="cc-scroll orc-rec-clientes">
        <table class="cc-table orc-rec-cli-tab">
          <colgroup>
            <col class="orc-rec-c-cli"><col class="orc-rec-c-un"><col class="orc-rec-c-tit">
            <col class="orc-rec-c-pmp"><col class="orc-rec-c-rep"><col class="orc-rec-c-idx">
            <col class="orc-rec-c-val"><col class="orc-rec-c-val"><col class="orc-rec-c-val">
          </colgroup>
          <thead><tr>
            <th>Cliente</th><th>Unidade</th><th>Título</th><th class="is-right">PMP</th><th>Repactuação</th><th>Indexador</th>
            <th class="is-right">Principal</th><th class="is-right">Reajuste</th><th class="is-right">No período</th>
          </tr></thead>
          <tbody id="orc-rec-cli">${this.clientesHtml(r)}</tbody>
        </table>
      </div>`;
  },

  celNum(v, extra, filtro) {
    const n = Number(v) || 0;
    const ativo = filtro && this.celulaAtiva(filtro);
    const clicavel = !!(filtro && n > 0.009);
    const visivel = Math.abs(n) > 0.009;
    const cls = "is-right" + (extra ? " " + extra : "") + (clicavel ? " orc-rec-cel" : "") + (ativo ? " is-filtro" : "");
    const click = clicavel
      ? ` onclick="event.stopPropagation();OrcamentoModuloApp.filtrarCelula('${filtro.ano}','${filtro.tipo}',${filtro.mes})"`
      : "";
    const titulo = clicavel ? ` title="Ver os clientes deste mês"` : "";
    return `<td class="${cls}"${click}${titulo}>${visivel ? this.esc(this.numero(n)) : "—"}</td>`;
  },

  celulaAtiva(filtro) {
    const atual = this.novo.filtroCelula;
    return !!(atual && String(atual.ano) === String(filtro.ano) && atual.tipo === filtro.tipo && atual.mes === filtro.mes);
  },

  jurosAtivos(valor, pmp) {
    const dias = pmp && pmp.conhecido ? Number(pmp.pmp) || 0 : 0;
    if (!(dias > 0) || !(valor > 0)) return 0;
    const multa = valor * 0.02;
    const juros = valor * 0.01 * (dias / 30);
    return Math.round((multa + juros) * 100) / 100;
  },

  linhaConta(rotulo, nota, valores, trClass, extra, ano, tipo) {
    const lista = valores || [];
    const soma = lista.reduce((s, v) => s + (Number(v) || 0), 0);
    return `<tr class="orc-rec-det${trClass ? " " + trClass : ""}">
      <td class="orc-rec-ano-nome">${this.esc(rotulo)}${nota ? `<small>${this.esc(nota)}</small>` : ""}</td>
      ${lista.map((v, mes) => this.celNum(v, extra, tipo ? { ano: ano, mes: mes, tipo: tipo } : null)).join("")}
      ${this.celNum(soma, extra)}
    </tr>`;
  },

  gradeAnosHtml(r) {
    const anos = Object.keys((r && r.grade) || {}).sort();
    const linhas = anos.map((ano) => {
      const cel = this.liquidoAno(r, ano);
      const total = cel.reduce((s, v) => s + (Number(v) || 0), 0);
      const aberto = this.novo.anoAberto === String(ano);
      const parte = (r.porAno && r.porAno[ano]) || {};
      const ico = aberto ? "chevron-down" : "chevron-right";
      const cabeca = `<tr class="orc-rec-ano" onclick="OrcamentoModuloApp.toggleAno('${ano}')">
        <td class="orc-rec-ano-nome"><i data-lucide="${ico}"></i>${this.esc(ano)}<small>1.01.01.01</small></td>
        ${cel.map((v, mes) => this.celNum(v, "", { ano: ano, mes: mes, tipo: "conta" })).join("")}
        ${this.celNum(total)}
      </tr>`;
      if (!aberto) return cabeca;
      if (!Array.isArray(parte.vence)) {
        return cabeca + `<tr class="orc-rec-det"><td colspan="14">Monte a receita de novo para ver o vencimento do ano e o que chega do ano anterior.</td></tr>`;
      }
      const sub = (r.subMes && r.subMes[ano]) || [];
      const juros = (r.jurosMes && r.jurosMes[ano]) || [];
      const dist = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((mes) => -this.abateMes(ano, mes));
      const vendasLinha = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((mes) => this.vendasNoMes(ano, mes));
      const anosAntes = Object.keys(parte.anosAntes || {}).sort();
      const rotuloAntes = anosAntes.length === 1 ? anosAntes[0] : (anosAntes.length ? anosAntes[0] + "–" + anosAntes[anosAntes.length - 1] : String(Number(ano) - 1));
      const somaAntes = (parte.antes || []).reduce((s, v) => s + (Number(v) || 0), 0);
      const linhaAntes = somaAntes > 0.009 ? this.linhaConta(rotuloAntes, "recebe em " + ano, parte.antes, "is-antes", "", ano, "antes") : "";
      return cabeca
        + this.linhaConta(ano, "recebe pelo PMP", parte.vence, "is-vence", "", ano, "vence")
        + linhaAntes
        + this.linhaConta("Reajuste", "sobre o caixa", parte.repactuacao, "is-reaj", "orc-rec-reaj", ano, "reaj")
        + this.linhaConta("Sub judice", "não soma", sub, "is-sj", "")
        + this.linhaConta("Distrato", "sai nos meses seguintes", dist, "is-dist", "")
        + this.linhaConta("Vendas novas", "entrada e parcelas", vendasLinha, "is-venda", "")
        + this.linhaConta("1.01.01.01", "Venda de lotes", cel, "is-conta", "", ano, "conta")
        + this.linhaConta("1.03.01.02", "Juros ativos", juros, "is-juros", "", ano, "juros");
    }).join("");
    const totaisMes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => anos.reduce((s, ano) => s + (this.liquidoAno(r, ano)[i] || 0), 0));
    const totalLiq = totaisMes.reduce((s, v) => s + v, 0);
    const rodape = `<tr class="orc-rec-total"><td>Total</td>${totaisMes.map((v, mes) => this.celNum(v, "", { ano: "", mes: mes, tipo: "total" })).join("")}${this.celNum(totalLiq)}</tr>`;
    return linhas + rodape;
  },

  toggleAno(ano) {
    this.novo.anoAberto = this.novo.anoAberto === String(ano) ? "" : String(ano);
    const box = document.getElementById("orc-rec-anos");
    if (box && this.novo.resultado) {
      box.innerHTML = this.gradeAnosHtml(this.novo.resultado);
      if (window.lucide) window.lucide.createIcons();
    }
  },

  filtrarCelula(ano, tipo, mes) {
    const atual = this.novo.filtroCelula;
    const mesN = Number(mes);
    if (atual && String(atual.ano) === String(ano) && atual.tipo === tipo && atual.mes === mesN) this.novo.filtroCelula = null;
    else this.novo.filtroCelula = { ano: String(ano), tipo: tipo, mes: mesN };
    this.novo.clienteAberto = -1;
    this.repintarGrade();
    const box = document.querySelector(".orc-rec-clientes");
    if (box && this.novo.filtroCelula) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  },

  limparFiltroCelula() {
    this.novo.filtroCelula = null;
    this.novo.clienteAberto = -1;
    this.repintarGrade();
  },

  repintarGrade() {
    const r = this.novo.resultado;
    const anos = document.getElementById("orc-rec-anos");
    const bar = document.getElementById("orc-rec-filtro");
    const cli = document.getElementById("orc-rec-cli");
    if (anos && r) anos.innerHTML = this.gradeAnosHtml(r);
    if (bar) bar.innerHTML = this.filtroBarraHtml();
    if (cli && r) cli.innerHTML = this.clientesHtml(r);
    if (window.lucide) window.lucide.createIcons();
  },

  filtroBarraHtml() {
    const f = this.novo.filtroCelula;
    if (!f) return "";
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const rotulos = {
      vence: "recebe pelo PMP",
      antes: "vencimento de ano anterior",
      reaj: "reajuste sobre o caixa",
      conta: "venda de lotes",
      juros: "juros ativos",
      total: "total do mês"
    };
    const quando = f.tipo === "total" ? meses[f.mes] + " · todos os anos" : meses[f.mes] + " de " + f.ano;
    return `<div class="orc-rec-filtro-bar"><span>${this.esc(quando)} · ${this.esc(rotulos[f.tipo] || "")}</span><button type="button" onclick="OrcamentoModuloApp.limparFiltroCelula()">Limpar</button></div>`;
  },

  parcelaNoFiltro(c, p, f) {
    const quando = String(p.quando || "");
    if (!/^\d{4}-\d{2}/.test(quando)) return false;
    const ano = quando.slice(0, 4);
    const mes = Number(quando.slice(5, 7)) - 1;
    if (mes !== f.mes) return false;
    if (f.tipo === "total") return true;
    if (ano !== String(f.ano)) return false;
    const anoDue = String(p.due || "").slice(0, 4);
    if (f.tipo === "vence") return anoDue >= ano;
    if (f.tipo === "antes") return anoDue < ano;
    if (f.tipo === "reaj") return (Number(p.reajuste) || 0) > 0.009;
    if (f.tipo === "juros") return this.jurosAtivos(p.valor, { conhecido: c.pmpConhecido, pmp: c.pmp }) > 0.009;
    return true;
  },

  clientesDoFiltro(r) {
    const lista = (r && r.clientes) || [];
    const f = this.novo.filtroCelula;
    const saida = [];
    lista.forEach((c, i) => {
      if (!f) {
        saida.push(c);
        return;
      }
      const parcelas = (c.parcelas || []).filter((p) => this.parcelaNoFiltro(c, p, f));
      if (!parcelas.length) return;
      let principal = 0;
      let reajuste = 0;
      let total = 0;
      parcelas.forEach((p) => {
        principal += Number(p.principal) || 0;
        reajuste += Number(p.reajuste) || 0;
        total += Number(p.valor) || 0;
      });
      saida.push(Object.assign({}, c, {
        parcelas: parcelas,
        principal: Math.round(principal * 100) / 100,
        reajuste: Math.round(reajuste * 100) / 100,
        total: Math.round(total * 100) / 100,
        _i: i
      }));
    });
    if (f) {
      const chave = f.tipo === "reaj" ? "reajuste" : (f.tipo === "vence" || f.tipo === "antes" ? "principal" : "total");
      saida.sort((a, b) => (b[chave] || 0) - (a[chave] || 0));
    }
    return saida;
  },

  clientesHtml(r) {
    const bruto = (r && r.clientes) || [];
    const lista = this.clientesDoFiltro(r);
    if (!bruto.length) return `<tr><td colspan="9" style="color:#64748b;">Nenhuma parcela em aberto entrou no período.</td></tr>`;
    if (!lista.length) return `<tr><td colspan="9" style="color:#64748b;">Nenhum cliente entra nesta célula.</td></tr>`;
    let principal = 0;
    let reajuste = 0;
    let total = 0;
    const linhas = lista.map((c, i) => {
      principal += Number(c.principal) || 0;
      reajuste += Number(c.reajuste) || 0;
      total += Number(c.total) || 0;
      const idx = c._i == null ? i : c._i;
      const aberto = this.novo.clienteAberto === idx;
      const detalhe = aberto ? this.parcelasHtml(c) : "";
      return `<tr class="orc-rec-cli" onclick="OrcamentoModuloApp.toggleCliente(${idx})">
        <td><i data-lucide="${aberto ? "chevron-down" : "chevron-right"}"></i>${this.esc(c.cliente)}</td>
        <td>${this.esc(c.unidade || "—")}</td>
        <td>${this.esc(c.titulo)}</td>
        <td class="is-right">${c.pmpConhecido ? this.esc(c.pmp + " d") : "—"}</td>
        <td>${this.esc(c.repactuacao || "—")}</td>
        <td>${this.esc(c.indexador || "—")}</td>
        <td class="is-right">${this.esc(this.numero(c.principal))}</td>
        <td class="is-right orc-rec-reaj">${this.esc(this.numero(c.reajuste))}</td>
        <td class="is-right">${this.esc(this.numero(c.total))}</td>
      </tr>${detalhe}`;
    }).join("");
    const rodape = `<tr class="orc-rec-total"><td colspan="6">Total</td><td class="is-right">${this.esc(this.numero(principal))}</td><td class="is-right orc-rec-reaj">${this.esc(this.numero(reajuste))}</td><td class="is-right">${this.esc(this.numero(total))}</td></tr>`;
    return linhas + rodape;
  },

  parcelasHtml(c) {
    const linhas = (c.parcelas || []).map((p) => {
      const anos = (p.anos || []).map((a) => a.ano + " " + this.pct(a.pct)).join(" + ");
      const caixa = p.quando ? p.quando.split("-").reverse().join("/") : "—";
      const venc = p.due ? String(p.due).slice(0, 10).split("-").reverse().join("/") : "—";
      return `<tr>
        <td>${this.esc(venc)}</td>
        <td>${this.esc(caixa)}</td>
        <td class="orc-rec-anos">${anos ? this.esc(anos) : "Sem reajuste"}</td>
        <td class="is-right">${this.esc(this.numero(p.principal))}</td>
        <td class="is-right orc-rec-reaj">${this.esc(this.numero(p.reajuste))}</td>
        <td class="is-right">${this.esc(this.numero(p.valor))}</td>
      </tr>`;
    }).join("");
    return `<tr class="orc-rec-parc"><td class="orc-rec-parc-cell" colspan="9">
      <table class="cc-table orc-rec-parc-tab">
        <colgroup>
          <col class="orc-rec-c-data"><col class="orc-rec-c-data"><col>
          <col class="orc-rec-c-val"><col class="orc-rec-c-val"><col class="orc-rec-c-val">
        </colgroup>
        <thead><tr><th>Vencimento</th><th>Caixa</th><th>Reajustes do Focus</th><th class="is-right">Principal</th><th class="is-right">Reajuste</th><th class="is-right">Corrigido</th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="6">Nenhuma parcela no período.</td></tr>`}</tbody>
      </table>
    </td></tr>`;
  },

  toggleCliente(i) {
    this.novo.clienteAberto = this.novo.clienteAberto === i ? -1 : i;
    const box = document.getElementById("orc-rec-cli");
    if (box && this.novo.resultado) {
      box.innerHTML = this.clientesHtml(this.novo.resultado);
      if (window.lucide) window.lucide.createIcons();
    }
  },

  async montarReceita() {
    const st = this.novo;
    if (st.carregando) return;
    if (!st.companyId || !st.ccId) {
      st.erro = "Escolha a empresa e o centro de custo.";
      this.renderNovo();
      return;
    }
    if (!(st.anoAte >= st.anoDe)) {
      st.erro = "O ano final precisa ser igual ou posterior ao ano inicial.";
      this.renderNovo();
      return;
    }
    if (st.anoAte - st.anoDe > 15) {
      st.erro = "O período plurianual fica em até 16 anos.";
      this.renderNovo();
      return;
    }
    st.carregando = true;
    st.erro = "";
    st.resultado = null;
    st.progressoPct = 30;
    this.renderNovo();
    try {
      if (typeof window.loadSubjudiceIntegra === "function") await window.loadSubjudiceIntegra();
      this.pintarProgresso("Buscando o contas a receber do centro de custo…", 40);
      const linhas = await this.buscarExtrato(st.ccId, st.anoAte);
      this.pintarProgresso("Distribuindo a receita pelo PMP e pela repactuação…", 75);
      st.clienteAberto = -1;
      st.anoAberto = "";
      st.filtroCelula = null;
      st.resultado = await this.distribuirReceita(linhas, st.anoDe, st.anoAte);
      st.progressoPct = 100;
    } catch (e) {
      console.warn("[Orçamento] receita", e);
      st.erro = (e && e.message) ? e.message : "Não foi possível montar a receita deste centro de custo.";
    } finally {
      st.carregando = false;
      this.renderNovo();
    }
  },

  async buscarExtrato(ccId, anoAte) {
    const fim = anoAte + "-12-31";
    const path = (s, e) => "/bulk-data/v1/customer-extract-history?startDueDate=" + encodeURIComponent(s)
      + "&endDueDate=" + encodeURIComponent(e)
      + "&costCenterId=" + encodeURIComponent(ccId)
      + "&documentsId=CT&includeRemadeInstallments=false&includeCanceledInstallments=false&includeRevokedInstallments=false&includeRenegotiatedDischarge=false";
    const get = async (s, e, depth) => {
      try {
        return this.linhasExtrato(await window.siengeFetchWithRetry(path(s, e), 2));
      } catch (err) {
        if (Number(err && err.status) === 404) return [];
        const sy = Number(String(s).slice(0, 4));
        const ey = Number(String(e).slice(0, 4));
        if (Number(err && err.status) !== 507 || depth > 6 || ey - sy < 1) throw err;
        const mid = Math.floor((sy + ey) / 2);
        const esq = await get(s, mid + "-12-31", depth + 1);
        const dir = await get((mid + 1) + "-01-01", e, depth + 1);
        return esq.concat(dir);
      }
    };
    if (typeof window.siengeFetchWithRetry !== "function") throw new Error("A consulta ao Sienge não está disponível nesta tela.");
    return get("1996-01-01", fim, 0);
  },

  linhasExtrato(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.results)) return res.results;
    return [];
  },

  marcadoSubJudice(obj) {
    if (!obj) return false;
    const flag = (v) => (typeof window.valueIsSubjudice === "function")
      ? window.valueIsSubjudice(v)
      : (v === true || v === 1 || String(v || "").trim().toUpperCase() === "S");
    if (flag(obj.subjudice) || flag(obj.subJudice) || flag(obj.subJudicie) || flag(obj.underJudgment) || flag(obj.judgment)) return true;
    const sit = String(obj.defaulterSituation || obj.situation || obj.defaulterStatus || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return sit.indexOf("SUB") >= 0 && sit.indexOf("JUD") >= 0;
  },

  tituloSubJudiceIntegra(clienteId, titulo) {
    const sid = String(titulo || "").replace(/^B-/i, "").split("-")[0];
    if (!sid) return false;
    const bag = (window.subjudiceIntegraData && window.subjudiceIntegraData.clients) || {};
    const cid = String(clienteId || "");
    if (cid && bag[cid + "-" + sid] && bag[cid + "-" + sid].on !== false) return true;
    return Object.keys(bag).some((k) => {
      const item = bag[k];
      if (!item || item.on === false) return false;
      const id = String(item.saleId || "").replace(/^B-/i, "").split("-")[0];
      return id === sid;
    });
  },

  idTitulo(id) {
    const s = String(id == null ? "" : id).replace(/^B-/i, "").split("-")[0].trim();
    if (!s || s === "null" || s === "undefined") return "";
    return s;
  },

  normPessoa(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  },

  chaveLote(nome, unidade) {
    const n = this.normPessoa(nome);
    const u = this.normPessoa(unidade).replace(/^\d+\s*-\s*/, "");
    return n && u ? n + "|" + u : "";
  },

  carteiraSubJudice() {
    const bills = (window.AppState && window.AppState.defaultersBills) || [];
    const bag = (window.subjudiceIntegraData && window.subjudiceIntegraData.clients) || {};
    const stamp = [(window._subjudiceList || []).length, (window.rawClientList || []).length, bills.length, Object.keys(bag).length].join(":");
    if (this._sjStamp === stamp && this._sjIds) return this._sjIds;
    const ids = new Set();
    const lotes = new Set();
    const addId = (id) => {
      const s = this.idTitulo(id);
      if (s) ids.add(s);
    };
    const addCliente = (c) => {
      if (!c) return;
      const sienge = String(c.subjudice || "").toUpperCase() === "S"
        || (typeof window.clientIsSubjudice === "function" && window.clientIsSubjudice(c));
      const integra = typeof window.clientIsSubjudiceIntegra === "function" && window.clientIsSubjudiceIntegra(c);
      if (!sienge && !integra) return;
      addId(c.saleId);
      (c.billIds || []).forEach(addId);
      const lote = this.chaveLote(c.customerName, c.unitName);
      if (lote) lotes.add(lote);
    };
    [window._subjudiceList, window.rawClientList, window.clientList].forEach((lista) => {
      (lista || []).forEach(addCliente);
    });
    bills.forEach((b) => {
      if (this.marcadoSubJudice(b)) addId(b.id || b.receivableBillId || b.billReceivableId);
    });
    Object.keys(bag).forEach((k) => {
      const item = bag[k];
      if (!item || item.on === false) return;
      addId(item.saleId);
      addId(k.split("-").pop());
      const lote = this.chaveLote(item.customerName, item.unitName);
      if (lote) lotes.add(lote);
    });
    this._sjIds = ids;
    this._sjLotes = lotes;
    this._sjStamp = stamp;
    return ids;
  },

  ehSubJudice(bill, clienteId, titulo, nome, unidade) {
    if (this.marcadoSubJudice(bill)) return true;
    if (this.tituloSubJudiceIntegra(clienteId, titulo)) return true;
    const sid = this.idTitulo(titulo);
    if (sid && this.carteiraSubJudice().has(sid)) return true;
    const lote = this.chaveLote(nome, unidade);
    if (lote && this._sjLotes && this._sjLotes.has(lote)) return true;
    return false;
  },

  agruparTitulos(linhas) {
    const map = {};
    (linhas || []).forEach((row) => {
      const pai = row && row.customer && typeof row.customer === "object" ? row.customer : {};
      const paiId = String((row && (row.customerId || pai.id || row.clientId)) || "");
      const paiNome = (row && (row.clientName || row.customerName || pai.name)) || "";
      const nested = (row && (row.billsReceivable || row.bills)) || [];
      const bills = nested.length ? nested : [row];
      bills.forEach((bill) => {
        if (!bill) return;
        const tipo = String(bill.documentIdentificationId || bill.documentId || (bill.document && bill.document.id) || "").trim().toUpperCase();
        if (tipo && tipo !== "CT" && !/^\d+$/.test(tipo)) return;
        if (bill.revokedBillReceivableDate) return;
        const titulo = String(bill.billReceivableId || bill.receivableBillId || "").replace(/^B-/, "").split("-")[0];
        if (!titulo) return;
        const clienteObj = bill.customer && typeof bill.customer === "object" ? bill.customer : {};
        const clienteId = String(bill.customerId || clienteObj.id || bill.clientId || paiId || "");
        const nome = bill.clientName || bill.customerName || clienteObj.name || paiNome || "Cliente";
        const unidades = [];
        if (Array.isArray(bill.units)) {
          bill.units.forEach((u) => { if (u && (u.name || u.id)) unidades.push(u.name || u.id); });
        }
        if (!unidades.length && bill.unitName) unidades.push(bill.unitName);
        const atual = map[titulo] || (map[titulo] = {
          titulo,
          clienteId,
          cliente: nome,
          unidade: unidades.join(", "),
          emissao: "",
          parcelas: {},
          sub: false
        });
        if (!atual.clienteId && clienteId) atual.clienteId = clienteId;
        if (atual.cliente === "Cliente" && nome) atual.cliente = nome;
        if (!atual.unidade && unidades.length) atual.unidade = unidades.join(", ");
        const em = bill.emissionDate || bill.issueDate || bill.contractDate || bill.saleDate || "";
        if (!atual.emissao && em) atual.emissao = String(em).slice(0, 10);
        if (this.ehSubJudice(bill, atual.clienteId, titulo, atual.cliente, atual.unidade) || this.ehSubJudice(row, atual.clienteId, titulo, atual.cliente, atual.unidade)) atual.sub = true;
        const idx = this.lerIndexador(bill);
        if (idx && !this.ehReal(idx)) atual.indexador = idx;
        (bill.installments || []).forEach((p) => {
          if (!p) return;
          const due = String(p.dueDate || p.originalDueDate || "").slice(0, 10);
          const id = String(p.id || p.installmentId || due);
          const chave = id + "|" + due;
          const saldo = Number(p.currentBalance != null ? p.currentBalance : p.balanceDue) || 0;
          const slot = atual.parcelas[chave] || (atual.parcelas[chave] = { due, saldo: 0, receipts: [] });
          slot.saldo += saldo;
          (p.receipts || []).forEach((rc) => slot.receipts.push(rc));
          if (this.marcadoSubJudice(p)) atual.sub = true;
          const ip = this.lerIndexador(p);
          if (ip && !this.ehReal(ip)) atual.indexador = ip;
        });
      });
    });
    return Object.keys(map).map((k) => map[k]);
  },

  lerIndexador(obj) {
    if (!obj) return null;
    const nested = obj.indexer && typeof obj.indexer === "object" ? obj.indexer : null;
    let id = obj.indexerId || obj.indexadorId || obj.correctionIndexerId || (nested && (nested.id || nested.indexerId)) || "";
    let nome = obj.indexerName || obj.indexerDescription || (nested && (nested.name || nested.description)) || "";
    if (typeof obj.indexer === "string") nome = nome || obj.indexer;
    if (!id && nome) {
      const m = String(nome).match(/^\s*(\d{1,2})\s*[-–]/);
      if (m) id = m[1];
    }
    if (id === "" && id !== 0) return null;
    if (id == null || id === "") return null;
    return { id: String(id), nome: String(nome || "") };
  },

  ehReal(idx) {
    if (!idx) return true;
    const nome = String(idx.nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return String(idx.id) === "0" || nome === "REAL" || nome.indexOf("REAL") >= 0 && nome.indexOf("INCC") < 0 && nome.indexOf("IPCA") < 0 && nome.indexOf("IGP") < 0;
  },

  pmpTitulo(parcelas, hoje) {
    const corteData = new Date(hoje + "T12:00:00");
    corteData.setMonth(corteData.getMonth() - 3);
    const corte = corteData.getFullYear() + "-" + String(corteData.getMonth() + 1).padStart(2, "0") + "-" + String(corteData.getDate()).padStart(2, "0");
    let dias = 0;
    let n = 0;
    Object.keys(parcelas).forEach((k) => {
      const p = parcelas[k];
      (p.receipts || []).forEach((rc) => {
        if (typeof window.isWriteOffReceipt === "function" && window.isWriteOffReceipt(rc)) return;
        const tipo = String((rc && (rc.type || rc.receiptType || "")) || "").toLowerCase();
        if (tipo.indexOf("distrato") >= 0 || tipo.indexOf("cancel") >= 0) return;
        const pago = String((rc && (rc.date || rc.receiptDate || rc.paymentDate)) || "").slice(0, 10);
        if (!pago || pago < corte || !p.due) return;
        const diff = Math.round((new Date(pago + "T12:00:00") - new Date(p.due + "T12:00:00")) / 86400000);
        if (!Number.isFinite(diff)) return;
        dias += diff;
        n += 1;
      });
    });
    if (!n) return { conhecido: false, pmp: 0 };
    return { conhecido: true, pmp: Math.round(dias / n) };
  },

  async distribuirReceita(linhas, anoDe, anoAte) {
    const hoje = this.hojeIso();
    const ini = anoDe + "-01-01";
    const fim = anoAte + "-12-31";
    const titulos = this.agruparTitulos(linhas);
    const grade = {};
    const porAno = {};
    const subMes = {};
    const jurosMes = {};
    const zeros = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let y = anoDe; y <= anoAte; y++) {
      grade[String(y)] = zeros();
      subMes[String(y)] = zeros();
      jurosMes[String(y)] = zeros();
      porAno[String(y)] = { original: zeros(), repactuacao: zeros(), vence: zeros(), antes: zeros(), anosAntes: {} };
    }
    const clientes = [];
    let principal = 0;
    let reajuste = 0;
    let subJudice = 0;
    let subJudiceValor = 0;
    let fora = 0;
    let antes = 0;
    let total = 0;
    let somaParcelas = 0;
    let nParcelas = 0;
    const usos = {};
    for (let i = 0; i < titulos.length; i++) {
      const t = titulos[i];
      const saldoAberto = Object.keys(t.parcelas).reduce((s, k) => s + Math.max(0, t.parcelas[k].saldo), 0);
      if (t.sub && saldoAberto > 0.009) {
        subJudice += 1;
        subJudiceValor += saldoAberto;
      }
      if (!(saldoAberto > 0.009)) continue;
      const pmp = this.pmpTitulo(t.parcelas, hoje);
      const taxa = await this.taxaDoIndexador(t.indexador);
      if (taxa) usos[taxa.chave] = taxa;
      const pendente = await this.percentualPendente(taxa, t.emissao, hoje);
      const mm = t.emissao && t.emissao.length >= 7 ? t.emissao.slice(5, 7) : "";
      let doCliente = 0;
      let principalCliente = 0;
      let reajusteCliente = 0;
      const parcelasCliente = [];
      Object.keys(t.parcelas).forEach((k) => {
        const p = t.parcelas[k];
        if (!(p.saldo > 0.009) || !p.due) return;
        const anos = this.anosDeReajuste(t.emissao, p.due, hoje);
        const detalheAnos = [];
        let fator = 1;
        if (taxa) {
          anos.forEach((ano) => {
            const pct = pendente && ano === pendente.ano ? pendente.pct : this.percentualAno(taxa, ano);
            fator *= (1 + pct);
            detalheAnos.push({ ano: ano, pct: pct * 100 });
          });
        }
        const saldo = Math.round(p.saldo * 100) / 100;
        if (!t.sub) {
          somaParcelas += saldo;
          nParcelas += 1;
        }
        const valor = Math.round(saldo * fator * 100) / 100;
        const ajuste = Math.round((valor - saldo) * 100) / 100;
        const anoDue = String(p.due).slice(0, 4);
        let quando = this.addDias(p.due, pmp.pmp);
        if (!quando) return;
        if (quando < hoje) quando = hoje;
        if (quando < ini) {
          if (!t.sub) antes += valor;
          return;
        }
        if (quando > fim) {
          if (!t.sub) fora += valor;
          return;
        }
        const ano = quando.slice(0, 4);
        const mes = Number(quando.slice(5, 7)) - 1;
        if (!grade[ano] || mes < 0) return;
        if (t.sub) {
          subMes[ano][mes] += valor;
          return;
        }
        grade[ano][mes] += valor;
        jurosMes[ano][mes] += this.jurosAtivos(valor, pmp);
        porAno[ano].original[mes] += saldo;
        porAno[ano].repactuacao[mes] += ajuste;
        if (anoDue < ano) {
          porAno[ano].antes[mes] += saldo;
          porAno[ano].anosAntes[anoDue] = true;
        } else {
          porAno[ano].vence[mes] += saldo;
        }
        doCliente += valor;
        principalCliente += saldo;
        reajusteCliente += ajuste;
        principal += saldo;
        reajuste += ajuste;
        total += valor;
        parcelasCliente.push({
          due: p.due,
          quando,
          anos: detalheAnos,
          principal: saldo,
          reajuste: ajuste,
          valor
        });
      });
      if (doCliente > 0.009) {
        const prox = this.proximaRepactuacao(t.emissao, hoje);
        clientes.push({
          cliente: t.cliente,
          unidade: t.unidade,
          titulo: t.titulo,
          pmp: pmp.pmp,
          pmpConhecido: pmp.conhecido,
          repactuacao: prox ? (this.mesNome(Number(prox.slice(5, 7))) + "/" + prox.slice(0, 4) + (mm ? "" : "")) : (t.indexador ? "Sem data de venda" : "Sem reajuste"),
          indexador: taxa ? taxa.nome : (t.indexador ? t.indexador.nome || t.indexador.id : "REAL"),
          principal: principalCliente,
          reajuste: reajusteCliente,
          total: doCliente,
          parcelas: parcelasCliente.sort((a, b) => String(a.due).localeCompare(String(b.due)))
        });
      }
    }
    clientes.sort((a, b) => b.total - a.total);
    return {
      grade,
      porAno,
      subMes,
      jurosMes,
      clientes,
      total,
      principal,
      reajuste,
      fora,
      antes,
      subJudice,
      subJudiceValor,
      anoDe,
      anoAte,
      parcelaMedia: nParcelas ? Math.round((somaParcelas / nParcelas) * 100) / 100 : 0,
      parcelasMedia: nParcelas,
      indices: Object.keys(usos).map((k) => usos[k])
    };
  },

  textoReajusteHoje() {
    const hoje = this.hojeIso();
    const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const hm = Number(hoje.slice(5, 7));
    const faltam = [];
    for (let m = hm + 1; m <= 12; m++) faltam.push(nomes[m - 1]);
    const base = "Contas a receber do centro de custo, sem cliente sub judice. O vencimento anda o PMP. ";
    if (!faltam.length) return base + "O reajuste deste ano já está no saldo. O próximo aniversário usa o Focus daquele ano sobre o saldo já corrigido.";
    const quais = faltam.length === 1 ? faltam[0] : faltam.slice(0, -1).join(", ") + " e " + faltam[faltam.length - 1];
    return base + "Reajuste até " + nomes[hm - 1] + " já está no saldo. Contrato de " + quais + " ainda não rodou: esse ajuste entra na parcela e segue no ano seguinte. O aniversário depois disso usa o Focus do ano.";
  },

  jaNoSaldo(ano, mes, hoje) {
    const hy = Number(String(hoje).slice(0, 4));
    const hm = Number(String(hoje).slice(5, 7));
    if (ano < hy) return true;
    if (ano > hy) return false;
    return Number(mes) <= hm;
  },

  anosDeReajuste(emissao, due, hoje) {
    const em = String(emissao || "").slice(0, 10);
    const venc = String(due || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(em) || !/^\d{4}-\d{2}-\d{2}$/.test(venc)) return [];
    const mes = Number(em.slice(5, 7));
    const mm = em.slice(5, 7);
    const anoVenda = Number(em.slice(0, 4));
    const anos = [];
    for (let y = anoVenda + 1; y <= Number(venc.slice(0, 4)) + 1; y++) {
      const data = y + "-" + mm + "-01";
      if (this.jaNoSaldo(y, mes, hoje)) continue;
      if (data > venc) break;
      anos.push(y);
    }
    return anos;
  },

  aniversariosAte(emissao, due, hoje) {
    return this.anosDeReajuste(emissao, due, hoje).length;
  },

  proximaRepactuacao(emissao, hoje) {
    const em = String(emissao || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(em)) return "";
    const mes = Number(em.slice(5, 7));
    const hy = Number(String(hoje).slice(0, 4));
    const hm = Number(String(hoje).slice(5, 7));
    let y = mes <= hm ? hy + 1 : hy;
    if (y <= Number(em.slice(0, 4))) y = Number(em.slice(0, 4)) + 1;
    return y + "-" + em.slice(5, 7) + "-01";
  },

  async percentualPendente(taxa, emissao, hoje) {
    const em = String(emissao || "").slice(0, 10);
    if (!taxa || !/^\d{4}-\d{2}-\d{2}$/.test(em)) return null;
    const mes = Number(em.slice(5, 7));
    const hy = Number(String(hoje).slice(0, 4));
    const hm = Number(String(hoje).slice(5, 7));
    if (!(mes > hm)) return null;
    const chave = taxa.chave + "|" + em.slice(0, 7) + "|" + hy;
    if (this._pendente[chave] != null) return this._pendente[chave];
    const acumulado = await this.acumuladoContrato(taxa, em, hy);
    const pct = acumulado == null ? this.percentualAno(taxa, hy) : acumulado;
    const out = { ano: hy, pct: pct };
    this._pendente[chave] = out;
    return out;
  },

  async acumuladoContrato(taxa, emissao, ano) {
    const codigo = this.codigoBcb(taxa.nome);
    if (!codigo) return null;
    let serie;
    try {
      serie = await this.serieBcb(taxa.nome, codigo);
    } catch (e) {
      return null;
    }
    const retro = Number(taxa.retro) || 0;
    let baseM = Number(emissao.slice(5, 7)) + retro;
    let baseY = ano;
    while (baseM < 1) { baseM += 12; baseY -= 1; }
    while (baseM > 12) { baseM -= 12; baseY += 1; }
    const meses = [];
    let m = baseM;
    let y = baseY;
    for (let i = 0; i < 12; i++) {
      meses.push(y + "-" + String(m).padStart(2, "0"));
      m -= 1;
      if (m < 1) { m = 12; y -= 1; }
    }
    meses.reverse();
    const conhecidos = meses.map((k) => serie[k]).filter((n) => n != null && Number.isFinite(Number(n))).map(Number);
    if (!conhecidos.length) return null;
    const amostra = conhecidos.slice(-3);
    const media = amostra.reduce((s, n) => s + n, 0) / amostra.length;
    const proj = media > 0 ? media : 0;
    let acc = 1;
    meses.forEach((k) => {
      const r = serie[k] != null && Number.isFinite(Number(serie[k])) ? Number(serie[k]) : proj;
      acc *= (1 + r / 100);
    });
    return acc < 1 ? 0 : acc - 1;
  },

  resumoIndice(ix) {
    if (!ix) return "";
    if (ix.fallback) return ix.nome + " · anual recente " + this.pct((ix.anual || 0) * 100) + " em cada ano";
    const anos = Object.keys(ix.porAno || {}).map(Number).sort((a, b) => a - b);
    const lista = anos.map((y) => y + " " + this.pct(ix.porAno[y])).join(" · ");
    const data = ix.dataFocus ? ix.dataFocus.split("-").reverse().join("/") : "";
    return ix.nome + " · Focus" + (data ? " " + data : "") + " · " + lista;
  },

  textoIndice(ix) {
    if (!ix) return "";
    if (ix.fallback) {
      const mesesTxt = (ix.meses || []).map((m) => this.mesNome(Number(m.key.slice(5, 7))) + "/" + m.key.slice(0, 4) + " " + this.pct(m.rate)).join(", ");
      return ix.nome + ": o Focus não publica este indexador. Cada repactuação repete o anual recente de " + this.pct((ix.anual || 0) * 100) + ", calculado em " + mesesTxt + ". O percentual do ano entra sobre o valor já corrigido.";
    }
    const anos = Object.keys(ix.porAno || {}).map(Number).sort((a, b) => a - b);
    const lista = anos.map((y) => y + " " + this.pct(ix.porAno[y])).join(", ");
    const data = ix.dataFocus ? ix.dataFocus.split("-").reverse().join("/") : "";
    return ix.nome + ": Boletim Focus" + (data ? " de " + data : "") + ". " + lista + ". Em cada aniversário entra o percentual daquele ano, sobre o valor já corrigido. Previsão negativa não reduz a parcela. Ano sem previsão repete a última publicada.";
  },

  fatorAcumulado(taxa, anos) {
    let fator = 1;
    (anos || []).forEach((ano) => { fator *= (1 + this.percentualAno(taxa, ano)); });
    return fator;
  },

  percentualAno(taxa, ano) {
    if (!taxa) return 0;
    if (taxa.fallback) return Math.max(0, Number(taxa.anual) || 0);
    const por = taxa.porAno || {};
    let bruto = por[ano];
    if (bruto == null) {
      const anteriores = Object.keys(por).map(Number).filter((y) => y <= ano).sort((a, b) => b - a);
      if (anteriores.length) bruto = por[anteriores[0]];
      else {
        const todos = Object.keys(por).map(Number).sort((a, b) => a - b);
        bruto = todos.length ? por[todos[todos.length - 1]] : 0;
      }
    }
    const n = Number(bruto) || 0;
    return n < 0 ? 0 : n / 100;
  },

  async taxaDoIndexador(idx) {
    if (!idx || this.ehReal(idx)) return null;
    const cat = await this.catalogoIndexadores();
    const det = cat.find((i) => String(i.id) === String(idx.id))
      || cat.find((i) => idx.nome && String(i.name || "").toUpperCase() === String(idx.nome).toUpperCase());
    const nome = (det && det.name) || idx.nome || ("Indexador " + idx.id);
    const indicador = this.focusIndicador(nome);
    if (indicador) {
      try {
        const focus = await this.previsaoFocus(indicador);
        const anosPub = focus ? Object.keys(focus.porAno || {}).map(Number) : [];
        const ultimo = anosPub.length ? Math.max.apply(null, anosPub) : 0;
        const anoHoje = Number(this.hojeIso().slice(0, 4));
        if (focus && anosPub.length && ultimo >= anoHoje) {
          return {
            chave: indicador,
            nome,
            retro: Number(det && det.revenueRetroactivity) || 0,
            porAno: focus.porAno,
            dataFocus: focus.data,
            fallback: false
          };
        }
      } catch (e) { /* segue para o anual recente */ }
    }
    const codigo = this.codigoBcb(nome);
    if (!codigo) return null;
    let serie;
    try {
      serie = await this.serieBcb(nome, codigo);
    } catch (e) {
      return null;
    }
    const meses = this.ultimosMeses(serie, 3);
    if (!meses.length) return null;
    let prod = 1;
    meses.forEach((m) => { prod *= (1 + m.rate / 100); });
    const anualBruto = Math.pow(prod, 12 / meses.length) - 1;
    return {
      chave: "bcb-" + codigo,
      nome,
      retro: Number(det && det.revenueRetroactivity) || 0,
      fallback: true,
      meses,
      anual: anualBruto < 0 ? 0 : anualBruto
    };
  },

  focusIndicador(nome) {
    const n = String(nome || "").toUpperCase();
    const mapa = [
      ["INCC-DI", "INCC"],
      ["INCC-M", "INCC"],
      ["INCC", "INCC"],
      ["IGP-DI", "IGP-DI"],
      ["IPC-DI", "IGP-DI"],
      ["IGP-M", "IGP-M"],
      ["IGPM", "IGP-M"],
      ["INPC", "INPC"],
      ["IPCA", "IPCA"]
    ];
    for (let i = 0; i < mapa.length; i++) {
      if (n === mapa[i][0] || n.indexOf(mapa[i][0]) >= 0) return mapa[i][1];
    }
    return "";
  },

  async previsaoFocus(indicador) {
    if (this._focus[indicador]) return this._focus[indicador];
    const filtro = "Indicador eq '" + indicador + "' and baseCalculo eq 0";
    const url = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais"
      + "?$top=40&$orderby=Data desc&$select=Indicador,Data,DataReferencia,Mediana&$format=json&$filter="
      + encodeURIComponent(filtro);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Não foi possível ler o Boletim Focus de " + indicador + ".");
    const json = await resp.json();
    const rows = (json && json.value) || [];
    if (!rows.length) {
      this._focus[indicador] = null;
      return null;
    }
    const data = String(rows[0].Data || "");
    const porAno = {};
    rows.forEach((r) => {
      if (String(r.Data || "") !== data) return;
      const y = Number(r.DataReferencia);
      const m = Number(r.Mediana);
      if (y && Number.isFinite(m)) porAno[y] = m;
    });
    const out = { indicador, data, porAno };
    this._focus[indicador] = out;
    return out;
  },

  codigoBcb(nome) {
    const n = String(nome || "").toUpperCase();
    const chaves = Object.keys(this.bcbSeries).sort((a, b) => b.length - a.length);
    for (let i = 0; i < chaves.length; i++) {
      if (n === chaves[i] || n.indexOf(chaves[i]) >= 0) return this.bcbSeries[chaves[i]];
    }
    return null;
  },

  async catalogoIndexadores() {
    if (this._indexadores) return this._indexadores;
    if (window.IndexadoresState && Array.isArray(IndexadoresState.allSiengeIndexers) && IndexadoresState.allSiengeIndexers.length) {
      this._indexadores = IndexadoresState.allSiengeIndexers;
      return this._indexadores;
    }
    const res = await window.siengeFetchWithRetry("/indexers?limit=200", 1);
    this._indexadores = (res && (res.results || res.data)) || [];
    return this._indexadores;
  },

  async serieBcb(nome, codigo) {
    if (this._bcb[codigo]) return this._bcb[codigo];
    if (window.IndexadoresState && IndexadoresState.bcbData && IndexadoresState.bcbData[nome]) {
      this._bcb[codigo] = this.taxasDeBcb(IndexadoresState.bcbData[nome]);
      return this._bcb[codigo];
    }
    const resp = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs." + codigo + "/dados?formato=json");
    if (!resp.ok) throw new Error("Não foi possível ler o indexador " + nome + " no Banco Central.");
    const json = await resp.json();
    this._bcb[codigo] = this.taxasDeBcb(json);
    return this._bcb[codigo];
  },

  taxasDeBcb(lista) {
    const map = {};
    (lista || []).forEach((d) => {
      const partes = String(d.data || "").split("/");
      if (partes.length !== 3) return;
      const n = parseFloat(String(d.valor).replace(",", "."));
      if (!Number.isFinite(n)) return;
      map[partes[2] + "-" + partes[1]] = n;
    });
    return map;
  },

  ultimosMeses(taxas, qtd) {
    const hoje = new Date();
    let y = hoje.getFullYear();
    let m = hoje.getMonth();
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const achados = [];
    for (let i = 0; i < 24 && achados.length < qtd; i++) {
      const chave = y + "-" + String(m).padStart(2, "0");
      if (taxas[chave] != null) achados.push({ key: chave, rate: taxas[chave] });
      m -= 1;
      if (m < 1) { m = 12; y -= 1; }
    }
    achados.reverse();
    return achados;
  }
};

window.OrcamentoModuloApp = OrcamentoModuloApp;
