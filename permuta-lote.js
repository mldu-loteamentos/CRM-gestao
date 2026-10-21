/* Permuta de lote — Gestão do cliente. Cliente adimplente, lote ativo, mesmo empreendimento. */
const PermutaState = {
  tab: "condicoes",
  loading: true,
  gerando: false,
  ctx: null,
  customer: null,
  contract: {},
  unit: {},
  empName: "",
  quadraLote: "",
  titulo: "",
  dataVenda: "",
  recente: false,
  preamble: "",
  condicoes: [],
  juros: 0,
  indexador: "REAL",
  qtdPagas: 0,
  qtdAbertas: 0,
  valorParcelaAberta: 0,
  primeiroVencAberto: "",
  saldoAberto: 0,
  valorPago: 0,
  valorContrato: 0,
  unidades: [],
  unidadesErro: "",
  unidadesCarregando: false,
  unidadeId: "",
  pagamento: [],
  pagamentoDe: "",
  jurosNovo: "",
  indexadorNovo: "",
  valorLote: 0,
  empresaNome: "",
  indexadores: [],
  tiposBoleto: [],
  tiposProntos: false,
  testemunha1: "",
  testemunha2: ""
};

const PermutaApp = {
  esc(s) { return window.CessaoApp ? CessaoApp.esc(s) : String(s == null ? "" : s); },

  money(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  parseValor(raw) {
    return window.CessaoPopup ? CessaoPopup.parseValor(raw) : (Number(raw) || 0);
  },

  ordem() {
    return ["condicoes", "lote", "pagamento", "testemunhas"];
  },

  unidadeEscolhida() {
    return (PermutaState.unidades || []).find((u) => String(u.id) === String(PermutaState.unidadeId)) || null;
  },

  async abrir(ctx) {
    ctx = ctx || {};
    if (!window.CessaoPopup || typeof CessaoPopup.carregar !== "function") {
      alert("A tela de permuta precisa da cessão carregada. Atualize a página.");
      return;
    }
    if (!ctx.customerId || !ctx.contractId) {
      alert("Abra a permuta a partir de um contrato, em Buscar Cliente → Gestão.");
      return;
    }
    Object.assign(PermutaState, {
      tab: "condicoes",
      loading: true,
      gerando: false,
      ctx: ctx,
      unidades: [],
      unidadesErro: "",
      unidadeId: "",
      pagamento: [],
      pagamentoDe: "",
      testemunha1: "",
      testemunha2: ""
    });
    this.montar();
    this.pintar();
    try {
      await CessaoPopup.carregar(ctx);
      const src = window.CessaoPopupState || {};
      const atraso = await this.temParcelaVencida(ctx);
      if (atraso) {
        this.fechar();
        alert("A permuta só pode ser feita com o cliente adimplente. Há parcela vencida em aberto neste título.");
        return;
      }
      Object.assign(PermutaState, {
        customer: src.customer,
        contract: src.contract || {},
        unit: src.unit || {},
        empName: src.empName || ctx.empreendimento || "",
        quadraLote: src.quadraLote || "",
        titulo: src.titulo || ctx.titulo || "",
        dataVenda: src.dataVenda || "",
        recente: !!src.recente,
        preamble: src.preamble || "",
        condicoes: (src.condicoes || []).map((c) => Object.assign({}, c)),
        juros: src.juros || 0,
        indexador: src.indexador || "REAL",
        qtdPagas: src.qtdPagas || 0,
        qtdAbertas: src.qtdAbertas || 0,
        valorParcelaAberta: src.valorParcelaAberta || 0,
        primeiroVencAberto: src.primeiroVencAberto || "",
        saldoAberto: src.saldoAberto || 0,
        valorPago: src.valorPago || 0,
        unitDetails: src.unitDetails || null,
        valorContrato: Number((src.contract && (src.contract.totalSellingValue || src.contract.value)) || 0) || 0,
        empresaNome: src.empresaNome || ""
      });
      const emp = (src.contract && (src.contract.enterpriseId || src.contract.costCenterId)) || "";
      this.carregarUnidades(emp, src.quadraLote || (src.unit && src.unit.name) || ctx.unidade || "");
    } catch (e) {
      console.error("[Permuta]", e);
      this.fechar();
      alert("Não foi possível carregar o contrato no Sienge.");
      return;
    }
    PermutaState.loading = false;
    this.pintar();
  },

  async temParcelaVencida(ctx) {
    const hoje = CessaoPopup.hojeIso();
    const billId = ctx.titulo || (CessaoPopupState.contract && CessaoPopupState.contract.receivableBillId) || "";
    let lista = [];
    try { lista = await CessaoPopup.parcelasCompletas(billId); } catch (e) { lista = []; }
    if (!lista.length) {
      try {
        const bill = await CessaoPopup.billFinanceiro(ctx.customerId, billId);
        lista = (bill && bill.installments) || [];
      } catch (e) { lista = []; }
    }
    return (lista || []).some((p) => {
      const due = String(p.dueDate || p.originalDueDate || "").slice(0, 10);
      if (!due || due >= hoje) return false;
      const saldo = CessaoPopup.saldoAtualDe(p);
      const cb = saldo != null ? saldo : (Number(p.balanceDue || p.currentBalance) || 0);
      return cb > 0.009;
    });
  },

  async carregarUnidades(enterpriseId, atualNome) {
    PermutaState.unidadesCarregando = true;
    PermutaState.unidadesErro = "";
    const fetchFn = window.siengeFetchWithRetry;
    if (!enterpriseId || typeof fetchFn !== "function") {
      PermutaState.unidadesErro = "Não identifiquei o empreendimento deste contrato.";
      PermutaState.unidadesCarregando = false;
      this.pintar();
      return;
    }
    const todas = [];
    const limit = 200;
    try {
      for (let offset = 0; offset < 5000; offset += limit) {
        const data = await fetchFn("/units?limit=" + limit + "&offset=" + offset + "&enterpriseId=" + encodeURIComponent(enterpriseId) + "&additionalData=NONE");
        const rows = (data && (data.results || data.availables)) || [];
        if (!rows.length) break;
        todas.push.apply(todas, rows);
        if (rows.length < limit) break;
      }
    } catch (e) {
      PermutaState.unidadesErro = "Não foi possível listar as unidades disponíveis.";
      PermutaState.unidadesCarregando = false;
      this.pintar();
      return;
    }
    const atual = String(atualNome || "").trim().toUpperCase();
    PermutaState.unidades = todas.filter((u) => String(u.commercialStock || "").toUpperCase() === "D").filter((u) => {
      const nome = String(u.name || "").trim().toUpperCase();
      return nome && nome !== atual;
    }).map((u) => ({
      id: u.id,
      nome: String(u.name || "").trim(),
      area: Number(u.totalArea || u.privateArea || u.indexedPrivateArea || u.landArea || u.terrainArea) || 0,
      valor: Number(u.totalSellingValue || u.indexedValue || u.value || u.terrainValue) || 0,
      matricula: String(u.legalRegistrationNumber || u.municipalRegistration || u.propertyRegistration || "").trim()
    })).sort((a, b) => a.nome.localeCompare(b.nome, "pt", { numeric: true }));
    PermutaState.unidadesCarregando = false;
    if (PermutaState.tab === "lote") this.pintar();
  },

  montar() {
    let ov = document.getElementById("permuta-popup");
    if (ov) return;
    ov = document.createElement("div");
    ov.id = "permuta-popup";
    ov.className = "cessao-popup";
    ov.innerHTML = `
      <div class="cessao-popup-panel" role="dialog" aria-modal="true" aria-labelledby="permuta-popup-title">
        <header>
          <div>
            <h3 id="permuta-popup-title">Permuta de lote</h3>
            <p id="permuta-popup-sub"></p>
          </div>
          <button type="button" class="btn btn-fechar" onclick="PermutaApp.fechar()">Fechar</button>
        </header>
        <div id="permuta-popup-tabs"></div>
        <div class="cessao-popup-body" id="permuta-popup-body"></div>
        <footer>
          <span class="cessao-pop-aviso" id="permuta-popup-aviso"></span>
          <button type="button" class="btn btn-cancel" onclick="PermutaApp.fechar()">Cancelar</button>
          <button type="button" class="btn btn-outline" id="permuta-popup-voltar" onclick="PermutaApp.voltar()">Voltar</button>
          <button type="button" class="btn btn-primary" id="permuta-popup-proximo" onclick="PermutaApp.proximo()"></button>
        </footer>
      </div>`;
    document.body.appendChild(ov);
  },

  fechar() {
    const ov = document.getElementById("permuta-popup");
    if (ov) ov.style.display = "none";
  },

  pintar() {
    const ov = document.getElementById("permuta-popup");
    if (!ov) return;
    ov.style.display = "flex";
    const st = PermutaState;
    const sub = document.getElementById("permuta-popup-sub");
    if (sub) {
      sub.textContent = [
        st.titulo ? "Título " + st.titulo : "",
        st.quadraLote && st.quadraLote !== "—" ? "Unidade " + st.quadraLote : "",
        (st.customer && st.customer.name) || (st.ctx && st.ctx.nome) || ""
      ].filter(Boolean).join(" · ");
    }
    const tabs = [
      { id: "condicoes", label: "Condições da compra", icon: "wallet" },
      { id: "lote", label: "Novo lote", icon: "map-pin" },
      { id: "pagamento", label: "Forma de pagamento", icon: "banknote" },
      { id: "testemunhas", label: "Testemunhas", icon: "pen-line" }
    ];
    const box = document.getElementById("permuta-popup-tabs");
    if (box) {
      box.innerHTML = `<div class="ml-tabs" role="tablist">${tabs.map((t) => {
        const ativa = st.tab === t.id;
        return `<button type="button" role="tab" aria-selected="${ativa}" class="ml-tab ${ativa ? "is-active" : "is-locked"}" ${ativa ? "" : "disabled"} tabindex="-1" title="${ativa ? "Etapa atual" : "Use Avançar para seguir e Voltar para retornar"}"><i data-lucide="${t.icon}"></i> ${t.label}</button>`;
      }).join("")}</div>`;
    }
    const body = document.getElementById("permuta-popup-body");
    if (body) {
      body.innerHTML = st.loading
        ? `<div style="padding:48px;text-align:center;color:#64748b;"><div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>Carregando o contrato no Sienge…</div>`
        : this.corpoHtml();
    }
    const voltar = document.getElementById("permuta-popup-voltar");
    const prox = document.getElementById("permuta-popup-proximo");
    if (voltar) voltar.style.display = st.tab === "condicoes" ? "none" : "";
    if (prox) {
      prox.innerHTML = st.tab === "testemunhas"
        ? (st.gerando ? `<span class="btn-spin"></span> Gerando...` : `<i data-lucide="file-down" style="width:16px;height:16px;"></i> Gerar permuta`)
        : "Avançar";
      prox.disabled = !!st.loading || !!st.gerando || (st.tab === "testemunhas" && !!this.pendencia("testemunhas"));
    }
    const aviso = document.getElementById("permuta-popup-aviso");
    if (aviso) aviso.textContent = st.loading ? "" : (this.pendencia(st.tab) || "");
    if (window.lucide) lucide.createIcons();
  },

  corpoHtml() {
    if (PermutaState.tab === "lote") return this.loteHtml();
    if (PermutaState.tab === "pagamento") return this.pagamentoHtml();
    if (PermutaState.tab === "testemunhas") return this.testemunhasHtml();
    return this.condicoesHtml();
  },

  condicoesHtml() {
    const st = PermutaState;
    const quando = st.dataVenda && window.CessaoApp ? CessaoApp.fmtDate(st.dataVenda) : "sem data de venda";
    const nota = `<p class="cessao-pop-nota is-ok">Contrato atual, venda de ${this.esc(quando)}. Ajuste as condições da compra se precisar. Juros, indexador, parcelas e saldo vêm do contrato.</p>`;
    const rows = (st.condicoes || []).map((row) => {
      const total = (Number(row.qtde) || 0) * this.parseValor(row.valor);
      return `<tr>
        <td><input class="form-control" value="${this.esc(row.tipo)}" oninput="PermutaApp.setCond('${row.id}','tipo',this.value)"></td>
        <td><input class="form-control" type="number" min="1" value="${this.esc(row.qtde)}" oninput="PermutaApp.setCond('${row.id}','qtde',this.value)"></td>
        <td><input class="form-control" value="${this.esc(row.valor)}" placeholder="0,00" oninput="PermutaApp.setCond('${row.id}','valor',this.value)"></td>
        <td id="permuta-cond-total-${row.id}" style="font-weight:700;white-space:nowrap;">${this.money(total)}</td>
        <td><input class="form-control" type="date" value="${this.esc(row.vencimento || "")}" onchange="PermutaApp.setCond('${row.id}','vencimento',this.value)"></td>
        <td><button type="button" class="btn btn-outline btn-sm" onclick="PermutaApp.removeCond('${row.id}')" title="Remover"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></td>
      </tr>`;
    }).join("");
    const campo = (rotulo, valor) => `<label class="cessao-pop-field">${rotulo}<input class="form-control" value="${this.esc(valor == null || valor === "" ? "—" : valor)}" disabled></label>`;
    return `${nota}
      <div class="cessao-cond-box">
        <div class="cessao-cond-head">CONDIÇÕES DE PAGAMENTO DA COMPRA</div>
        <div class="cessao-cond-scroll">
          <table class="cessao-cond-table">
            <thead><tr><th>Tipo</th><th>Qtde. parcelas</th><th>Valor da parcela</th><th>Total</th><th>1º vencimento</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <button type="button" class="btn btn-outline cessao-cond-add" onclick="PermutaApp.addCond()"><i data-lucide="plus" style="width:14px;height:14px;"></i> Adicionar condição</button>
        <div class="cessao-contrato-dados">
          ${campo("Juros ao mês (%)", window.CessaoPopup ? CessaoPopup.fmtJuros(st.juros) : st.juros)}
          ${campo("Indexador", st.indexador || "REAL")}
          ${campo("Parcelas já pagas", String(st.qtdPagas || 0))}
          ${campo("Parcelas a pagar", String(st.qtdAbertas || 0))}
          ${campo("Valor da próxima parcela", this.money(st.valorParcelaAberta))}
          ${campo("Próximo vencimento", st.primeiroVencAberto && window.CessaoApp ? CessaoApp.fmtDate(st.primeiroVencAberto) : "—")}
          ${campo("Saldo com o vendedor", this.money(st.saldoAberto))}
        </div>
      </div>`;
  },

  loteHtml() {
    const st = PermutaState;
    if (st.unidadesCarregando && !st.unidades.length) {
      return `<div style="padding:48px;text-align:center;color:#64748b;"><div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>Buscando as unidades disponíveis…</div>`;
    }
    if (st.unidadesErro) return `<p class="cessao-pop-nota">${this.esc(st.unidadesErro)}</p>`;
    if (!st.unidades.length) return `<p class="cessao-pop-nota">Nenhuma unidade disponível neste empreendimento.</p>`;
    const linhas = st.unidades.map((u) => {
      const on = String(st.unidadeId) === String(u.id);
      return `<label class="cessao-pop-pessoa" style="cursor:pointer;${on ? "outline:2px solid var(--color-primary);" : ""}">
        <span style="display:flex;align-items:center;gap:8px;">
          <input type="radio" name="permuta-lote" ${on ? "checked" : ""} onchange="PermutaApp.escolherLote('${this.esc(u.id)}')">
          <strong>${this.esc(u.nome)}</strong>
        </span>
        <span style="font-size:0.82rem;color:#475569;">${u.area ? this.esc(String(u.area).replace(".", ",") + " m²") : "Área não informada"}</span>
        <span style="font-weight:700;">${u.valor ? this.money(u.valor) : "Valor não informado"}</span>
      </label>`;
    }).join("");
    return `<p class="cessao-pop-nota is-ok">Unidades disponíveis de ${this.esc(st.empName || "este empreendimento")}. A unidade atual do cliente não entra na lista.</p>${linhas}`;
  },

  pagamentoHtml() {
    const st = PermutaState;
    const lote = this.unidadeEscolhida();
    const rows = (st.pagamento || []).map((row) => {
      const total = (Number(row.qtde) || 0) * this.parseValor(row.valor);
      return `<tr>
        <td><select class="form-control" onchange="PermutaApp.setPag('${row.id}','tipo',this.value)">${this.opcoesTipo(row)}</select></td>
        <td><input class="form-control" type="number" min="1" value="${this.esc(row.qtde)}" oninput="PermutaApp.setPag('${row.id}','qtde',this.value)"></td>
        <td><input class="form-control" value="${this.esc(row.valor ? this.fmtValorCampo(row.valor) : "")}" placeholder="0,00" oninput="PermutaApp.setPag('${row.id}','valor',this.value)" onblur="PermutaApp.formatarPag('${row.id}', this)"></td>
        <td id="permuta-pag-total-${row.id}" style="font-weight:700;white-space:nowrap;">${this.money(total)}</td>
        <td><input class="form-control" type="date" value="${this.esc(row.vencimento || "")}" onchange="PermutaApp.setPag('${row.id}','vencimento',this.value)"></td>
        <td><button type="button" class="btn btn-outline btn-sm" onclick="PermutaApp.removePag('${row.id}')" title="Remover"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></td>
      </tr>`;
    }).join("");
    return `<p class="cessao-pop-nota is-ok">Forma de pagamento do lote ${this.esc((lote && lote.nome) || "")}. Preencha o valor, os juros, o indexador e cada condição.</p>
      <div class="cessao-cond-box">
        <div class="cessao-cond-head">FORMA DE PAGAMENTO DO NOVO LOTE</div>
        <div class="cessao-contrato-dados">
          <label class="cessao-pop-field">Valor do lote
            <input class="form-control" value="${this.esc(st.valorLote ? this.fmtValorCampo(st.valorLote) : "")}" placeholder="0,00" oninput="PermutaApp.setValorLote(this.value)" onblur="PermutaApp.formatarValorLote(this)">
          </label>
          <label class="cessao-pop-field">Juros ao mês (%)
            <input class="form-control" value="${this.esc(st.jurosNovo == null ? "" : st.jurosNovo)}" placeholder="0,0000" oninput="PermutaApp.setJurosNovo(this.value)">
          </label>
          <label class="cessao-pop-field">Indexador
            <select class="form-control" onchange="PermutaApp.setIndexador(this.value)">${this.opcoesIndexador()}</select>
          </label>
        </div>
        <div class="cessao-cond-scroll">
          <table class="cessao-cond-table">
            <thead><tr><th>Tipo</th><th>Qtde. parcelas</th><th>Valor da parcela</th><th>Total</th><th>1º vencimento</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <button type="button" class="btn btn-outline cessao-cond-add" onclick="PermutaApp.addPag()"><i data-lucide="plus" style="width:14px;height:14px;"></i> Adicionar condição</button>
      </div>`;
  },

  testemunhasHtml() {
    const st = PermutaState;
    return `<p class="cessao-pop-nota is-ok">Escolha duas pessoas diferentes para assinar como testemunha e gere o instrumento de permuta.</p>
      <div class="cessao-ces-fechamento">
        <div class="cessao-cond-head">TESTEMUNHAS</div>
        <div class="cessao-ces-fechamento-grid">
          <label class="cessao-pop-field">Testemunha 1
            <select class="form-control" onchange="PermutaApp.setTestemunha('testemunha1', this.value)">${this.opcoesTestemunha(st.testemunha1, st.testemunha2)}</select>
          </label>
          <label class="cessao-pop-field">Testemunha 2
            <select class="form-control" onchange="PermutaApp.setTestemunha('testemunha2', this.value)">${this.opcoesTestemunha(st.testemunha2, st.testemunha1)}</select>
          </label>
        </div>
      </div>`;
  },

  opcoesTestemunha(selecionada, outra) {
    const users = typeof getDistratoWitnessUsers === "function" ? getDistratoWitnessUsers() : [];
    const bloqueada = String(outra || "");
    const opts = users.filter((u) => String(u.id) !== bloqueada).map((u) => {
      const id = String(u.id);
      const rg = u.doc_rg || u.rg || "";
      return `<option value="${this.esc(id)}" ${String(selecionada) === id ? "selected" : ""}>${this.esc((u.name || u.nome || u.email || id) + (rg ? " — RG " + rg : ""))}</option>`;
    }).join("");
    return `<option value="">Selecione</option>${opts}`;
  },

  condicoesOk(rows) {
    return (rows || []).length && !(rows || []).some((r) => !(Number(r.qtde) > 0) || !(this.parseValor(r.valor) > 0) || !r.vencimento);
  },

  pendencia(tab) {
    const st = PermutaState;
    if (tab === "condicoes") {
      if (!this.condicoesOk(st.condicoes)) return "Preencha quantidade, valor e vencimento de cada condição da compra.";
      return "";
    }
    if (tab === "lote") {
      if (st.unidadesCarregando && !st.unidades.length) return "Aguarde a lista de unidades disponíveis.";
      if (st.unidadesErro) return st.unidadesErro;
      if (!st.unidades.length) return "Não há unidade disponível neste empreendimento.";
      if (!this.unidadeEscolhida()) return "Escolha o lote de destino.";
      return "";
    }
    if (tab === "pagamento") {
      if (!(Number(st.valorLote) > 0)) return "Informe o valor do lote de destino.";
      if (!String(st.indexadorNovo || "").trim()) return "Escolha o indexador.";
      if ((st.pagamento || []).some((r) => !String(r.tipo || "").trim()) || !this.condicoesOk(st.pagamento)) {
        return "Escolha a condição que gera boleto no Sienge e preencha quantidade, valor e vencimento.";
      }
      return "";
    }
    if (tab === "testemunhas") {
      const antes = this.pendencia("condicoes") || this.pendencia("lote") || this.pendencia("pagamento");
      if (antes) return antes;
      if (!st.testemunha1 || !st.testemunha2) return "Escolha as duas testemunhas.";
      if (String(st.testemunha1) === String(st.testemunha2)) return "As testemunhas precisam ser pessoas diferentes.";
      return "";
    }
    return "";
  },

  async proximo() {
    const st = PermutaState;
    if (st.tab === "testemunhas") {
      this.gerar();
      return;
    }
    const erro = this.pendencia(st.tab);
    if (erro) {
      const aviso = document.getElementById("permuta-popup-aviso");
      if (aviso) aviso.textContent = erro;
      return;
    }
    const ordem = this.ordem();
    const i = ordem.indexOf(st.tab);
    if (st.tab === "lote") {
      this.preencherPagamento();
      await this.carregarListasPagamento();
    }
    if (i >= 0 && ordem[i + 1]) {
      st.tab = ordem[i + 1];
      this.pintar();
    }
  },

  voltar() {
    const ordem = this.ordem();
    const i = ordem.indexOf(PermutaState.tab);
    if (i > 0) {
      PermutaState.tab = ordem[i - 1];
      this.pintar();
    }
  },

  preencherPagamento() {
    const u = this.unidadeEscolhida();
    if (!u) return;
    if (String(PermutaState.pagamentoDe) === String(u.id) && (PermutaState.pagamento || []).length) return;
    PermutaState.valorLote = 0;
    PermutaState.jurosNovo = "";
    PermutaState.indexadorNovo = "";
    PermutaState.pagamento = [{ id: "p1", tipo: "", qtde: "", valor: "", vencimento: "" }];
    PermutaState.pagamentoDe = u.id;
  },

  async carregarListasPagamento() {
    if (this._listasP) return this._listasP;
    this._listasP = this._buscarListasPagamento().catch((e) => {
      console.warn("[Permuta] listas", e);
      this._listasP = null;
    });
    return this._listasP;
  },

  async _buscarListasPagamento() {
    let rawIdx = [];
    if (window.IndexadoresState && Array.isArray(IndexadoresState.allSiengeIndexers) && IndexadoresState.allSiengeIndexers.length) {
      rawIdx = IndexadoresState.allSiengeIndexers;
    } else if (window.SiengeApiService && typeof SiengeApiService.getIndexers === "function") {
      const res = await SiengeApiService.getIndexers();
      rawIdx = (res && res.results) || [];
    }
    let ativos = [];
    try { ativos = JSON.parse(localStorage.getItem("crm_indexadores_ativos") || "[]"); } catch (e) { ativos = []; }
    const nomes = new Set((ativos || []).map((n) => String(n)));
    const idx = (rawIdx || []).filter((i) => i && i.name && (nomes.size ? nomes.has(i.name) : String(i.name).toUpperCase() !== "REAL"));
    PermutaState.indexadores = idx
      .map((i) => ({ id: i.id, name: String(i.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const cp = window.CondicoesPagamentoApp;
    let tipos = [];
    if (cp && Array.isArray(cp.items) && cp.items.length) {
      tipos = cp.items;
    } else if (cp && typeof cp.fetchAllTypes === "function") {
      try { tipos = await cp.fetchAllTypes(); } catch (e) { tipos = []; }
    } else if (window.SiengeApiService && typeof SiengeApiService.getPaymentConditionTypes === "function") {
      try {
        const lista = await SiengeApiService.getPaymentConditionTypes();
        tipos = (lista || []).map((t) => (cp && cp.normalizeItem ? cp.normalizeItem(t) : t)).filter(Boolean);
      } catch (e) { tipos = []; }
    }
    if (cp && typeof cp.loadFlagsFromLocal === "function") {
      try { cp.loadFlagsFromLocal(); } catch (e) {}
    }
    const permite = typeof window.paymentConditionAllowsBoleto === "function" ? window.paymentConditionAllowsBoleto : () => true;
    PermutaState.tiposBoleto = (tipos || [])
      .filter((t) => t && permite(t.id))
      .map((t) => ({ id: String(t.id), name: String(t.name || t.description || t.id) }))
      .sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
    PermutaState.tiposProntos = true;
  },

  opcoesIndexador() {
    const atual = String(PermutaState.indexadorNovo || "");
    const lista = PermutaState.indexadores || [];
    const extra = atual && !lista.some((i) => i.name === atual)
      ? `<option value="${this.esc(atual)}" selected>${this.esc(atual)}</option>`
      : "";
    const opts = lista.map((i) => `<option value="${this.esc(i.name)}" ${i.name === atual ? "selected" : ""}>${this.esc(i.name)}</option>`).join("");
    const vazio = lista.length || atual ? "" : `<option value="" disabled>Carregando indexadores…</option>`;
    return `<option value="">Selecione</option>${vazio}${extra}${opts}`;
  },

  opcoesTipo(row) {
    const tipos = PermutaState.tiposBoleto || [];
    const atual = String((row && row.tipo) || "");
    const usados = new Set((PermutaState.pagamento || []).filter((r) => r !== row && r.tipo).map((r) => String(r.tipo)));
    const extra = atual && !tipos.some((t) => t.id === atual)
      ? [{ id: atual, name: tipos.length ? "não gera boleto no Sienge" : "" }]
      : [];
    const carregando = PermutaState.tiposProntos ? "" : `<option value="" disabled>Carregando condições…</option>`;
    const opts = extra.concat(tipos).map((t) => {
      const usado = usados.has(t.id) && t.id !== atual;
      const nome = t.name && t.name !== t.id ? " · " + t.name : "";
      return `<option value="${this.esc(t.id)}" ${t.id === atual ? "selected" : ""} ${usado ? "disabled" : ""}>${this.esc(t.id + nome)}${usado ? " (já usada)" : ""}</option>`;
    }).join("");
    return `<option value="" ${atual ? "" : "selected"}>Condição…</option>${carregando}${opts}`;
  },

  nomeCondicao(id) {
    const t = (PermutaState.tiposBoleto || []).find((x) => String(x.id) === String(id));
    if (!t) return String(id || "");
    return t.name && t.name !== t.id ? (t.id + " " + t.name) : t.id;
  },

  fmtValorCampo(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    const n = this.parseValor(s);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  escolherLote(id) {
    PermutaState.unidadeId = id;
    PermutaState.pagamentoDe = "";
    this.pintar();
  },

  setCond(id, field, value) {
    const row = (PermutaState.condicoes || []).find((c) => c.id === id);
    if (!row) return;
    row[field] = value;
    if (field === "qtde" || field === "valor") {
      const el = document.getElementById("permuta-cond-total-" + id);
      if (el) el.textContent = this.money((Number(row.qtde) || 0) * this.parseValor(row.valor));
    }
  },

  addCond() {
    const n = (PermutaState.condicoes || []).length + 1;
    PermutaState.condicoes.push({ id: "n" + Date.now(), tipo: "Mensal", qtde: "", valor: "", vencimento: "" });
    if (!n) return;
    this.pintar();
  },

  removeCond(id) {
    PermutaState.condicoes = (PermutaState.condicoes || []).filter((c) => c.id !== id);
    if (!PermutaState.condicoes.length) PermutaState.condicoes.push({ id: "n" + Date.now(), tipo: "Mensal", qtde: "", valor: "", vencimento: "" });
    this.pintar();
  },

  setPag(id, field, value) {
    const row = (PermutaState.pagamento || []).find((c) => c.id === id);
    if (!row) return;
    row[field] = value;
    if (field === "qtde" || field === "valor") {
      const el = document.getElementById("permuta-pag-total-" + id);
      if (el) el.textContent = this.money((Number(row.qtde) || 0) * this.parseValor(row.valor));
    }
    if (field === "tipo") this.pintar();
  },

  formatarPag(id, el) {
    const row = (PermutaState.pagamento || []).find((c) => c.id === id);
    if (!row || !el) return;
    const txt = this.fmtValorCampo(el.value);
    row.valor = txt;
    el.value = txt;
    const total = document.getElementById("permuta-pag-total-" + id);
    if (total) total.textContent = this.money((Number(row.qtde) || 0) * this.parseValor(txt));
  },

  addPag() {
    PermutaState.pagamento.push({ id: "p" + Date.now(), tipo: "", qtde: "", valor: "", vencimento: "" });
    this.pintar();
  },

  removePag(id) {
    PermutaState.pagamento = (PermutaState.pagamento || []).filter((c) => c.id !== id);
    if (!PermutaState.pagamento.length) {
      PermutaState.pagamento.push({ id: "p" + Date.now(), tipo: "", qtde: "", valor: "", vencimento: "" });
    }
    this.pintar();
  },

  setValorLote(raw) {
    PermutaState.valorLote = this.parseValor(raw);
  },

  formatarValorLote(el) {
    if (!el) return;
    const txt = this.fmtValorCampo(el.value);
    PermutaState.valorLote = this.parseValor(txt);
    el.value = txt;
  },

  setJurosNovo(raw) {
    PermutaState.jurosNovo = String(raw == null ? "" : raw);
  },

  setIndexador(val) {
    PermutaState.indexadorNovo = val || "";
  },

  setTestemunha(campo, valor) {
    const outra = campo === "testemunha1" ? "testemunha2" : "testemunha1";
    PermutaState[campo] = valor;
    if (valor && String(PermutaState[outra]) === String(valor)) PermutaState[outra] = "";
    this.pintar();
  },

  textoCondicoes(rows) {
    return (rows || []).map((r) => {
      const q = Number(r.qtde) || 0;
      const v = this.parseValor(r.valor);
      const quando = r.vencimento && window.CessaoApp ? CessaoApp.fmtDate(r.vencimento) : (r.vencimento || "");
      const tipo = this.nomeCondicao(r.tipo) || r.tipo || "parcela";
      return q + " (" + (window.CessaoPopup ? CessaoPopup.extensoQtd(q) : q) + ") parcela(s) de " + tipo +
        " no valor de " + this.money(v) + " (" + (window.CessaoPopup ? CessaoPopup.extensoValor(v) : "") + "), com primeiro vencimento em " + quando;
    }).join("; ");
  },

  async gerar() {
    const erro = this.pendencia("testemunhas");
    if (erro) {
      alert(erro);
      return;
    }
    const rel = window.RelacionamentoApp;
    if (!rel || typeof rel._paginarDoc !== "function" || typeof rel._baixarPaginasPdf !== "function") {
      alert("O gerador de PDF dos documentos não está disponível.");
      return;
    }
    PermutaState.gerando = true;
    this.pintar();
    try {
      const st = PermutaState;
      const tituloDoc = (document.getElementById("doc-permuta-title") || {}).value || "INSTRUMENTO PARTICULAR DE PERMUTA DE IMÓVEIS URBANOS";
      const htmlTexto = window.CessaoPopup && typeof CessaoPopup.htmlTexto === "function"
        ? (s) => CessaoPopup.htmlTexto(s)
        : (s) => this.esc(s);
      const blocos = this.paragrafosDocumento().map(htmlTexto);
      blocos.push(this.assinaturaHtml());
      const lote = this.unidadeEscolhida() || {};
      const topo = `<div style="font-family:'Times New Roman',serif;font-size:11pt;color:#111;margin:0 0 24px;">Título: ${this.esc(st.titulo || "")} | Unidade de origem: ${this.esc(st.quadraLote || "")} | Unidade de destino: ${this.esc(lote.nome || "")}</div>
        <h2 style="text-align:center;color:#111;font-size:13pt;font-weight:bold;letter-spacing:0.02em;margin:0 0 22px;font-family:'Times New Roman',serif;">${this.esc(tituloDoc)}</h2>`;
      const corpoCss = "font-family:'Times New Roman',serif;font-size:11pt;line-height:1.45;text-align:justify;white-space:pre-wrap;color:#111;";
      const paginas = rel._paginarDoc(topo, blocos, corpoCss);
      const nome = "Permuta_" + String(st.titulo || "lote").replace(/\W+/g, "") + ".pdf";
      await rel._baixarPaginasPdf(paginas, nome);
      this.fechar();
    } catch (e) {
      console.error("[Permuta] PDF", e);
      alert(e && e.message ? e.message : "Não foi possível gerar o documento da permuta.");
    } finally {
      PermutaState.gerando = false;
      const ov = document.getElementById("permuta-popup");
      if (ov && ov.style.display === "flex") this.pintar();
    }
  },

  paragrafosDocumento() {
    const st = PermutaState;
    const el = document.getElementById("doc-permuta-corpo");
    let corpo = el ? String(el.value || "") : "";
    if (!corpo) corpo = "Instrumento de permuta do título {{TITULO}}, da unidade {{UNIDADE}} para {{LOTE_DESTINO}}.";
    let idxN = 0;
    corpo = corpo.replace(/\{\{INDEXADOR\}\}/g, () => {
      idxN += 1;
      return idxN === 1 ? "{{INDEXADOR}}" : "{{INDEXADOR_NOVO}}";
    });
    const lote = this.unidadeEscolhida() || {};
    const customer = st.customer || {};
    const unit = st.unit || {};
    const sale = st.contract || {};
    let base = {};
    if (typeof window.buildLegalDocVarMap === "function") {
      try {
        base = window.buildLegalDocVarMap(customer, sale, unit, { preambleText: st.preamble, empName: st.empName }) || {};
      } catch (e) { base = {}; }
    }
    const ext = (n) => window.CessaoPopup ? CessaoPopup.extensoValor(n) : "";
    const areaTxt = (n) => {
      if (!(Number(n) > 0)) return "";
      const num = String(n).replace(".", ",");
      const extN = typeof numeroPorExtenso === "function" ? numeroPorExtenso(Math.round(Number(n))) : "";
      return extN ? extN + " metros quadrados" : num + " metros quadrados";
    };
    const users = typeof getDistratoWitnessUsers === "function" ? getDistratoWitnessUsers() : [];
    const w = (id) => users.find((u) => String(u.id) === String(id)) || {};
    const t1 = w(st.testemunha1);
    const t2 = w(st.testemunha2);
    const ud = st.unitDetails || {};
    const areaOrigem = Number(ud.privateArea || ud.Privatearea || ud.totalArea || ud.terrainArea || unit.area) || 0;
    const valorContrato = st.valorContrato || (Number(st.valorPago) + Number(st.saldoAberto));
    const mapa = Object.assign({}, base, {
      TITULO: st.titulo || base.TITULO || "",
      UNIDADE: st.quadraLote || base.UNIDADE || "",
      QUADRA: unit.block || base.QUADRA || "",
      LOTE: unit.lot || base.LOTE || "",
      LOTE_DESTINO: lote.nome || "",
      EMPREENDIMENTO: st.empName || base.EMPREENDIMENTO || "",
      PREAMBULO: st.preamble || base.PREAMBULO || "",
      DATA_CONTRATO: st.dataVenda && window.CessaoApp ? CessaoApp.fmtDate(st.dataVenda) : (base.DATA_CONTRATO || ""),
      INDEXADOR: st.indexador || "REAL",
      INDEXADOR_NOVO: st.indexadorNovo || st.indexador || "REAL",
      CONDICOES_ORIGEM: this.textoCondicoes(st.condicoes),
      CONDICOES_SALDO: this.textoCondicoes(st.pagamento),
      VALOR_CONTRATO: this.money(valorContrato),
      VALOR_CONTRATO_EXTENSO: ext(valorContrato),
      VALOR_PAGO: this.money(st.valorPago),
      VALOR_PAGO_EXTENSO: ext(st.valorPago),
      SALDO_DEVEDOR: this.money(st.saldoAberto),
      SALDO_DEVEDOR_EXTENSO: ext(st.saldoAberto),
      VALOR_LOTE_DESTINO: this.money(st.valorLote),
      VALOR_LOTE_DESTINO_EXTENSO: ext(st.valorLote),
      AREA_LOTE: areaOrigem ? String(areaOrigem).replace(".", ",") : (base.AREA_LOTE || ""),
      AREA_LOTE_EXTENSO: areaTxt(areaOrigem) || base.AREA_LOTE_EXTENSO || "",
      AREA_LOTE_DESTINO: lote.area ? String(lote.area).replace(".", ",") : "",
      AREA_LOTE_DESTINO_EXTENSO: areaTxt(lote.area),
      MATRICULA: lote.matricula || ud.legalRegistrationNumber || base.MATRICULA || "",
      CERTIFICADO_GRAPROHAB: base.CERTIFICADO_GRAPROHAB || "____",
      DATA_HOJE_EXTENSO: (window.CessaoPopup && CessaoPopup.dataHoje()) || base.DATA_HOJE_EXTENSO || "",
      TESTEMUNHA_1_NOME: t1.name || t1.nome || "",
      TESTEMUNHA_2_NOME: t2.name || t2.nome || "",
      TESTEMUNHA_1_RG: t1.doc_rg || t1.rg || "",
      TESTEMUNHA_2_RG: t2.doc_rg || t2.rg || ""
    });
    Object.keys(mapa).forEach((k) => {
      corpo = corpo.split("{{" + k + "}}").join(String(mapa[k] == null ? "" : mapa[k]));
    });
    corpo = corpo
      .replace(/\nE por assim estarem[\s\S]*$/i, "")
      .replace(/\n\{\{ASSINATURAS_VENDEDORES\}\}[\s\S]*$/i, "")
      .replace(/\n_{5,}[\s\S]*$/i, "")
      .replace(/\nTestemunhas[\s\S]*$/i, "")
      .trim();
    return corpo.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter((p) => p && !/^Título:/i.test(p));
  },

  assinaturaHtml() {
    const st = PermutaState;
    const campo = (nome, papel) => `<div style="height:32px;"></div>
      <div style="border-top:1px solid #111;margin:0 10px 8px;"></div>
      <div style="font-weight:bold;line-height:1.3;">${this.esc(String(nome || "").toUpperCase())}</div>
      <div style="margin-top:2px;">${this.esc(papel)}</div>`;
    const faixa = (campos) => {
      if (!campos.length) return "";
      if (campos.length === 1) {
        return `<tr><td colspan="2" style="padding:20px 22% 0;text-align:center;white-space:normal;vertical-align:bottom;">${campo(campos[0].nome, campos[0].papel)}</td></tr>`;
      }
      return `<tr>${campos.slice(0, 2).map((c) => `<td style="width:50%;padding:20px 14px 0;text-align:center;white-space:normal;vertical-align:bottom;">${campo(c.nome, c.papel)}</td>`).join("")}</tr>`;
    };
    const customer = st.customer || {};
    const nomeCli = customer.name || customer.nome || "";
    const conj = customer && typeof window.legalSpouseRecord === "function" && !(window.CessaoPopup && CessaoPopup.isPj && CessaoPopup.isPj(customer))
      ? window.legalSpouseRecord(customer)
      : null;
    const permutantes = [];
    if (nomeCli) {
      const par = [{ nome: nomeCli, papel: "Permutante" }];
      if (conj && conj.name) par.push({ nome: conj.name, papel: "Cônjuge" });
      permutantes.push(par);
    }
    let empresa = st.empresaNome || "";
    if (!empresa && typeof window.buildLegalDocVarMap === "function") {
      try {
        const base = window.buildLegalDocVarMap(customer, st.contract || {}, st.unit || {}, { preambleText: st.preamble, empName: st.empName }) || {};
        empresa = base.EMPRESA_NOME || base.PROMITENTE_VENDEDOR || "";
      } catch (e) { empresa = ""; }
    }
    if (empresa) permutantes.push([{ nome: empresa, papel: "Permutante" }]);
    const users = typeof getDistratoWitnessUsers === "function" ? getDistratoWitnessUsers() : [];
    const w = (id) => users.find((u) => String(u.id) === String(id)) || {};
    const testemunha = (u) => {
      const nome = u.name || u.nome || "________________";
      const rg = u.doc_rg || u.rg || "________________";
      return `<td style="width:50%;padding:18px 16px 0;text-align:center;white-space:normal;">${this.esc(nome)}<br>RG: ${this.esc(rg)}</td>`;
    };
    const data = window.CessaoPopup && typeof CessaoPopup.dataHoje === "function" ? CessaoPopup.dataHoje() : "";
    const frase = window.CessaoPopup && typeof CessaoPopup.htmlTexto === "function"
      ? CessaoPopup.htmlTexto("E por assim estarem justos e contratados, os permutantes assinam o presente instrumento particular de permuta em 2 (duas) vias de igual conteúdo, juntamente com as duas testemunhas que a tudo presenciaram.")
      : this.esc("E por assim estarem justos e contratados, os permutantes assinam o presente instrumento particular de permuta em 2 (duas) vias de igual conteúdo, juntamente com as duas testemunhas que a tudo presenciaram.");
    return `<div style="font-family:'Times New Roman',serif;white-space:normal;line-height:1.35;">` +
      `<p style="text-align:justify;margin:0 0 8px;">${frase}</p>` +
      `<p style="text-align:center;margin:28px 0 8px;">Botucatu, ${this.esc(data)}</p>` +
      `<table style="width:100%;border-collapse:collapse;margin-top:8px;">${permutantes.map(faixa).join("")}` +
      `<tr><td colspan="2" style="padding-top:24px;text-align:center;font-weight:bold;">Testemunhas</td></tr>` +
      `<tr>${testemunha(w(st.testemunha1))}${testemunha(w(st.testemunha2))}</tr>` +
      `</table></div>`;
  }
};

window.PermutaApp = PermutaApp;
window.PermutaState = PermutaState;
