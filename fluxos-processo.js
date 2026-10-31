/* Jurídico · Configurações · fluxos de processo.
   Quem cria o fluxo é o responsável. O gestor imediato dessa pessoa também edita
   e pode trocar o responsável. O fluxo já em uso fica com a Lucélia; o supervisor é o Israel. */
const FluxosProcesso = {
  state: {
    fluxos: [],
    filtroResp: "",
    filtroFluxoIds: [],
    filtroNomeOpen: false,
    filtroNomeQuery: "",
    consulted: false,
    shown: [],
    abertoId: "",
    leitura: false,
    pronto: false
  },

  esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  norm(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  },

  eu() {
    if (typeof window.crmUsuarioEfetivo === "function") {
      const u = window.crmUsuarioEfetivo();
      if (u) return u;
    }
    return (window.AppState && window.AppState.currentUser) || null;
  },

  usuarios() {
    let lista = [];
    try { lista = JSON.parse(localStorage.getItem("crm_users") || "[]") || []; } catch (e) { lista = []; }
    return lista.filter((u) => u && String(u.status || "").toUpperCase() !== "INATIVO");
  },

  pessoaBate(user, email, nome) {
    if (!user) return false;
    const em = this.norm(email);
    const nm = this.norm(nome);
    const uem = this.norm(user.email);
    const uname = this.norm(user.name || user.nome);
    const usienge = this.norm(user.sienge_user);
    if (em && uem && em === uem) return true;
    if (nm && usienge && nm === usienge) return true;
    if (nm && uname && (uname === nm || uname.indexOf(nm + " ") === 0)) return true;
    return false;
  },

  acharUsuario(email, nome) {
    return this.usuarios().find((u) => this.pessoaBate(u, email, nome)) || null;
  },

  donoDe(user) {
    const cheio = (user && this.acharUsuario(user.email, user.name || user.nome || user.sienge_user)) || user || {};
    return {
      responsavelNome: String(cheio.name || cheio.nome || (user && (user.name || user.nome)) || "").trim(),
      responsavelEmail: String(cheio.email || (user && user.email) || "").trim(),
      responsavelSienge: String(cheio.sienge_user || (user && user.sienge_user) || "").trim(),
      supervisorNome: String(cheio.manager_name || (user && user.manager_name) || "").trim(),
      supervisorEmail: String(cheio.manager_email || (user && user.manager_email) || "").trim()
    };
  },

  lucelia() {
    const achou = this.usuarios().find((u) => /LUCELIA/.test(this.norm(u.name) + " " + this.norm(u.sienge_user)));
    if (achou) {
      const dono = this.donoDe(achou);
      if (!dono.supervisorNome) dono.supervisorNome = "ISRAEL";
      if (!dono.supervisorEmail) dono.supervisorEmail = "israel@mouraleite.com.br";
      return dono;
    }
    return {
      responsavelNome: "LUCELIA SALVADOR JUSTO",
      responsavelEmail: "lucelia.justo@mouraleite.com.br",
      responsavelSienge: "LUCELIA JUSTO",
      supervisorNome: "ISRAEL",
      supervisorEmail: "israel@mouraleite.com.br"
    };
  },

  sou(fluxo, papel) {
    const eu = this.eu();
    if (!eu || !fluxo) return false;
    if (papel === "responsavel") {
      return this.pessoaBate(eu, fluxo.responsavelEmail, fluxo.responsavelNome)
        || this.pessoaBate(eu, "", fluxo.responsavelSienge);
    }
    return this.pessoaBate(eu, fluxo.supervisorEmail, fluxo.supervisorNome);
  },

  podeEditar(fluxo) {
    return this.sou(fluxo, "responsavel") || this.sou(fluxo, "supervisor");
  },

  podeTrocar(fluxo) {
    return this.sou(fluxo, "supervisor");
  },

  achar(id) {
    return (this.state.fluxos || []).find((f) => String(f.id) === String(id)) || null;
  },

  fluxoAberto() {
    return this.achar(this.state.abertoId);
  },

  somenteLeitura() {
    return !!this.state.leitura;
  },

  etapasAtuais() {
    const lista = window.EtapasJudiciaisState;
    return Array.isArray(lista) ? JSON.parse(JSON.stringify(lista)) : [];
  },

  garantirOficial() {
    let oficial = (this.state.fluxos || []).find((f) => f.oficial);
    const etapasVivas = this.etapasAtuais();
    if (!oficial) {
      oficial = Object.assign({
        id: "fluxo-judicial",
        oficial: true,
        nome: "Fluxo judicial",
        etapas: etapasVivas,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }, this.lucelia());
      this.state.fluxos.unshift(oficial);
      this.persistir();
      return;
    }
    const dono = this.lucelia();
    let mudou = false;
    if (!oficial.responsavelEmail && !oficial.responsavelNome) {
      Object.assign(oficial, dono);
      mudou = true;
    }
    if ((!oficial.etapas || !oficial.etapas.length) && etapasVivas.length) {
      oficial.etapas = etapasVivas;
      mudou = true;
    }
    if (mudou) this.persistir();
  },

  carregarLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem("crm_fluxos_processo") || "null");
      this.state.fluxos = raw && Array.isArray(raw.fluxos) ? raw.fluxos : [];
    } catch (e) {
      this.state.fluxos = [];
    }
  },

  async lerRemoto() {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.getDoc) return null;
    try {
      const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", "fluxos_processo"));
      const existe = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (!existe) return null;
      const data = snap.data() || {};
      return Array.isArray(data.fluxos) ? data.fluxos : [];
    } catch (e) {
      console.warn("[Fluxos] leitura", e);
      return null;
    }
  },

  persistir() {
    const dados = { fluxos: this.state.fluxos };
    try { localStorage.setItem("crm_fluxos_processo", JSON.stringify(dados)); } catch (e) {}
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc) return;
    fc.setDoc(fc.doc(window.firebaseDb, "config", "fluxos_processo"), dados, { merge: true }).catch((e) => {
      console.warn("[Fluxos] gravação", e);
    });
  },

  gravarEtapasAbertas() {
    const fluxo = this.fluxoAberto();
    if (!fluxo || this.state.leitura) return;
    fluxo.etapas = this.etapasAtuais();
    fluxo.updatedAt = Date.now();
    if (fluxo.oficial) {
      try { localStorage.setItem("crm_moura_judiciais", JSON.stringify(fluxo.etapas)); } catch (e) {}
      if (window.forceUploadLocalConfig) window.forceUploadLocalConfig(true).catch(console.error);
    }
    this.persistir();
  },

  restaurarOficialNaMemoria() {
    try {
      const raw = localStorage.getItem("crm_moura_judiciais");
      const lista = raw ? JSON.parse(raw) : [];
      if (Array.isArray(lista)) window.EtapasJudiciaisState = lista;
    } catch (e) {}
  },

  async init() {
    if (!this.state.pronto) {
      this.carregarLocal();
      this.garantirOficial();
      this.state.pronto = true;
      this.pintar();
      const remoto = await this.lerRemoto();
      if (!this.state.abertoId && Array.isArray(remoto) && remoto.length) {
        this.state.fluxos = remoto;
        this.garantirOficial();
        this.pintar();
      }
      return;
    }
    this.pintar();
  },

  pintar() {
    if (this.state.abertoId) this.mostrarEditor();
    else this.mostrarLista();
  },

  responsaveis() {
    const nomes = [];
    (this.state.fluxos || []).forEach((f) => {
      const n = String(f.responsavelNome || "").trim();
      if (n && nomes.indexOf(n) < 0) nomes.push(n);
    });
    nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
    return nomes;
  },

  fluxosFiltroItens() {
    return (this.state.fluxos || []).map((f) => ({
      id: String(f.id),
      label: String(f.nome || "Sem nome").toUpperCase()
    })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  },

  filtroNomeOpts() {
    return {
      id: "fluxo-filtro-nome",
      items: this.fluxosFiltroItens(),
      selectedIds: this.state.filtroFluxoIds || [],
      query: this.state.filtroNomeQuery || "",
      keepOrder: true,
      nouns: {
        singular: "fluxo",
        plural: "fluxos",
        none: "Nenhum fluxo",
        noMatch: "Nenhum fluxo com esse nome."
      }
    };
  },

  pintarFiltroNome() {
    const slot = document.getElementById("fluxo-filtro-nome-slot");
    if (!slot || !window.MlEmpresaFilter) return;
    slot.innerHTML = MlEmpresaFilter.html(Object.assign({
      label: "Nome do fluxo",
      open: !!this.state.filtroNomeOpen,
      emptyMeansAll: true
    }, this.filtroNomeOpts()));
    if (window.lucide) window.lucide.createIcons();
  },

  bindFiltroNome() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    MlEmpresaFilter.bind("fluxo-filtro-nome", {
      toggleOpen() {
        self.state.filtroNomeOpen = !self.state.filtroNomeOpen;
        self.pintarFiltroNome();
        if (self.state.filtroNomeOpen) {
          const inp = document.getElementById("fluxo-filtro-nome-search");
          if (inp) inp.focus();
        }
      },
      setQuery(q) {
        self.state.filtroNomeQuery = q || "";
        const box = document.getElementById("fluxo-filtro-nome-list");
        if (box) box.innerHTML = MlEmpresaFilter.listHtml(self.filtroNomeOpts());
      },
      toggleId(itemId, on) {
        const sid = String(itemId);
        const cur = (self.state.filtroFluxoIds || []).map(String);
        self.state.filtroFluxoIds = on ? (cur.indexOf(sid) >= 0 ? cur : cur.concat(sid)) : cur.filter((x) => x !== sid);
        self.state.filtroNomeOpen = true;
        self.pintarFiltroNome();
      },
      selectAll() {
        self.state.filtroFluxoIds = self.fluxosFiltroItens().map((x) => String(x.id));
        self.state.filtroNomeOpen = true;
        self.pintarFiltroNome();
      },
      selectNone() {
        self.state.filtroFluxoIds = [];
        self.state.filtroNomeOpen = true;
        self.pintarFiltroNome();
      }
    });
  },

  consultar() {
    const ids = (this.state.filtroFluxoIds || []).map(String);
    const resp = this.norm(this.state.filtroResp);
    this.state.shown = (this.state.fluxos || []).filter((f) => {
      if (resp && this.norm(f.responsavelNome) !== resp) return false;
      if (ids.length && ids.indexOf(String(f.id)) < 0) return false;
      return true;
    });
    this.state.consulted = true;
    this.renderLista();
  },

  limpar() {
    this.state.filtroResp = "";
    this.state.filtroFluxoIds = [];
    this.state.filtroNomeOpen = false;
    this.state.filtroNomeQuery = "";
    this.state.consulted = false;
    this.state.shown = [];
    this.mostrarLista();
  },

  mostrarLista() {
    const root = document.getElementById("fluxos-processo-root");
    const editor = document.getElementById("fluxos-processo-editor");
    if (editor) editor.style.display = "none";
    if (root) root.style.display = "";
    if (!root) return;
    const opts = this.responsaveis().map((n) => `<option value="${this.esc(n)}"${this.norm(n) === this.norm(this.state.filtroResp) ? " selected" : ""}>${this.esc(n)}</option>`).join("");
    root.innerHTML = `<div class="tvig-page">
      <div class="search-filter-panel tvig-params">
        <h3 class="tvig-section-title">Parâmetros da consulta</h3>
        <div class="tvig-filters fluxo-consulta-filtros">
          <div id="fluxo-filtro-nome-slot" class="tvig-filter-slot fluxo-consulta-nome"></div>
          <div class="tvig-filter-slot fluxo-consulta-resp">
            <label class="tvig-comp-label" for="fluxo-filtro-resp">Responsável</label>
            <select id="fluxo-filtro-resp" class="form-control" onchange="FluxosProcesso.state.filtroResp = this.value">
              <option value="">Todos</option>
              ${opts}
            </select>
          </div>
          <div class="tvig-filter-actions">
            <button type="button" class="btn btn-primary" onclick="FluxosProcesso.consultar()"><i data-lucide="search" style="width:16px;"></i> Consultar</button>
            <button type="button" class="btn btn-cancel" onclick="FluxosProcesso.limpar()">Limpar</button>
            <button type="button" class="btn btn-primary" onclick="FluxosProcesso.novo()"><i data-lucide="plus" style="width:16px;"></i> Adicionar novo fluxo</button>
          </div>
        </div>
      </div>
      <h3 class="tvig-section-title">Resultados da consulta</h3>
      <p style="margin: 0 0 10px; color: #64748b; font-size: 0.85rem;">Quem cria o fluxo é o responsável. O supervisor dele também edita e pode trocar o responsável. Copiar gera um fluxo seu, para ajustar sem começar do zero.</p>
      <div id="fluxos-processo-results"></div>
    </div>`;
    this.bindFiltroNome();
    this.pintarFiltroNome();
    this.renderLista();
    if (window.lucide) window.lucide.createIcons();
  },

  renderLista() {
    const box = document.getElementById("fluxos-processo-results");
    if (!box) return;
    if (!this.state.consulted) {
      box.innerHTML = `<div class="tvig-empty">Use <strong>Consultar</strong> para ver os fluxos cadastrados.</div>`;
      return;
    }
    const rows = this.state.shown || [];
    if (!rows.length) {
      box.innerHTML = `<div class="tvig-empty">Não há fluxos cadastrados para o filtro selecionado.</div>`;
      return;
    }
    box.innerHTML = `<div class="cc-scroll">
      <table class="cc-table tvig-cc-table">
        <colgroup><col><col style="width:24%"><col style="width:22%"><col style="width:148px"></colgroup>
        <thead><tr>
          <th>Fluxo</th><th>Responsável</th><th>Supervisor</th><th class="is-right">Ações</th>
        </tr></thead>
        <tbody>
          ${rows.map((f) => this.linha(f)).join("")}
        </tbody>
      </table>
    </div>`;
    if (window.lucide) window.lucide.createIcons();
  },

  linha(f) {
    const edita = this.podeEditar(f);
    const nome = f.nome || "Sem nome";
    const excluir = edita && !f.oficial
      ? `<button type="button" class="tvig-ico is-danger" title="Excluir" onclick="FluxosProcesso.excluir('${this.esc(f.id)}')"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>`
      : "";
    const lapis = edita
      ? `<button type="button" class="tvig-ico" title="Editar" onclick="FluxosProcesso.abrir('${this.esc(f.id)}')"><i data-lucide="pencil" style="width:15px;height:15px;"></i></button>`
      : "";
    return `<tr>
      <td class="cc-nome" title="${this.esc(nome)}">${this.esc(nome)}${f.oficial ? " · em uso" : ""}</td>
      <td>${this.esc(f.responsavelNome || "—")}</td>
      <td>${this.esc(f.supervisorNome || "—")}</td>
      <td class="is-right fluxo-acoes">
        <button type="button" class="tvig-ico" title="Visualizar" onclick="FluxosProcesso.abrir('${this.esc(f.id)}', true)"><i data-lucide="eye" style="width:15px;height:15px;"></i></button>
        <button type="button" class="tvig-ico" title="Copiar" onclick="FluxosProcesso.copiar('${this.esc(f.id)}')"><i data-lucide="copy" style="width:15px;height:15px;"></i></button>
        ${lapis}
        ${excluir}
      </td>
    </tr>`;
  },

  novo() {
    const eu = this.eu();
    const fluxo = Object.assign({
      id: "fp" + Date.now(),
      oficial: false,
      nome: "",
      etapas: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, eu ? this.donoDe(eu) : { responsavelNome: "", responsavelEmail: "", responsavelSienge: "", supervisorNome: "", supervisorEmail: "" });
    this.state.fluxos.push(fluxo);
    this.persistir();
    this.abrir(fluxo.id);
  },

  copiar(id) {
    const src = this.achar(id);
    if (!src) return;
    const eu = this.eu();
    const fluxo = Object.assign({
      id: "fp" + Date.now(),
      oficial: false,
      nome: "Cópia de " + (src.nome || "fluxo"),
      etapas: JSON.parse(JSON.stringify(src.etapas || [])),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, eu ? this.donoDe(eu) : {
      responsavelNome: src.responsavelNome,
      responsavelEmail: src.responsavelEmail,
      responsavelSienge: src.responsavelSienge,
      supervisorNome: src.supervisorNome,
      supervisorEmail: src.supervisorEmail
    });
    this.state.fluxos.push(fluxo);
    this.persistir();
    this.abrir(fluxo.id);
  },

  async excluir(id) {
    const fluxo = this.achar(id);
    if (!fluxo || fluxo.oficial || !this.podeEditar(fluxo)) return;
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Excluir o fluxo " + (fluxo.nome || "sem nome") + "?")
      : window.confirm("Excluir o fluxo " + (fluxo.nome || "sem nome") + "?");
    if (!ok) return;
    this.state.fluxos = this.state.fluxos.filter((f) => f.id !== fluxo.id);
    this.persistir();
    if (this.state.consulted) this.consultar();
    else this.renderLista();
  },

  abrir(id, leitura) {
    const fluxo = this.achar(id);
    if (!fluxo) return;
    const edita = this.podeEditar(fluxo);
    this.state.abertoId = fluxo.id;
    this.state.leitura = leitura === true || !edita;
    window.EtapasJudiciaisState = JSON.parse(JSON.stringify(fluxo.etapas || []));
    this.mostrarEditor();
  },

  mostrarEditor() {
    const root = document.getElementById("fluxos-processo-root");
    const editor = document.getElementById("fluxos-processo-editor");
    const topo = document.getElementById("fluxos-processo-topo");
    if (root) root.style.display = "none";
    if (editor) editor.style.display = "";
    const fluxo = this.fluxoAberto();
    if (!fluxo || !topo) return;
    const nomeVivo = document.getElementById("fluxo-nome");
    if (nomeVivo && document.activeElement === nomeVivo) fluxo.nome = nomeVivo.value;
    const troca = !this.state.leitura && this.podeTrocar(fluxo);
    const pessoas = this.usuarios().map((u) => {
      const sel = this.pessoaBate(u, fluxo.responsavelEmail, fluxo.responsavelNome) ? " selected" : "";
      return `<option value="${this.esc(u.email || u.id)}"${sel}>${this.esc(u.name || u.sienge_user || u.email)}</option>`;
    }).join("");
    this._pintandoTopo = true;
    topo.innerHTML = `<div class="fluxo-topo">
      <button type="button" class="btn btn-outline fluxo-voltar" onclick="FluxosProcesso.fechar()">Voltar</button>
      <label class="fluxo-campo fluxo-campo-nome">Nome do fluxo
        <input id="fluxo-nome" value="${this.esc(fluxo.nome)}" ${this.state.leitura ? "disabled" : ""}>
      </label>
      <div class="fluxo-campo fluxo-campo-pessoa"><span>Responsável</span><div class="fluxo-valor" title="${this.esc(fluxo.responsavelNome || "")}">${this.esc(fluxo.responsavelNome || "—")}</div></div>
      <div class="fluxo-campo fluxo-campo-pessoa"><span>Supervisor</span><div class="fluxo-valor" title="${this.esc(fluxo.supervisorNome || "")}">${this.esc(fluxo.supervisorNome || "—")}</div></div>
      ${troca ? `<label class="fluxo-campo fluxo-campo-troca">Trocar responsável<select onchange="FluxosProcesso.trocarResponsavel(this.value)">${pessoas}</select></label>` : ""}
    </div>`;
    this._pintandoTopo = false;
    const nomeEl = document.getElementById("fluxo-nome");
    if (nomeEl && !nomeEl.disabled) nomeEl.addEventListener("input", () => this.renomear(nomeEl.value));
    const add = document.getElementById("fluxo-add-etapa");
    if (add) add.style.display = this.state.leitura ? "none" : "";
    if (typeof window.renderEtapasJudiciais === "function") window.renderEtapasJudiciais();
    if (window.lucide) window.lucide.createIcons();
  },

  renomear(valor) {
    if (this._pintandoTopo) return;
    const fluxo = this.fluxoAberto();
    if (!fluxo || this.state.leitura) return;
    const texto = String(valor == null ? "" : valor);
    const el = document.getElementById("fluxo-nome");
    if (!texto.trim() && String(fluxo.nome || "").trim() && (!el || document.activeElement !== el)) return;
    if (texto === String(fluxo.nome || "")) return;
    fluxo.nome = texto;
    fluxo.updatedAt = Date.now();
    this.persistir();
  },

  trocarResponsavel(email) {
    const fluxo = this.fluxoAberto();
    if (!fluxo || !this.podeTrocar(fluxo)) return;
    const user = this.usuarios().find((u) => String(u.email || u.id) === String(email));
    if (!user) return;
    Object.assign(fluxo, this.donoDe(user));
    fluxo.updatedAt = Date.now();
    this.state.leitura = !this.podeEditar(fluxo);
    this.persistir();
    this.mostrarEditor();
  },

  fechar() {
    this.state.abertoId = "";
    this.state.leitura = false;
    this.restaurarOficialNaMemoria();
    this.mostrarLista();
    if (this.state.consulted) this.consultar();
  }
};

window.persistirEtapasJudiciais = function () {
  if (window.FluxosProcesso && FluxosProcesso.fluxoAberto()) {
    FluxosProcesso.gravarEtapasAbertas();
    return;
  }
  try { localStorage.setItem("crm_moura_judiciais", JSON.stringify(window.EtapasJudiciaisState || [])); } catch (e) {}
  if (window.forceUploadLocalConfig) window.forceUploadLocalConfig(true).catch(console.error);
};

window.FluxosProcesso = FluxosProcesso;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "juridico-config") FluxosProcesso.init();
});
