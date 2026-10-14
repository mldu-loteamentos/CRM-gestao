/* Log dos documentos do Relacionamento que precisam de assinatura. */
const DocAssinaturaApp = {
  COL: "relacionamento_docs_assinatura",
  LS: "crm_docs_assinatura_v1",
  TIPOS: [
    { id: "distrato", label: "Distrato" },
    { id: "cessao", label: "Cessão de direitos" },
    { id: "aditamento", label: "Aditamento" },
    { id: "vencimento", label: "Alteração de vencimento" },
    { id: "terceiros", label: "Autorização de terceiros" }
  ],
  itens: [],
  vista: "todos",
  tipo: "",
  sortKey: "quando",
  sortDir: "desc",
  carregando: false,
  aviso: "",

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  tipoLabel(id) {
    const t = this.TIPOS.find((x) => x.id === id);
    return t ? t.label : String(id || "Documento");
  },

  eu() {
    const u = (typeof window.crmUsuarioAcesso === "function" && window.crmUsuarioAcesso()) || {};
    const nome = String(u.name || u.nome || u.email || "Usuário").replace(/ no usuário .+$/i, "").trim();
    return {
      userId: String(u.id || u.uid || u.email || nome || ""),
      userName: nome || "Usuário",
      userEmail: String(u.email || "").trim().toLowerCase()
    };
  },

  mesmoUsuario(row) {
    const eu = this.eu();
    if (eu.userEmail && row.userEmail && eu.userEmail === String(row.userEmail).toLowerCase()) return true;
    if (eu.userId && row.userId && String(eu.userId) === String(row.userId)) return true;
    return false;
  },

  lerLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.LS) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  },

  gravarLocal(lista) {
    try { localStorage.setItem(this.LS, JSON.stringify(lista.slice(0, 400))); } catch (e) {}
  },

  unir(nuvem, local) {
    const map = new Map();
    [...local, ...nuvem].forEach((row) => {
      if (!row) return;
      const id = String(row.id || "");
      if (!id) return;
      map.set(id, row);
    });
    return [...map.values()];
  },

  async registrar(dados) {
    const tipo = String((dados && dados.tipo) || "");
    if (!this.TIPOS.some((t) => t.id === tipo)) return;
    const eu = this.eu();
    const row = {
      id: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      tipo,
      tipoLabel: this.tipoLabel(tipo),
      cliente: String((dados && dados.cliente) || "").trim() || "—",
      titulo: String((dados && dados.titulo) || "").trim() || "—",
      unidade: String((dados && dados.unidade) || "").trim() || "—",
      arquivo: String((dados && dados.arquivo) || "").trim(),
      centroId: String((dados && dados.centroId) || "").replace(/\D/g, ""),
      centroNome: String((dados && dados.centroNome) || "").trim(),
      pdfUrl: "",
      userId: eu.userId,
      userName: eu.userName,
      userEmail: eu.userEmail,
      createdAt: new Date().toISOString(),
      status: "aguardando"
    };
    const local = this.lerLocal();
    local.unshift(row);
    this.gravarLocal(local);
    if (this.itens.length) {
      this.itens.unshift(row);
      if (document.getElementById("tab-relacionamento_assinaturas") && document.getElementById("tab-relacionamento_assinaturas").style.display !== "none") {
        this.pintar();
      }
    }
    try {
      if (!window.firebaseDb || !window.firebaseCollections || !window.firebaseCollections.addDoc) return;
      const { collection, addDoc } = window.firebaseCollections;
      const ref = await addDoc(collection(window.firebaseDb, this.COL), {
        tipo: row.tipo,
        tipoLabel: row.tipoLabel,
        cliente: row.cliente,
        titulo: row.titulo,
        unidade: row.unidade,
        arquivo: row.arquivo,
        centroId: row.centroId,
        centroNome: row.centroNome,
        pdfUrl: "",
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        createdAt: row.createdAt,
        status: row.status
      });
      row.id = ref.id;
      const atual = this.lerLocal().map((x) => (x.createdAt === row.createdAt && x.userId === row.userId && x.tipo === row.tipo ? row : x));
      this.gravarLocal(atual);
      await this.guardarPdf(row, dados && dados.bytes);
    } catch (e) {
      console.error("[Assinatura] registro", e);
    }
  },

  async guardarPdf(row, bytes) {
    if (!row || !bytes) return;
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!window.firebaseStorage || !fx || !fx.ref || !fx.uploadBytes || !fx.getDownloadURL) return;
    try {
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const blob = new Blob([u8], { type: "application/pdf" });
      const path = "assinaturas/" + String(row.id).replace(/[^\w\-]+/g, "_") + ".pdf";
      const storageRef = fx.ref(window.firebaseStorage, path);
      await fx.uploadBytes(storageRef, blob, { contentType: "application/pdf" });
      row.pdfUrl = await fx.getDownloadURL(storageRef);
      const atual = this.lerLocal().map((x) => (String(x.id) === String(row.id) ? row : x));
      this.gravarLocal(atual);
      const item = this.itens.find((x) => String(x.id) === String(row.id));
      if (item) item.pdfUrl = row.pdfUrl;
      if (db && fx.doc && fx.updateDoc && !String(row.id).startsWith("local-")) {
        await fx.updateDoc(fx.doc(db, this.COL, row.id), { pdfUrl: row.pdfUrl });
      }
      if (document.getElementById("docs-ass-body")) this.pintar();
    } catch (e) {
      console.error("[Assinatura] anexo", e);
    }
  },

  centroDe(row) {
    const salvo = String((row && row.centroId) || "").replace(/\D/g, "");
    if (salvo) return salvo;
    const u = String((row && row.unidade) || "");
    const direto = u.match(/^(\d{4,6})\b/);
    if (direto) return direto[1];
    const unidade = u.match(/U-(\d{4,6})/i);
    if (unidade) return unidade[1];
    return "";
  },

  nomeCentro(id) {
    const salvo = (this.itens || []).find((r) => this.centroDe(r) === String(id) && r.centroNome);
    if (salvo && salvo.centroNome) return String(salvo.centroNome);
    const lista = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    const cc = lista.find((c) => String(c.id) === String(id));
    return cc && cc.name ? String(cc.name).toUpperCase() : "";
  },

  consultar(id) {
    const chave = decodeURIComponent(String(id || ""));
    const row = (this.itens || []).find((r) => String(r.id) === chave);
    if (row && row.pdfUrl) {
      window.open(row.pdfUrl, "_blank", "noopener");
      return;
    }
    alert("Este PDF não ficou salvo para consulta. Ele foi gerado só no computador de quem criou. Os próximos documentos ficam disponíveis neste botão.");
  },

  async carregar() {
    this.carregando = true;
    this.aviso = "";
    this.pintar();
    let nuvem = [];
    try {
      if (window.firebaseDb && window.firebaseCollections && window.firebaseCollections.getDocs) {
        const { collection, getDocs } = window.firebaseCollections;
        const snap = await getDocs(collection(window.firebaseDb, this.COL));
        snap.forEach((d) => nuvem.push(Object.assign({ id: d.id }, d.data() || {})));
      } else {
        this.aviso = "A lista compartilhada ainda não respondeu. Os documentos desta máquina continuam visíveis.";
      }
    } catch (e) {
      console.error("[Assinatura] leitura", e);
      this.aviso = "Não consegui ler a lista compartilhada. Os documentos desta máquina continuam visíveis.";
    }
    this.itens = this.unir(nuvem, this.lerLocal());
    this.carregando = false;
    this.pintar();
  },

  abrir() {
    const root = document.getElementById("relacionamento-assinaturas-root");
    if (!root) return;
    if (!root.dataset.pronto) {
      root.dataset.pronto = "1";
      root.innerHTML = `<div id="docs-ass-body"></div>`;
    }
    this.carregar();
  },

  setVista(id) {
    this.vista = id === "meus" ? "meus" : "todos";
    this.pintar();
  },

  setTipo(id) {
    this.tipo = String(id || "");
    this.pintar();
  },

  toggleSort(key) {
    if (this.sortKey === key) this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    else {
      this.sortKey = key;
      this.sortDir = key === "quando" ? "desc" : "asc";
    }
    this.pintar();
  },

  visiveis() {
    return this.itens.filter((row) => {
      if (this.tipo && row.tipo !== this.tipo) return false;
      if (this.vista === "meus" && !this.mesmoUsuario(row)) return false;
      return true;
    });
  },

  ordenar(lista) {
    const dir = this.sortDir === "asc" ? 1 : -1;
    const key = this.sortKey;
    const val = (row) => {
      if (key === "quando") return String(row.createdAt || "");
      if (key === "tipo") return this.tipoLabel(row.tipo);
      if (key === "cliente") return String(row.cliente || "");
      if (key === "titulo") return String(row.titulo || "");
      if (key === "unidade") return String(row.unidade || "");
      if (key === "quem") return String(row.userName || "");
      return "";
    };
    return lista.slice().sort((a, b) => String(val(a)).localeCompare(String(val(b)), "pt-BR", { numeric: true }) * dir);
  },

  quando(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  },

  th(key, label) {
    return `<th onclick="DocAssinaturaApp.toggleSort('${key}')" style="cursor:pointer;user-select:none;">${label} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
  },

  pintar() {
    const body = document.getElementById("docs-ass-body");
    if (!body) return;
    if (this.carregando) {
      body.innerHTML = `
        <div class="ml-load">
          <div class="loading-spinner" aria-hidden="true"></div>
          <div class="loading-status-text">Carregando os documentos…</div>
          <div class="ml-load-track"><div class="loading-progress-bar" style="width:40%"></div></div>
        </div>`;
      return;
    }
    const abas = [
      { id: "todos", label: "Todos", icon: "files" },
      { id: "meus", label: "Gerados por mim", icon: "user" }
    ];
    const tabs = `<div class="ml-tabs" role="tablist">${abas.map((t) => {
      const on = this.vista === t.id;
      return `<button type="button" role="tab" class="ml-tab${on ? " is-active" : ""}" aria-selected="${on ? "true" : "false"}" onclick="DocAssinaturaApp.setVista('${t.id}')"><i data-lucide="${t.icon}"></i> ${t.label}</button>`;
    }).join("")}</div>`;
    const opts = `<option value="">Todos os documentos</option>` + this.TIPOS.map((t) => `<option value="${t.id}"${this.tipo === t.id ? " selected" : ""}>${this.esc(t.label)}</option>`).join("");
    const rows = this.ordenar(this.visiveis());
    const aviso = this.aviso ? `<p style="margin:0 0 12px;color:#9a3412;font-size:0.85rem;">${this.esc(this.aviso)}</p>` : "";
    const grupos = new Map();
    rows.forEach((r) => {
      const id = this.centroDe(r) || "";
      if (!grupos.has(id)) grupos.set(id, []);
      grupos.get(id).push(r);
    });
    const ordem = [...grupos.keys()].sort((a, b) => String(a || "￿").localeCompare(String(b || "￿"), "pt-BR", { numeric: true }));
    const linha = (r) => {
      const tem = !!r.pdfUrl;
      return `<tr>
            <td>${this.esc(this.quando(r.createdAt))}</td>
            <td>${this.esc(this.tipoLabel(r.tipo))}</td>
            <td>${this.esc(r.cliente || "—")}</td>
            <td>${this.esc(r.titulo || "—")}</td>
            <td>${this.esc(r.unidade || "—")}</td>
            <td>${this.esc(r.userName || "—")}${this.mesmoUsuario(r) ? " <span style=\"color:#105436;font-weight:700;\">você</span>" : ""}</td>
            <td>Aguardando assinatura</td>
            <td class="is-right"><button type="button" class="tvig-ico" title="${tem ? "Consultar documento" : "PDF não salvo para consulta"}" style="${tem ? "" : "opacity:.35"}" onclick="DocAssinaturaApp.consultar('${encodeURIComponent(String(r.id))}')"><i data-lucide="paperclip" style="width:15px;height:15px;"></i></button></td>
          </tr>`;
    };
    const tabela = rows.length
      ? ordem.map((id) => {
          const lista = grupos.get(id) || [];
          const nome = id ? this.nomeCentro(id) : "";
          const rotulo = id ? (nome ? id + " - " + nome : id) : "Sem centro de custo";
          return `<section class="docs-cc-bloco">
            <div class="docs-cc">${this.esc(rotulo)} <span>${lista.length} documento(s)</span></div>
            <div style="overflow:auto;"><table class="custom-table" style="font-size:0.85rem;min-width:920px;">
              <thead><tr>
                ${this.th("quando", "Quando")}
                ${this.th("tipo", "Documento")}
                ${this.th("cliente", "Cliente")}
                ${this.th("titulo", "Título")}
                ${this.th("unidade", "Unidade")}
                ${this.th("quem", "Gerado por")}
                <th>Situação</th>
                <th class="is-right" style="width:64px;">Ações</th>
              </tr></thead>
              <tbody>${lista.map(linha).join("")}</tbody>
            </table></div>
          </section>`;
        }).join("")
      : `<p style="margin:8px 0 0;color:#64748b;">Nenhum documento nesta visão.</p>`;
    body.innerHTML = `
      <p style="margin:0 0 14px;color:#64748b;font-size:0.9rem;">Distrato, cessão de direitos, aditamento, alteração de vencimento e autorização de terceiros entram aqui quando o PDF é gerado. A lista é de todos os clientes: cada pessoa vê o que gerou e o que os demais geraram.</p>
      ${aviso}
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;">
        ${tabs}
        <label style="margin-left:auto;font-size:0.78rem;font-weight:700;color:#64748b;">Documento
          <select class="form-control" style="min-width:220px;margin-top:4px;" onchange="DocAssinaturaApp.setTipo(this.value)">${opts}</select>
        </label>
      </div>
      ${tabela}`;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
};

window.DocAssinaturaApp = DocAssinaturaApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "relacionamento_assinaturas") DocAssinaturaApp.abrir();
});
