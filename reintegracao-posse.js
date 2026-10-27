/* Reintegração de posse: clientes que estão nessas fases e o que falta fazer em cada um. */
window.ReintegracaoPosseApp = {
  KEY: "crm_reintegracao_posse",
  DOC: "reintegracao_posse",
  aba: "todas",
  busca: "",
  ordem: "cliente",
  dir: 1,
  aberto: "",
  fichas: {},
  updatedAt: 0,
  lido: false,

  ETAPAS: [
    { id: "posse", nome: "Reintegração de posse", fazer: "Acompanhar a reintegração de posse deste cliente." },
    { id: "mandado", nome: "Aguardando expedição do mandado de reintegração", fazer: "Aguardar o juiz expedir o mandado de reintegração." },
    { id: "oficial", nome: "Aguardando cumprimento pelo Oficial de Justiça", fazer: "Aguardar o oficial de justiça entregar o mandado." },
    { id: "realizar", nome: "Realizar reintegração", fazer: "Organizar a retomada física do imóvel." },
    { id: "avaliacao", nome: "Avaliação prévia Engenharia", fazer: "Agendar a avaliação prévia da engenharia." },
    { id: "vistoria", nome: "Vistoria técnica externa", fazer: "Aguardar a vistoria externa e o projeto." },
    { id: "prefeitura", nome: "Aprovação projeto - Prefeitura", fazer: "Acompanhar a visita e a aprovação do projeto na prefeitura." }
  ],

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fold(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  },

  podeEditar() {
    return typeof window.hasCrmPerm === "function" && window.hasCrmPerm("sub_jur_geral_reintegracao_posse_editar") === true;
  },

  etapaDe(fase) {
    const bruto = typeof window.canonicalJudicialPhaseName === "function" ? window.canonicalJudicialPhaseName(fase) : fase;
    const nome = this.fold(bruto).replace(/^\d+(?:\.\d+)*\.?\s+/, "");
    return this.ETAPAS.find((e) => this.fold(e.nome) === nome) || null;
  },

  depoisDaAvaliacao(etapa) {
    return etapa && (etapa.id === "avaliacao" || etapa.id === "vistoria" || etapa.id === "prefeitura");
  },

  fichaDe(id) {
    return this.fichas[String(id)] || {};
  },

  pendencias(cliente) {
    const f = this.fichaDe(cliente.id);
    const itens = [cliente.etapa.fazer];
    const morador = f.temMorador;
    if (!morador) itens.push("Informar se a casa tem morador");
    else if (morador === "sim") {
      if (!f.caminhao) itens.push("Informar se precisa de caminhão");
      else if (f.caminhao === "sim") itens.push("Providenciar caminhão");
      if (!f.chaveiro) itens.push("Informar se precisa de chaveiro");
      else if (f.chaveiro === "sim") itens.push("Chamar o chaveiro");
      if (!String(f.deposito || "").trim()) itens.push("Definir o local para depositar os móveis do reintegrado");
    } else if (morador === "nao") {
      if (!f.chaveiro) itens.push("Informar se precisa de chaveiro");
      else if (f.chaveiro === "sim") itens.push("Chamar o chaveiro");
    }
    if (this.depoisDaAvaliacao(cliente.etapa)) {
      if (!f.valorComercial) itens.push("Após a avaliação interna, informar se possui valor comercial");
      if (!f.demolir) itens.push("Informar se precisa demolir e limpar o terreno");
      else if (f.demolir === "sim") itens.push("Demolir e limpar o terreno");
    }
    return itens;
  },

  clientes() {
    const notas = (window.AppState && AppState.judNotes) || {};
    const lista = [];
    Object.keys(notas).forEach((id) => {
      const arr = Array.isArray(notas[id]) ? notas[id] : [];
      const validas = arr.filter((n) => n && n.type === "Judicial" && n.fase !== "Nota Interna" && n.status !== "Cancelada");
      if (!validas.length) return;
      validas.sort((a, b) => new Date(b.date) - new Date(a.date));
      const ultima = validas[0];
      const etapa = this.etapaDe(ultima.fase);
      if (!etapa) return;
      lista.push({
        id: String(id),
        nome: this.nomeCliente(id),
        doc: this.docCliente(id),
        etapa: etapa,
        desde: ultima.date || "",
        prazo: ultima.prazo || ""
      });
    });
    const q = this.fold(this.busca);
    const aba = this.aba;
    const filtrada = lista.filter((c) => {
      if (aba !== "todas" && c.etapa.id !== aba) return false;
      if (!q) return true;
      return this.fold(c.nome + " " + c.doc + " " + c.id + " " + c.etapa.nome).indexOf(q) >= 0;
    });
    const dir = this.dir === -1 ? -1 : 1;
    filtrada.sort((a, b) => {
      let va = "";
      let vb = "";
      if (this.ordem === "etapa") { va = a.etapa.nome; vb = b.etapa.nome; }
      else if (this.ordem === "desde") { va = a.desde; vb = b.desde; }
      else { va = a.nome; vb = b.nome; }
      return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
    });
    return { todas: lista, visiveis: filtrada };
  },

  nomeCliente(id) {
    const sid = String(id);
    const cache = (window.GlobalCustomerCache && GlobalCustomerCache.data) || [];
    const hit = cache.find((c) => String(c.id) === sid);
    if (hit && hit.name) return hit.name;
    const fila = (window.rawClientList || []).find((c) => String(c.customerId) === sid);
    if (fila) return fila.customerName || fila.name || ("Cliente " + sid);
    return "Cliente " + sid;
  },

  docCliente(id) {
    const sid = String(id);
    const cache = (window.GlobalCustomerCache && GlobalCustomerCache.data) || [];
    const hit = cache.find((c) => String(c.id) === sid);
    return (hit && (hit.cpfCnpj || hit.cpf || hit.cnpj)) || "";
  },

  dataBr(iso) {
    const s = String(iso || "").slice(0, 10);
    const p = s.split("-");
    if (p.length !== 3 || p[0].length !== 4) return "—";
    return p[2] + "/" + p[1] + "/" + p[0];
  },

  async abrir() {
    if (window.startCustomerBackgroundSync && (!window.GlobalCustomerCache || !GlobalCustomerCache.data || !GlobalCustomerCache.data.length)) {
      try { await window.startCustomerBackgroundSync(false, true); } catch (e) {}
    }
    await this.carregar();
    this.render();
  },

  async carregar() {
    if (this.lido) return;
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || "null");
      if (raw && raw.fichas) {
        this.fichas = raw.fichas;
        this.updatedAt = Number(raw.updatedAt) || 0;
      }
    } catch (e) {}
    try {
      const fc = window.firebaseCollections;
      if (window.firebaseDb && fc && fc.getDoc && fc.doc) {
        const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", this.DOC));
        if (snap && typeof snap.exists === "function" && snap.exists()) {
          const data = snap.data() || {};
          const nuvem = data.fichas && typeof data.fichas === "object" ? data.fichas : null;
          if (nuvem && (Number(data.updatedAt) || 0) >= this.updatedAt) {
            this.fichas = nuvem;
            this.updatedAt = Number(data.updatedAt) || this.updatedAt;
          }
        }
      }
    } catch (e) {}
    this.lido = true;
  },

  async gravar() {
    this.updatedAt = Date.now();
    const payload = { fichas: this.fichas, updatedAt: this.updatedAt };
    try { localStorage.setItem(this.KEY, JSON.stringify(payload)); } catch (e) {}
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc || !fc.doc) return;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, "config", this.DOC), payload, { merge: true });
    } catch (e) {}
  },

  setAba(id) {
    this.aba = id;
    this.aberto = "";
    this.render();
  },

  setBusca(v) {
    this.busca = v || "";
    const el = document.querySelector("#reintegracao-posse-root .reint-busca");
    const pos = el ? el.selectionStart : null;
    this.render();
    const novo = document.querySelector("#reintegracao-posse-root .reint-busca");
    if (novo) {
      novo.focus();
      if (pos != null) novo.setSelectionRange(pos, pos);
    }
  },

  ordenar(campo) {
    if (this.ordem === campo) this.dir = this.dir === 1 ? -1 : 1;
    else { this.ordem = campo; this.dir = 1; }
    this.render();
  },

  abrirCliente(id) {
    this.aberto = this.aberto === String(id) ? "" : String(id);
    this.render();
  },

  verFicha(id) {
    if (typeof window.openCustomerFromRelacionamento === "function") {
      window.openCustomerFromRelacionamento(id);
    }
  },

  responder(id, campo, valor) {
    if (!this.podeEditar()) return;
    const key = String(id);
    const atual = Object.assign({}, this.fichas[key] || {});
    atual[campo] = valor;
    if (campo === "temMorador" && valor !== "sim") atual.deposito = "";
    this.fichas[key] = atual;
    this.gravar();
    this.render();
  },

  opcoes(atual) {
    return [
      ["", "A definir"],
      ["sim", "Sim"],
      ["nao", "Não"]
    ].map((p) => `<option value="${p[0]}"${atual === p[0] ? " selected" : ""}>${p[1]}</option>`).join("");
  },

  campo(id, nome, rotulo, valor, disabled) {
    return `<label class="reint-campo"><span>${this.esc(rotulo)}</span>
      <select class="form-control" ${disabled} onchange="ReintegracaoPosseApp.responder('${this.esc(id)}','${nome}', this.value)">${this.opcoes(valor || "")}</select>
    </label>`;
  },

  painel(cliente) {
    if (this.aberto !== cliente.id) return "";
    const f = this.fichaDe(cliente.id);
    const disabled = this.podeEditar() ? "" : "disabled";
    const morador = f.temMorador || "";
    const extrasMorador = morador === "sim" ? `
      ${this.campo(cliente.id, "caminhao", "Precisa de caminhão?", f.caminhao, disabled)}
      ${this.campo(cliente.id, "chaveiro", "Precisa de chaveiro?", f.chaveiro, disabled)}
      <label class="reint-campo reint-campo-largo"><span>Local para depositar os móveis do reintegrado</span>
        <input class="form-control" ${disabled} value="${this.esc(f.deposito || "")}" placeholder="Onde os móveis ficam" onchange="ReintegracaoPosseApp.responder('${this.esc(cliente.id)}','deposito', this.value)">
      </label>` : (morador === "nao" ? this.campo(cliente.id, "chaveiro", "Precisa de chaveiro?", f.chaveiro, disabled) : "");
    const avaliacao = this.depoisDaAvaliacao(cliente.etapa) ? `
      <p class="reint-bloco">Depois da avaliação interna</p>
      ${this.campo(cliente.id, "valorComercial", "Possui valor comercial?", f.valorComercial, disabled)}
      ${this.campo(cliente.id, "demolir", "Precisa demolir e limpar o terreno?", f.demolir, disabled)}` : "";
    return `<tr class="reint-detalhe"><td colspan="5">
      <div class="reint-perguntas">
        <p class="reint-bloco">A casa</p>
        ${this.campo(cliente.id, "temMorador", "Tem morador?", morador, disabled)}
        ${extrasMorador}
        ${avaliacao}
      </div>
    </td></tr>`;
  },

  render() {
    const root = document.getElementById("reintegracao-posse-root");
    if (!root) return;
    const dados = this.clientes();
    const conta = (id) => dados.todas.filter((c) => id === "todas" || c.etapa.id === id).length;
    const abas = [{ id: "todas", nome: "Todos", icone: "users" }].concat(this.ETAPAS.map((e) => ({ id: e.id, nome: e.nome, icone: "git-branch" })));
    const th = (campo, rotulo) => `<th onclick="ReintegracaoPosseApp.ordenar('${campo}')" style="cursor:pointer;user-select:none;">${rotulo} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
    const linhas = dados.visiveis.map((c) => {
      const falta = this.pendencias(c);
      return `<tr>
        <td><strong>${this.esc(c.nome)}</strong><div class="reint-sub">${this.esc(c.id)}${c.doc ? " · " + this.esc(c.doc) : ""}</div></td>
        <td>${this.esc(c.etapa.nome)}</td>
        <td>${this.dataBr(c.desde)}</td>
        <td>${falta.map((t) => `<div>${this.esc(t)}</div>`).join("")}</td>
        <td class="is-right" style="white-space:nowrap;">
          <button type="button" class="tvig-ico" title="O que fazer" onclick="ReintegracaoPosseApp.abrirCliente('${this.esc(c.id)}')"><i data-lucide="clipboard-list" style="width:15px;height:15px;"></i></button>
          <button type="button" class="tvig-ico" title="Abrir ficha" onclick="ReintegracaoPosseApp.verFicha('${this.esc(c.id)}')"><i data-lucide="eye" style="width:15px;height:15px;"></i></button>
        </td>
      </tr>${this.painel(c)}`;
    }).join("");
    root.innerHTML = `
      <style>
        .reint-ajuda { margin: 0 0 12px; color: #64748b; font-size: 0.84rem; line-height: 1.45; }
        .reint-busca { max-width: 320px; margin: 10px 0 12px; }
        .reint-table { width: 100%; border-collapse: collapse; background: #fff; }
        .reint-table th { text-align: left; color: var(--color-primary, #105436); font-size: 0.78rem; padding: 8px; border-bottom: 1px solid #e2e8f0; }
        .reint-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-size: 0.84rem; color: #334155; }
        .reint-sub { color: #64748b; font-size: 0.75rem; font-weight: 500; }
        .reint-detalhe td { background: #f8fafc; }
        .reint-perguntas { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
        .reint-campo { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; font-weight: 700; color: #334155; }
        .reint-campo-largo { grid-column: 1 / -1; }
        .reint-bloco { grid-column: 1 / -1; margin: 4px 0 0; font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
        .reint-vazio { text-align: center; color: #64748b; padding: 28px; }
      </style>
      <p class="reint-ajuda">Clientes cuja fase judicial atual é uma das etapas da reintegração de posse. Em cada um fica o que ainda precisa ser resolvido: morador, caminhão, chaveiro, móveis e, depois da avaliação interna, valor comercial e demolição.</p>
      <div class="ml-tabs" role="tablist">
        ${abas.map((a) => `<button type="button" class="ml-tab${this.aba === a.id ? " is-active" : ""}" aria-selected="${this.aba === a.id ? "true" : "false"}" onclick="ReintegracaoPosseApp.setAba('${a.id}')"><i data-lucide="${a.icone}"></i> ${this.esc(a.nome)} <span class="ml-tab-count">${conta(a.id)}</span></button>`).join("")}
      </div>
      <input class="form-control reint-busca" placeholder="Buscar cliente" value="${this.esc(this.busca)}" oninput="ReintegracaoPosseApp.setBusca(this.value)">
      <div style="overflow:auto;">
        <table class="reint-table">
          <thead><tr>
            ${th("cliente", "Cliente")}
            ${th("etapa", "Etapa")}
            ${th("desde", "Desde")}
            <th>O que fazer</th>
            <th class="is-right">Ações</th>
          </tr></thead>
          <tbody>${linhas || `<tr><td colspan="5" class="reint-vazio">Nenhum cliente nesta etapa.</td></tr>`}</tbody>
        </table>
      </div>`;
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  }
};

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "reintegracao-posse" && window.ReintegracaoPosseApp) {
    ReintegracaoPosseApp.abrir();
  }
});
