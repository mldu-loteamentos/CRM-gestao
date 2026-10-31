/* Processo novo: a empresa do grupo pode ser autora ou ré. */
const ProcessoContraApp = {
  fTitulo: "",
  fContrato: "",
  fDoc: "",
  fNome: "",
  fTel: "",
  fEmail: "",
  fEmp: "",
  fUnidade: "",
  unidades: [],
  ccs: [],
  clienteId: "",
  clienteNome: "",
  clienteDoc: "",
  fichaHtml: "",
  buscando: false,
  erroBusca: "",
  filtro: "",
  parte: null,
  itens: [],
  empresaId: "",
  autorEmpresaId: "",
  papelAutor: "empresa",
  valorCausa: "",
  tituloEmpresa: "",
  processo: "",
  motivo: "",
  motivoId: "",
  motivoAberto: false,
  motivoBusca: "",
  motivoEditId: "",
  motivos: [],
  popup: false,
  tipoParte: "cliente",
  anexos: [],
  salvando: false,
  credorBusca: "",
  credorLista: [],
  prefNome: "",
  prefBusca: "",
  terceiroNome: "",
  terceiroDoc: "",
  MOTIVOS_PADRAO: [
    { id: "atraso-obra", nome: "Atraso na entrega da obra" },
    { id: "vicio-construcao", nome: "Vício de construção" },
    { id: "cobranca-indevida", nome: "Cobrança indevida" },
    { id: "rescisao", nome: "Rescisão contratual" },
    { id: "danos-morais", nome: "Danos morais" },
    { id: "revisao", nome: "Revisão de contrato" },
    { id: "posse", nome: "Posse e reintegração" },
    { id: "vizinhanca", nome: "Direito de vizinhança" },
    { id: "publicidade", nome: "Publicidade enganosa" },
    { id: "outro", nome: "Outro" }
  ],

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fold(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  },

  podeEditar() {
    return typeof window.hasCrmPerm === "function" && window.hasCrmPerm("sub_jur_geral_processo_contra_editar") === true;
  },

  fb() {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.collection || !fc.getDocs || !fc.doc || !fc.setDoc) return null;
    return fc;
  },

  empresaGerida(id) {
    const sid = String(id == null ? "" : id).trim();
    if (!sid) return false;
    const num = String(Number(sid));
    const fontes = [];
    if (window.EmpresasState && EmpresasState.customFields) fontes.push(EmpresasState.customFields);
    try { fontes.push(JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {}); } catch (e) {}
    if (window.AppState && AppState.companiesCustom) fontes.push(AppState.companiesCustom);
    for (let i = 0; i < fontes.length; i++) {
      const map = fontes[i] || {};
      const cfg = map[sid] || map[num] || map[Number(sid)];
      if (!cfg || typeof cfg !== "object") continue;
      const v = cfg.gerida_pelo_grupo != null ? cfg.gerida_pelo_grupo : cfg.gerida_grupo;
      if (v == null) continue;
      return v === 1 || v === true || v === "1" || Number(v) === 1;
    }
    return false;
  },

  empresas() {
    const lista = (window.AppState && AppState.companies) || [];
    return lista.filter((c) => this.empresaGerida(c.id)).slice().sort((a, b) => Number(a.id) - Number(b.id));
  },

  nomeEmpresa(id) {
    if (typeof window.getCompanyName === "function") return window.getCompanyName(id) || "";
    const c = this.empresas().find((x) => String(x.id) === String(id));
    return (c && (c.name || c.tradeName)) || "";
  },

  init() {
    this.motivos = this.motivosDoCadastro();
    this.popup = this.podeEditar();
    this.render();
    this.carregar();
    this.carregarMotivosFluxos();
    this.carregarEmpreendimentos();
    if (typeof window.startCustomerBackgroundSync === "function") window.startCustomerBackgroundSync(false, true);
  },

  render() {
    const root = document.getElementById("processo-contra-root");
    if (!root) return;
    if (this.empresaId && String(this.empresaId) !== String(this.tituloEmpresa) && !this.empresas().some((c) => String(c.id) === String(this.empresaId))) this.empresaId = "";
    if (this.autorEmpresaId && !this.empresas().some((c) => String(c.id) === String(this.autorEmpresaId))) this.autorEmpresaId = "";
    const edita = this.podeEditar();
    root.innerHTML = this.popup && edita
      ? `<div class="pc-page">${this.htmlPopup()}</div>`
      : `<div class="pc-page">
        <div class="pc-lista-topo">
          <div class="search-box-wrapper pc-busca pc-filtro">
            <input type="text" id="pc-filtro" class="search-input" placeholder="Número do processo ou motivo..." style="font-style: italic;" autocomplete="off" value="${this.esc(this.filtro)}">
            <i data-lucide="search" class="search-icon"></i>
          </div>
          ${edita ? `<button type="button" class="btn btn-primary" id="pc-novo">Novo processo</button>` : ""}
        </div>
        <div id="pc-lista"></div>
      </div>`;
    this.ligarPesquisa();
    const filtro = document.getElementById("pc-filtro");
    if (filtro) filtro.addEventListener("input", () => {
      this.filtro = filtro.value || "";
      this.pintarLista();
    });
    const num = document.getElementById("pc-numero");
    if (num) num.addEventListener("input", () => this.mascaraProcesso(num));
    const novo = document.getElementById("pc-novo");
    if (novo) novo.addEventListener("click", () => { this.popup = true; this.render(); });
    this.ligarMotivo();
    this.ligarPopup();
    const cancelar = document.getElementById("pc-cancelar");
    const abrir = document.getElementById("pc-abrir");
    if (cancelar) cancelar.addEventListener("click", () => this.limpar());
    if (abrir) abrir.addEventListener("click", () => this.abrir());
    this.empEmpresa.render();
    this.empAutor.render();
    this.pintarLista();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  limpar() {
    this.empresaId = "";
    this.autorEmpresaId = "";
    this.papelAutor = "empresa";
    this.valorCausa = "";
    this.tituloEmpresa = "";
    this.processo = "";
    this.motivo = "";
    this.motivoId = "";
    this.motivoAberto = false;
    this.motivoBusca = "";
    this.motivoEditId = "";
    this.popup = false;
    this.tipoParte = "cliente";
    this.anexos = [];
    this.salvando = false;
    this.parte = null;
    this.fichaHtml = "";
    this.erroBusca = "";
    this.buscando = false;
    this.credorBusca = "";
    this.credorLista = [];
    this.prefNome = "";
    this.prefBusca = "";
    this.terceiroNome = "";
    this.terceiroDoc = "";
    this.fTitulo = "";
    this.fContrato = "";
    this.fDoc = "";
    this.fNome = "";
    this.fTel = "";
    this.fEmail = "";
    this.fEmp = "";
    this.fUnidade = "";
    this.clienteId = "";
    this.empEmpresa.open = false;
    this.empEmpresa.query = "";
    this.empAutor.open = false;
    this.empAutor.query = "";
    this.render();
  },

  tiposParte() {
    return [
      { id: "cliente", label: "Cliente", icon: "user" },
      { id: "credor", label: "Credor", icon: "briefcase" },
      { id: "prefeitura", label: "Prefeitura", icon: "landmark" },
      { id: "terceiro", label: "Outros terceiros", icon: "users" }
    ];
  },

  setPapel(id) {
    const papel = id === "cliente" ? "cliente" : "empresa";
    if (this.papelAutor === papel) return;
    this.papelAutor = papel;
    this.parte = null;
    this.fichaHtml = "";
    this.erroBusca = "";
    this.buscando = false;
    this.tituloEmpresa = "";
    this.empresaId = "";
    this.autorEmpresaId = "";
    this.tipoParte = "cliente";
    this.credorLista = [];
    this.credorBusca = "";
    this.prefNome = "";
    this.prefBusca = "";
    this.terceiroNome = "";
    this.terceiroDoc = "";
    this.fTitulo = "";
    this.fContrato = "";
    this.fDoc = "";
    this.fNome = "";
    this.fTel = "";
    this.fEmail = "";
    this.fEmp = "";
    this.fUnidade = "";
    this.clienteId = "";
    this.render();
  },

  setTipo(id) {
    if (this.tipoParte === id) return;
    this.tipoParte = id;
    this.parte = null;
    this.fichaHtml = "";
    this.erroBusca = "";
    this.buscando = false;
    this.tituloEmpresa = "";
    this.empresaId = "";
    this.credorLista = [];
    this.credorBusca = "";
    this.prefNome = "";
    this.prefBusca = "";
    this.render();
  },

  prontoParaDados() {
    if (this.tipoParte === "terceiro") return true;
    if (this.tipoParte === "prefeitura" && !this.prefeituras().length) return true;
    return !!this.parte;
  },

  htmlFichaBloco() {
    if (this.buscando) {
      return `<div class="crm-card pc-pesq"><div class="crm-card-content" style="padding:24px;"><div class="ml-load"><div class="loading-spinner"></div><div class="loading-status-text">Buscando o cliente</div><div class="ml-load-track"><div class="loading-progress-bar"></div></div></div></div></div>`;
    }
    if (this.erroBusca) return `<p class="cj-nota">${this.esc(this.erroBusca)}</p>`;
    if (!this.fichaHtml) return "";
    return `<div class="crm-card" id="pc-cliente-card" style="margin-bottom:16px;">
      <div class="crm-card-header" style="background-color:#f3f4f6;padding:12px 20px;border-bottom:1px solid #e5e7eb;border-radius:8px 8px 0 0;">
        <h3 style="margin:0;font-size:1.1rem;color:var(--color-primary);">Dados do cliente</h3>
      </div>
      <div class="crm-card-content">${this.fichaHtml}</div>
    </div>`;
  },

  htmlAbasAutor() {
    const tab = (id, icon, label) => {
      const on = this.papelAutor === id;
      return `<button type="button" role="tab" class="ml-tab${on ? " is-active" : ""}" aria-selected="${on ? "true" : "false"}" data-pc-autor="${id}"><i data-lucide="${icon}"></i> ${label}</button>`;
    };
    return `<div class="ml-tabs pc-tipos" role="tablist">${tab("empresa", "building-2", "Empresa")}${tab("cliente", "user", "Cliente")}</div>`;
  },

  htmlAbasReu() {
    const abas = this.tiposParte().map((t) => {
      const on = this.tipoParte === t.id;
      return `<button type="button" role="tab" class="ml-tab${on ? " is-active" : ""}" aria-selected="${on ? "true" : "false"}" data-pc-tipo="${t.id}"><i data-lucide="${t.icon}"></i> ${t.label}</button>`;
    }).join("");
    return `<div class="ml-tabs pc-tipos" role="tablist">${abas}</div>`;
  },

  htmlReu() {
    if (this.papelAutor === "cliente") {
      const porTitulo = !!String(this.fTitulo || "").replace(/\D/g, "") && !!this.tituloEmpresa;
      if (porTitulo) {
        const nome = this.nomeEmpresa(this.tituloEmpresa);
        return `<p class="pc-reu-fixo">${this.esc(this.tituloEmpresa + (nome ? " - " + nome : ""))}</p>
          <p class="cj-nota">O réu é a empresa deste título.</p>`;
      }
      return `<p class="cj-nota">Escolha a empresa do grupo que é a ré. Se o autor vier de um título, a empresa do título entra sozinha.</p>
        <div id="pc-emp-slot"></div>`;
    }
    const busca = this.tipoParte === "cliente" ? this.htmlFichaBloco() : "";
    return `${this.htmlAbasReu()}${this.htmlBuscaTipo()}${busca}`;
  },

  htmlPopup() {
    const autorBusca = this.papelAutor === "cliente" ? `${this.htmlPesquisa()}${this.htmlFichaBloco()}` : `<div id="pc-autor-slot"></div>`;
    const largo = this.papelAutor === "cliente" || (this.papelAutor !== "cliente" && this.tipoParte === "cliente");
    return `<div class="pc-tela pc-folha" id="pc-popup">
      <div class="pc-popup-corpo">
        <div class="pc-partes${largo ? " is-stack" : ""}">
          <section class="pc-parte">
            <h4>Autor</h4>
            ${this.htmlAbasAutor()}
            ${autorBusca}
          </section>
          <section class="pc-parte">
            <h4>Réu</h4>
            ${this.htmlReu()}
          </section>
        </div>
        ${this.htmlDadosProcesso()}
      </div>
    </div>`;
  },

  htmlBuscaTipo() {
    if (this.tipoParte === "cliente") return this.htmlPesquisa();
    if (this.tipoParte === "credor") return this.htmlBuscaCredor();
    if (this.tipoParte === "prefeitura") return this.htmlBuscaPrefeitura();
    return this.htmlTerceiro();
  },

  htmlBuscaCredor() {
    const linhas = (this.credorLista || []).map((c) => {
      const doc = c.cpf || c.cnpj || "";
      const on = this.parte && this.parte.tipo === "credor" && String(this.parte.id) === String(c.id);
      return `<button type="button" class="pc-hit${on ? " is-on" : ""}" data-pc-credor="${this.esc(c.id)}">${this.esc(String(c.id || "") + " - " + (c.name || "") + (doc ? " - " + doc : ""))}</button>`;
    }).join("");
    const lista = this.credorLista && this.credorLista.length
      ? `<div class="pc-hits">${linhas}</div>`
      : (this.credorMsg ? `<p class="cj-nota">${this.esc(this.credorMsg)}</p>` : "");
    return `<div class="pc-busca-tipo">
      <div class="pc-busca-linha">
        <label>Credor<input type="text" id="pc-credor-q" placeholder="Nome, CPF ou CNPJ" value="${this.esc(this.credorBusca)}" autocomplete="off"></label>
        <button type="button" class="btn btn-primary" id="pc-credor-buscar">Pesquisar</button>
      </div>
      ${lista}
    </div>`;
  },

  prefeituras() {
    const cities = new Set();
    const rules = (window.AppState && AppState.rules) || {};
    Object.keys(rules).forEach((k) => {
      const rule = rules[k];
      if (!rule || !String(rule.id || k).startsWith("CID_")) return;
      const nome = String(rule.desc || "").trim();
      if (nome) cities.add(nome);
    });
    return Array.from(cities).sort((a, b) => a.localeCompare(b, "pt-BR"));
  },

  htmlBuscaPrefeitura() {
    const todas = this.prefeituras();
    const q = this.fold(this.prefBusca).trim();
    const lista = todas.filter((n) => !q || this.fold(n).indexOf(q) >= 0);
    const itens = lista.slice(0, 80).map((n) => {
      const on = this.prefNome && this.fold(this.prefNome) === this.fold(n);
      return `<button type="button" class="pc-hit${on ? " is-on" : ""}" data-pc-pref="${this.esc(n)}">${this.esc(n)}</button>`;
    }).join("");
    const vazio = todas.length
      ? (lista.length ? "" : `<p class="cj-nota">Nenhuma prefeitura com esse nome.</p>`)
      : `<label>Nome da prefeitura<input type="text" id="pc-pref-livre" placeholder="Digite o nome" value="${this.esc(this.prefNome)}" autocomplete="off"></label>`;
    return `<div class="pc-busca-tipo">
      <label>Prefeitura<input type="text" id="pc-pref-q" placeholder="Buscar pelo nome..." value="${this.esc(this.prefBusca)}" autocomplete="off"></label>
      ${todas.length ? `<div class="pc-hits">${itens}</div>` : vazio}
    </div>`;
  },

  htmlTerceiro() {
    return `<div class="pc-busca-tipo pc-terc">
      <label>Nome<input type="text" id="pc-terc-nome" placeholder="Nome" value="${this.esc(this.terceiroNome)}" autocomplete="off"></label>
      <label>CPF/CNPJ<input type="text" id="pc-terc-doc" placeholder="000.000.000-00" value="${this.esc(this.terceiroDoc)}" autocomplete="off"></label>
    </div>`;
  },

  htmlDadosProcesso() {
    const arquivos = (this.anexos || []).map((f, i) => `<li><span>${this.esc(f.name)}</span><button type="button" class="tvig-ico is-danger" title="Excluir" data-pc-arq="${i}"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button></li>`).join("");
    return `<div class="pc-form" id="pc-form">
        <label>Número do processo
          <input type="text" id="pc-numero" inputmode="numeric" placeholder="0000000-00.0000.0.00.0000" maxlength="25" value="${this.esc(this.formatarProcesso(this.processo))}" autocomplete="off">
        </label>
        <label>Valor da causa
          <input type="text" id="pc-valor" inputmode="decimal" placeholder="R$ 0,00" value="${this.esc(this.textoMoeda(this.valorCausa))}" autocomplete="off">
        </label>
        ${this.htmlMotivo()}
        <label class="pc-anexo-campo">Anexos
          <input type="file" id="pc-anexos" multiple>
        </label>
        ${arquivos ? `<ul class="pc-anexo-lista">${arquivos}</ul>` : ""}
        <div class="pc-acoes">
          <button type="button" class="btn btn-cancel" id="pc-cancelar">Cancelar</button>
          <button type="button" class="btn btn-primary" id="pc-abrir"${this.salvando ? " disabled" : ""}>${this.salvando ? "Abrindo…" : "Abrir processo"}</button>
        </div>
      </div>`;
  },

  ligarPopup() {
    document.querySelectorAll("[data-pc-autor]").forEach((btn) => {
      btn.addEventListener("click", () => this.setPapel(btn.getAttribute("data-pc-autor")));
    });
    const valor = document.getElementById("pc-valor");
    if (valor) valor.addEventListener("input", () => this.mascaraMoeda(valor));
    document.querySelectorAll("[data-pc-tipo]").forEach((btn) => {
      btn.addEventListener("click", () => this.setTipo(btn.getAttribute("data-pc-tipo")));
    });
    const credQ = document.getElementById("pc-credor-q");
    const credBtn = document.getElementById("pc-credor-buscar");
    if (credQ) credQ.addEventListener("input", () => { this.credorBusca = credQ.value || ""; });
    if (credQ) credQ.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); this.buscarCredor(); } });
    if (credBtn) credBtn.addEventListener("click", () => this.buscarCredor());
    document.querySelectorAll("[data-pc-credor]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-pc-credor");
        const c = (this.credorLista || []).find((x) => String(x.id) === String(id));
        if (c) this.escolherCredor(c);
      });
    });
    const prefQ = document.getElementById("pc-pref-q");
    if (prefQ) prefQ.addEventListener("input", () => {
      this.prefBusca = prefQ.value || "";
      const box = prefQ.parentElement && prefQ.parentElement.parentElement;
      const hits = box ? box.querySelector(".pc-hits") : null;
      if (!hits) return;
      const q = this.fold(this.prefBusca).trim();
      const lista = this.prefeituras().filter((n) => !q || this.fold(n).indexOf(q) >= 0).slice(0, 80);
      hits.innerHTML = lista.map((n) => {
        const on = this.prefNome && this.fold(this.prefNome) === this.fold(n);
        return `<button type="button" class="pc-hit${on ? " is-on" : ""}" data-pc-pref="${this.esc(n)}">${this.esc(n)}</button>`;
      }).join("") || `<p class="cj-nota">Nenhuma prefeitura com esse nome.</p>`;
      hits.querySelectorAll("[data-pc-pref]").forEach((b) => b.addEventListener("click", () => this.escolherPrefeitura(b.getAttribute("data-pc-pref"))));
    });
    document.querySelectorAll("[data-pc-pref]").forEach((btn) => {
      btn.addEventListener("click", () => this.escolherPrefeitura(btn.getAttribute("data-pc-pref")));
    });
    const prefLivre = document.getElementById("pc-pref-livre");
    if (prefLivre) prefLivre.addEventListener("input", () => {
      this.prefNome = prefLivre.value || "";
      const nome = String(this.prefNome || "").trim();
      this.parte = nome ? { tipo: "prefeitura", id: nome, nome: nome, customerId: "", rotulo: nome } : null;
    });
    const tercNome = document.getElementById("pc-terc-nome");
    const tercDoc = document.getElementById("pc-terc-doc");
    if (tercNome) tercNome.addEventListener("input", () => { this.terceiroNome = tercNome.value || ""; });
    if (tercDoc) tercDoc.addEventListener("input", () => { this.mascaraDoc(tercDoc); this.terceiroDoc = tercDoc.value || ""; });
    const arq = document.getElementById("pc-anexos");
    if (arq) arq.addEventListener("change", () => {
      Array.from(arq.files || []).forEach((f) => {
        if (!this.anexos.some((x) => x.name === f.name && x.size === f.size)) this.anexos.push(f);
      });
      arq.value = "";
      this.render();
    });
    document.querySelectorAll("[data-pc-arq]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-pc-arq"));
        this.anexos.splice(i, 1);
        this.render();
      });
    });
  },

  escolherCredor(c) {
    const doc = c.cpf || c.cnpj || "";
    this.parte = {
      tipo: "credor",
      id: String(c.id || ""),
      nome: c.name || "",
      customerId: "",
      rotulo: String(c.id || "") + " - " + (c.name || "") + (doc ? " - " + doc : "")
    };
    this.render();
  },

  escolherPrefeitura(nome) {
    const n = String(nome || "").trim();
    if (!n) return;
    this.prefNome = n;
    this.parte = { tipo: "prefeitura", id: n, nome: n, customerId: "", rotulo: n };
    this.render();
  },

  async buscarCredor() {
    const q = String(this.credorBusca || "").trim();
    const dig = q.replace(/\D/g, "");
    if (q.length < 3 && dig.length < 11) {
      this.credorMsg = "Digite ao menos 3 letras, ou o CPF/CNPJ.";
      this.credorLista = [];
      this.render();
      return;
    }
    if (typeof window.siengeFetchWithRetry !== "function") {
      this.credorMsg = "A consulta de credores não está disponível.";
      this.render();
      return;
    }
    this.credorMsg = "Buscando…";
    this.render();
    let path = "/creditors?limit=15&name=" + encodeURIComponent(q);
    if (dig.length === 11) path = "/creditors?limit=15&cpf=" + encodeURIComponent(dig);
    else if (dig.length === 14) path = "/creditors?limit=15&cnpj=" + encodeURIComponent(dig);
    try {
      const data = await window.siengeFetchWithRetry(path, 1);
      this.credorLista = (data && data.results) || [];
      this.credorMsg = this.credorLista.length ? "" : "Nenhum credor com esse nome.";
    } catch (e) {
      this.credorLista = [];
      this.credorMsg = (e && e.message) || "Não consegui pesquisar o credor.";
    }
    this.render();
  },

  async subirAnexos(id) {
    const lista = (this.anexos || []).filter(Boolean);
    if (!lista.length) return [];
    const fc = window.firebaseCollections;
    if (!window.firebaseStorage || !fc || !fc.ref || !fc.uploadBytes || !fc.getDownloadURL) {
      throw new Error("Não consegui enviar os anexos.");
    }
    const out = [];
    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      const safe = String(file.name || "anexo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "anexo";
      const path = "processos_contra/" + id + "/" + Date.now() + "_" + i + "_" + safe;
      const storageRef = fc.ref(window.firebaseStorage, path);
      await fc.uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
      const url = await fc.getDownloadURL(storageRef);
      out.push({ name: file.name || safe, url: url, type: file.type || "", size: Number(file.size) || 0, path: path });
    }
    return out;
  },

  htmlPesquisa() {
    const optsEmp = (this.ccs || []).map((c) => {
      const sel = String(c.id) === String(this.fEmp) ? " selected" : "";
      return `<option value="${this.esc(c.id)}"${sel}>${this.esc(c.id + " - " + (c.name || ""))}</option>`;
    }).join("");
    const optsUni = (this.unidades || []).map((u) => {
      const sel = String(u.id) === String(this.fUnidade) ? " selected" : "";
      return `<option value="${this.esc(u.id)}"${sel}>${this.esc(u.name || u.id)}</option>`;
    }).join("");
    return `<div class="crm-card pc-pesq">
      <div class="crm-card-header" style="background-color:#f3f4f6;padding:12px 20px;border-bottom:1px solid #e5e7eb;border-radius:8px 8px 0 0;margin-bottom:20px;">
        <h3 style="margin:0;font-size:1.1rem;color:var(--color-primary);">Pesquisar</h3>
      </div>
      <div class="crm-card-content" style="padding-bottom:0;">
        <div class="pc-pesq-grid">
          <div class="form-group"><label>Título (Contas a Receber)</label>
            <input type="text" class="form-control" id="pcf-filter-titulo" value="${this.esc(this.fTitulo)}" autocomplete="off"></div>
          <div class="form-group"><label>Contrato</label>
            <input type="text" class="form-control" id="pcf-filter-contrato" value="${this.esc(this.fContrato)}" autocomplete="off"></div>
          <div class="form-group"><label>CPF/CNPJ</label>
            <input type="text" class="form-control" id="pcf-filter-doc" placeholder="000.000.000-00" value="${this.esc(this.fDoc)}" autocomplete="off"></div>
          <div class="form-group" style="grid-column:1 / 3;"><label>Empreendimento</label>
            <select class="form-control" id="pcf-filter-emp" style="display:none;"><option value="">Selecione...</option>${optsEmp}</select>
            <div id="pcf-emp-slot"></div></div>
          <div class="form-group"><label>Unidade</label>
            <select class="form-control" id="pcf-filter-unidade"><option value="">Selecione o emp...</option>${optsUni}</select></div>
          <div class="form-group" style="display:flex;align-items:flex-end;">
            <button type="button" class="btn btn-primary" id="pcf-limpar" style="height:38px;width:100%;" title="Nova Busca / Limpar"><i data-lucide="eraser" style="width:14px;margin-right:6px;"></i> Limpar</button></div>
          <div class="form-group" style="grid-column:1 / 2;"><label>Nome do Cliente</label>
            <div class="pc-drop"><input type="text" class="form-control" id="pcf-filter-nome" placeholder="Digite para buscar..." value="${this.esc(this.fNome)}" autocomplete="off"></div></div>
          <div class="form-group" style="grid-column:2 / 3;"><label>Telefone</label>
            <div class="pc-drop"><input type="text" class="form-control" id="pcf-filter-telefone" placeholder="Digite para buscar..." value="${this.esc(this.fTel)}" autocomplete="off"></div></div>
          <div class="form-group" style="grid-column:3 / 4;"><label>E-mail</label>
            <input type="text" class="form-control" id="pcf-filter-email" placeholder="Digite para buscar..." value="${this.esc(this.fEmail)}" autocomplete="off"></div>
        </div>
      </div>
    </div>`;
  },

  ligarPesquisa() {
    const self = this;
    const enter = (el) => {
      if (!el) return;
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === "Tab") {
          if (!String(el.value || "").trim()) return;
          ev.preventDefault();
          self.pesquisar();
        }
      });
    };
    const titulo = document.getElementById("pcf-filter-titulo");
    const contrato = document.getElementById("pcf-filter-contrato");
    const doc = document.getElementById("pcf-filter-doc");
    const nome = document.getElementById("pcf-filter-nome");
    const tel = document.getElementById("pcf-filter-telefone");
    const email = document.getElementById("pcf-filter-email");
    const emp = document.getElementById("pcf-filter-emp");
    const uni = document.getElementById("pcf-filter-unidade");
    if (titulo) titulo.addEventListener("input", () => {
      titulo.value = String(titulo.value || "").replace(/\D/g, "");
      this.fTitulo = titulo.value;
      this.clienteId = "";
      this.travarFiltros();
    });
    if (contrato) contrato.addEventListener("input", () => { this.fContrato = contrato.value || ""; this.clienteId = ""; this.travarFiltros(); });
    if (doc) doc.addEventListener("input", () => { this.mascaraDoc(doc); this.fDoc = doc.value || ""; this.clienteId = ""; this.travarFiltros(); });
    if (nome) nome.addEventListener("input", () => {
      this.fNome = nome.value || "";
      this.clienteId = "";
      this.travarFiltros();
      if (typeof window.handleDynamicCustomerSearch === "function") window.handleDynamicCustomerSearch(this.fNome, "nome", "pc");
    });
    if (tel) tel.addEventListener("input", () => {
      tel.value = String(tel.value || "").replace(/\D/g, "");
      this.fTel = tel.value || "";
      this.clienteId = "";
      this.travarFiltros();
      if (typeof window.handleDynamicCustomerSearch === "function") window.handleDynamicCustomerSearch(this.fTel, "telefone", "pc");
    });
    if (email) email.addEventListener("input", () => {
      this.fEmail = email.value || "";
      this.clienteId = "";
      this.travarFiltros();
      if (typeof window.handleDynamicCustomerSearch === "function") window.handleDynamicCustomerSearch(this.fEmail, "email", "pc");
    });
    if (emp) emp.addEventListener("change", () => {
      this.fEmp = emp.value || "";
      this.fUnidade = "";
      this.unidades = [];
      this.clienteId = "";
      this.carregarUnidades(this.fEmp);
    });
    if (uni) uni.addEventListener("change", () => {
      this.fUnidade = uni.value || "";
      this.clienteId = "";
      if (this.fUnidade) this.pesquisar();
    });
    [titulo, contrato, doc, nome, tel, email].forEach(enter);
    const limpar = document.getElementById("pcf-limpar");
    if (limpar) limpar.addEventListener("click", () => this.limparBusca());
    this.travarFiltros();
    this.empPicker.render();
  },

  empEmpresa: {
    id: "pc-empresa-filter",
    open: false,
    query: "",
    bound: false,
    items() {
      return ProcessoContraApp.empresas().map((c) => ({
        id: String(c.id),
        label: String(c.id) + " - " + String(ProcessoContraApp.nomeEmpresa(c.id) || c.name || c.tradeName || "").toUpperCase()
      }));
    },
    opts() {
      return {
        id: this.id,
        label: "Empresa",
        items: this.items(),
        selectedIds: ProcessoContraApp.empresaId ? [String(ProcessoContraApp.empresaId)] : [],
        open: this.open,
        query: this.query,
        single: true,
        emptyMeansAll: false,
        emptyLabel: "Selecione",
        nouns: { singular: "empresa", plural: "empresas", noMatch: "Nenhuma empresa com esse nome." }
      };
    },
    bind() {
      if (this.bound || !window.MlEmpresaFilter) return;
      this.bound = true;
      const self = this;
      MlEmpresaFilter.bind(this.id, {
        toggleOpen() {
          self.open = !self.open;
          if (!self.open) self.query = "";
          self.render();
        },
        close() { self.open = false; self.query = ""; self.render(); },
        setQuery(q) {
          self.query = q || "";
          const list = document.getElementById(self.id + "-list");
          if (list) list.innerHTML = MlEmpresaFilter.listHtml(self.opts());
        },
        toggleId(itemId) {
          ProcessoContraApp.empresaId = String(itemId || "");
          self.open = false;
          self.query = "";
          self.render();
        }
      });
    },
    render() {
      const slot = document.getElementById("pc-emp-slot");
      if (!slot || !window.MlEmpresaFilter) return;
      this.bind();
      slot.innerHTML = MlEmpresaFilter.html(this.opts());
      if (window.lucide) lucide.createIcons();
    }
  },

  empAutor: {
    id: "pc-autor-filter",
    open: false,
    query: "",
    bound: false,
    items() {
      return ProcessoContraApp.empresas().map((c) => ({
        id: String(c.id),
        label: String(c.id) + " - " + String(ProcessoContraApp.nomeEmpresa(c.id) || c.name || c.tradeName || "").toUpperCase()
      }));
    },
    opts() {
      return {
        id: this.id,
        label: "Empresa",
        items: this.items(),
        selectedIds: ProcessoContraApp.autorEmpresaId ? [String(ProcessoContraApp.autorEmpresaId)] : [],
        open: this.open,
        query: this.query,
        single: true,
        emptyMeansAll: false,
        emptyLabel: "Selecione",
        nouns: { singular: "empresa", plural: "empresas", noMatch: "Nenhuma empresa com esse nome." }
      };
    },
    bind() {
      if (this.bound || !window.MlEmpresaFilter) return;
      this.bound = true;
      const self = this;
      MlEmpresaFilter.bind(this.id, {
        toggleOpen() {
          self.open = !self.open;
          if (!self.open) self.query = "";
          self.render();
        },
        close() { self.open = false; self.query = ""; self.render(); },
        setQuery(q) {
          self.query = q || "";
          const list = document.getElementById(self.id + "-list");
          if (list) list.innerHTML = MlEmpresaFilter.listHtml(self.opts());
        },
        toggleId(itemId) {
          ProcessoContraApp.autorEmpresaId = String(itemId || "");
          self.open = false;
          self.query = "";
          self.render();
        }
      });
    },
    render() {
      const slot = document.getElementById("pc-autor-slot");
      if (!slot || !window.MlEmpresaFilter) return;
      this.bind();
      slot.innerHTML = MlEmpresaFilter.html(this.opts());
      if (window.lucide) lucide.createIcons();
    }
  },

  empPicker: {
    id: "pcf-emp-filter",
    open: false,
    query: "",
    bound: false,
    select() { return document.getElementById("pcf-filter-emp"); },
    items() {
      const sel = this.select();
      if (!sel) return [];
      return Array.from(sel.options).filter((o) => o.value !== "").map((o) => ({ id: String(o.value), label: String(o.textContent || "").trim().toUpperCase() }));
    },
    opts() {
      const sel = this.select();
      return {
        id: this.id,
        label: "Empreendimento",
        items: this.items(),
        selectedIds: sel && sel.value ? [String(sel.value)] : [],
        open: this.open,
        query: this.query,
        single: true,
        emptyMeansAll: false,
        nouns: { singular: "empreendimento", plural: "empreendimentos", noMatch: "Nenhum empreendimento com esse nome." }
      };
    },
    bind() {
      if (this.bound || !window.MlEmpresaFilter) return;
      this.bound = true;
      const self = this;
      MlEmpresaFilter.bind(this.id, {
        toggleOpen() {
          const sel = self.select();
          if (sel && sel.disabled) return;
          self.open = !self.open;
          if (!self.open) self.query = "";
          self.render();
        },
        close() { self.open = false; self.query = ""; self.render(); },
        setQuery(q) {
          self.query = q || "";
          const list = document.getElementById(self.id + "-list");
          if (list) list.innerHTML = MlEmpresaFilter.listHtml(self.opts());
        },
        toggleId(itemId) {
          const sel = self.select();
          if (!sel) return;
          self.open = false;
          self.query = "";
          if (String(sel.value) !== String(itemId)) {
            sel.value = String(itemId);
            sel.dispatchEvent(new Event("change", { bubbles: true }));
          }
          self.render();
        }
      });
    },
    render() {
      const slot = document.getElementById("pcf-emp-slot");
      const sel = this.select();
      if (!slot || !sel || !window.MlEmpresaFilter) return;
      this.bind();
      if (sel.disabled) { this.open = false; this.query = ""; }
      slot.innerHTML = MlEmpresaFilter.html(this.opts());
      const btn = slot.querySelector(".ml-emp-filter-btn");
      if (btn) {
        btn.disabled = !!sel.disabled;
        if (!sel.value) {
          const span = btn.querySelector("span");
          if (span) span.textContent = this.items().length ? "Selecione..." : "Carregando empreendimentos...";
        }
      }
      if (window.lucide) lucide.createIcons();
    }
  },

  travarFiltros() {
    const nome = document.getElementById("pcf-filter-nome");
    const tel = document.getElementById("pcf-filter-telefone");
    const email = document.getElementById("pcf-filter-email");
    const doc = document.getElementById("pcf-filter-doc");
    const titulo = document.getElementById("pcf-filter-titulo");
    const contrato = document.getElementById("pcf-filter-contrato");
    const emp = document.getElementById("pcf-filter-emp");
    const uni = document.getElementById("pcf-filter-unidade");
    const hasNome = nome && nome.value.trim() !== "";
    const hasTel = tel && tel.value.trim() !== "";
    const hasEmail = email && email.value.trim() !== "";
    const hasDoc = doc && doc.value.trim() !== "";
    const hasTitulo = titulo && titulo.value.trim() !== "";
    const hasContrato = contrato && contrato.value.trim() !== "";
    const hasEmp = emp && emp.value !== "";
    if (nome) nome.disabled = hasTel || hasEmail || hasDoc || hasTitulo || hasContrato || hasEmp;
    if (tel) tel.disabled = hasNome || hasEmail || hasDoc || hasTitulo || hasContrato || hasEmp;
    if (email) email.disabled = hasNome || hasTel || hasDoc || hasTitulo || hasContrato || hasEmp;
    if (doc) doc.disabled = hasNome || hasTel || hasEmail || hasTitulo || hasContrato || hasEmp;
    if (titulo) titulo.disabled = hasNome || hasTel || hasEmail || hasDoc || hasContrato || hasEmp;
    if (contrato) contrato.disabled = hasNome || hasTel || hasEmail || hasDoc || hasTitulo || hasEmp;
    if (emp) emp.disabled = hasNome || hasTel || hasEmail || hasDoc || hasTitulo || hasContrato;
    if (uni) uni.disabled = !hasEmp || hasNome || hasTel || hasEmail || hasDoc || hasTitulo || hasContrato;
    this.empPicker.render();
  },

  mascaraDoc(input) {
    let v = String(input.value || "").replace(/\D/g, "");
    if (v.length <= 11) {
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      v = v.replace(/^(\d{2})(\d)/, "$1.$2");
      v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
      v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
      v = v.replace(/(\d{4})(\d)/, "$1-$2");
      if (v.length > 18) v = v.substring(0, 18);
    }
    input.value = v;
  },

  limparBusca() {
    this.fTitulo = "";
    this.fContrato = "";
    this.fDoc = "";
    this.fNome = "";
    this.fTel = "";
    this.fEmail = "";
    this.fEmp = "";
    this.fUnidade = "";
    this.unidades = [];
    this.clienteId = "";
    this.clienteNome = "";
    this.clienteDoc = "";
    this.fichaHtml = "";
    this.erroBusca = "";
    this.buscando = false;
    this.parte = null;
    this.tituloEmpresa = "";
    this.empPicker.open = false;
    this.empPicker.query = "";
    this.render();
  },

  async carregarEmpreendimentos() {
    if (!window.SiengeApiService || typeof SiengeApiService.getCostCenters !== "function") return;
    try {
      let ccs = await SiengeApiService.getCostCenters();
      let customFields = {};
      try { customFields = JSON.parse(localStorage.getItem("crm_centros_custo_custom") || "{}") || {}; } catch (e) {}
      if (window.EstoqueComercialApp && typeof EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento === "function") {
        ccs = EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento(ccs);
      } else {
        ccs = (ccs || []).filter((c) => {
          const custom = customFields[c.id] || {};
          const tipo = custom.tipo_cc || "";
          return tipo === "Loteamento Aberto" || tipo === "Loteamento Fechado" || tipo === "Incorporação";
        });
      }
      ccs.sort((a, b) => Number(a.id) - Number(b.id));
      this.ccs = ccs;
      const sel = document.getElementById("pcf-filter-emp");
      if (!sel) return;
      const keep = this.fEmp;
      sel.innerHTML = `<option value="">Selecione...</option>` + ccs.map((c) => `<option value="${this.esc(c.id)}">${this.esc(c.id + " - " + (c.name || ""))}</option>`).join("");
      if (keep) sel.value = keep;
      this.empPicker.render();
    } catch (e) {}
  },

  async carregarUnidades(cc) {
    const sel = document.getElementById("pcf-filter-unidade");
    if (!cc) {
      this.unidades = [];
      if (sel) {
        sel.innerHTML = `<option value="">Selecione o emp...</option>`;
        sel.disabled = true;
      }
      this.travarFiltros();
      return;
    }
    if (sel) {
      sel.innerHTML = `<option value="">Carregando unidades...</option>`;
      sel.disabled = true;
    }
    try {
      let all = [];
      let offset = 0;
      while (offset < 5000) {
        const data = await window.siengeFetchWithRetry(`/units?limit=200&offset=${offset}&enterpriseId=${encodeURIComponent(cc)}&additionalData=NONE`);
        const results = (data && data.results) || [];
        all = all.concat(results);
        if (!results.length) break;
        offset += results.length;
        if (results.length < 200) break;
      }
      all = all.filter((u) => u.commercialStock !== "T");
      all.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt", { numeric: true }));
      this.unidades = all.map((u) => ({ id: u.id, name: u.name || u.id }));
      if (sel) {
        sel.innerHTML = `<option value="">Selecione uma unidade...</option>` + this.unidades.map((u) => `<option value="${this.esc(u.id)}">${this.esc(u.name)}</option>`).join("");
      }
    } catch (e) {
      this.unidades = [];
      if (sel) sel.innerHTML = `<option value="">Erro ao carregar unidades</option>`;
    }
    this.travarFiltros();
  },

  acharNoCache() {
    const cache = window.GlobalCustomerCache && GlobalCustomerCache.data;
    if (!cache) return null;
    const nome = this.fold(this.fNome).trim();
    const tel = String(this.fTel || "").replace(/\D/g, "");
    const email = this.fold(this.fEmail).trim();
    let match = null;
    if (nome) {
      const termos = nome.split(" ").filter(Boolean);
      match = cache.find((c) => termos.every((t) => this.fold(c.name).indexOf(t) >= 0));
    } else if (tel.length >= 4) {
      match = cache.find((c) => (c.phones || []).some((p) => {
        const full = String(p.areaCode || "") + String(p.number || p.phoneNumber || "");
        return full.replace(/\D/g, "").indexOf(tel) >= 0;
      }));
    } else if (email) {
      match = cache.find((c) => this.fold(c.email).indexOf(email) >= 0);
    }
    if (!match) return null;
    if (typeof window.filterCustomersToAssignedPortfolio === "function") {
      const ok = window.filterCustomersToAssignedPortfolio([match]);
      if (!ok.length) return null;
    }
    return match;
  },

  async resolverCliente() {
    const titulo = String(this.fTitulo || "").replace(/\D/g, "");
    const contrato = String(this.fContrato || "").trim();
    const doc = String(this.fDoc || "").replace(/\D/g, "");
    const get = window.relSiengeGet;
    this.tituloEmpresa = "";
    if (titulo) {
      let bill = null;
      try { bill = await get("/accounts-receivable/receivable-bills/" + encodeURIComponent(titulo)); }
      catch (e) { bill = typeof window.relFindTituloLocal === "function" ? window.relFindTituloLocal(titulo) : null; }
      if (!bill) throw new Error("Título não encontrado.");
      const tipo = String(bill.documentId || "").trim().toUpperCase();
      if (tipo && tipo !== "CT" && tipo !== "CTCV") throw new Error("O título " + titulo + " não é de venda.");
      if (!bill.customerId) throw new Error("O título não tem cliente.");
      const company = String(bill.companyId || bill.debtorId || "").replace(/\D/g, "");
      this.tituloEmpresa = company;
      if (company) this.empresaId = company;
      return String(bill.customerId);
    }
    if (contrato) {
      const c = await window.findSalesContractExact(contrato, get);
      if (!c) throw new Error("Contrato não encontrado.");
      const id = c.customerId || (c.customer && c.customer.id) || (c.customers && c.customers[0] && (c.customers[0].id || c.customers[0].customerId));
      if (!id) throw new Error("O contrato não tem cliente.");
      return String(id);
    }
    if (doc && !(this.clienteId && this.clienteDoc && doc === String(this.clienteDoc).replace(/\D/g, ""))) {
      const param = doc.length === 14 ? "cnpj=" + doc : "cpf=" + doc;
      const data = await get("/customers?" + param);
      const lista = (data && data.results) || [];
      if (!lista.length) throw new Error("CPF/CNPJ não encontrado.");
      return String(lista[0].id);
    }
    if (this.clienteId) return String(this.clienteId);
    if (this.fEmp && this.fUnidade) {
      const uni = document.getElementById("pcf-filter-unidade");
      const nomeUni = uni && uni.selectedIndex >= 0 ? uni.options[uni.selectedIndex].text.trim() : "";
      let customerId = "";
      try {
        const uData = await get("/units?enterpriseId=" + encodeURIComponent(this.fEmp) + "&name=" + encodeURIComponent(nomeUni));
        const uObj = ((uData && uData.results) || []).find((u) => String(u.id) === String(this.fUnidade));
        if (uObj && uObj.contractId) {
          const ct = await get("/sales-contracts/" + encodeURIComponent(uObj.contractId));
          customerId = ct && (ct.customerId || (ct.customer && ct.customer.id));
        }
      } catch (e) {}
      if (!customerId) {
        const direct = await get("/sales-contracts?enterpriseId=" + encodeURIComponent(this.fEmp) + "&unitId=" + encodeURIComponent(this.fUnidade));
        const lista = ((direct && direct.results) || []).filter((c) => String(c.unitId) === String(this.fUnidade));
        const ct = lista[0];
        customerId = ct && (ct.customerId || (ct.customer && ct.customer.id));
      }
      if (!customerId) throw new Error("Não há cliente nesta unidade.");
      return String(customerId);
    }
    const match = this.acharNoCache();
    if (match) {
      this.clienteId = match.id;
      this.clienteNome = match.name;
      this.clienteDoc = match.cpf || match.cnpj || match.cpfCnpj || "";
      return String(match.id);
    }
    if (String(this.fNome || "").trim() || String(this.fTel || "").replace(/\D/g, "") || String(this.fEmail || "").trim()) {
      throw new Error("Cliente não encontrado.");
    }
    throw new Error("Preencha um campo para pesquisar.");
  },

  docMascara(val) {
    const d = String(val || "").replace(/\D/g, "");
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    return d || "Não informado";
  },

  htmlFicha(c) {
    const nome = this.esc(c.name || "");
    const docBruto = c.cpfCnpj || c.cpf || c.cnpj || this.clienteDoc || "";
    const doc = this.docMascara(docBruto);
    const docLabel = String(docBruto).replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF";
    let age = "Não informado";
    const nasc = c.birthDate || "";
    if (String(docBruto).replace(/\D/g, "").length > 11) age = "Não se aplica";
    else if (nasc && nasc !== "1980-01-01") {
      const birth = new Date(nasc + "T12:00:00");
      if (!isNaN(birth.getTime())) {
        const today = new Date();
        let diff = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) diff--;
        age = diff + " anos";
      }
    }
    const prof = this.esc(c.profession || c.occupation || "N/D");
    const email = c.email && c.email !== "N/D" ? String(c.email) : "";
    let addr = "Não informado";
    let addrLabel = "Endereço";
    let addrIcon = "home";
    if (c.addresses && c.addresses.length) {
      const a = c.addresses[0];
      const comercial = a.type === 2 || String(a.typeDescription || a.type || "").toUpperCase().indexOf("COM") >= 0;
      addrIcon = comercial ? "building" : "home";
      addrLabel = comercial ? "Endereço Comercial" : "Endereço Residencial";
      const street = a.street || a.streetName || "";
      const num = a.number ? ", " + a.number : "";
      const compl = a.complement ? " - " + a.complement : "";
      const neigh = a.neighborhood ? ", " + a.neighborhood : "";
      const city = a.cityName || a.city || "";
      const state = a.stateName || a.state || "";
      const zip = (a.postalCode || a.zipCode) ? " - CEP: " + (a.postalCode || a.zipCode) : "";
      addr = street + num + compl + neigh + ", " + city + "/" + state + zip;
    } else if (c.address && c.address !== "N/D") addr = c.address;
    const fones = [];
    (c.phones || []).forEach((p) => {
      const ddd = String(p.areaCode || "").replace(/\D/g, "");
      const num = String(p.number || p.phoneNumber || "").replace(/\D/g, "");
      const full = ddd + num;
      let formatted = full;
      if (full.length === 11) formatted = "(" + full.slice(0, 2) + ") " + full.slice(2, 7) + "-" + full.slice(7);
      else if (full.length === 10) formatted = "(" + full.slice(0, 2) + ") " + full.slice(2, 6) + "-" + full.slice(6);
      if (!formatted || fones.some((x) => x.formatted === formatted)) return;
      fones.push({ formatted: formatted, raw: full, principal: p.main === true || String(p.type || "").toUpperCase() === "MAIN" });
    });
    if (fones.length && !fones.some((p) => p.principal)) fones[0].principal = true;
    const foneHtml = fones.length ? fones.map((p) => `<div style="display:flex;align-items:center;gap:8px;">
        <i data-lucide="phone" style="width:15px;height:15px;color:var(--color-primary);"></i>
        <span style="font-size:0.95rem;color:#1e293b;font-weight:500;">${this.esc(p.formatted)}</span>
        ${p.principal ? `<span class="badge badge-success" style="font-size:0.6rem;padding:2px 6px;text-transform:none;">Principal</span>` : ""}
        <button type="button" onclick="copyToClipboard('${p.raw}', this)" style="background:none;border:none;padding:4px;cursor:pointer;" title="Copiar número"><i data-lucide="copy" style="width:14px;height:14px;color:var(--color-primary);"></i></button>
      </div>`).join("") : `<span style="font-size:0.95rem;color:#1e293b;">Não informado</span>`;
    const docDig = String(docBruto).replace(/\D/g, "");
    return `<div class="cessao-customer-grid">
      <div class="cessao-customer-field cessao-customer-field--wide"><span class="cessao-lbl">Nome</span><span class="cessao-val">${nome}</span></div>
      <div class="cessao-customer-field"><span class="cessao-lbl">${docLabel}</span><span class="cessao-val" style="display:flex;align-items:center;gap:8px;">${this.esc(doc)}
        ${docDig ? `<button type="button" onclick="copyToClipboard('${docDig}', this)" style="background:none;border:none;padding:4px;cursor:pointer;" title="Copiar Documento"><i data-lucide="copy" style="width:14px;height:14px;color:var(--color-primary);"></i></button>` : ""}
      </span></div>
      <div class="cessao-customer-field"><span class="cessao-lbl">Idade</span><span class="cessao-val" style="display:flex;align-items:center;gap:8px;"><i data-lucide="calendar" style="width:15px;height:15px;color:var(--color-primary);"></i> ${this.esc(age)}</span></div>
      <div class="cessao-customer-field"><span class="cessao-lbl">Profissão</span><span class="cessao-val" style="display:flex;align-items:center;gap:8px;"><i data-lucide="briefcase" style="width:15px;height:15px;color:var(--color-primary);"></i> ${prof}</span></div>
      <div class="cessao-customer-field"><span class="cessao-lbl">Telefones</span>${foneHtml}</div>
      <div class="cessao-customer-field cessao-customer-field--wide"><span class="cessao-lbl">E-mail</span><span class="cessao-val" style="display:flex;align-items:center;gap:8px;"><i data-lucide="mail" style="width:15px;height:15px;color:var(--color-primary);"></i> ${this.esc(email || "Não informado")}</span></div>
      <div class="cessao-customer-field cessao-customer-field--full"><span class="cessao-lbl">${this.esc(addrLabel)}</span><span class="cessao-val" style="display:flex;align-items:flex-start;gap:8px;"><i data-lucide="${addrIcon}" style="width:15px;height:15px;color:var(--color-primary);margin-top:2px;"></i> ${this.esc(addr)}</span></div>
    </div>`;
  },

  async pesquisar() {
    const ler = (id) => { const el = document.getElementById(id); return el ? (el.value || "") : ""; };
    if (document.getElementById("pcf-filter-titulo")) {
      this.fTitulo = ler("pcf-filter-titulo");
      this.fContrato = ler("pcf-filter-contrato");
      this.fDoc = ler("pcf-filter-doc");
      this.fNome = ler("pcf-filter-nome");
      this.fTel = ler("pcf-filter-telefone");
      this.fEmail = ler("pcf-filter-email");
      const emp = document.getElementById("pcf-filter-emp");
      const uni = document.getElementById("pcf-filter-unidade");
      if (emp) this.fEmp = emp.value || "";
      if (uni) this.fUnidade = uni.value || "";
    }
    const token = (this._buscaToken = (this._buscaToken || 0) + 1);
    this.buscando = true;
    this.erroBusca = "";
    this.fichaHtml = "";
    this.parte = null;
    this.render();
    try {
      const id = await this.resolverCliente();
      if (token !== this._buscaToken) return;
      const api = window.SiengeApiService;
      const full = api && typeof api.getCustomer === "function" ? await api.getCustomer(id) : null;
      if (token !== this._buscaToken) return;
      if (!full) throw new Error("Não encontrei o cadastro deste cliente.");
      const doc = full.cpfCnpj || full.cpf || full.cnpj || this.clienteDoc || "";
      const docFmt = this.docMascara(doc);
      this.clienteId = String(full.id || id);
      this.clienteNome = full.name || this.clienteNome || "";
      this.clienteDoc = doc;
      this.parte = {
        tipo: "cliente",
        id: this.clienteId,
        nome: this.clienteNome,
        customerId: this.clienteId,
        rotulo: this.clienteId + " - " + this.clienteNome + (docFmt && docFmt !== "Não informado" ? " - " + docFmt : "")
      };
      this.fichaHtml = this.htmlFicha(full);
      this.buscando = false;
    } catch (e) {
      if (token !== this._buscaToken) return;
      this.buscando = false;
      this.erroBusca = (e && e.message) || "Não consegui pesquisar o cliente.";
    }
    this.render();
  },

  async carregar() {
    const fc = this.fb();
    const box = document.getElementById("pc-lista");
    if (!fc) {
      if (box) box.innerHTML = `<p class="cj-nota">Não consegui ler os processos: o Firebase não está disponível.</p>`;
      return;
    }
    try {
      const snap = await fc.getDocs(fc.collection(window.firebaseDb, "processos_contra"));
      const itens = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        data.id = d.id;
        itens.push(data);
      });
      itens.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      this.itens = itens;
      this.sincronizarFila();
    } catch (e) {
      if (box) box.innerHTML = `<p class="cj-nota">Não consegui ler os processos: ${this.esc((e && e.message) || e)}</p>`;
      return;
    }
    this.pintarLista();
  },

  pintarLista() {
    const box = document.getElementById("pc-lista");
    if (!box) return;
    const edita = this.podeEditar();
    if (!this.itens.length) {
      box.innerHTML = `<div class="cc-scroll"><table class="cc-table"><tbody><tr><td class="cj-vazio">Nenhum processo aberto.</td></tr></tbody></table></div>`;
      return;
    }
    const q = this.fold(this.filtro).trim();
    const visiveis = !q ? this.itens : this.itens.filter((item) => {
      const lados = this.nomesPartes(item);
      const blob = this.fold((item.processo || "") + " " + (item.motivo || "") + " " + lados.autor + " " + lados.reu);
      return blob.indexOf(q) >= 0;
    });
    if (!visiveis.length) {
      box.innerHTML = `<div class="cc-scroll"><table class="cc-table"><tbody><tr><td class="cj-vazio">Nenhum processo com esse número ou motivo.</td></tr></tbody></table></div>`;
      return;
    }
    const linhas = visiveis.map((item) => {
      const quando = this.quando(item.createdAt);
      const acao = edita
        ? `<button type="button" class="tvig-ico is-danger" title="Excluir" data-pc-del="${this.esc(item.id)}"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>`
        : "";
      const lados = this.nomesPartes(item);
      return `<tr>
        <td class="cc-nome">${this.esc(lados.autor)}</td>
        <td class="cc-nome">${this.esc(lados.reu)}</td>
        <td>${this.esc(this.formatarProcesso(item.processo) || item.processo || "—")}</td>
        <td class="cc-nome">${this.esc(item.motivo || "—")}</td>
        <td>${this.esc(this.money(item.valorCausa))}</td>
        <td class="pc-anexos-cell">${this.htmlAnexosItem(item)}</td>
        <td class="cj-quem"><span class="cj-quem-linha">${this.esc(item.createdBy || "—")}${quando ? `<span class="cj-quando">${this.esc(quando)}</span>` : ""}</span></td>
        <td class="is-center">${acao}</td>
      </tr>`;
    }).join("");
    box.innerHTML = `<div class="cc-scroll"><table class="cc-table cj-cc">
      <thead><tr><th>Autor</th><th>Réu</th><th>Processo</th><th>Motivo</th><th>Valor da causa</th><th>Anexos</th><th>Aberto por</th><th class="is-center">Ações</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
    box.querySelectorAll("[data-pc-del]").forEach((btn) => {
      btn.addEventListener("click", () => this.excluir(btn.getAttribute("data-pc-del")));
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  htmlAnexosItem(item) {
    const lista = Array.isArray(item.anexos) ? item.anexos : [];
    if (!lista.length) return "—";
    return lista.map((a) => {
      const url = String(a && a.url || "");
      const nome = this.esc(a && a.name ? a.name : "Anexo");
      if (!url) return nome;
      return `<a href="${this.esc(url)}" target="_blank" rel="noopener">${nome}</a>`;
    }).join("<br>");
  },

  nomesPartes(item) {
    const empresa = [item.companyId, item.companyName].filter(Boolean).join(" - ") || "—";
    const outra = item.parteRotulo || item.parteNome || "—";
    const empresaAutora = item.poloEmpresa === "autor" || item.autorTipo === "empresa";
    if (empresaAutora) return { autor: item.autorNome || empresa, reu: item.reuNome || outra };
    return { autor: item.autorNome || outra, reu: item.reuNome || empresa };
  },

  money(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  textoMoeda(v) {
    if (v == null || v === "") return "";
    const texto = String(v);
    if (/R\$\s*\d/.test(texto)) return texto;
    const n = this.lerValor(texto);
    if (n == null) return "";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  mascaraMoeda(input) {
    const digitos = String(input.value || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (!digitos) {
      input.value = "";
      this.valorCausa = "";
      return;
    }
    const n = Number(digitos) / 100;
    const txt = n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    input.value = txt;
    this.valorCausa = txt;
  },

  formatarProcesso(valor) {
    const d = String(valor || "").replace(/\D/g, "").slice(0, 20);
    if (!d) return "";
    let out = d.slice(0, 7);
    if (d.length > 7) out += "-" + d.slice(7, 9);
    if (d.length > 9) out += "." + d.slice(9, 13);
    if (d.length > 13) out += "." + d.slice(13, 14);
    if (d.length > 14) out += "." + d.slice(14, 16);
    if (d.length > 16) out += "." + d.slice(16, 20);
    return out;
  },

  mascaraProcesso(input) {
    const txt = this.formatarProcesso(input.value);
    input.value = txt;
    this.processo = txt;
  },

  motivosDoCadastro() {
    const app = window.FluxosProcesso;
    const lista = (app && app.state && app.state.fluxos) || [];
    return lista.filter((f) => {
      const nome = String(f && f.nome || "").trim();
      if (!nome) return false;
      const n = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ");
      return n !== "COBRANCA JUDICIAL";
    }).map((f) => ({ id: String(f.id), nome: String(f.nome).trim() }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },

  async carregarMotivosFluxos() {
    const app = window.FluxosProcesso;
    if (app && !app.state.abertoId) {
      if (!app.state.pronto) app.carregarLocal();
      const remoto = await app.lerRemoto();
      if (Array.isArray(remoto) && remoto.length && !app.state.abertoId) app.state.fluxos = remoto;
    }
    this.motivos = this.motivosDoCadastro();
    if (this.motivoId && !this.motivos.some((m) => m.id === this.motivoId)) {
      this.motivoId = "";
      this.motivo = "";
    }
    this.pintarMotivoPainel();
  },

  lerValor(v) {
    let s = String(v || "").trim().replace(/[R$\s]/g, "");
    if (!s) return null;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  },

  tipoTxt(tipo) {
    if (tipo === "credor") return "Credor";
    if (tipo === "prefeitura") return "Prefeitura";
    if (tipo === "terceiro") return "Outros terceiros";
    if (tipo === "titulo") return "Título";
    return "Cliente";
  },

  quando(iso) {
    const dt = new Date(iso || "");
    if (!iso || isNaN(dt.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      }).format(dt);
    } catch (e) {
      return "";
    }
  },

  lerMotivosLocal() {
    let lista = null;
    try { lista = JSON.parse(localStorage.getItem("crm_processo_contra_motivos") || "null"); } catch (e) { lista = null; }
    const normal = (m) => {
      const id = String(m && m.id || "").trim();
      const nome = String(m && m.nome || "").trim();
      return id && nome ? { id: id, nome: nome } : null;
    };
    const prontos = Array.isArray(lista) ? lista.map(normal).filter(Boolean) : [];
    this.motivos = prontos.length ? prontos : this.MOTIVOS_PADRAO.map((m) => ({ id: m.id, nome: m.nome }));
  },

  gravarMotivosLocal() {
    try { localStorage.setItem("crm_processo_contra_motivos", JSON.stringify(this.motivos)); } catch (e) {}
  },

  async salvarCatalogo() {
    this.gravarMotivosLocal();
    const fc = this.fb();
    if (!fc) throw new Error("O Firebase não está disponível.");
    await fc.setDoc(fc.doc(window.firebaseDb, "processos_contra_motivos", "lista"), {
      itens: this.motivos.map((m) => ({ id: m.id, nome: m.nome })),
      updatedAt: new Date().toISOString()
    });
  },

  async carregarMotivosNuvem() {
    const fc = this.fb();
    if (!fc) return;
    try {
      const snap = await fc.getDoc(fc.doc(window.firebaseDb, "processos_contra_motivos", "lista"));
      const existe = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      const data = existe ? (snap.data() || {}) : null;
      const itens = data && Array.isArray(data.itens) ? data.itens : null;
      if (!itens || !itens.length) {
        if (!this.motivos.length) this.motivos = this.MOTIVOS_PADRAO.map((m) => ({ id: m.id, nome: m.nome }));
        await this.salvarCatalogo();
      } else {
        this.motivos = itens.map((m) => ({ id: String(m.id || "").trim(), nome: String(m.nome || "").trim() })).filter((m) => m.id && m.nome);
        this.gravarMotivosLocal();
      }
      if (this.motivoId && !this.motivos.some((m) => m.id === this.motivoId)) {
        this.motivoId = "";
        this.motivo = "";
      }
      this.pintarMotivoPainel();
    } catch (e) {}
  },

  htmlMotivo() {
    const aberto = this.motivoAberto ? " is-open" : "";
    return `<div class="ml-emp-filter pc-motivo-filter${aberto}" id="pc-motivo-filter" onmousedown="event.stopPropagation()">
      <div class="ml-emp-filter-label">Motivo</div>
      <button type="button" class="ml-emp-filter-btn" id="pc-motivo-btn">
        <span>${this.esc(this.motivo || "Selecione")}</span>
        <i data-lucide="chevron-down" style="width:16px;height:16px;flex-shrink:0;pointer-events:none;"></i>
      </button>
      <div class="ml-emp-filter-panel">
        <div class="ml-emp-filter-search">
          <input id="pc-motivo-busca" type="text" placeholder="Buscar..." value="${this.esc(this.motivoBusca)}" autocomplete="off">
        </div>
        <div class="ml-emp-filter-list" id="pc-motivo-lista">${this.htmlMotivoLista()}</div>
      </div>
    </div>`;
  },

  htmlMotivoLista() {
    const q = this.fold(this.motivoBusca).trim();
    const lista = this.motivos.filter((m) => !q || this.fold(m.nome).indexOf(q) >= 0);
    if (!this.motivos.length) return `<div class="ml-emp-filter-empty">Nenhum fluxo disponível. Cobrança judicial não entra em novo processo.</div>`;
    if (!lista.length) return `<div class="ml-emp-filter-empty">Nenhum motivo com esse nome.</div>`;
    return lista.map((m) => {
      const on = m.id === this.motivoId;
      return `<div class="ml-emp-filter-item pc-motivo-item${on ? " is-on" : ""}" data-pc-mot="${this.esc(m.id)}">
        <input type="radio" name="pc-motivo-radio"${on ? " checked" : ""} tabindex="-1">
        <span>${this.esc(m.nome)}</span>
      </div>`;
    }).join("");
  },

  motivoEmUso(m) {
    if (!m) return false;
    const nome = this.fold(m.nome);
    return (this.itens || []).some((it) => (it.motivoId && it.motivoId === m.id) || (nome && this.fold(it.motivo) === nome));
  },

  nomeMotivoLivre(nome, ignorarId) {
    const n = this.fold(nome);
    if (!n) return false;
    return !this.motivos.some((m) => m.id !== ignorarId && this.fold(m.nome) === n);
  },

  avisoMotivo(texto) {
    const el = document.getElementById("pc-motivo-aviso");
    if (el) el.textContent = texto || "";
  },

  pintarMotivoLista() {
    const lista = document.getElementById("pc-motivo-lista");
    if (!lista) return;
    lista.innerHTML = this.htmlMotivoLista();
    const ren = lista.querySelector(".pc-motivo-renome");
    if (ren) {
      ren.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); this.salvarTextoMotivo(ren.getAttribute("data-id")); }
        if (e.key === "Escape") { this.motivoEditId = ""; this.avisoMotivo(""); this.pintarMotivoLista(); }
      });
      ren.focus();
      ren.select();
    }
    if (window.lucide && lucide.createIcons) lucide.createIcons({ root: lista });
  },

  pintarMotivoPainel() {
    const root = document.getElementById("pc-motivo-filter");
    if (!root) return;
    root.classList.toggle("is-open", !!this.motivoAberto);
    const span = root.querySelector(".ml-emp-filter-btn span");
    if (span) span.textContent = this.motivo || "Selecione";
    const busca = document.getElementById("pc-motivo-busca");
    if (busca && busca.value !== this.motivoBusca) busca.value = this.motivoBusca;
    this.pintarMotivoLista();
    if (window.lucide && lucide.createIcons) lucide.createIcons({ root: root });
  },

  toggleMotivo() {
    this.motivoAberto = !this.motivoAberto;
    if (!this.motivoAberto) {
      this.motivoBusca = "";
      this.motivoEditId = "";
      this.avisoMotivo("");
    }
    this.pintarMotivoPainel();
    if (this.motivoAberto) {
      const busca = document.getElementById("pc-motivo-busca");
      if (busca) busca.focus();
    }
  },

  escolherMotivo(id) {
    const m = this.motivos.find((x) => x.id === id);
    if (!m) return;
    this.motivoId = m.id;
    this.motivo = m.nome;
    this.motivoAberto = false;
    this.motivoBusca = "";
    this.motivoEditId = "";
    this.avisoMotivo("");
    this.pintarMotivoPainel();
  },

  cliqueMotivo(e) {
    const edit = e.target.closest("[data-pc-edit]");
    if (edit) {
      e.preventDefault();
      e.stopPropagation();
      const id = edit.getAttribute("data-pc-edit");
      const m = this.motivos.find((x) => x.id === id);
      if (m && this.motivoEmUso(m)) {
        this.avisoMotivo("Esse motivo já está em um processo e não pode ser editado.");
        return;
      }
      this.motivoEditId = id;
      this.avisoMotivo("");
      this.pintarMotivoLista();
      return;
    }
    const salvar = e.target.closest(".pc-motivo-salvar");
    if (salvar) {
      e.preventDefault();
      this.salvarTextoMotivo(salvar.getAttribute("data-id"));
      return;
    }
    if (e.target.closest(".pc-motivo-cancelar-edit")) {
      e.preventDefault();
      this.motivoEditId = "";
      this.avisoMotivo("");
      this.pintarMotivoLista();
      return;
    }
    if (e.target.closest(".pc-motivo-renome") || e.target.closest(".tvig-ico")) return;
    const item = e.target.closest("[data-pc-mot]");
    if (!item) return;
    this.escolherMotivo(item.getAttribute("data-pc-mot"));
  },

  async incluirMotivo() {
    const el = document.getElementById("pc-motivo-novo");
    const nome = String((el && el.value) || "").trim().replace(/\s+/g, " ");
    if (!nome) { this.avisoMotivo("Escreva o motivo antes de incluir."); return; }
    if (!this.nomeMotivoLivre(nome, "")) { this.avisoMotivo("Já existe um motivo com esse nome."); return; }
    const m = { id: "m" + Date.now(), nome: nome };
    this.motivos.push(m);
    try {
      await this.salvarCatalogo();
    } catch (e) {
      this.motivos = this.motivos.filter((x) => x.id !== m.id);
      this.avisoMotivo("Não consegui salvar o motivo.");
      return;
    }
    this.motivoId = m.id;
    this.motivo = m.nome;
    if (el) el.value = "";
    this.motivoAberto = false;
    this.motivoBusca = "";
    this.avisoMotivo("");
    this.pintarMotivoPainel();
  },

  async salvarTextoMotivo(id) {
    const m = this.motivos.find((x) => x.id === id);
    if (!m) return;
    if (this.motivoEmUso(m)) {
      this.motivoEditId = "";
      this.avisoMotivo("Esse motivo já está em um processo e não pode ser editado.");
      this.pintarMotivoLista();
      return;
    }
    const inp = document.querySelector('.pc-motivo-renome[data-id="' + id + '"]');
    const nome = String((inp && inp.value) || "").trim().replace(/\s+/g, " ");
    if (!nome) { this.avisoMotivo("O motivo não pode ficar vazio."); return; }
    if (!this.nomeMotivoLivre(nome, id)) { this.avisoMotivo("Já existe um motivo com esse nome."); return; }
    const antes = m.nome;
    m.nome = nome;
    if (this.motivoId === id) this.motivo = nome;
    this.motivoEditId = "";
    try {
      await this.salvarCatalogo();
      this.avisoMotivo("");
    } catch (e) {
      m.nome = antes;
      if (this.motivoId === id) this.motivo = antes;
      this.avisoMotivo("Não consegui salvar a alteração.");
    }
    this.pintarMotivoPainel();
  },

  ligarMotivo() {
    const root = document.getElementById("pc-motivo-filter");
    if (!root) return;
    const btn = document.getElementById("pc-motivo-btn");
    if (btn) btn.addEventListener("click", (e) => { e.preventDefault(); this.toggleMotivo(); });
    const busca = document.getElementById("pc-motivo-busca");
    if (busca) busca.addEventListener("input", () => {
      this.motivoBusca = busca.value || "";
      this.pintarMotivoLista();
    });
    const lista = document.getElementById("pc-motivo-lista");
    if (lista) lista.addEventListener("click", (e) => this.cliqueMotivo(e));
    if (!this._motivoFora) {
      this._motivoFora = true;
      document.addEventListener("mousedown", (e) => {
        if (!this.motivoAberto) return;
        const box = document.getElementById("pc-motivo-filter");
        if (box && e.target && box.contains(e.target)) return;
        this.motivoAberto = false;
        this.motivoBusca = "";
        this.motivoEditId = "";
        this.avisoMotivo("");
        this.pintarMotivoPainel();
      }, true);
    }
  },

  sincronizarFila() {
    window._pcFilaGeracao = (window._pcFilaGeracao || 0) + 1;
    const set = new Set();
    (this.itens || []).forEach((it) => {
      const id = String(it.customerId || "");
      if (id) set.add(id);
    });
    window._processoContraClientes = set;
    window._processoContraFilaPronto = true;
    if (typeof window.pintarTagsProcessoContra === "function") window.pintarTagsProcessoContra();
  },

  montarParte() {
    if (this.tipoParte === "terceiro") {
      const nome = String(this.terceiroNome || "").trim();
      const doc = String(this.terceiroDoc || "").trim();
      if (!nome) return null;
      return {
        tipo: "terceiro",
        id: "",
        nome: nome,
        customerId: "",
        rotulo: nome + (doc ? " - " + doc : "")
      };
    }
    if (this.tipoParte === "prefeitura" && !this.parte) {
      const nome = String(this.prefNome || "").trim();
      if (!nome) return null;
      return { tipo: "prefeitura", id: nome, nome: nome, customerId: "", rotulo: nome };
    }
    return this.parte;
  },

  async abrir() {
    if (!this.podeEditar() || this.salvando) return;
    const campoValor = document.getElementById("pc-valor");
    if (campoValor) this.valorCausa = campoValor.value || "";
    const campoNum = document.getElementById("pc-numero");
    if (campoNum) this.processo = this.formatarProcesso(campoNum.value);
    const parte = this.montarParte();
    const empresaAutora = this.papelAutor === "empresa";
    if (empresaAutora && (!parte || parte.tipo === "empresa")) {
      const aviso = {
        cliente: "Pesquise o cliente que é o réu.",
        credor: "Pesquise e escolha o credor que é o réu.",
        prefeitura: "Escolha a prefeitura que é a ré.",
        terceiro: "Informe o nome do réu."
      };
      alert(aviso[this.tipoParte] || "Informe o réu.");
      return;
    }
    if (!empresaAutora && (!parte || parte.tipo !== "cliente")) {
      alert("Pesquise o cliente que é o autor.");
      return;
    }
    this.parte = parte;
    const porTitulo = !empresaAutora && !!String(this.fTitulo || "").replace(/\D/g, "") && !!this.tituloEmpresa;
    const empresa = empresaAutora
      ? String(this.autorEmpresaId || "").replace(/\D/g, "")
      : (porTitulo ? this.tituloEmpresa : String(this.empresaId || "").replace(/\D/g, ""));
    const processo = String(this.processo || "").trim();
    const valor = this.lerValor(this.valorCausa);
    const escolhido = this.motivos.find((m) => m.id === this.motivoId);
    if (!empresa) {
      alert(empresaAutora ? "Escolha a empresa autora." : (porTitulo ? "Esse título não tem empresa vinculada." : "Escolha a empresa que é a ré."));
      return;
    }
    if (processo.replace(/\D/g, "").length !== 20) { alert("Informe o número no padrão 0000000-00.0000.0.00.0000."); return; }
    if (valor == null || valor <= 0) { alert("Informe o valor da causa."); return; }
    if (!escolhido) { alert("Escolha o motivo na lista."); return; }
    const fc = this.fb();
    if (!fc) { alert("O Firebase não está disponível."); return; }
    const u = (window.AppState && AppState.currentUser) || {};
    const id = "pc_" + Date.now();
    this.salvando = true;
    this.render();
    try {
      const anexos = await this.subirAnexos(id);
      await fc.setDoc(fc.doc(window.firebaseDb, "processos_contra", id), {
        parteTipo: this.parte.tipo,
        parteId: String(this.parte.id || ""),
        parteNome: this.parte.nome || "",
        parteRotulo: this.parte.rotulo || "",
        customerId: this.parte.tipo === "cliente" ? String(this.parte.customerId || "") : "",
        companyId: empresa,
        companyName: this.nomeEmpresa(empresa),
        autorTipo: empresaAutora ? "empresa" : "cliente",
        poloEmpresa: empresaAutora ? "autor" : "reu",
        autorNome: empresaAutora ? (empresa + (this.nomeEmpresa(empresa) ? " - " + this.nomeEmpresa(empresa) : "")) : (this.parte.rotulo || this.parte.nome || ""),
        reuNome: empresaAutora ? (this.parte.rotulo || this.parte.nome || "") : (empresa + (this.nomeEmpresa(empresa) ? " - " + this.nomeEmpresa(empresa) : "")),
        valorCausa: valor,
        processo: processo,
        motivo: escolhido.nome,
        motivoId: escolhido.id,
        anexos: anexos,
        createdAt: new Date().toISOString(),
        createdBy: u.name || u.nome || u.email || ""
      });
      this.salvando = false;
      this.limpar();
      await this.carregar();
    } catch (e) {
      this.salvando = false;
      this.render();
      alert("Não consegui abrir o processo: " + ((e && e.message) || e));
    }
  },

  async excluir(id) {
    if (!this.podeEditar()) return;
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Excluir este processo contra?")
      : confirm("Excluir este processo?");
    if (!ok) return;
    const fc = this.fb();
    if (!fc || !fc.deleteDoc) return;
    try {
      await fc.deleteDoc(fc.doc(window.firebaseDb, "processos_contra", id));
      await this.carregar();
    } catch (e) {
      alert("Não consegui excluir: " + ((e && e.message) || e));
    }
  }
};

window.ProcessoContraApp = ProcessoContraApp;
document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "processo-contra" && window.ProcessoContraApp) ProcessoContraApp.init();
});
