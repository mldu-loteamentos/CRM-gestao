/* Processo em que outra parte entra contra uma empresa do grupo. */
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
  tituloEmpresa: "",
  processo: "",
  motivo: "",
  MOTIVOS: [
    "Atraso na entrega da obra",
    "Vício de construção",
    "Cobrança indevida",
    "Rescisão contratual",
    "Danos morais",
    "Revisão de contrato",
    "Posse e reintegração",
    "Direito de vizinhança",
    "Publicidade enganosa",
    "Outro"
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
    this.render();
    this.carregar();
    this.carregarEmpreendimentos();
    if (typeof window.startCustomerBackgroundSync === "function") window.startCustomerBackgroundSync(false, true);
  },

  render() {
    const root = document.getElementById("processo-contra-root");
    if (!root) return;
    if (this.empresaId && String(this.empresaId) !== String(this.tituloEmpresa) && !this.empresas().some((c) => String(c.id) === String(this.empresaId))) this.empresaId = "";
    const edita = this.podeEditar();
    const motivos = this.MOTIVOS.map((m) => `<option value="${this.esc(m)}"${m === this.motivo ? " selected" : ""}>${this.esc(m)}</option>`).join("");
    const porTitulo = !!String(this.fTitulo || "").replace(/\D/g, "") && !!this.tituloEmpresa;
    const nota = this.parte ? "" : "Pesquise o cliente acima. Os dados dele aparecem antes deste formulário.";
    const campoEmpresa = porTitulo ? "" : `<label>Empresa processada<div id="pc-emp-slot"></div></label>`;
    const form = !edita ? "" : `<div class="pc-form" id="pc-form">
        ${nota ? `<p class="cj-nota">${this.esc(nota)}</p>` : ""}
        ${campoEmpresa}
        <label>Número do processo
          <input type="text" id="pc-numero" value="${this.esc(this.processo)}" autocomplete="off">
        </label>
        <label>Motivo
          <select id="pc-motivo"><option value="">Selecione</option>${motivos}</select>
        </label>
        <div class="pc-acoes">
          <button type="button" class="btn btn-cancel" id="pc-cancelar">Cancelar</button>
          <button type="button" class="btn btn-primary" id="pc-abrir">Abrir processo</button>
        </div>
      </div>`;
    const ficha = this.buscando
      ? `<div class="crm-card pc-pesq"><div class="crm-card-content" style="padding:24px;"><div class="ml-load"><div class="loading-spinner"></div><div class="loading-status-text">Buscando o cliente</div><div class="ml-load-track"><div class="loading-progress-bar"></div></div></div></div></div>`
      : (this.erroBusca
        ? `<p class="cj-nota">${this.esc(this.erroBusca)}</p>`
        : (this.fichaHtml ? `<div class="crm-card" id="pc-cliente-card" style="margin-bottom:16px;">
            <div class="crm-card-header" style="background-color:#f3f4f6;padding:12px 20px;border-bottom:1px solid #e5e7eb;border-radius:8px 8px 0 0;">
              <h3 style="margin:0;font-size:1.1rem;color:var(--color-primary);">Dados do cliente</h3>
            </div>
            <div class="crm-card-content">${this.fichaHtml}</div>
          </div>` : ""));
    root.innerHTML = `<div class="pc-page">
        ${this.htmlPesquisa()}
        ${ficha}
        ${form}
        <div class="search-box-wrapper pc-busca pc-filtro">
          <input type="text" id="pc-filtro" class="search-input" placeholder="Número do processo ou motivo..." style="font-style: italic;" autocomplete="off" value="${this.esc(this.filtro)}">
          <i data-lucide="search" class="search-icon"></i>
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
    const mot = document.getElementById("pc-motivo");
    if (num) num.addEventListener("input", () => { this.processo = num.value || ""; });
    if (mot) mot.addEventListener("change", () => { this.motivo = mot.value || ""; });
    const cancelar = document.getElementById("pc-cancelar");
    const abrir = document.getElementById("pc-abrir");
    if (cancelar) cancelar.addEventListener("click", () => this.limpar());
    if (abrir) abrir.addEventListener("click", () => this.abrir());
    this.empEmpresa.render();
    this.pintarLista();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  limpar() {
    this.empresaId = "";
    this.tituloEmpresa = "";
    this.processo = "";
    this.motivo = "";
    this.empEmpresa.open = false;
    this.empEmpresa.query = "";
    this.render();
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
    } catch (e) {
      this.itens = [];
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
      box.innerHTML = `<div class="cc-scroll"><table class="cc-table"><tbody><tr><td class="cj-vazio">Nenhum processo contra aberto.</td></tr></tbody></table></div>`;
      return;
    }
    const q = this.fold(this.filtro).trim();
    const visiveis = !q ? this.itens : this.itens.filter((item) => {
      const blob = this.fold((item.processo || "") + " " + (item.motivo || ""));
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
      return `<tr>
        <td class="cc-nome" title="${this.esc(item.parteNome || "")}">${this.esc(item.parteRotulo || item.parteNome || "—")}</td>
        <td>${this.esc(this.tipoTxt(item.parteTipo))}</td>
        <td>${this.esc(item.companyId || "—")}</td>
        <td>${this.esc(item.processo || "—")}</td>
        <td class="cc-nome">${this.esc(item.motivo || "—")}</td>
        <td class="cj-quem"><span class="cj-quem-linha">${this.esc(item.createdBy || "—")}${quando ? `<span class="cj-quando">${this.esc(quando)}</span>` : ""}</span></td>
        <td class="is-center">${acao}</td>
      </tr>`;
    }).join("");
    box.innerHTML = `<div class="cc-scroll"><table class="cc-table cj-cc">
      <thead><tr><th>Parte</th><th>Tipo</th><th title="ID da empresa"><span class="pr-id-head">ID <i data-lucide="info"></i></span></th><th>Processo</th><th>Motivo</th><th>Aberto por</th><th class="is-center">Ações</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
    box.querySelectorAll("[data-pc-del]").forEach((btn) => {
      btn.addEventListener("click", () => this.excluir(btn.getAttribute("data-pc-del")));
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  tipoTxt(tipo) {
    if (tipo === "credor") return "Credor";
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

  async abrir() {
    if (!this.podeEditar()) return;
    if (!this.parte) { alert("Pesquise o cliente antes de abrir o processo."); return; }
    const porTitulo = !!String(this.fTitulo || "").replace(/\D/g, "") && !!this.tituloEmpresa;
    const empresa = porTitulo ? this.tituloEmpresa : String(this.empresaId || "").replace(/\D/g, "");
    const processo = String(this.processo || "").trim();
    const motivo = String(this.motivo || "").trim();
    if (!empresa) { alert(porTitulo ? "Esse título não tem empresa vinculada." : "Escolha a empresa que está sendo processada."); return; }
    if (!processo) { alert("Informe o número do processo."); return; }
    if (!this.MOTIVOS.includes(motivo)) { alert("Escolha o motivo na lista."); return; }
    const fc = this.fb();
    if (!fc) { alert("O Firebase não está disponível."); return; }
    const u = (window.AppState && AppState.currentUser) || {};
    const id = "pc_" + Date.now();
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, "processos_contra", id), {
        parteTipo: this.parte.tipo,
        parteId: String(this.parte.id || ""),
        parteNome: this.parte.nome || "",
        parteRotulo: this.parte.rotulo || "",
        customerId: String(this.parte.customerId || ""),
        companyId: empresa,
        companyName: this.nomeEmpresa(empresa),
        processo: processo,
        motivo: motivo,
        createdAt: new Date().toISOString(),
        createdBy: u.name || u.nome || u.email || ""
      });
      this.limpar();
      await this.carregar();
    } catch (e) {
      alert("Não consegui abrir o processo: " + ((e && e.message) || e));
    }
  },

  async excluir(id) {
    if (!this.podeEditar()) return;
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Excluir este processo contra?")
      : confirm("Excluir este processo contra?");
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
