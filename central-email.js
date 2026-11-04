/* Central de e-mail da cobrança.
   O operador grava o texto com variáveis, escolhe a tag da fila e quantos dias depois do vencimento o cliente entra na fila do dia. */
const CentralEmailApp = {
  state: { templates: [], pronto: false, aba: "templates" },

  VARIAVEIS: [
    { token: "{{primeiro_nome}}", label: "Primeiro nome", grupo: "Cliente" },
    { token: "{{nome}}", label: "Nome completo", grupo: "Cliente" },
    { token: "{{unidade}}", label: "Unidade", grupo: "Imóvel" },
    { token: "{{empreendimento}}", label: "Empreendimento", grupo: "Imóvel" },
    { token: "{{cidade}}", label: "Cidade", grupo: "Imóvel" },
    { token: "{{vencimento}}", label: "Vencimento", grupo: "Parcelas" },
    { token: "{{texto_abertas}}", label: "Parcelas em aberto", grupo: "Parcelas" },
    { token: "{{ordinal_proxima}}", label: "Próxima parcela", grupo: "Parcelas" },
    { token: "{{vencimento_proxima}}", label: "Vencimento da próxima", grupo: "Parcelas" }
  ],

  EXEMPLO: {
    primeiro_nome: "Nonata",
    nome: "NONATA NAYARA DE ARAÚJO MESQUITA",
    unidade: "Q 12 L 08",
    empreendimento: "Terras de Itu",
    cidade: "Itu",
    vencimento: "10/10/2026",
    texto_abertas: "01 parcela em aberto",
    ordinal_proxima: "2ª",
    vencimento_proxima: "10/11"
  },

  esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  podeEditar() {
    if (typeof window.hasCrmPerm !== "function") return true;
    return !!window.hasCrmPerm("sub_fin_cr_central_email_editar");
  },

  eu() {
    const u = (typeof window.crmUsuarioAcesso === "function" && window.crmUsuarioAcesso())
      || (window.AppState && window.AppState.currentUser)
      || {};
    return {
      email: String(u.email || "").trim().toLowerCase(),
      nome: String(u.name || "").replace(/ no usuário .+$/i, "").trim()
    };
  },

  souAdmin() {
    const u = (window.AppState && window.AppState.currentUser) || null;
    return typeof window.isCrmAdministrator === "function" && window.isCrmAdministrator(u);
  },

  assinatura(t) {
    return [t && t.nome, t && t.assunto, t && t.corpo, t && t.tag, t && t.diasVencido].join("\u0001");
  },

  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "";
  },

  dataDeMs(ms) {
    if (!ms) return "";
    const d = new Date(Number(ms));
    if (isNaN(d.getTime())) return "";
    return this.dataBr(this.iso(d));
  },

  dataMais(dias) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + (Number(dias) || 0));
    return this.dataBr(this.iso(d));
  },

  titulo(texto) {
    return String(texto || "").toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
  },

  ordinal(n) {
    return Math.max(1, Number(n) || 1) + "ª";
  },

  tags() {
    const G = window.FILA_QUEUE_GROUPS || {};
    const vistos = {};
    return Object.keys(G).map((k) => {
      const id = Number(G[k]);
      if (vistos[id]) return null;
      vistos[id] = true;
      const meta = typeof window.getFilaQueueGroupMeta === "function" ? window.getFilaQueueGroupMeta(id) : null;
      return { id, label: (meta && meta.label) || k };
    }).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label, "pt"));
  },

  rotuloTag(id) {
    const n = Number(id);
    const achou = this.tags().find((t) => t.id === n);
    return achou ? achou.label : "Tag";
  },

  diasAtraso(client, tag) {
    const G = window.FILA_QUEUE_GROUPS || {};
    const n = Number(tag);
    if (n === G.ACORDO_JURIDICO || n === G.ACORDO_INTERNO_QUEBRADO) {
      const acordo = Number(client && client.agreementDaysDelay);
      if (acordo > 0) return acordo;
    }
    return Number(client && client.maxDaysDelay) || 0;
  },

  contextoCliente(client) {
    const nome = String((client && client.customerName) || "").trim();
    const primeiro = (nome.split(/\s+/)[0] || "");
    let cidade = "";
    let empreendimento = "";
    if (client && typeof window.resolveCityRuleId === "function") {
      const r = window.resolveCityRuleId(client.costCenterId) || {};
      cidade = this.titulo(r.city || "");
    }
    if (client && typeof window.findCachedCostCenter === "function") {
      const cc = window.findCachedCostCenter(client.costCenterId);
      empreendimento = String((cc && (cc.name || cc.enterpriseName)) || "").trim();
    }
    const qtd = Math.max(0, Number(client && client.billCount) || 0);
    const texto = qtd === 1 ? "01 parcela em aberto" : String(qtd).padStart(2, "0") + " parcelas em aberto";
    return {
      primeiro_nome: this.titulo(primeiro) || "—",
      nome: nome || "—",
      unidade: String((client && client.unitName) || "").trim() || "—",
      empreendimento: empreendimento || "—",
      cidade: cidade || "—",
      vencimento: this.dataDeMs(client && client.oldestDueDateMs) || "—",
      texto_abertas: texto,
      ordinal_proxima: this.ordinal(qtd + 1),
      vencimento_proxima: "—"
    };
  },

  aplicar(texto, ctx) {
    let s = String(texto || "");
    s = s.replace(/\{\{retorno:(\d+)\}\}/g, (_, n) => this.dataMais(Number(n)));
    const dados = ctx || this.EXEMPLO;
    Object.keys(dados).forEach((k) => {
      s = s.split("{{" + k + "}}").join(dados[k] == null || dados[k] === "" ? "—" : String(dados[k]));
    });
    return s;
  },

  emailDe(client) {
    const id = client && client.customerId;
    const c = window.AppState && window.AppState.customers && window.AppState.customers[id];
    const email = String((c && c.email) || "").trim();
    if (!email || email === "N/D") return "";
    return email;
  },

  clientesDoTemplate(t) {
    const lista = window.rawClientList || [];
    const tag = Number(t.tag);
    const alvo = Number(t.diasVencido);
    if (!Number.isFinite(tag) || !Number.isFinite(alvo)) return [];
    return lista.filter((c) => {
      if (typeof window.getFilaQueueGroup !== "function") return false;
      if (Number(window.getFilaQueueGroup(c)) !== tag) return false;
      return this.diasAtraso(c, tag) === alvo;
    });
  },

  normalizar(lista) {
    const tags = new Set(this.tags().map((t) => t.id));
    return (Array.isArray(lista) ? lista : []).map((t) => {
      const tinha = t && (t.status === "pendente" || t.status === "aprovado");
      const status = tinha ? t.status : (t && t.ativo === false ? "pendente" : "aprovado");
      const ativo = status === "aprovado" && (tinha ? !!(t && t.ativo) : t.ativo !== false);
      return {
        id: String((t && t.id) || ""),
        nome: String((t && t.nome) || "").trim(),
        assunto: String((t && t.assunto) || "").trim(),
        corpo: String((t && t.corpo) || ""),
        tag: tags.has(Number(t && t.tag)) ? Number(t.tag) : "",
        diasVencido: Math.max(0, Math.round(Number(t && t.diasVencido) || 0)),
        status: status,
        ativo: status === "pendente" ? false : ativo,
        criadoPorEmail: String((t && t.criadoPorEmail) || "").trim().toLowerCase(),
        criadoPorNome: String((t && t.criadoPorNome) || "").trim(),
        aprovadoEm: String((t && t.aprovadoEm) || ""),
        avisoCriador: !!(t && t.avisoCriador)
      };
    }).filter((t) => t.id && t.nome);
  },

  lerLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem("crm_central_email") || "null");
      return this.normalizar(raw && raw.templates);
    } catch (e) {
      return [];
    }
  },

  async lerRemoto() {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.getDoc) return null;
    try {
      const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", "central_email"));
      const existe = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (!existe) return null;
      return this.normalizar((snap.data() || {}).templates);
    } catch (e) {
      console.warn("[Central e-mail] leitura", e);
      return null;
    }
  },

  async carregar() {
    const local = this.lerLocal();
    const remoto = await this.lerRemoto();
    this.state.templates = remoto || local;
    this.state.pronto = true;
    try { localStorage.setItem("crm_central_email", JSON.stringify({ templates: this.state.templates })); } catch (e) {}
  },

  async gravar() {
    const dados = { templates: this.state.templates };
    try { localStorage.setItem("crm_central_email", JSON.stringify(dados)); } catch (e) {}
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc) return;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, "config", "central_email"), dados, { merge: true });
    } catch (e) {
      console.warn("[Central e-mail] gravação", e);
    }
  },

  async abrir() {
    if (!this.state.pronto) await this.carregar();
    this.render();
  },

  setAba(id) {
    this.state.aba = id === "fila" ? "fila" : "templates";
    this.render();
  },

  abasHtml() {
    const atual = this.state.aba;
    const item = (id, icon, label) => `<button type="button" role="tab" aria-selected="${atual === id}" class="ml-tab ${atual === id ? "is-active" : ""}" onclick="CentralEmailApp.setAba('${id}')"><i data-lucide="${icon}"></i> ${label}</button>`;
    return `<div class="ml-tabs cem-tabs" role="tablist">${item("templates", "file-text", "Templates")}${item("fila", "send", "Fila do dia")}</div>`;
  },

  situacao(t) {
    if (!t || t.status !== "aprovado") return "Pendente";
    return t.ativo ? "Ligada" : "Desligada";
  },

  tabelaHtml() {
    const pode = this.podeEditar();
    const admin = this.souAdmin();
    const linhas = this.state.templates.map((t) => `<tr>
      <td>${this.esc(t.nome)}</td>
      <td>${this.esc(this.rotuloTag(t.tag))}</td>
      <td>${this.esc(t.diasVencido)}</td>
      <td>${this.esc(this.situacao(t))}</td>
      <td class="is-right cem-acoes">
        <button type="button" class="tvig-ico" title="Ver" onclick="CentralEmailApp.verTemplate('${this.esc(t.id)}')"><i data-lucide="eye" style="width:15px;height:15px;"></i></button>
        ${admin && t.status !== "aprovado" ? `<button type="button" class="tvig-ico" title="Aprovar" onclick="CentralEmailApp.abrirAprovacao('${this.esc(t.id)}')"><i data-lucide="check" style="width:15px;height:15px;"></i></button>` : ""}
        ${pode ? `<button type="button" class="tvig-ico" title="Editar" onclick="CentralEmailApp.editar('${this.esc(t.id)}')"><i data-lucide="pencil" style="width:15px;height:15px;"></i></button>
        <button type="button" class="tvig-ico is-danger" title="Excluir" onclick="CentralEmailApp.excluir('${this.esc(t.id)}')"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>` : ""}
      </td>
    </tr>`).join("");
    return `<table class="cem-tabela">
      <thead><tr><th>Template</th><th>Tag</th><th>Dias vencido</th><th>Régua</th><th class="is-right">Ações</th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="5">Nenhum template. Crie o texto, escolha a tag e quantos dias depois do vencimento.</td></tr>`}</tbody>
    </table>`;
  },

  filaHtml() {
    const ativos = this.state.templates.filter((t) => t.ativo);
    if (!ativos.length) return `<p class="cem-vazio">Nenhuma régua ligada. O administrador liga a régua ao aprovar o template.</p>`;
    if (!(window.rawClientList || []).length) {
      return `<p class="cem-vazio">A fila de cobrança ainda não foi carregada nesta sessão. Abra a Fila de Cobrança para a central localizar quem completa os dias de atraso hoje.</p>`;
    }
    return ativos.map((t) => {
      const gente = this.clientesDoTemplate(t);
      const linhas = gente.map((c, i) => `<tr>
        <td>${this.esc(c.customerName || "—")}</td>
        <td>${this.esc(c.unitName || "—")}</td>
        <td>${this.esc(this.emailDe(c) || "Sem e-mail na ficha")}</td>
        <td class="is-right cem-acoes"><button type="button" class="tvig-ico" title="Ver e-mail" onclick="CentralEmailApp.verCliente('${this.esc(t.id)}', ${i})"><i data-lucide="eye" style="width:15px;height:15px;"></i></button></td>
      </tr>`).join("");
      return `<section class="cem-bloco">
        <h4>${this.esc(t.nome)}</h4>
        <p>${this.esc(this.rotuloTag(t.tag))} · ${this.esc(t.diasVencido)} dia(s) depois de vencido · ${gente.length} cliente(s) hoje</p>
        <table class="cem-tabela">
          <thead><tr><th>Cliente</th><th>Unidade</th><th>E-mail</th><th class="is-right">Ações</th></tr></thead>
          <tbody>${linhas || `<tr><td colspan="4">Ninguém completa esse atraso hoje.</td></tr>`}</tbody>
        </table>
      </section>`;
    }).join("");
  },

  render() {
    const root = document.getElementById("central-email-root");
    if (!root) return;
    const pode = this.podeEditar();
    const corpo = this.state.aba === "fila"
      ? this.filaHtml()
      : `<div class="cem-topo">${pode ? `<button type="button" class="btn btn-primary" onclick="CentralEmailApp.editar('')">Novo template</button>` : ""}</div>${this.tabelaHtml()}`;
    root.innerHTML = `
      <p class="cem-intro">O operador escreve o e-mail com variáveis. Ao salvar, a régua fica desligada até o administrador aprovar. A tag define o grupo da fila, e os dias dizem quando o título vencido entra na fila do dia.</p>
      ${this.abasHtml()}
      <div class="cem-painel">${corpo}</div>`;
    if (window.lucide) window.lucide.createIcons({ root: root });
  },

  achar(id) {
    return this.state.templates.find((t) => t.id === id) || null;
  },

  editar(id) {
    if (!this.podeEditar()) return;
    const atual = id ? this.achar(id) : null;
    this.fecharModal();
    const tags = this.tags().map((t) => `<option value="${t.id}"${atual && Number(atual.tag) === t.id ? " selected" : ""}>${this.esc(t.label)}</option>`).join("");
    const grupos = [];
    this.VARIAVEIS.forEach((v) => {
      let g = grupos.find((x) => x.nome === v.grupo);
      if (!g) {
        g = { nome: v.grupo, itens: [] };
        grupos.push(g);
      }
      g.itens.push(v);
    });
    const botoes = grupos.map((g) => `<section class="cem-var-grupo"><h4>${this.esc(g.nome)}</h4>${g.itens.map((v) => `<button type="button" class="cem-var" onclick="CentralEmailApp.inserir('${v.token}')">${this.esc(v.label)}</button>`).join("")}</section>`).join("");
    const pop = document.createElement("div");
    pop.id = "cem-modal";
    pop.className = "cem-modal";
    pop.innerHTML = `<div class="cem-card" role="dialog" aria-modal="true" aria-labelledby="cem-titulo">
      <div class="cem-head">
        <h3 id="cem-titulo">${atual ? "Editar template" : "Novo template"}</h3>
        <button type="button" class="btn btn-fechar" onclick="CentralEmailApp.fecharModal()">Fechar</button>
      </div>
      <div class="cem-body">
        <div class="cem-editor">
          <div class="cem-escrever">
            <div class="cem-grade">
              <label>Nome<input id="cem-nome" class="cem-campo" value="${this.esc(atual ? atual.nome : "")}"></label>
              <label>Tag<select id="cem-tag" class="cem-campo">${tags}</select></label>
              <label class="cem-span">Título do e-mail<input id="cem-assunto" class="cem-campo" value="${this.esc(atual ? atual.assunto : "")}"></label>
              <label>Dias depois de vencido<input id="cem-dias" class="cem-campo" type="number" min="0" step="1" value="${atual ? atual.diasVencido : 5}"></label>
            </div>
            <p class="cem-legenda">${atual && atual.status === "aprovado" ? "Se alterar o título, o texto, a tag ou os dias, o template volta para o administrador e a régua desliga." : "Ao salvar, a régua fica desligada até o administrador aprovar."}</p>
            <label class="cem-bloco-campo">Texto<textarea id="cem-corpo" class="cem-campo">${this.esc(atual ? atual.corpo : "")}</textarea></label>
            <p class="cem-legenda">Prévia com um cliente de exemplo. Na fila do dia, nome, unidade, empreendimento, cidade e vencimento saem do contrato.</p>
            <pre id="cem-previa" class="cem-previa"></pre>
          </div>
          <aside class="cem-vars-lado">
            <h4>Variáveis</h4>
            ${botoes}
            <section class="cem-var-grupo">
              <h4>Data de retorno</h4>
              <label class="cem-retorno">Dias depois do envio
                <input id="cem-retorno" type="number" min="0" step="1" value="5">
              </label>
              <button type="button" class="cem-var" onclick="CentralEmailApp.inserirRetorno()">Inserir data de retorno</button>
            </section>
          </aside>
        </div>
      </div>
      <div class="cem-foot"><button type="button" class="btn btn-primary" onclick="CentralEmailApp.salvar('${this.esc(atual ? atual.id : "")}')">Salvar</button></div>
    </div>`;
    document.body.appendChild(pop);
    const corpo = document.getElementById("cem-corpo");
    if (corpo) corpo.addEventListener("input", () => this.atualizarPreview());
    ["cem-assunto", "cem-retorno"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", () => this.atualizarPreview());
    });
    this.atualizarPreview();
  },

  fecharModal() {
    const pop = document.getElementById("cem-modal");
    if (pop) pop.remove();
  },

  inserir(token) {
    const el = document.getElementById("cem-corpo");
    if (!el) return;
    const i = el.selectionStart || 0;
    const f = el.selectionEnd || 0;
    el.value = el.value.slice(0, i) + token + el.value.slice(f);
    const p = i + token.length;
    el.focus();
    el.setSelectionRange(p, p);
    this.atualizarPreview();
  },

  inserirRetorno() {
    const n = document.getElementById("cem-retorno");
    const dias = Math.max(0, Math.round(Number(n && n.value) || 0));
    this.inserir("{{retorno:" + dias + "}}");
  },

  atualizarPreview() {
    const previa = document.getElementById("cem-previa");
    const corpo = document.getElementById("cem-corpo");
    const assunto = document.getElementById("cem-assunto");
    if (!previa) return;
    const titulo = this.aplicar(assunto && assunto.value, this.EXEMPLO);
    const texto = this.aplicar(corpo && corpo.value, this.EXEMPLO);
    previa.textContent = (titulo ? "Título: " + titulo + "\n\n" : "") + texto;
  },

  async salvar(id) {
    if (!this.podeEditar()) return;
    const nome = String((document.getElementById("cem-nome") || {}).value || "").trim();
    const assunto = String((document.getElementById("cem-assunto") || {}).value || "").trim();
    const corpo = String((document.getElementById("cem-corpo") || {}).value || "");
    const tag = Number((document.getElementById("cem-tag") || {}).value);
    const dias = Math.round(Number((document.getElementById("cem-dias") || {}).value));
    if (!nome || !assunto || !corpo.trim() || !Number.isFinite(tag) || !Number.isFinite(dias) || dias < 0) {
      this.aviso("Informe o nome, o título do e-mail, o texto, a tag e os dias depois de vencido.");
      return;
    }
    const anterior = id ? this.achar(id) : null;
    const quem = this.eu();
    const item = {
      id: id || ("cem_" + Date.now().toString(36)),
      nome, assunto, corpo, tag, diasVencido: dias,
      criadoPorEmail: (anterior && anterior.criadoPorEmail) || quem.email,
      criadoPorNome: (anterior && anterior.criadoPorNome) || quem.nome,
      status: "pendente",
      ativo: false,
      aprovadoEm: "",
      avisoCriador: false
    };
    if (anterior && this.assinatura(anterior) === this.assinatura(item)) {
      item.status = anterior.status || "pendente";
      item.ativo = item.status === "aprovado" && !!anterior.ativo;
      item.aprovadoEm = anterior.aprovadoEm || "";
      item.avisoCriador = !!anterior.avisoCriador;
    }
    const resto = this.state.templates.filter((t) => t.id !== item.id);
    this.state.templates = resto.concat([item]);
    await this.gravar();
    this.fecharModal();
    this.render();
  },

  aviso(texto) {
    let el = document.getElementById("cem-aviso");
    if (!el) {
      el = document.createElement("p");
      el.id = "cem-aviso";
      el.className = "cem-aviso";
      const body = document.querySelector("#cem-modal .cem-body");
      if (body) body.prepend(el);
    }
    el.textContent = texto;
  },

  async excluir(id) {
    if (!this.podeEditar()) return;
    const t = this.achar(id);
    if (!t) return;
    const pergunta = "Excluir o template " + t.nome + "?";
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(pergunta) : confirm(pergunta);
    if (!ok) return;
    this.state.templates = this.state.templates.filter((item) => item.id !== id);
    await this.gravar();
    this.render();
  },

  abrirLeitura(titulo, texto) {
    this.fecharModal();
    const pop = document.createElement("div");
    pop.id = "cem-modal";
    pop.className = "cem-modal";
    pop.innerHTML = `<div class="cem-card" role="dialog" aria-modal="true" aria-labelledby="cem-titulo">
      <div class="cem-head">
        <h3 id="cem-titulo">${this.esc(titulo)}</h3>
        <button type="button" class="btn btn-fechar" onclick="CentralEmailApp.fecharModal()">Fechar</button>
      </div>
      <div class="cem-body"><pre id="cem-leitura" class="cem-previa"></pre></div>
      <div class="cem-foot"><button type="button" class="btn btn-primary" onclick="CentralEmailApp.copiar()">Copiar</button></div>
    </div>`;
    document.body.appendChild(pop);
    const pre = document.getElementById("cem-leitura");
    if (pre) pre.textContent = texto;
  },

  verTemplate(id) {
    const t = this.achar(id);
    if (!t) return;
    const assunto = this.aplicar(t.assunto, this.EXEMPLO);
    const corpo = this.aplicar(t.corpo, this.EXEMPLO);
    this.abrirLeitura(t.nome, (assunto ? assunto + "\n\n" : "") + corpo);
  },

  verCliente(id, indice) {
    const t = this.achar(id);
    if (!t) return;
    const c = this.clientesDoTemplate(t)[indice];
    if (!c) return;
    const ctx = this.contextoCliente(c);
    const assunto = this.aplicar(t.assunto, ctx);
    const corpo = this.aplicar(t.corpo, ctx);
    const para = this.emailDe(c);
    this.abrirLeitura(c.customerName || t.nome, (para ? "Para: " + para + "\n\n" : "") + (assunto ? assunto + "\n\n" : "") + corpo);
  },

  async copiar() {
    const pre = document.getElementById("cem-leitura");
    const texto = pre ? pre.textContent : "";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(texto);
    } catch (e) {}
  },

  pendentes() {
    return this.state.templates.filter((t) => t.status !== "aprovado");
  },

  chaveVisto(t) {
    return "crm_cem_visto_" + this.eu().email + "_" + t.id + "_" + (t.aprovadoEm || "");
  },

  visto(t) {
    try { return localStorage.getItem(this.chaveVisto(t)) === "1"; } catch (e) { return false; }
  },

  marcarVisto(t) {
    try { localStorage.setItem(this.chaveVisto(t), "1"); } catch (e) {}
  },

  avisosDoCriador() {
    const email = this.eu().email;
    if (!email) return [];
    return this.state.templates.filter((t) => t.status === "aprovado" && !t.ativo && t.avisoCriador && t.criadoPorEmail === email && !this.visto(t));
  },

  async avisar() {
    if (this._avisando || !this.eu().email) return;
    this._avisando = true;
    try {
    if (!this.state.pronto) {
      try { await this.carregar(); } catch (e) { return; }
    }
    if (document.getElementById("cem-modal")) return;
    let sessao = "";
    try { sessao = sessionStorage.getItem("crm_cem_aprov_sessao") || ""; } catch (e) {}
    if (this.souAdmin() && this.pendentes().length && sessao !== "1") {
      this.abrirAprovacao("");
      return;
    }
    const meus = this.avisosDoCriador();
    if (meus.length) this.abrirAvisoCriador(meus);
    } finally {
      this._avisando = false;
    }
  },

  abrirAprovacao(id) {
    if (!this.souAdmin()) return;
    const lista = id ? this.pendentes().filter((t) => t.id === id) : this.pendentes();
    if (!lista.length) return;
    this.fecharModal();
    const blocos = lista.map((t) => `<section class="cem-bloco">
      <h4>${this.esc(t.nome)}</h4>
      <p>${this.esc(this.rotuloTag(t.tag))} · ${this.esc(t.diasVencido)} dia(s) depois de vencido${t.criadoPorNome ? " · " + this.esc(t.criadoPorNome) : ""}</p>
      <p>${this.esc(t.assunto)}</p>
      <div class="cem-aprova-linha">
        <label class="moura-switch">
          <input type="checkbox" id="cem-ligar-${this.esc(t.id)}">
          <span class="moura-switch-track" aria-hidden="true"></span>
          <span class="moura-switch-text">Ligar a régua</span>
        </label>
        <button type="button" class="btn btn-primary btn-sm" onclick="CentralEmailApp.aprovar('${this.esc(t.id)}')">Aprovar</button>
      </div>
    </section>`).join("");
    const pop = document.createElement("div");
    pop.id = "cem-modal";
    pop.className = "cem-modal";
    pop.innerHTML = `<div class="cem-card cem-card-aviso" role="dialog" aria-modal="true" aria-labelledby="cem-titulo">
      <div class="cem-head">
        <h3 id="cem-titulo">Aprovar template</h3>
        <button type="button" class="btn btn-fechar" id="cem-aprov-fechar">Fechar</button>
      </div>
      <div class="cem-body">
        <p class="cem-legenda">A régua só liga se o interruptor estiver ligado na hora de aprovar. Sem isso, o template fica aprovado e a régua continua desligada.</p>
        ${blocos}
      </div>
    </div>`;
    document.body.appendChild(pop);
    pop.querySelector("#cem-aprov-fechar").addEventListener("click", () => {
      try { sessionStorage.setItem("crm_cem_aprov_sessao", "1"); } catch (e) {}
      this.fecharModal();
    });
  },

  async aprovar(id) {
    if (!this.souAdmin()) return;
    const t = this.achar(id);
    if (!t) return;
    const liga = document.getElementById("cem-ligar-" + id);
    t.status = "aprovado";
    t.ativo = !!(liga && liga.checked);
    t.aprovadoEm = new Date().toISOString();
    t.avisoCriador = !t.ativo;
    await this.gravar();
    const ainda = this.pendentes();
    if (ainda.length && document.getElementById("cem-modal")) this.abrirAprovacao("");
    else this.fecharModal();
    if (document.getElementById("central-email-root")) this.render();
  },

  abrirAvisoCriador(lista) {
    const itens = lista || [];
    if (!itens.length) return;
    this.fecharModal();
    const blocos = itens.map((t) => `<section class="cem-bloco">
      <h4>${this.esc(t.nome)}</h4>
      <p>O template foi aprovado, mas a régua continua desligada. Deseja fazer alguma modificação antes de ligar?</p>
      <button type="button" class="btn btn-primary btn-sm" onclick="CentralEmailApp.modificarAprovado('${this.esc(t.id)}')">Modificar</button>
    </section>`).join("");
    const pop = document.createElement("div");
    pop.id = "cem-modal";
    pop.className = "cem-modal";
    pop.innerHTML = `<div class="cem-card cem-card-aviso" role="dialog" aria-modal="true" aria-labelledby="cem-titulo">
      <div class="cem-head">
        <h3 id="cem-titulo">Template aprovado</h3>
        <button type="button" class="btn btn-fechar" id="cem-criador-fechar">Fechar</button>
      </div>
      <div class="cem-body">${blocos}</div>
    </div>`;
    document.body.appendChild(pop);
    pop.querySelector("#cem-criador-fechar").addEventListener("click", () => {
      itens.forEach((t) => this.marcarVisto(t));
      this.fecharModal();
    });
  },

  modificarAprovado(id) {
    const t = this.achar(id);
    if (t) this.marcarVisto(t);
    this.fecharModal();
    this.editar(id);
  }
};

window.CentralEmailApp = CentralEmailApp;

document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "central-email" && window.CentralEmailApp) CentralEmailApp.abrir();
});

document.addEventListener("DOMContentLoaded", function () {
  let tentativas = 0;
  const tentar = function () {
    tentativas += 1;
    const app = window.CentralEmailApp;
    const u = typeof window.crmUsuarioAcesso === "function" ? window.crmUsuarioAcesso() : (window.AppState && window.AppState.currentUser);
    if (!app || !u || !u.email) {
      if (tentativas < 20) setTimeout(tentar, 1000);
      return;
    }
    app.avisar();
  };
  setTimeout(tentar, 2500);
});
