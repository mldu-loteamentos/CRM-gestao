/* Processo em que outra parte entra contra uma empresa do grupo. */
const ProcessoContraApp = {
  buscaCliente: "",
  buscaTitulo: "",
  filtro: "",
  achadosCliente: [],
  achadosTitulo: [],
  parte: null,
  itens: [],
  empresaId: "",
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
  },

  render() {
    const root = document.getElementById("processo-contra-root");
    if (!root) return;
    const edita = this.podeEditar();
    const opcoes = this.empresas().map((c) => {
      const nome = this.nomeEmpresa(c.id);
      const sel = String(c.id) === String(this.empresaId) ? " selected" : "";
      return `<option value="${this.esc(c.id)}"${sel}>${this.esc(c.id + " - " + nome)}</option>`;
    }).join("");
    const vazioEmp = opcoes ? "" : `<option value="" disabled>Nenhuma empresa gerida pelo grupo</option>`;
    const motivos = this.MOTIVOS.map((m) => `<option value="${this.esc(m)}"${m === this.motivo ? " selected" : ""}>${this.esc(m)}</option>`).join("");
    const form = !edita ? "" : `<div class="pc-form" id="pc-form">
        <p class="cj-nota">${this.parte ? ("Parte: " + this.esc(this.parte.rotulo)) : "Escolha a parte na busca para abrir o processo."}</p>
        <label>Empresa processada
          <select id="pc-empresa"><option value="">Selecione</option>${vazioEmp}${opcoes}</select>
        </label>
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
    root.innerHTML = `<div class="pc-page">
        <p class="cj-nota">Busque o cliente. O título a receber fica no campo ao lado. A outra parte entra com o processo contra a empresa escolhida.</p>
        <div class="pc-buscas">
          <label>Cliente
            <div class="pc-drop">
              <input type="text" id="pc-q" class="pc-campo" placeholder="Nome do cliente..." autocomplete="off" value="${this.esc(this.buscaCliente)}">
              <div id="pc-clientes" class="pc-dd"></div>
            </div>
          </label>
          <label>Título a receber
            <div class="pc-drop">
              <input type="text" id="pc-titulo" class="pc-campo" placeholder="Número do título ou nome do cliente..." autocomplete="off" value="${this.esc(this.buscaTitulo)}">
              <div id="pc-titulos" class="pc-dd"></div>
            </div>
          </label>
        </div>
        ${form}
        <div class="search-box-wrapper pc-busca pc-filtro">
          <input type="text" id="pc-filtro" class="search-input" placeholder="Número do processo ou motivo..." style="font-style: italic;" autocomplete="off" value="${this.esc(this.filtro)}">
          <i data-lucide="search" class="search-icon"></i>
        </div>
        <div id="pc-lista"></div>
      </div>`;
    const q = document.getElementById("pc-q");
    if (q) q.addEventListener("input", () => {
      this.buscaCliente = q.value || "";
      this.sugerirClientes();
    });
    const tit = document.getElementById("pc-titulo");
    if (tit) tit.addEventListener("input", () => {
      this.buscaTitulo = tit.value || "";
      this.sugerirTitulos();
    });
    const filtro = document.getElementById("pc-filtro");
    if (filtro) filtro.addEventListener("input", () => {
      this.filtro = filtro.value || "";
      this.pintarLista();
    });
    const emp = document.getElementById("pc-empresa");
    const num = document.getElementById("pc-numero");
    const mot = document.getElementById("pc-motivo");
    if (emp) emp.addEventListener("change", () => { this.empresaId = emp.value || ""; });
    if (num) num.addEventListener("input", () => { this.processo = num.value || ""; });
    if (mot) mot.addEventListener("change", () => { this.motivo = mot.value || ""; });
    const cancelar = document.getElementById("pc-cancelar");
    const abrir = document.getElementById("pc-abrir");
    if (cancelar) cancelar.addEventListener("click", () => this.limpar());
    if (abrir) abrir.addEventListener("click", () => this.abrir());
    this.sugerirClientes();
    this.sugerirTitulos();
    this.pintarLista();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  limpar() {
    this.parte = null;
    this.empresaId = "";
    this.processo = "";
    this.motivo = "";
    this.buscaCliente = "";
    this.buscaTitulo = "";
    this.achadosCliente = [];
    this.achadosTitulo = [];
    this.render();
  },

  clientesBase() {
    const cache = window.GlobalCustomerCache && GlobalCustomerCache.data;
    if (Array.isArray(cache) && cache.length) {
      return cache.map((c) => ({ id: String(c.id || "").replace(/\D/g, ""), name: String(c.name || "").trim() })).filter((c) => c.id || c.name);
    }
    const vistos = new Set();
    const out = [];
    [].concat(window.rawClientList || []).concat(window.clientList || []).concat(window._subjudiceList || []).forEach((c) => {
      if (!c) return;
      const id = String(c.customerId || "").replace(/\D/g, "");
      const name = String(c.customerName || c.clientName || "").trim();
      if (!id || vistos.has(id)) return;
      vistos.add(id);
      out.push({ id: id, name: name });
    });
    return out;
  },

  sugerirClientes() {
    const dd = document.getElementById("pc-clientes");
    if (!dd) return;
    const q = this.fold(this.buscaCliente).trim();
    const termos = q.split(" ").filter(Boolean);
    if (!termos.length) {
      this.achadosCliente = [];
      dd.style.display = "none";
      dd.innerHTML = "";
      return;
    }
    const lista = this.clientesBase().filter((c) => {
      const blob = this.fold(c.id + " " + c.name);
      return termos.every((t) => blob.indexOf(t) >= 0);
    }).slice(0, 12);
    this.achadosCliente = lista.map((c) => ({
      tipo: "cliente",
      id: c.id,
      nome: c.name,
      customerId: c.id,
      rotulo: (c.id ? c.id + " - " : "") + c.name
    }));
    this.pintarDrop(dd, this.achadosCliente, "cliente");
  },

  sugerirTitulos() {
    const dd = document.getElementById("pc-titulos");
    if (!dd) return;
    const q = this.fold(this.buscaTitulo).trim();
    if (q.length < 2) {
      this.achadosTitulo = [];
      dd.style.display = "none";
      dd.innerHTML = "";
      return;
    }
    const vistos = new Set();
    const out = [];
    [].concat(window.rawClientList || []).concat(window.clientList || []).concat(window._subjudiceList || []).forEach((c) => {
      if (!c || out.length >= 12) return;
      const nome = String(c.customerName || c.clientName || "").trim();
      const cid = String(c.customerId || "").replace(/\D/g, "");
      const sid = String(c.saleId || c.receivableBillId || "").replace(/\D/g, "");
      if (!sid || vistos.has(sid)) return;
      const blob = this.fold(sid + " " + nome + " " + cid);
      if (blob.indexOf(q) < 0) return;
      vistos.add(sid);
      out.push({ tipo: "titulo", id: sid, nome: nome, customerId: cid, rotulo: sid + " - " + (nome || "Sem cliente") });
    });
    this.achadosTitulo = out;
    this.pintarDrop(dd, out, "titulo");
  },

  pintarDrop(dd, lista, qual) {
    if (!lista.length) {
      dd.style.display = "none";
      dd.innerHTML = "";
      return;
    }
    dd.style.display = "block";
    dd.innerHTML = lista.map((a, i) => `<button type="button" data-pc-${qual}="${i}">${this.esc(a.rotulo)}</button>`).join("");
    dd.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        const item = lista[Number(btn.getAttribute("data-pc-" + qual))];
        this.escolher(item);
      });
    });
  },

  escolher(item) {
    if (!item || !this.podeEditar()) return;
    this.parte = item;
    this.achadosCliente = [];
    this.achadosTitulo = [];
    if (item.tipo === "titulo") {
      this.buscaTitulo = item.rotulo;
      this.buscaCliente = "";
    } else {
      this.buscaCliente = item.nome || item.rotulo;
      this.buscaTitulo = "";
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
    if (!this.parte) { alert("Busque e escolha o cliente ou o título a receber."); return; }
    const empresa = String(this.empresaId || "").replace(/\D/g, "");
    const processo = String(this.processo || "").trim();
    const motivo = String(this.motivo || "").trim();
    if (!empresa) { alert("Escolha a empresa que está sendo processada."); return; }
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
