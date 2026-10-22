/* Custas judiciais da ficha: só para título sub judice no Sienge ou marcado no Integra. */
const CustasJudiciaisApp = {
  itens: [],
  editId: "",
  guias: [],
  comprovantes: [],
  salvando: false,

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  chave() {
    const cid = String((window.AppState && AppState.selectedCustomerId) || "").replace(/\D/g, "");
    const bruto = String((window.AppState && (AppState.selectedSaleId || AppState.selectedContractId)) || "");
    const sid = bruto.replace(/^B-/i, "").split("-")[0].replace(/\D/g, "");
    return { cid: cid, sid: sid };
  },

  dataBr(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "/" + m[2] + "/" + m[1]) : "";
  },

  usuario() {
    const u = (window.AppState && AppState.currentUser) || {};
    return u.name || u.nome || u.email || "";
  },

  async render() {
    const root = document.getElementById("custas-judiciais-root");
    if (!root) return;
    const chave = this.chave();
    if (!chave.cid || !chave.sid) {
      root.innerHTML = `<p class="cj-nota">Abra o título do cliente para registrar as custas.</p>`;
      return;
    }
    this.editId = "";
    this.guias = [];
    this.comprovantes = [];
    root.innerHTML = `<div class="cj-topo">
        <p class="cj-nota">Clique na linha para editar.</p>
        <button type="button" class="btn btn-primary" id="cj-nova">Nova custa</button>
      </div>
      <div id="cj-lista"><p class="cj-nota">Carregando…</p></div>`;
    const nova = document.getElementById("cj-nova");
    if (nova) nova.addEventListener("click", () => this.nova());
    await this.carregar();
  },

  nova() {
    this.editId = "nova";
    this.rascunho = null;
    this.guias = [];
    this.comprovantes = [];
    this.pintarLista();
    const data = document.getElementById("cj-data");
    if (data) data.focus();
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
    this.pintarLista();
  },

  guardarRascunho() {
    const data = document.getElementById("cj-data");
    const desc = document.getElementById("cj-desc");
    if (!data && !desc) return;
    this.rascunho = {
      data: data ? data.value : "",
      descricao: desc ? desc.value : ""
    };
  },

  celulaArquivos(campo, inputId, existentes) {
    const links = (existentes || []).map((a) => `<a href="${this.esc(a.url)}" target="_blank" rel="noopener">${this.esc(a.name || "Arquivo")}</a>`).join("");
    const novos = (this[campo] || []).map((f, i) => `<span>${this.esc(f.name)}
      <button type="button" class="tvig-ico is-danger" title="Tirar arquivo" data-cj-tirar="${campo}:${i}">
        <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
      </button></span>`).join("");
    return `<div class="cj-cel-arq">
      <label class="cj-escolher"><i data-lucide="paperclip" style="width:14px;height:14px;"></i> Anexar
        <input type="file" id="${inputId}" accept="application/pdf,image/*" multiple>
      </label>
      ${links}${novos}
    </div>`;
  },

  linhaEdicao(item) {
    const fonte = this.rascunho || {
      data: String((item && item.data) || "").slice(0, 10),
      descricao: (item && item.descricao) || ""
    };
    this.rascunho = null;
    const data = this.esc(fonte.data);
    const desc = this.esc(fonte.descricao);
    return `<tr class="cj-linha-edicao">
      <td><input type="date" id="cj-data" value="${data}"></td>
      <td><input type="text" id="cj-desc" value="${desc}" placeholder="Ex.: custas de distribuição, diligência do oficial"></td>
      <td>${this.celulaArquivos("guias", "cj-guias", item && item.guias)}</td>
      <td>${this.celulaArquivos("comprovantes", "cj-comp", item && item.comprovantes)}</td>
      <td class="is-right cj-acoes-cell">
        <div class="cj-acoes">
          <button type="button" class="btn btn-primary" id="cj-salvar">Salvar</button>
          <button type="button" class="btn btn-cancel" id="cj-cancelar">Cancelar</button>
        </div>
      </td>
    </tr>`;
  },

  ligarEdicao() {
    const guias = document.getElementById("cj-guias");
    const comp = document.getElementById("cj-comp");
    if (guias) guias.addEventListener("change", () => this.receberArquivos(guias, "guias"));
    if (comp) comp.addEventListener("change", () => this.receberArquivos(comp, "comprovantes"));
    const salvar = document.getElementById("cj-salvar");
    const cancelar = document.getElementById("cj-cancelar");
    if (salvar) salvar.addEventListener("click", () => this.salvar());
    if (cancelar) cancelar.addEventListener("click", () => this.cancelarEdicao());
    const lista = document.getElementById("cj-lista");
    if (!lista) return;
    lista.querySelectorAll("[data-cj-tirar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ped = String(btn.getAttribute("data-cj-tirar") || "").split(":");
        const campo = ped[0];
        const i = Number(ped[1]);
        if (this[campo]) this[campo].splice(i, 1);
        this.guardarRascunho();
        this.pintarLista();
      });
    });
  },

  fb() {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.collection || !fc.getDocs || !fc.doc || !fc.setDoc) return null;
    return fc;
  },

  async carregar() {
    const lista = document.getElementById("cj-lista");
    const chave = this.chave();
    const fc = this.fb();
    if (!fc) {
      this.itens = [];
      if (lista) lista.innerHTML = `<p class="cj-nota">Não consegui ler as custas: o Firebase não está disponível.</p>`;
      return;
    }
    try {
      const q = fc.query(fc.collection(window.firebaseDb, "custas_judiciais"), fc.where("customerId", "==", chave.cid));
      const snap = await fc.getDocs(q);
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

  links(lista) {
    if (!lista || !lista.length) return "—";
    return lista.map((a) => `<a href="${this.esc(a.url)}" target="_blank" rel="noopener">${this.esc(a.name || "Arquivo")}</a>`).join("<br>");
  },

  pintarLista() {
    const lista = document.getElementById("cj-lista");
    if (!lista) return;
    const nova = this.editId === "nova" ? this.linhaEdicao(null) : "";
    const linhas = this.itens.map((item) => {
      if (this.editId === item.id) return this.linhaEdicao(item);
      return `<tr class="cj-linha" data-cj-linha="${this.esc(item.id)}" title="Clique para editar">
        <td>${this.esc(this.dataBr(item.data))}</td>
        <td>${this.esc(item.descricao || "")}</td>
        <td>${this.links(item.guias)}</td>
        <td>${this.links(item.comprovantes)}</td>
        <td class="is-right cj-acoes-cell">
          <button type="button" class="tvig-ico" title="Editar" data-cj-editar="${this.esc(item.id)}">
            <i data-lucide="pencil" style="width:15px;height:15px;"></i>
          </button>
          <button type="button" class="tvig-ico is-danger" title="Excluir" data-cj-excluir="${this.esc(item.id)}">
            <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
          </button>
        </td>
      </tr>`;
    }).join("");
    const vazio = !this.itens.length && !nova
      ? `<tr><td colspan="5"><p class="cj-nota">Nenhuma custa registrada neste título.</p></td></tr>`
      : "";
    lista.innerHTML = `<div class="cj-tabela-scroll"><table class="custom-table cj-tabela">
      <thead><tr><th>Data</th><th>Do que se trata</th><th>Guias</th><th>Comprovantes</th><th class="is-right">Ações</th></tr></thead>
      <tbody>${nova}${linhas}${vazio}</tbody>
    </table></div>`;
    lista.querySelectorAll("[data-cj-linha]").forEach((tr) => {
      tr.addEventListener("click", (ev) => {
        if (ev.target.closest("a, button, input, label")) return;
        this.editar(tr.getAttribute("data-cj-linha"));
      });
    });
    lista.querySelectorAll("[data-cj-editar]").forEach((btn) => {
      btn.addEventListener("click", () => this.editar(btn.getAttribute("data-cj-editar")));
    });
    lista.querySelectorAll("[data-cj-excluir]").forEach((btn) => {
      btn.addEventListener("click", () => this.excluir(btn.getAttribute("data-cj-excluir")));
    });
    if (this.editId) this.ligarEdicao();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  editar(id) {
    const item = this.itens.find((x) => x.id === id);
    if (!item || this.editId === item.id) return;
    this.editId = item.id;
    this.rascunho = null;
    this.guias = [];
    this.comprovantes = [];
    this.pintarLista();
    const data = document.getElementById("cj-data");
    if (data) data.focus();
  },

  cancelarEdicao() {
    this.editId = "";
    this.rascunho = null;
    this.guias = [];
    this.comprovantes = [];
    this.pintarLista();
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
    if (!data) { alert("Informe a data."); return; }
    if (!descricao) { alert("Informe do que se trata."); return; }
    const atual = this.itens.find((x) => x.id === this.editId);
    const guiasAtuais = (atual && atual.guias) || [];
    const compAtuais = (atual && atual.comprovantes) || [];
    if (!guiasAtuais.length && !this.guias.length) { alert("Anexe a guia."); return; }
    if (!compAtuais.length && !this.comprovantes.length) { alert("Anexe o comprovante de pagamento."); return; }
    const fc = this.fb();
    if (!fc) { alert("O Firebase não está disponível."); return; }
    this.salvando = true;
    const btn = document.getElementById("cj-salvar");
    if (btn) btn.disabled = true;
    try {
      const id = this.editId || (chave.cid + "_" + chave.sid + "_" + Date.now());
      const guias = guiasAtuais.concat(await this.subir(this.guias, id, "guia"));
      const comprovantes = compAtuais.concat(await this.subir(this.comprovantes, id, "comprovante"));
      const payload = {
        customerId: chave.cid,
        saleId: chave.sid,
        data: data,
        descricao: descricao,
        guias: guias,
        comprovantes: comprovantes,
        updatedAt: new Date().toISOString(),
        updatedBy: this.usuario()
      };
      if (!this.editId) {
        payload.createdAt = payload.updatedAt;
        payload.createdBy = payload.updatedBy;
      }
      await fc.setDoc(fc.doc(window.firebaseDb, "custas_judiciais", id), payload, { merge: true });
      this.cancelarEdicao();
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
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Excluir esta custa e os anexos?")
      : confirm("Excluir esta custa e os anexos?");
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
      if (this.editId === id) this.cancelarEdicao();
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
