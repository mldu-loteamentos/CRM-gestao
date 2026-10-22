/* Custas judiciais da ficha: só para título sub judice no Sienge ou marcado no Integra. */
const CustasJudiciaisApp = {
  itens: [],
  editId: "",
  guias: [],
  comprovantes: [],
  guiasTirar: [],
  comprovantesTirar: [],
  salvando: false,
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

  money(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  lerValor(texto) {
    const t = String(texto || "").trim();
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
    if (!t || t === "N/D" || t === "—" || t === "-") return "";
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
        <p class="cj-nota">Clique na linha para editar.</p>
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
    const desc = document.getElementById("cj-desc");
    const valor = document.getElementById("cj-valor");
    if (!data && !desc && !valor) return;
    this.rascunho = {
      data: data ? data.value : "",
      descricao: desc ? desc.value : "",
      valor: valor ? valor.value : ""
    };
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
    return arquivos.map((a) => `<li><a href="${this.esc(a.url)}" target="_blank" rel="noopener">${this.esc(a.name || "Arquivo")}</a></li>`).join("");
  },

  fecharPainelAnexos() {
    const pop = document.getElementById("cj-anexos-pop");
    if (pop) pop.remove();
  },

  abrirPainelAnexos(guias, comprovantes, anchor) {
    this.fecharPainelAnexos();
    const pop = document.createElement("div");
    pop.id = "cj-anexos-pop";
    pop.className = "cj-anexos-pop";
    pop.innerHTML = `<div class="cj-anexos-bloco"><b>Guias</b><ul>${this.listaArquivos(guias, "Nenhuma guia")}</ul></div>
      <div class="cj-anexos-bloco"><b>Comprovantes</b><ul>${this.listaArquivos(comprovantes, "Nenhum comprovante")}</ul></div>`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const largura = pop.offsetWidth || 280;
    const altura = pop.offsetHeight || 160;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
    const abaixo = r.bottom + 6;
    const top = abaixo + altura > window.innerHeight - 8 ? Math.max(8, r.top - altura - 6) : abaixo;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    const fechar = (ev) => {
      if (pop.contains(ev.target) || anchor.contains(ev.target)) return;
      this.fecharPainelAnexos();
      document.removeEventListener("mousedown", fechar);
    };
    this._fechaPainel = fechar;
    setTimeout(() => document.addEventListener("mousedown", fechar), 0);
  },

  pintarLista() {
    const lista = document.getElementById("cj-lista");
    if (!lista) return;
    const linhas = this.itens.map((item) => {
      const pago = item.billId ? `<div class="cj-nota">Título a pagar ${this.esc(item.billId)}</div>` : "";
      const nAnexos = ((item.guias || []).length + (item.comprovantes || []).length);
      return `<tr class="cj-linha" data-cj-linha="${this.esc(item.id)}" title="Clique para editar">
        <td>${this.esc(this.dataBr(item.data))}</td>
        <td class="cc-nome">${this.esc(item.descricao || "")}${pago}</td>
        <td class="is-right">${item.valor != null && item.valor !== "" ? this.money(item.valor) : "—"}</td>
        <td class="is-center">
          <button type="button" class="tvig-ico" title="Anexos" data-cj-anexos="${this.esc(item.id)}">
            <i data-lucide="paperclip" style="width:15px;height:15px;"></i>${nAnexos ? `<span class="cj-anexo-n">${nAnexos}</span>` : ""}
          </button>
        </td>
        <td class="is-center cj-acoes-cell">
          <button type="button" class="tvig-ico" title="Editar" data-cj-editar="${this.esc(item.id)}">
            <i data-lucide="pencil" style="width:15px;height:15px;"></i>
          </button>
          <button type="button" class="tvig-ico is-danger" title="Excluir" data-cj-excluir="${this.esc(item.id)}">
            <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
          </button>
        </td>
      </tr>`;
    }).join("");
    const vazio = !this.itens.length
      ? `<tr><td colspan="5" class="cj-vazio">Nenhuma custa registrada neste título.</td></tr>`
      : "";
    lista.innerHTML = `<div class="cc-scroll cj-scroll"><table class="cc-table cj-cc">
      <colgroup><col class="cj-c-data"><col><col class="cj-c-valor"><col class="cj-c-ico"><col class="cj-c-acoes"></colgroup>
      <thead><tr><th>Data</th><th>Do que se trata</th><th class="is-right">Valor</th><th class="is-center">Anexos</th><th class="is-center">Ações</th></tr></thead>
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
        this.abrirPainelAnexos(item.guias, item.comprovantes, btn);
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
    this.editId = item.id;
    this.rascunho = null;
    this.guias = [];
    this.comprovantes = [];
    this.guiasTirar = [];
    this.comprovantesTirar = [];
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
      descricao: (item && item.descricao) || "",
      valor: item && item.valor != null && item.valor !== "" ? this.money(item.valor) : ""
    };
    const titulo = item ? "Editar custa" : "Nova custa";
    el.hidden = false;
    el.innerHTML = `<div class="cj-pop-box" role="dialog" aria-modal="true" aria-labelledby="cj-pop-titulo">
      <div class="cj-pop-head">
        <h3 id="cj-pop-titulo">${titulo}</h3>
        <button type="button" class="btn btn-fechar" id="cj-fechar">Fechar</button>
      </div>
      <div class="cj-pop-grid">
        <label>Data<input type="date" id="cj-data" value="${this.esc(fonte.data)}"></label>
        <label>Valor<input type="text" id="cj-valor" inputmode="decimal" placeholder="0,00" value="${this.esc(fonte.valor)}"></label>
      </div>
      <label class="cj-pop-campo">Do que se trata
        <input type="text" id="cj-desc" value="${this.esc(fonte.descricao)}" placeholder="Ex.: custas de distribuição, diligência do oficial">
      </label>
      <div id="cj-chips"></div>
      <div class="cj-pop-acoes">
        <button type="button" class="btn btn-primary" id="cj-salvar">Salvar</button>
        <button type="button" class="btn btn-cancel" id="cj-cancelar">Cancelar</button>
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
    this.pintarChips();
    const data = document.getElementById("cj-data");
    if (data) data.focus();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  arquivosVisiveis(item, campo, tirar) {
    return ((item && item[campo]) || []).filter((a) => tirar.indexOf(a && a.url) < 0);
  },

  pintarChips() {
    const box = document.getElementById("cj-chips");
    if (!box) return;
    const item = this.itens.find((x) => x.id === this.editId);
    const bloco = (rotulo, campo, tirar, novos) => {
      const salvos = this.arquivosVisiveis(item, campo, tirar).map((a) => `<li><a href="${this.esc(a.url)}" target="_blank" rel="noopener">${this.esc(a.name || "Arquivo")}</a>
        <button type="button" class="tvig-ico is-danger" title="Tirar arquivo" data-cj-tirar-salvo="${campo}:${this.esc(a.url)}">
          <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
        </button></li>`).join("");
      const pend = novos.map((f, i) => `<li><span>${this.esc(f.name)}</span>
        <button type="button" class="tvig-ico is-danger" title="Tirar arquivo" data-cj-tirar="${campo}:${i}">
          <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
        </button></li>`).join("");
      const vazio = !salvos && !pend ? `<li class="cj-arq-vazio">Nenhum arquivo</li>` : "";
      const inputId = campo === "guias" ? "cj-guias" : "cj-comp";
      return `<section class="cj-arq-bloco"><header><b>${rotulo}</b>
        <label class="cj-escolher"><i data-lucide="paperclip" style="width:14px;height:14px;"></i> Anexar
          <input type="file" id="${inputId}" accept="application/pdf,image/*" multiple>
        </label>
      </header><ul class="cj-arq-lista">${salvos}${pend}${vazio}</ul></section>`;
    };
    box.innerHTML = `<div class="cj-arq-grade">
      ${bloco("Guias", "guias", this.guiasTirar, this.guias)}
      ${bloco("Comprovantes", "comprovantes", this.comprovantesTirar, this.comprovantes)}
    </div>`;
    const guias = document.getElementById("cj-guias");
    const comp = document.getElementById("cj-comp");
    if (guias) guias.addEventListener("change", () => this.receberArquivos(guias, "guias"));
    if (comp) comp.addEventListener("change", () => this.receberArquivos(comp, "comprovantes"));
    box.querySelectorAll("[data-cj-tirar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ped = String(btn.getAttribute("data-cj-tirar") || "").split(":");
        const campo = ped[0];
        const i = Number(ped[1]);
        if (this[campo]) this[campo].splice(i, 1);
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
        const lista = campo === "guias" ? this.guiasTirar : this.comprovantesTirar;
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
    this.guiasTirar = [];
    this.comprovantesTirar = [];
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
    const descricao = String((document.getElementById("cj-desc") || {}).value || "").replace(/\s+/g, " ").trim();
    const valor = Math.round(this.lerValor((document.getElementById("cj-valor") || {}).value) * 100) / 100;
    if (!data) { alert("Informe a data."); return; }
    if (!(valor > 0)) { alert("Informe o valor."); return; }
    if (!descricao) { alert("Informe do que se trata."); return; }
    const atual = this.itens.find((x) => x.id === this.editId);
    const guiasAtuais = this.arquivosVisiveis(atual, "guias", this.guiasTirar);
    const compAtuais = this.arquivosVisiveis(atual, "comprovantes", this.comprovantesTirar);
    if (!guiasAtuais.length && !this.guias.length) { alert("Anexe a guia."); return; }
    if (!compAtuais.length && !this.comprovantes.length) { alert("Anexe o comprovante de pagamento."); return; }
    const fc = this.fb();
    if (!fc) { alert("O Firebase não está disponível."); return; }
    this.salvando = true;
    const btn = document.getElementById("cj-salvar");
    if (btn) btn.disabled = true;
    try {
      const novo = !atual;
      const id = novo ? (chave.cid + "_" + chave.sid + "_" + Date.now()) : atual.id;
      const guias = guiasAtuais.concat(await this.subir(this.guias, id, "guia"));
      const comprovantes = compAtuais.concat(await this.subir(this.comprovantes, id, "comprovante"));
      const ctx = this.contextoTitulo();
      const payload = {
        customerId: chave.cid,
        saleId: chave.sid,
        data: data,
        descricao: descricao,
        valor: valor,
        guias: guias,
        comprovantes: comprovantes,
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
      const removidos = [].concat(atual && atual.guias || [], atual && atual.comprovantes || [])
        .filter((a) => a && (this.guiasTirar.indexOf(a.url) >= 0 || this.comprovantesTirar.indexOf(a.url) >= 0));
      if (removidos.length && fc.deleteObject && fc.ref && window.firebaseStorage) {
        await Promise.all(removidos.map((a) => {
          if (!a.path) return Promise.resolve();
          return fc.deleteObject(fc.ref(window.firebaseStorage, a.path)).catch(function() {});
        }));
      }
      this.fecharModal();
      await this.carregar();
    } catch (e) {
      alert("Não consegui salvar a custa: " + ((e && e.message) || e));
    } finally {
      this.salvando = false;
      if (btn) btn.disabled = false;
    }
  },

  async excluir(id) {
    const item = this.itens.find((x) => x.id === id);
    if (!item) return;
    const extra = item.billId ? " O título a pagar " + item.billId + " no Sienge continua." : "";
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Excluir esta custa e os anexos?" + extra)
      : confirm("Excluir esta custa e os anexos?" + extra);
    if (!ok) return;
    const fc = this.fb();
    if (!fc || !fc.deleteDoc) { alert("O Firebase não está disponível."); return; }
    try {
      const arquivos = [].concat(item.guias || [], item.comprovantes || []);
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
