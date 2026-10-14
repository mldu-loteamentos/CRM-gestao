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
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        createdAt: row.createdAt,
        status: row.status
      });
      row.id = ref.id;
      const atual = this.lerLocal().map((x) => (x.createdAt === row.createdAt && x.userId === row.userId && x.tipo === row.tipo ? row : x));
      this.gravarLocal(atual);
    } catch (e) {
      console.error("[Assinatura] registro", e);
    }
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
    const tabela = rows.length
      ? `<div style="overflow:auto;"><table class="custom-table" style="font-size:0.85rem;min-width:860px;">
          <thead><tr>
            ${this.th("quando", "Quando")}
            ${this.th("tipo", "Documento")}
            ${this.th("cliente", "Cliente")}
            ${this.th("titulo", "Título")}
            ${this.th("unidade", "Unidade")}
            ${this.th("quem", "Gerado por")}
            <th>Situação</th>
          </tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${this.esc(this.quando(r.createdAt))}</td>
            <td>${this.esc(this.tipoLabel(r.tipo))}</td>
            <td>${this.esc(r.cliente || "—")}</td>
            <td>${this.esc(r.titulo || "—")}</td>
            <td>${this.esc(r.unidade || "—")}</td>
            <td>${this.esc(r.userName || "—")}${this.mesmoUsuario(r) ? " <span style=\"color:#105436;font-weight:700;\">você</span>" : ""}</td>
            <td>Aguardando assinatura</td>
          </tr>`).join("")}</tbody>
        </table></div>`
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
