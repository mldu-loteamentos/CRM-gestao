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
    updatedAt: 0,
    busca: "",
    rascunho: null,
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

  aplicar(data) {
    if (!data || typeof data !== "object") return;
    this.state.empresas = data.empresas && typeof data.empresas === "object" ? data.empresas : {};
    this.state.lancados = data.lancados && typeof data.lancados === "object" ? data.lancados : {};
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

  async salvar() {
    this.lerFormulario();
    const id = this.state.empresaId;
    const r = this.state.rascunho || {};
    if (!id) {
      this.state.erro = "Escolha a empresa.";
      this.render();
      return;
    }
    const evento = parseInt(String(r.evento || "").trim(), 10);
    if (!r.lucro || !r.prejuizo || !r.ajuste || !evento) {
      this.state.erro = "Informe a conta de lucro, a de prejuízo, a de ajuste MEP e a partida.";
      this.render();
      return;
    }
    const nomeDe = (codigo) => {
      const c = (this.state.contas || []).find((item) => item.codigo === codigo);
      return c ? c.nome : "";
    };
    const emp = (this.state.companies || []).find((c) => c.id === id);
    if (!this.state.empresas) this.state.empresas = {};
    this.state.empresas[id] = {
      lucro: r.lucro,
      lucroNome: nomeDe(r.lucro),
      prejuizo: r.prejuizo,
      prejuizoNome: nomeDe(r.prejuizo),
      ajuste: r.ajuste,
      ajusteNome: nomeDe(r.ajuste),
      evento: evento,
      nome: emp ? emp.nome : "",
      updatedAt: Date.now()
    };
    this.state.erro = "";
    try {
      const nuvem = await this.persistir();
      this.state.msg = nuvem
        ? "Parametrização salva."
        : "Salvei neste navegador. A nuvem não respondeu, então outro computador ainda não vê essa conta.";
    } catch (e) {
      this.state.msg = "Salvei neste navegador. A nuvem não respondeu, então outro computador ainda não vê essa conta.";
    }
    this.render();
  },

  usarPartida(valor) {
    const campo = document.getElementById("ctb-eq-evento");
    if (campo) campo.value = String(valor);
    this.lerFormulario();
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
    const cfg = this.cfgDa(this.state.empresaId);
    if (!cfg) return false;
    return [cfg.lucro, cfg.prejuizo, cfg.ajuste].some((c) => c && (item.debit === c || item.credit === c));
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

  render() {
    const root = document.getElementById("contabil-config-root");
    if (!root) return;
    const s = this.state;
    const cfg = this.cfgDa(s.empresaId) || {};
    const lucro = this.valorCampo("lucro", cfg.lucro);
    const prejuizo = this.valorCampo("prejuizo", cfg.prejuizo);
    const ajuste = this.valorCampo("ajuste", cfg.ajuste);
    const evento = this.valorCampo("evento", cfg.evento ? String(cfg.evento) : "");
    const empresas = (s.companies || []).map((c) => {
      const ok = this.cfgDa(c.id);
      return '<option value="' + this.esc(c.id) + '"' + (c.id === s.empresaId ? " selected" : "") + ">" + this.esc(c.id + " - " + c.nome + (ok ? " · parametrizada" : "")) + "</option>";
    }).join("");
    const busca = String(s.busca || "").toUpperCase();
    const linhas = (s.contas || []).map((c) => {
      const blob = (c.codigo + " " + c.nome).toUpperCase();
      const esconde = busca && blob.indexOf(busca) < 0 ? ' style="display:none"' : "";
      return '<tr data-nome="' + this.esc(blob) + '"' + esconde + "><td>" + this.esc(c.codigo) + "</td><td>" + this.esc(c.nome) + "</td></tr>";
    }).join("");
    const app = window.ContabilApp;
    const lanca = (s.lancamentos || []).map((item) => {
      const quando = app && app.dataBr ? app.dataBr(item.date) : item.date;
      const valor = app && app.money ? app.money(item.amount) : String(item.amount);
      const partida = item.eventId !== "" && item.eventId != null
        ? '<button type="button" class="ctb-link" data-partida="' + this.esc(item.eventId) + '" onclick="ContabilEquiv.usarPartida(this.getAttribute(\'data-partida\'))">' + this.esc(item.eventId) + "</button>"
        : "—";
      return "<tr><td>" + this.esc(quando) + "</td><td class=\"ctb-num\">" + this.esc(valor) + "</td><td>" + this.esc(item.debit) + "</td><td>" + this.esc(item.credit) + "</td><td>" + this.esc(item.description) + "</td><td>" + partida + "</td></tr>";
    }).join("");
    const espera = (s.lendo || s.lendoLanc) ? `<div class="ml-load">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-status-text">${s.lendoLanc ? "Lendo os lançamentos de equivalência…" : "Lendo o plano de contas…"}</div>
        <div class="ml-load-track"><div class="loading-progress-bar" style="width:${Math.max(8, s.progresso || 30)}%"></div></div>
      </div>` : "";
    root.innerHTML = `<style>
      #contabil-config-root .ctb-nota { color:#64748b; font-size:0.84rem; margin:4px 0 14px; max-width:820px; }
      #contabil-config-root .ctb-erro { color:#b91c1c; font-size:0.84rem; margin:0 0 12px; }
      #contabil-config-root .ctb-ok { color:#105436; font-size:0.84rem; font-weight:700; margin:0 0 12px; }
      #contabil-config-root .ctb-grade { display:flex; flex-wrap:wrap; gap:12px 16px; align-items:flex-end; margin:0 0 14px; }
      #contabil-config-root .ctb-campo { display:flex; flex-direction:column; gap:4px; min-width:220px; }
      #contabil-config-root .ctb-campo label { font-size:0.72rem; letter-spacing:0.04em; text-transform:uppercase; color:#64748b; font-weight:700; }
      #contabil-config-root select, #contabil-config-root input[type="text"], #contabil-config-root input[type="number"] {
        height:38px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; padding:0 10px; color:#0f172a; min-width:220px;
      }
      #contabil-config-root .ctb-buscar { height:38px; padding:0 16px; border:0; border-radius:8px; background:#105436; color:#fff; font-weight:700; cursor:pointer; }
      #contabil-config-root .ctb-buscar:disabled { opacity:0.6; cursor:wait; }
      #contabil-config-root .ctb-table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; margin:0 0 16px; }
      #contabil-config-root .ctb-table th { text-align:left; font-size:0.72rem; letter-spacing:0.04em; text-transform:uppercase; color:#64748b; padding:10px 12px; border-bottom:1px solid #e2e8f0; }
      #contabil-config-root .ctb-table td { padding:7px 12px; border-bottom:1px solid #f1f5f9; color:#0f172a; }
      #contabil-config-root .ctb-num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
      #contabil-config-root .ctb-link { border:0; background:transparent; color:#105436; font-weight:700; cursor:pointer; padding:0; }
    </style>
    <p class="ctb-nota">Cada empresa tem a própria conta de lucro, a de prejuízo e a de ajuste MEP. No lucro, o ajuste entra no débito e a receita no crédito. No prejuízo, a perda entra no débito e o ajuste no crédito. O histórico sai como Lote equivalencia MM-AA, no último dia do mês. A partida é o código que o Sienge exige nesse lançamento.</p>
    <div class="ctb-grade">
      <div class="ctb-campo">
        <label for="ctb-eq-emp">Empresa</label>
        <select id="ctb-eq-emp" onchange="ContabilEquiv.setEmpresa(this.value)">
          <option value="">Selecione</option>
          ${empresas}
        </select>
      </div>
      <button type="button" class="ctb-buscar" ${s.lendo ? "disabled" : ""} onclick="ContabilEquiv.verContas()">Ver contas</button>
      <button type="button" class="ctb-buscar" ${s.lendoLanc ? "disabled" : ""} onclick="ContabilEquiv.verLancamentos()">Ver lançamentos</button>
    </div>
    ${s.erro ? `<p class="ctb-erro">${this.esc(s.erro)}</p>` : ""}
    ${s.msg ? `<p class="ctb-ok">${this.esc(s.msg)}</p>` : ""}
    ${espera}
    ${s.contas.length ? `<div class="ctb-campo" style="margin-bottom:8px;max-width:320px;">
      <label for="ctb-eq-busca">Filtrar contas</label>
      <input type="text" id="ctb-eq-busca" value="${this.esc(s.busca)}" oninput="ContabilEquiv.filtrar(this.value)" placeholder="Código ou nome">
    </div>
    <table class="ctb-table"><thead><tr><th>Código</th><th>Conta</th></tr></thead><tbody>${linhas}</tbody></table>` : ""}
    <div class="ctb-grade">
      <div class="ctb-campo" style="min-width:280px;flex:1;">
        <label for="ctb-eq-lucro">Conta de lucro</label>
        <select id="ctb-eq-lucro">${this.opcoes(lucro)}</select>
      </div>
      <div class="ctb-campo" style="min-width:280px;flex:1;">
        <label for="ctb-eq-prej">Conta de prejuízo</label>
        <select id="ctb-eq-prej">${this.opcoes(prejuizo)}</select>
      </div>
      <div class="ctb-campo" style="min-width:280px;flex:1;">
        <label for="ctb-eq-ajuste">Conta de ajuste MEP</label>
        <select id="ctb-eq-ajuste">${this.opcoes(ajuste)}</select>
      </div>
      <div class="ctb-campo" style="min-width:140px;">
        <label for="ctb-eq-evento">Partida</label>
        <input type="number" id="ctb-eq-evento" min="1" step="1" value="${this.esc(evento)}">
      </div>
      <button type="button" class="ctb-buscar" onclick="ContabilEquiv.salvar()">Salvar</button>
    </div>
    <div class="ctb-grade">
      <div class="ctb-campo">
        <label for="ctb-eq-codigo">Outra conta, pelo código</label>
        <input type="text" id="ctb-eq-codigo" placeholder="4.1.03.01.001">
      </div>
      <button type="button" class="ctb-buscar" onclick="ContabilEquiv.incluirCodigo()">Incluir</button>
    </div>
    ${lanca ? `<table class="ctb-table"><thead><tr><th>Data</th><th>Valor</th><th>Débito</th><th>Crédito</th><th>Histórico</th><th>Partida</th></tr></thead><tbody>${lanca}</tbody></table>
    <p class="ctb-nota">A partida do lançamento antigo preenche o campo quando você clica no número.</p>` : ""}`;
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

  montarPlano(app) {
    const s = app.state;
    const janela = s.janela;
    const empresas = app.empresasEscolhidas();
    if (!empresas.length) return { erro: "Escolha a empresa no DRE antes de lançar." };
    if (!janela || !s.porEmpresa) return { erro: "Busque o DRE antes de lançar a equivalência." };
    const meses = this.mesesDe(app, janela);
    const linhas = [];
    const faltas = [];
    const pulos = [];
    const vistos = {};
    empresas.forEach((emp) => {
      const bloco = s.porEmpresa[String(emp.id)] || s.porEmpresa[emp.id];
      if (!bloco || !bloco.porMes) return;
      const serie = app.montarSerie(janela, bloco.porMes);
      const cfg = this.cfgDa(emp.id);
      const pronta = cfg && cfg.lucro && cfg.prejuizo && cfg.ajuste && Number(cfg.evento) > 0;
      const nome = emp.id + " - " + emp.nome;
      meses.forEach((mes) => {
        const valor = Math.round(((serie.contas || []).filter((c) => c.grupo === "equiv").reduce((soma, c) => soma + (Number(c.por[mes.chave]) || 0), 0)) * 100) / 100;
        if (Math.abs(valor) < 0.01) return;
        if (this.jaLancado(emp.id, mes.chave)) {
          pulos.push(nome + " · " + mes.rotulo);
          return;
        }
        if (!pronta) {
          if (!vistos[emp.id]) { vistos[emp.id] = true; faltas.push(nome); }
          return;
        }
        const lucro = valor > 0;
        linhas.push({
          companyId: Number(emp.id),
          empresa: nome,
          chave: mes.chave,
          rotulo: mes.rotulo,
          date: mes.fim,
          amount: Math.round(Math.abs(valor) * 100) / 100,
          tipo: lucro ? "lucro" : "prejuízo",
          debitAccountId: lucro ? cfg.ajuste : cfg.prejuizo,
          creditAccountId: lucro ? cfg.lucro : cfg.ajuste,
          eventId: Number(cfg.evento),
          description: this.hist(mes.chave)
        });
      });
    });
    if (!linhas.length && faltas.length) {
      return { erro: "Falta parametrizar a conta de lucro, a de prejuízo, a de ajuste MEP e a partida em Contábil > Configurações:\n" + faltas.join("\n") };
    }
    if (!linhas.length && pulos.length) return { erro: "Esses meses já foram lançados:\n" + pulos.join("\n") };
    if (!linhas.length) return { erro: "Nesse período a equivalência não deu lucro nem prejuízo." };
    const texto = [
      "Vou lançar no Sienge, em reais, um lote por mês. A linha 50% Eq. MLDU não entra.",
      ""
    ].concat(linhas.map((l) => l.empresa + " · " + l.rotulo + " · " + l.tipo + " · " + app.money(l.amount) + "\nDébito " + l.debitAccountId + " · Crédito " + l.creditAccountId + " · " + app.dataBr(l.date) + " · partida " + l.eventId));
    if (faltas.length) texto.push("", "Sem parametrização, não lanço:", faltas.join("\n"));
    if (pulos.length) texto.push("", "Já lançado, não repito:", pulos.join("\n"));
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
    this.state.lancados[String(linha.companyId) + "@" + linha.chave] = {
      em: Date.now(),
      valor: linha.amount,
      tipo: linha.tipo,
      msg: msg
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
    return "Equivalência " + linha.tipo + " da empresa " + linha.empresa + " em " + linha.rotulo + ": " + app.money(linha.amount) + " · débito " + linha.debitAccountId + " · crédito " + linha.creditAccountId + " · " + msg;
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

  async lancar() {
    if (!this.podeLancar()) {
      alert("Sem permissão para lançar a equivalência.");
      return;
    }
    const app = window.ContabilApp;
    if (!app || !app.state || app.state.lancando) return;
    if (!app.state.buscou || !app.state.porEmpresa) {
      alert("Busque o DRE antes de lançar a equivalência.");
      return;
    }
    await this.garantirConfig();
    const plano = this.montarPlano(app);
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
