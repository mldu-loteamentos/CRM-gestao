/* Custas judiciais da ficha: só para título sub judice no Sienge ou marcado no Integra. */
const CustasJudiciaisApp = {
  itens: [],
  editId: "",
  guias: [],
  comprovantes: [],
  guiasTirar: [],
  comprovantesTirar: [],
  anexos: [],
  anexosTirar: [],
  tipos: [],
  salvando: false,
  TIPOS: [
    "Custas de distribuição",
    "Custas iniciais",
    "Taxa judiciária",
    "Custas de citação",
    "Diligência de oficial de justiça",
    "Condução de oficial de justiça",
    "Custas de mandado",
    "Custas de intimação",
    "Custas de carta precatória",
    "Custas de edital",
    "Custas de publicação",
    "Preparo de recurso",
    "Custas de apelação",
    "Custas de agravo",
    "Custas de embargos",
    "Custas de cumprimento de sentença",
    "Custas de penhora",
    "Custas de avaliação",
    "Honorários de perito",
    "Custas de protesto",
    "Custas de certidão",
    "Custas de desarquivamento",
    "Custas finais"
  ],
  rascunho: null,

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  chave() {
    const cid = String((window.AppState && AppState.selectedCustomerId) || "").replace(/\D/g, "");
    const bruto = String((window.AppState && (AppState.selectedSaleId || AppState.selectedContractId || AppState.currentReceivableBillId)) || "");
    const sid = bruto.replace(/^B-/i, "").split("-")[0].replace(/\D/g, "");
    return { cid: cid, sid: sid };
  },

  dataBr(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "/" + m[2] + "/" + m[1]) : "";
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

  money(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  reais(n) {
    return "R$ " + this.money(n);
  },

  formatarValor(input) {
    if (!input) return;
    let d = String(input.value || "").replace(/\D/g, "");
    if (!d) { input.value = ""; return; }
    d = d.replace(/^0+/, "");
    while (d.length < 3) d = "0" + d;
    const reais = d.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    input.value = "R$ " + reais + "," + d.slice(-2);
  },

  fold(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  },

  tiposDoItem(item) {
    if (item && Array.isArray(item.tipos) && item.tipos.length) {
      return item.tipos.map((t) => String(t || "").trim()).filter(Boolean);
    }
    return String((item && item.descricao) || "").split(/[,;·|]/).map((s) => s.trim()).filter(Boolean);
  },

  lerValor(texto) {
    const t = String(texto || "").replace(/[^\d,.-]/g, "").trim();
    if (!t) return 0;
    if (t.indexOf(",") >= 0) return Number(t.replace(/\./g, "").replace(",", ".")) || 0;
    return Number(t) || 0;
  },

  usuario() {
    const u = (window.AppState && AppState.currentUser) || {};
    return u.name || u.nome || u.email || "";
  },

  processoAtual() {
    const el = document.getElementById("jud-process-number");
    const digitado = el ? el.value : "";
    if (typeof window.processoJudicialTexto === "function") return window.processoJudicialTexto(digitado);
    return String(digitado || "").trim();
  },

  limparUnidade(nome, ccId) {
    let t = String(nome || "").replace(/\s+/g, " ").trim();
    if (!t || t === "N/D" || t === "—" || t === "-" || /^carregando\b/i.test(t)) return "";
    const cc = String(ccId || "").replace(/\D/g, "");
    if (cc) t = t.replace(new RegExp("^" + cc + "\\s*[-–]\\s*", "i"), "").trim();
    if (!t || t === "N/D" || (cc && t.replace(/\D/g, "") === cc)) return "";
    return t;
  },

  nomeDeRegistro(row, ccId) {
    if (!row) return "";
    const cc = ccId || row.costCenterId;
    const direto = this.limparUnidade(row.unitName || row.units || row.unityName, cc);
    if (direto) return direto;
    const unidade = (row.salesContractUnits && row.salesContractUnits[0]) || {};
    const doContrato = this.limparUnidade(unidade.name || unidade.unitName, cc);
    if (doContrato) return doContrato;
    const partes = String(row.unitId || "").split("-");
    if (partes.length >= 3) return this.limparUnidade(partes.slice(2).join("-"), cc);
    return "";
  },

  idsDoRegistro(row) {
    const lista = [row && row.saleId, row && row.receivableBillId, row && row.id].concat((row && row.billIds) || []);
    return lista.map((v) => String(v || "").replace(/^B-/i, "").split("-")[0].replace(/\D/g, "")).filter(Boolean);
  },

  unidadeConhecida(cid, sid, ccId) {
    const st = window.AppState || {};
    const c = String(cid || "").replace(/\D/g, "");
    const s = String(sid || "").replace(/\D/g, "");
    const cc = String(ccId || "").replace(/\D/g, "");
    const fontes = [].concat(st.defaultersList || [], st.sales || []);
    const doCliente = fontes.filter((row) => {
      const rc = String(row.customerId || "").replace(/\D/g, "");
      return !c || !rc || rc === c;
    });
    const porTitulo = doCliente.filter((row) => s && this.idsDoRegistro(row).indexOf(s) >= 0);
    const porCentro = doCliente.filter((row) => cc && String(row.costCenterId || "").replace(/\D/g, "") === cc);
    const fila = porTitulo.length ? porTitulo : (porCentro.length ? porCentro : (doCliente.length === 1 ? doCliente : []));
    for (let i = 0; i < fila.length; i++) {
      const nome = this.nomeDeRegistro(fila[i], cc);
      if (nome) return nome;
    }
    const tituloEl = document.getElementById("ctx-titulo-val");
    const aberto = tituloEl ? String(tituloEl.textContent || "").replace(/\D/g, "") : "";
    if (!s || !aberto || aberto === s) {
      const rotulo = document.getElementById("det-block-lot-span") || document.getElementById("det-block-lot") || document.getElementById("ctx-empreend-val");
      const nome = this.limparUnidade(rotulo && rotulo.textContent, cc);
      if (nome) return nome;
    }
    return "";
  },

  contextoTitulo() {
    const st = window.AppState || {};
    const chave = this.chave();
    const lista = st.defaultersList || [];
    const hit = lista.find((c) => String(c.customerId || "").replace(/\D/g, "") === chave.cid
      && this.idsDoRegistro(c).indexOf(chave.sid) >= 0) || null;
    const companyId = String(st.currentCompanyId || (hit && hit.companyId) || "").replace(/\D/g, "");
    const costCenterId = String(st.currentCostCenterId || (hit && hit.costCenterId) || "").replace(/\D/g, "");
    const unitName = this.nomeDeRegistro(hit, costCenterId) || this.unidadeConhecida(chave.cid, chave.sid, costCenterId);
    let companyName = "";
    if (companyId && typeof window.getCompanyName === "function") companyName = window.getCompanyName(companyId) || "";
    return {
      companyId: companyId,
      companyName: companyName,
      costCenterId: costCenterId,
      unitName: unitName,
      customerName: (hit && (hit.customerName || hit.clientName)) || ""
    };
  },

  async render() {
    const root = document.getElementById("custas-judiciais-root");
    if (!root) return;
    this.fecharModal();
    const chave = this.chave();
    if (!chave.cid || !chave.sid) {
      root.innerHTML = `<p class="cj-nota">Abra o título do cliente para registrar as custas.</p>`;
      return;
    }
    const chaveAtual = chave.cid + "|" + chave.sid;
    if (this._chave !== chaveAtual) {
      this._chave = chaveAtual;
      this.itens = [];
    }
    this.editId = "";
    this.guias = [];
    this.comprovantes = [];
    this.rascunho = null;
    root.innerHTML = `<div class="cj-topo">
        <p class="cj-nota">Clique na linha para editar. Custa com título a pagar não é alterada.</p>
        <button type="button" class="btn btn-primary" id="cj-nova">Nova custa</button>
      </div>
      <div id="cj-lista"></div>`;
    const nova = document.getElementById("cj-nova");
    if (nova) nova.addEventListener("click", () => this.nova());
    this.pintarLista();
    const geracao = (this._geracao = (this._geracao || 0) + 1);
    this.carregar(geracao);
  },

  nova() {
    this.editId = "nova";
    this.rascunho = null;
    this.guias = [];
    this.comprovantes = [];
    this.guiasTirar = [];
    this.comprovantesTirar = [];
    this.anexos = [];
    this.anexosTirar = [];
    this.tipos = [];
    this.abrirModal(null);
  },

  receberArquivos(input, campo) {
    const lista = Array.from((input && input.files) || []);
    if (input) input.value = "";
    const max = 10 * 1024 * 1024;
    lista.forEach((file) => {
      if (!file) return;
      if (file.size > max) {
        alert("O arquivo \"" + file.name + "\" passa de 10 MB.");
        return;
      }
      const ja = this[campo].some((f) => f.name === file.name && f.size === file.size);
      if (!ja) this[campo].push(file);
    });
    this.guardarRascunho();
    this.pintarChips();
  },

  guardarRascunho() {
    const data = document.getElementById("cj-data");
    const valor = document.getElementById("cj-valor");
    if (!data && !valor && !document.getElementById("cj-tipos")) return;
    this.tipos = this.tiposMarcados();
    this.rascunho = {
      data: data ? data.value : "",
      valor: valor ? valor.value : "",
      tipos: this.tipos.slice()
    };
  },

  tiposMarcados() {
    const box = document.getElementById("cj-tipos");
    if (!box) return (this.tipos || []).slice();
    return Array.from(box.querySelectorAll("[data-cj-tipo]:checked")).map((el) => el.value).filter(Boolean);
  },

  fb() {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.collection || !fc.getDocs || !fc.doc || !fc.setDoc) return null;
    return fc;
  },

  async carregar(geracao) {
    const lista = document.getElementById("cj-lista");
    const chave = this.chave();
    const fc = this.fb();
    if (geracao != null && geracao !== this._geracao) return;
    if (!fc) {
      this.itens = [];
      if (lista) lista.innerHTML = `<p class="cj-nota">Não consegui ler as custas: o Firebase não está disponível.</p>`;
      return;
    }
    try {
      const col = fc.collection(window.firebaseDb, "custas_judiciais");
      let snap;
      try {
        snap = await fc.getDocs(fc.query(col, fc.where("customerId", "==", chave.cid), fc.where("saleId", "==", chave.sid)));
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (!/index|índice/i.test(msg)) throw e;
        snap = await fc.getDocs(fc.query(col, fc.where("customerId", "==", chave.cid)));
      }
      if (geracao != null && geracao !== this._geracao) return;
      const itens = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        if (String(data.saleId || "") !== chave.sid) return;
        data.id = d.id;
        itens.push(data);
      });
      itens.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      this.itens = itens;
    } catch (e) {
      this.itens = [];
      if (lista) lista.innerHTML = `<p class="cj-nota">Não consegui ler as custas: ${this.esc((e && e.message) || e)}</p>`;
      return;
    }
    this.pintarLista();
    this.marcarContagem();
    await this.completarPagamento(geracao);
  },

  situacao(item) {
    if (!String((item && item.billId) || "").trim()) return { rotulo: "—", classe: "" };
    if (item.reemPago) return { rotulo: "Pago", classe: "is-pago" };
    return { rotulo: "Programado", classe: "is-prog" };
  },

  async completarPagamento(geracao) {
    const app = window.PagarReembolsoApp;
    if (!app || typeof app.lerTitulo !== "function") return;
    const alvos = this.itens.filter((item) => item.billId && item.reemPago == null);
    if (!alvos.length) return;
    await Promise.all(alvos.map(async (item) => {
      try {
        const info = await app.lerTitulo(item.billId);
        item.reemPago = !!info.pago;
      } catch (e) {
        item.reemPago = false;
      }
    }));
    if (geracao != null && geracao !== this._geracao) return;
    this.pintarLista();
  },

  marcarContagem() {
    const btn = document.getElementById("btn-tab-custas-judiciais");
    if (!btn) return;
    let pill = btn.querySelector(".ml-tab-count");
    if (!this.itens.length) {
      if (pill) pill.remove();
      return;
    }
    if (!pill) {
      pill = document.createElement("span");
      pill.className = "ml-tab-count";
      btn.appendChild(pill);
    }
    pill.textContent = String(this.itens.length);
  },

  listaArquivos(arquivos, vazio) {
    if (!arquivos || !arquivos.length) return `<li class="cj-arq-vazio">${vazio}</li>`;
    return arquivos.map((a) => `<li><a href="${this.esc(a.url)}" target="_blank" rel="noopener"><i data-lucide="file-text"></i><span>${this.esc(a.name || "Arquivo")}</span></a></li>`).join("");
  },

  juntarArquivos(guias, comprovantes, anexos) {
    const vistos = {};
    const out = [];
    [].concat(guias || [], comprovantes || [], anexos || []).forEach((a) => {
      if (!a || !a.url || vistos[a.url]) return;
      vistos[a.url] = true;
      out.push(a);
    });
    return out;
  },

  fecharPainelAnexos() {
    const pop = document.getElementById("cj-anexos-pop");
    if (pop) pop.remove();
  },

  abrirPainelAnexos(guias, comprovantes, anexos) {
    this.fecharPainelAnexos();
    const todos = this.juntarArquivos(guias, comprovantes, anexos);
    const pop = document.createElement("div");
    pop.id = "cj-anexos-pop";
    pop.className = "cj-pop";
    pop.innerHTML = `<div class="cj-pop-box cj-anexos-box" role="dialog" aria-modal="true">
      <div class="cj-pop-head"><h3>Anexos</h3><button type="button" class="btn btn-fechar" id="cj-anexos-fechar">Fechar</button></div>
      <ul class="cj-arq-lista cj-anexos-lista">${this.listaArquivos(todos, "Nenhum arquivo")}</ul>
    </div>`;
    document.body.appendChild(pop);
    const fechar = document.getElementById("cj-anexos-fechar");
    if (fechar) fechar.addEventListener("click", () => this.fecharPainelAnexos());
    pop.addEventListener("click", (ev) => { if (ev.target === pop) this.fecharPainelAnexos(); });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  pintarLista() {
    const lista = document.getElementById("cj-lista");
    if (!lista) return;
    const linhas = this.itens.map((item) => {
      const travado = !!String(item.billId || "").trim();
      const nAnexos = ((item.guias || []).length + (item.comprovantes || []).length + (item.anexos || []).length);
      const quem = item.createdBy || item.updatedBy || "—";
      const quando = this.quando(item.createdAt || item.updatedAt);
      const liberado = item.liberatedBy || "";
      const quandoLib = this.quando(item.liberatedAt);
      const sit = this.situacao(item);
      const acoes = travado
        ? ""
        : `<button type="button" class="tvig-ico" title="Editar" data-cj-editar="${this.esc(item.id)}"><i data-lucide="pencil" style="width:15px;height:15px;"></i></button>
           <button type="button" class="tvig-ico is-danger" title="Excluir" data-cj-excluir="${this.esc(item.id)}"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>`;
      return `<tr class="cj-linha${travado ? " is-travada" : ""}" ${travado ? "" : `data-cj-linha="${this.esc(item.id)}"`} title="${travado ? "Título a pagar gerado. Esta custa não pode ser editada." : "Clique para editar"}">
        <td>${this.esc(this.dataBr(item.data) || "—")}</td>
        <td><span class="pr-status ${sit.classe}">${this.esc(sit.rotulo)}</span></td>
        <td class="cc-nome" title="${this.esc(item.descricao || "")}">${this.esc(item.descricao || "—")}</td>
        <td class="cj-quem">${liberado ? `<span class="cj-quem-linha">${this.esc(liberado)}${quandoLib ? `<span class="cj-quando">${this.esc(quandoLib)}</span>` : ""}</span>` : "—"}</td>
        <td>${travado ? this.esc(item.billId) : "—"}</td>
        <td class="is-right">${item.valor != null && item.valor !== "" ? this.money(item.valor) : "—"}</td>
        <td class="cj-quem"><span class="cj-quem-linha">${this.esc(quem)}${quando ? `<span class="cj-quando">${this.esc(quando)}</span>` : ""}</span></td>
        <td class="is-center">
          <button type="button" class="tvig-ico" title="Anexos" data-cj-anexos="${this.esc(item.id)}">
            <i data-lucide="paperclip" style="width:15px;height:15px;"></i>${nAnexos ? `<span class="cj-anexo-n">${nAnexos}</span>` : ""}
          </button>
        </td>
        <td class="is-center cj-acoes-cell">${acoes}</td>
      </tr>`;
    }).join("");
    const vazio = !this.itens.length
      ? `<tr><td colspan="9" class="cj-vazio">Nenhuma custa registrada neste título.</td></tr>`
      : "";
    lista.innerHTML = `<div class="cc-scroll cj-scroll"><table class="cc-table cj-cc">
      <colgroup><col class="cj-c-data"><col class="cj-c-status"><col><col class="cj-c-quem"><col class="cj-c-pagar"><col class="cj-c-valor"><col class="cj-c-quem"><col class="cj-c-ico"><col class="cj-c-acoes"></colgroup>
      <thead><tr><th>Data de pagamento</th><th>Status</th><th>Do que se trata</th><th>Liberado por</th><th>Título a pagar</th><th class="is-right">Valor</th><th>Cadastrado por</th><th class="is-center">Anexos</th><th class="is-center">Ações</th></tr></thead>
      <tbody>${linhas}${vazio}</tbody>
    </table></div>`;
    lista.querySelectorAll("[data-cj-linha]").forEach((tr) => {
      tr.addEventListener("click", (ev) => {
        if (ev.target.closest("a, button")) return;
        this.editar(tr.getAttribute("data-cj-linha"));
      });
    });
    lista.querySelectorAll("[data-cj-anexos]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const item = this.itens.find((x) => x.id === btn.getAttribute("data-cj-anexos"));
        if (!item) return;
        this.abrirPainelAnexos(item.guias, item.comprovantes, item.anexos);
      });
    });
    lista.querySelectorAll("[data-cj-editar]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.editar(btn.getAttribute("data-cj-editar"));
      });
    });
    lista.querySelectorAll("[data-cj-excluir]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.excluir(btn.getAttribute("data-cj-excluir"));
      });
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  editar(id) {
    const item = this.itens.find((x) => x.id === id);
    if (!item) return;
    if (String(item.billId || "").trim()) return;
    this.editId = item.id;
    this.rascunho = null;
    this.guias = [];
    this.comprovantes = [];
    this.guiasTirar = [];
    this.comprovantesTirar = [];
    this.anexos = [];
    this.anexosTirar = [];
    this.tipos = this.tiposDoItem(item);
    this.abrirModal(item);
  },

  modalEl() {
    let el = document.getElementById("cj-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "cj-modal";
    el.className = "cj-pop";
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  },

  abrirModal(item) {
    const el = this.modalEl();
    const fonte = this.rascunho || {
      data: String((item && item.data) || "").slice(0, 10),
      valor: item && item.valor != null && item.valor !== "" ? this.reais(item.valor) : "",
      tipos: (item && this.tiposDoItem(item)) || []
    };
    if (!this.rascunho) this.tipos = fonte.tipos.slice();
    const titulo = item ? "Editar custa" : "Nova custa";
    el.hidden = false;
    el.innerHTML = `<div class="cj-pop-box" role="dialog" aria-modal="true" aria-labelledby="cj-pop-titulo">
      <div class="cj-pop-head">
        <h3 id="cj-pop-titulo">${titulo}</h3>
        <button type="button" class="btn btn-fechar" id="cj-fechar">Fechar</button>
      </div>
      <div class="cj-pop-grid">
        <label>Data de pagamento das custas<input type="date" id="cj-data" value="${this.esc(fonte.data)}"></label>
        <label>Valor<input type="text" id="cj-valor" inputmode="numeric" placeholder="R$ 0,00" value="${this.esc(fonte.valor)}"></label>
      </div>
      <div class="cj-pop-campo">Do que se trata
        <p class="cj-nota">Marque um ou mais tipos. A lista junta as custas já usadas e as principais de um processo de cobrança.</p>
        <input type="search" id="cj-tipo-busca" placeholder="Buscar tipo de custa">
        <div id="cj-tipos" class="cj-tipos"></div>
        <div class="cj-tipo-outro">
          <input type="text" id="cj-tipo-novo" placeholder="Outro tipo de custa">
          <button type="button" class="btn btn-primary" id="cj-tipo-add">Incluir</button>
        </div>
      </div>
      <div id="cj-chips"></div>
      <div class="cj-pop-acoes">
        <button type="button" class="btn btn-cancel" id="cj-cancelar">Cancelar</button>
        <button type="button" class="btn btn-primary" id="cj-salvar">Salvar</button>
      </div>
    </div>`;
    this.rascunho = null;
    const salvar = document.getElementById("cj-salvar");
    const cancelar = document.getElementById("cj-cancelar");
    const fechar = document.getElementById("cj-fechar");
    if (salvar) salvar.addEventListener("click", () => this.salvar());
    if (cancelar) cancelar.addEventListener("click", () => this.fecharModal());
    if (fechar) fechar.addEventListener("click", () => this.fecharModal());
    el.onclick = (ev) => { if (ev.target === el) this.fecharModal(); };
    const valor = document.getElementById("cj-valor");
    if (valor) valor.addEventListener("input", () => this.formatarValor(valor));
    const add = document.getElementById("cj-tipo-add");
    if (add) add.addEventListener("click", () => this.incluirTipo());
    const busca = document.getElementById("cj-tipo-busca");
    if (busca) busca.addEventListener("input", () => this.pintarTipos());
    this.pintarTipos();
    this.pintarChips();
    this.garantirCatalogo();
    const data = document.getElementById("cj-data");
    if (data) data.focus();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  incluirTipo() {
    const input = document.getElementById("cj-tipo-novo");
    const nome = String((input && input.value) || "").replace(/\s+/g, " ").trim();
    if (!nome) return;
    const chave = this.fold(nome);
    if (!this.TIPOS.some((t) => this.fold(t) === chave)) this.TIPOS.push(nome);
    if (!(this._catalogo || []).some((t) => this.fold(t) === chave)) {
      this._catalogo = (this._catalogo || this.TIPOS.slice()).concat([nome]);
    }
    this.tipos = this.tiposMarcados();
    if (!this.tipos.some((t) => this.fold(t) === chave)) this.tipos.push(nome);
    if (input) input.value = "";
    this.pintarTipos();
  },

  catalogoTipos() {
    const vistos = {};
    const out = [];
    const por = (lista) => (lista || []).forEach((t) => {
      const nome = String(t || "").trim();
      const chave = this.fold(nome);
      if (!chave || vistos[chave]) return;
      vistos[chave] = true;
      out.push(nome);
    });
    por(this.TIPOS);
    por(this._catalogo);
    por(this.tipos);
    (this.itens || []).forEach((item) => por(this.tiposDoItem(item)));
    return out;
  },

  async garantirCatalogo() {
    if (this._catalogoPronto) return;
    this._catalogoPronto = true;
    const fc = this.fb();
    if (!fc) return;
    try {
      const snap = await fc.getDocs(fc.collection(window.firebaseDb, "custas_judiciais"));
      const extra = [];
      snap.forEach((d) => this.tiposDoItem(d.data()).forEach((t) => extra.push(t)));
      this._catalogo = extra;
      if (document.getElementById("cj-tipos")) this.pintarTipos();
    } catch (e) {}
  },

  pintarTipos() {
    const box = document.getElementById("cj-tipos");
    if (!box) return;
    const marcados = {};
    (this.tipos || []).forEach((t) => { marcados[this.fold(t)] = true; });
    const buscaEl = document.getElementById("cj-tipo-busca");
    const busca = this.fold(buscaEl && buscaEl.value);
    const nomes = this.catalogoTipos().filter((nome) => !busca || this.fold(nome).indexOf(busca) >= 0);
    if (!nomes.length) {
      box.innerHTML = `<p class="cj-nota">Nenhum tipo com esse nome.</p>`;
      return;
    }
    box.innerHTML = nomes.map((nome) => {
      const on = !!marcados[this.fold(nome)];
      return `<label class="cj-tipo${on ? " is-on" : ""}"><input type="checkbox" data-cj-tipo value="${this.esc(nome)}" ${on ? "checked" : ""}><span>${this.esc(nome)}</span></label>`;
    }).join("");
    box.querySelectorAll("[data-cj-tipo]").forEach((el) => {
      el.addEventListener("change", () => {
        el.closest(".cj-tipo").classList.toggle("is-on", el.checked);
        this.tipos = this.tiposMarcados();
      });
    });
  },

  mostrarSalvando() {
    const box = document.querySelector("#cj-modal .cj-pop-box");
    if (!box) return;
    let load = document.getElementById("cj-salvando");
    if (!load) {
      load = document.createElement("div");
      load.id = "cj-salvando";
      load.className = "cj-salvando";
      box.appendChild(load);
    }
    load.hidden = false;
    load.innerHTML = `<div class="ml-load"><div class="loading-spinner" aria-hidden="true"></div><div class="loading-status-text">Salvando</div><div class="ml-load-track"><div class="loading-progress-bar" style="width:55%"></div></div></div>`;
  },

  esconderSalvando() {
    const load = document.getElementById("cj-salvando");
    if (load) load.remove();
  },

  arquivosVisiveis(item, campo, tirar) {
    return ((item && item[campo]) || []).filter((a) => tirar.indexOf(a && a.url) < 0);
  },

  pintarChips() {
    const box = document.getElementById("cj-chips");
    if (!box) return;
    const item = this.itens.find((x) => x.id === this.editId);
    const salvos = []
      .concat(this.arquivosVisiveis(item, "guias", this.guiasTirar).map((a) => ({ a: a, campo: "guias" })))
      .concat(this.arquivosVisiveis(item, "comprovantes", this.comprovantesTirar).map((a) => ({ a: a, campo: "comprovantes" })))
      .concat(this.arquivosVisiveis(item, "anexos", this.anexosTirar).map((a) => ({ a: a, campo: "anexos" })));
    const linhas = salvos.map((x) => `<li><a href="${this.esc(x.a.url)}" target="_blank" rel="noopener">${this.esc(x.a.name || "Arquivo")}</a>
      <button type="button" class="tvig-ico is-danger" title="Tirar arquivo" data-cj-tirar-salvo="${x.campo}:${this.esc(x.a.url)}">
        <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
      </button></li>`).join("");
    const pend = (this.anexos || []).map((f, i) => `<li><span>${this.esc(f.name)}</span>
      <button type="button" class="tvig-ico is-danger" title="Tirar arquivo" data-cj-tirar="${i}">
        <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
      </button></li>`).join("");
    const vazio = !linhas && !pend ? `<li class="cj-arq-vazio">Nenhum arquivo</li>` : "";
    box.innerHTML = `<section class="cj-arq-bloco"><header><b>Anexos</b>
      <label class="cj-escolher"><i data-lucide="paperclip" style="width:14px;height:14px;"></i> Anexar
        <input type="file" id="cj-anexos" accept="application/pdf,image/*" multiple>
      </label>
    </header><ul class="cj-arq-lista">${linhas}${pend}${vazio}</ul></section>`;
    const input = document.getElementById("cj-anexos");
    if (input) input.addEventListener("change", () => this.receberArquivos(input, "anexos"));
    box.querySelectorAll("[data-cj-tirar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-cj-tirar"));
        if (this.anexos) this.anexos.splice(i, 1);
        this.guardarRascunho();
        this.pintarChips();
      });
    });
    box.querySelectorAll("[data-cj-tirar-salvo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bruto = String(btn.getAttribute("data-cj-tirar-salvo") || "");
        const corte = bruto.indexOf(":");
        const campo = bruto.slice(0, corte);
        const url = bruto.slice(corte + 1);
        const lista = campo === "guias" ? this.guiasTirar : (campo === "comprovantes" ? this.comprovantesTirar : this.anexosTirar);
        if (url && lista.indexOf(url) < 0) lista.push(url);
        this.guardarRascunho();
        this.pintarChips();
      });
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  fecharModal() {
    this.fecharPainelAnexos();
    const el = document.getElementById("cj-modal");
    if (el) el.hidden = true;
    this.editId = "";
    this.rascunho = null;
    this.guias = [];
    this.comprovantes = [];
    this.anexos = [];
    this.guiasTirar = [];
    this.comprovantesTirar = [];
    this.anexosTirar = [];
    this.tipos = [];
    this.esconderSalvando();
  },

  async subir(files, id, pasta) {
    const fc = window.firebaseCollections;
    if (!window.firebaseStorage || !fc || !fc.ref || !fc.uploadBytes || !fc.getDownloadURL) {
      throw new Error("Não consegui enviar o anexo.");
    }
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safe = String(file.name || "arquivo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "arquivo";
      const path = "custas-judiciais/" + id + "/" + pasta + "_" + Date.now() + "_" + i + "_" + safe;
      const storageRef = fc.ref(window.firebaseStorage, path);
      await fc.uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
      const url = await fc.getDownloadURL(storageRef);
      out.push({ name: file.name || safe, url: url, path: path, type: file.type || "", size: Number(file.size) || 0 });
    }
    return out;
  },

  async salvar() {
    if (this.salvando) return;
    const chave = this.chave();
    const data = String((document.getElementById("cj-data") || {}).value || "").slice(0, 10);
    const tipos = this.tiposMarcados();
    const descricao = tipos.join(", ");
    const valor = Math.round(this.lerValor((document.getElementById("cj-valor") || {}).value) * 100) / 100;
    if (!data) { alert("Informe a data de pagamento das custas."); return; }
    if (!(valor > 0)) { alert("Informe o valor."); return; }
    if (!tipos.length) { alert("Selecione ao menos um tipo de custa."); return; }
    const atual = this.itens.find((x) => x.id === this.editId);
    const guiasAtuais = this.arquivosVisiveis(atual, "guias", this.guiasTirar);
    const compAtuais = this.arquivosVisiveis(atual, "comprovantes", this.comprovantesTirar);
    const anexosAtuais = this.arquivosVisiveis(atual, "anexos", this.anexosTirar);
    if (!guiasAtuais.length && !compAtuais.length && !anexosAtuais.length && !this.anexos.length) {
      alert("Anexe a custa e o comprovante.");
      return;
    }
    const fc = this.fb();
    if (!fc) { alert("O Firebase não está disponível."); return; }
    this.salvando = true;
    const btn = document.getElementById("cj-salvar");
    if (btn) btn.disabled = true;
    this.mostrarSalvando();
    try {
      const novo = !atual;
      const id = novo ? (chave.cid + "_" + chave.sid + "_" + Date.now()) : atual.id;
      const guias = guiasAtuais;
      const comprovantes = compAtuais;
      const anexos = anexosAtuais.concat(await this.subir(this.anexos, id, "anexo"));
      const ctx = this.contextoTitulo();
      const payload = {
        customerId: chave.cid,
        saleId: chave.sid,
        data: data,
        descricao: descricao,
        tipos: tipos,
        valor: valor,
        guias: guias,
        comprovantes: comprovantes,
        anexos: anexos,
        companyId: ctx.companyId || (atual && atual.companyId) || "",
        companyName: ctx.companyName || (atual && atual.companyName) || "",
        costCenterId: ctx.costCenterId || (atual && atual.costCenterId) || "",
        unitName: ctx.unitName || (atual && atual.unitName) || "",
        customerName: ctx.customerName || (atual && atual.customerName) || "",
        processo: this.processoAtual() || (atual && atual.processo) || "",
        updatedAt: new Date().toISOString(),
        updatedBy: this.usuario()
      };
      if (novo) {
        payload.createdAt = payload.updatedAt;
        payload.createdBy = payload.updatedBy;
        payload.billId = "";
      }
      await fc.setDoc(fc.doc(window.firebaseDb, "custas_judiciais", id), payload, { merge: true });
      const removidos = [].concat(atual && atual.guias || [], atual && atual.comprovantes || [], atual && atual.anexos || [])
        .filter((a) => a && (this.guiasTirar.indexOf(a.url) >= 0 || this.comprovantesTirar.indexOf(a.url) >= 0 || this.anexosTirar.indexOf(a.url) >= 0));
      if (removidos.length && fc.deleteObject && fc.ref && window.firebaseStorage) {
        await Promise.all(removidos.map((a) => {
          if (!a.path) return Promise.resolve();
          return fc.deleteObject(fc.ref(window.firebaseStorage, a.path)).catch(function() {});
        }));
      }
      this.fecharModal();
      await this.carregar();
    } catch (e) {
      this.esconderSalvando();
      alert("Não consegui salvar a custa: " + ((e && e.message) || e));
    } finally {
      this.salvando = false;
      if (btn) btn.disabled = false;
    }
  },

  async excluir(id) {
    const item = this.itens.find((x) => x.id === id);
    if (!item || String(item.billId || "").trim()) return;
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Excluir esta custa e os anexos?")
      : confirm("Excluir esta custa e os anexos?");
    if (!ok) return;
    const fc = this.fb();
    if (!fc || !fc.deleteDoc) { alert("O Firebase não está disponível."); return; }
    try {
      const arquivos = [].concat(item.guias || [], item.comprovantes || [], item.anexos || []);
      if (fc.deleteObject && fc.ref && window.firebaseStorage) {
        await Promise.all(arquivos.map((a) => {
          if (!a || !a.path) return Promise.resolve();
          return fc.deleteObject(fc.ref(window.firebaseStorage, a.path)).catch(function() {});
        }));
      }
      await fc.deleteDoc(fc.doc(window.firebaseDb, "custas_judiciais", id));
      await this.carregar();
    } catch (e) {
      alert("Não consegui excluir a custa: " + ((e && e.message) || e));
    }
  }
};

window.CustasJudiciaisApp = CustasJudiciaisApp;

window.custasJudiciaisDeveMostrar = function(originIsSubjudice) {
  if (originIsSubjudice) return true;
  if (typeof window.fichaSubjudiceIntegraAtivo === "function" && window.fichaSubjudiceIntegraAtivo()) return true;
  if (typeof window.isCurrentlySubjudice === "function") {
    const cid = window.AppState && AppState.selectedCustomerId;
    const sid = window.AppState && (AppState.selectedSaleId || AppState.selectedContractId);
    return window.isCurrentlySubjudice(cid, sid);
  }
  return false;
};
