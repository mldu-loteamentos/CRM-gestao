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
    aba: "receita",
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
    anoAberto: ""
  },

  _bcb: {},
  _focus: {},
  _indexadores: null,

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
    root.innerHTML = `
      <div class="ml-tabs orc-novo-tabs" role="tablist">
        <button type="button" role="tab" class="ml-tab is-active" aria-selected="true">
          <i data-lucide="trending-up"></i> Receita
        </button>
      </div>
      <p class="orc-rec-lead">Contas a receber do centro de custo, sem cliente sub judice. O vencimento anda o PMP. Cada aniversário aplica o Focus daquele ano sobre o saldo já corrigido.</p>
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
      </div>
      ${st.erro ? `<div style="margin:0 0 12px;padding:12px 14px;border-radius:8px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;">${this.esc(st.erro)}</div>` : ""}
      <div id="orc-receita-corpo">${st.carregando ? this.carregandoHtml() : this.resultadoHtml()}</div>`;
    this.bindFiltros();
    if (window.lucide) window.lucide.createIcons();
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
    if (corpo && !st.carregando) corpo.innerHTML = this.resultadoHtml();
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
    return `
      <div class="orc-rec-kpis">
        <div class="crm-card orc-rec-kpi"><span>Receita no período</span><strong>${this.esc(this.dinheiro(r.total))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Principal</span><strong>${this.esc(this.dinheiro(r.principal || 0))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Reajuste</span><strong class="orc-rec-reaj">${this.esc(this.dinheiro(r.reajuste || 0))}</strong></div>
        <div class="crm-card orc-rec-kpi"><span>Clientes</span><strong>${r.clientes.length}</strong></div>
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

  celNum(v, extra) {
    const n = Number(v) || 0;
    const cls = "is-right" + (extra ? " " + extra : "");
    return `<td class="${cls}">${n > 0.009 ? this.esc(this.numero(n)) : "—"}</td>`;
  },

  jurosAtivos(valor, pmp) {
    const dias = pmp && pmp.conhecido ? Number(pmp.pmp) || 0 : 0;
    if (!(dias > 0) || !(valor > 0)) return 0;
    const multa = valor * 0.02;
    const juros = valor * 0.01 * (dias / 30);
    return Math.round((multa + juros) * 100) / 100;
  },

  linhaConta(rotulo, nota, valores, trClass, extra) {
    const lista = valores || [];
    const soma = lista.reduce((s, v) => s + (Number(v) || 0), 0);
    return `<tr class="orc-rec-det${trClass ? " " + trClass : ""}">
      <td class="orc-rec-ano-nome">${this.esc(rotulo)}${nota ? `<small>${this.esc(nota)}</small>` : ""}</td>
      ${lista.map((v) => this.celNum(v, extra)).join("")}
      ${this.celNum(soma, extra)}
    </tr>`;
  },

  gradeAnosHtml(r) {
    const anos = Object.keys((r && r.grade) || {}).sort();
    const linhas = anos.map((ano) => {
      const cel = r.grade[ano] || [];
      const total = cel.reduce((s, v) => s + (Number(v) || 0), 0);
      const aberto = this.novo.anoAberto === String(ano);
      const parte = (r.porAno && r.porAno[ano]) || {};
      const ico = aberto ? "chevron-down" : "chevron-right";
      const cabeca = `<tr class="orc-rec-ano" onclick="OrcamentoModuloApp.toggleAno('${ano}')">
        <td class="orc-rec-ano-nome"><i data-lucide="${ico}"></i>${this.esc(ano)}<small>1.01.01.01</small></td>
        ${cel.map((v) => this.celNum(v)).join("")}
        ${this.celNum(total)}
      </tr>`;
      if (!aberto) return cabeca;
      if (!Array.isArray(parte.original)) {
        return cabeca + `<tr class="orc-rec-det"><td colspan="14">Monte a receita de novo para ver o mês a mês.</td></tr>`;
      }
      const sub = (r.subMes && r.subMes[ano]) || [];
      const juros = (r.jurosMes && r.jurosMes[ano]) || [];
      return cabeca
        + this.linhaConta("Original", "", parte.original, "", "")
        + this.linhaConta("Reajuste", "", parte.repactuacao, "is-reaj", "orc-rec-reaj")
        + this.linhaConta("Sub judice", "não soma", sub, "is-sj", "")
        + this.linhaConta("1.01.01.01", "Venda de lotes", cel, "is-conta", "")
        + this.linhaConta("1.03.01.02", "Juros ativos", juros, "is-juros", "");
    }).join("");
    const totaisMes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => anos.reduce((s, ano) => s + ((r.grade[ano] && r.grade[ano][i]) || 0), 0));
    const rodape = `<tr class="orc-rec-total"><td>Total</td>${totaisMes.map((v) => this.celNum(v)).join("")}${this.celNum(r.total)}</tr>`;
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

  clientesHtml(r) {
    const lista = (r && r.clientes) || [];
    if (!lista.length) return `<tr><td colspan="9" style="color:#64748b;">Nenhuma parcela em aberto entrou no período.</td></tr>`;
    let principal = 0;
    let reajuste = 0;
    let total = 0;
    const linhas = lista.map((c, i) => {
      principal += Number(c.principal) || 0;
      reajuste += Number(c.reajuste) || 0;
      total += Number(c.total) || 0;
      const aberto = this.novo.clienteAberto === i;
      const detalhe = aberto ? this.parcelasHtml(c) : "";
      return `<tr class="orc-rec-cli" onclick="OrcamentoModuloApp.toggleCliente(${i})">
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

  ehSubJudice(bill, clienteId, titulo) {
    const flag = (v) => (typeof window.valueIsSubjudice === "function")
      ? window.valueIsSubjudice(v)
      : (v === true || v === 1 || String(v || "").trim().toUpperCase() === "S");
    if (flag(bill.subjudice) || flag(bill.subJudicie) || flag(bill.underJudgment) || flag(bill.judgment)) return true;
    const sit = String(bill.defaulterSituation || bill.situation || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (sit.indexOf("SUB") >= 0 && sit.indexOf("JUD") >= 0) return true;
    const cliente = { customerId: clienteId, saleId: titulo, billIds: titulo ? [titulo] : [], subjudice: "N" };
    if (typeof window.clientIsSubjudiceIntegra === "function" && window.clientIsSubjudiceIntegra(cliente)) return true;
    const lista = window.rawClientList || window.clientList || [];
    const row = lista.find((c) => {
      if (!c) return false;
      const ids = []
        .concat(c.billIds || [])
        .concat(c.saleId ? [c.saleId] : []);
      return ids.some((id) => String(id).replace(/^B-/i, "").split("-")[0] === String(titulo));
    });
    if (row && typeof window.clientIsSubjudice === "function" && window.clientIsSubjudice(row)) return true;
    if (row && typeof window.clientIsSubjudiceIntegra === "function" && window.clientIsSubjudiceIntegra(row)) return true;
    return false;
  },

  agruparTitulos(linhas) {
    const map = {};
    (linhas || []).forEach((row) => {
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
        const clienteId = String(bill.customerId || clienteObj.id || bill.clientId || "");
        const nome = bill.clientName || bill.customerName || clienteObj.name || "Cliente";
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
        if (this.ehSubJudice(bill, atual.clienteId, titulo)) atual.sub = true;
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
      porAno[String(y)] = { original: zeros(), repactuacao: zeros() };
    }
    const clientes = [];
    let principal = 0;
    let reajuste = 0;
    let subJudice = 0;
    let subJudiceValor = 0;
    let fora = 0;
    let antes = 0;
    let total = 0;
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
      const mm = t.emissao && t.emissao.length >= 7 ? t.emissao.slice(5, 7) : "";
      let doCliente = 0;
      let principalCliente = 0;
      let reajusteCliente = 0;
      const parcelasCliente = [];
      Object.keys(t.parcelas).forEach((k) => {
        const p = t.parcelas[k];
        if (!(p.saldo > 0.009) || !p.due) return;
        const anos = this.anosDeReajuste(t.emissao, p.due, hoje);
        const fator = taxa ? this.fatorAcumulado(taxa, anos) : 1;
        const saldo = Math.round(p.saldo * 100) / 100;
        const valor = Math.round(saldo * fator * 100) / 100;
        const ajuste = Math.round((valor - saldo) * 100) / 100;
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
        doCliente += valor;
        principalCliente += saldo;
        reajusteCliente += ajuste;
        principal += saldo;
        reajuste += ajuste;
        total += valor;
        parcelasCliente.push({
          due: p.due,
          quando,
          anos: anos.map((y) => ({ ano: y, pct: taxa ? this.percentualAno(taxa, y) * 100 : 0 })),
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
      indices: Object.keys(usos).map((k) => usos[k])
    };
  },

  anosDeReajuste(emissao, due, hoje) {
    const em = String(emissao || "").slice(0, 10);
    const venc = String(due || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(em) || !/^\d{4}-\d{2}-\d{2}$/.test(venc)) return [];
    const mm = em.slice(5, 7);
    const anoVenda = Number(em.slice(0, 4));
    const anos = [];
    for (let y = anoVenda + 1; y <= Number(venc.slice(0, 4)) + 1; y++) {
      const data = y + "-" + mm + "-01";
      if (data < hoje) continue;
      if (data > venc) break;
      anos.push(y);
    }
    return anos;
  },

  aniversariosAte(emissao, due, hoje) {
    const em = String(emissao || "").slice(0, 10);
    const venc = String(due || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(em) || !/^\d{4}-\d{2}-\d{2}$/.test(venc)) return 0;
    const mm = em.slice(5, 7);
    const anoVenda = Number(em.slice(0, 4));
    let n = 0;
    for (let y = anoVenda + 1; y <= Number(venc.slice(0, 4)) + 1; y++) {
      const data = y + "-" + mm + "-01";
      if (data < hoje) continue;
      if (data > venc) break;
      n += 1;
    }
    return n;
  },

  proximaRepactuacao(emissao, hoje) {
    const em = String(emissao || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(em)) return "";
    const mm = em.slice(5, 7);
    let y = Number(hoje.slice(0, 4));
    let data = y + "-" + mm + "-01";
    if (data < hoje) data = (y + 1) + "-" + mm + "-01";
    if (Number(data.slice(0, 4)) <= Number(em.slice(0, 4))) return (Number(em.slice(0, 4)) + 1) + "-" + mm + "-01";
    return data;
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
        if (focus && Object.keys(focus.porAno).length) {
          return {
            chave: indicador,
            nome,
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
