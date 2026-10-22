/* Processo em que outra parte entra contra uma empresa do grupo. */
const ProcessoContraApp = {
  busca: "",
  achados: [],
  buscando: false,
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

  empresas() {
    const lista = (window.AppState && AppState.companies) || [];
    return lista.slice().sort((a, b) => Number(a.id) - Number(b.id));
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
    const motivos = this.MOTIVOS.map((m) => `<option value="${this.esc(m)}"${m === this.motivo ? " selected" : ""}>${this.esc(m)}</option>`).join("");
    const form = !edita ? "" : `<div class="pc-form" id="pc-form">
        <p class="cj-nota">${this.parte ? ("Parte: " + this.esc(this.parte.rotulo)) : "Escolha a parte na busca para abrir o processo."}</p>
        <label>Empresa processada
          <select id="pc-empresa"><option value="">Selecione</option>${opcoes}</select>
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
        <p class="cj-nota">Busque o cliente, o credor ou o título a receber. A outra parte entra com o processo contra a empresa escolhida.</p>
        <div class="search-box-wrapper pc-busca">
          <input type="text" id="pc-q" class="search-input" placeholder="Cliente, credor ou título a receber..." style="font-style: italic;" autocomplete="off" value="${this.esc(this.busca)}">
          <i data-lucide="search" class="search-icon"></i>
        </div>
        <div id="pc-achados"></div>
        ${form}
        <div id="pc-lista"></div>
      </div>`;
    const q = document.getElementById("pc-q");
    if (q) q.addEventListener("input", () => {
      this.busca = q.value || "";
      this.procurar();
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
    this.pintarAchados();
    this.pintarLista();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  limpar() {
    this.parte = null;
    this.empresaId = "";
    this.processo = "";
    this.motivo = "";
    this.busca = "";
    this.achados = [];
    this.render();
  },

  async procurar() {
    const q = this.fold(this.busca).trim();
    const token = (this._token = (this._token || 0) + 1);
    if (q.length < 2) {
      this.achados = [];
      this.pintarAchados();
      return;
    }
    const locais = this.buscarLocais(q);
    this.achados = locais;
    this.pintarAchados();
    let credores = [];
    try { credores = await this.buscarCredores(this.busca.trim()); } catch (e) { credores = []; }
    if (token !== this._token) return;
    const vistos = new Set(locais.map((a) => a.tipo + "|" + a.id));
    credores.forEach((c) => {
      const k = c.tipo + "|" + c.id;
      if (vistos.has(k)) return;
      vistos.add(k);
      locais.push(c);
    });
    this.achados = locais.slice(0, 20);
    this.pintarAchados();
  },

  buscarLocais(q) {
    const listas = []
      .concat(window.rawClientList || [])
      .concat(window.clientList || [])
      .concat(window._subjudiceList || []);
    const out = [];
    const vistos = new Set();
    listas.forEach((c) => {
      if (!c) return;
      const nome = String(c.customerName || c.clientName || "").trim();
      const cid = String(c.customerId || "").replace(/\D/g, "");
      const sid = String(c.saleId || c.receivableBillId || c.id || "").replace(/\D/g, "");
      const blob = this.fold([nome, cid, sid].join(" "));
      if (blob.indexOf(q) < 0) return;
      if (sid && !vistos.has("titulo|" + sid)) {
        vistos.add("titulo|" + sid);
        out.push({ tipo: "titulo", id: sid, nome: nome, customerId: cid, rotulo: "Título " + sid + (nome ? " · " + nome : "") });
      }
      if (cid && !vistos.has("cliente|" + cid)) {
        vistos.add("cliente|" + cid);
        out.push({ tipo: "cliente", id: cid, nome: nome, customerId: cid, rotulo: "Cliente " + cid + (nome ? " · " + nome : "") });
      }
    });
    return out.slice(0, 12);
  },

  async buscarCredores(q) {
    if (typeof window.siengeFetchWithRetry !== "function") return [];
    const dig = String(q || "").replace(/\D/g, "");
    const path = dig.length >= 11
      ? "/creditors?limit=10&cnpj=" + encodeURIComponent(dig)
      : "/creditors?limit=10&name=" + encodeURIComponent(q);
    const res = await window.siengeFetchWithRetry(path, 1);
    const lista = Array.isArray(res) ? res : ((res && (res.results || res.creditors)) || []);
    return lista.map((c) => {
      const nome = String(c.name || c.tradeName || c.corporateName || "").trim();
      return { tipo: "credor", id: String(c.id || ""), nome: nome, rotulo: "Credor " + (c.id || "") + (nome ? " · " + nome : "") };
    }).filter((c) => c.id);
  },

  pintarAchados() {
    const box = document.getElementById("pc-achados");
    if (!box) return;
    if (!this.achados.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = `<ul class="pc-lista-busca">${this.achados.map((a, i) => `<li><button type="button" data-pc-parte="${i}">${this.esc(a.rotulo)}</button></li>`).join("")}</ul>`;
    box.querySelectorAll("[data-pc-parte]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = this.achados[Number(btn.getAttribute("data-pc-parte"))];
        if (!item || !this.podeEditar()) return;
        this.parte = item;
        this.render();
      });
    });
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
    const linhas = this.itens.map((item) => {
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
    if (!this.parte) { alert("Busque e escolha o cliente, o credor ou o título."); return; }
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
