/* Libera custas judiciais pendentes e gera o título a pagar REEM no Sienge. */
const PagarReembolsoApp = {
  itens: [],
  documentosUsados: [],
  marcados: {},
  retornos: [],
  busca: "",
  ocultarLiberados: false,
  mlIni: "",
  mlFim: "",
  colIni: "",
  colFim: "",
  carregando: false,
  liberando: false,
  CREDOR: 2244,
  CONTA: "2030211",

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  dataBr(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "/" + m[2] + "/" + m[1]) : "";
  },

  hoje() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  },

  maisDias(iso, n) {
    const p = String(iso || "").split("-").map(Number);
    const dt = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  },

  pendente(item) {
    return item && !String(item.billId || "").trim();
  },

  fold(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  },

  noPeriodo(iso, ini, fim) {
    if (!ini && !fim) return true;
    const d = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    if (ini && d < ini) return false;
    if (fim && d > fim) return false;
    return true;
  },

  visiveis() {
    const q = this.fold(this.busca);
    return this.itens.filter((item) => {
      if (this.ocultarLiberados && !this.pendente(item)) return false;
      if (!this.noPeriodo(item.data, this.mlIni, this.mlFim)) return false;
      if (!this.noPeriodo(item.pagoEm, this.colIni, this.colFim)) return false;
      if (!q) return true;
      const blob = this.fold([item.saleId, item.billId, item.customerName].filter(Boolean).join(" "));
      return blob.indexOf(q) >= 0;
    });
  },

  situacao(item) {
    if (this.pendente(item)) return { rotulo: "—", classe: "" };
    if (item.reemPago) return { rotulo: "Pago", classe: "is-pago" };
    return { rotulo: "Programado", classe: "is-prog" };
  },

  pronto(item) {
    return this.pendente(item) && Number(item.valor) > 0 && String(item.companyId || "").replace(/\D/g, "")
      && String(item.costCenterId || "").replace(/\D/g, "");
  },

  fb() {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.collection || !fc.getDocs || !fc.doc || !fc.setDoc) return null;
    return fc;
  },

  init() {
    this.renderCasca();
    this.carregar();
  },

  renderCasca() {
    const root = document.getElementById("pagar-reembolso-root");
    if (!root) return;
    root.innerHTML = `<div class="pr-topo">
        <p class="cj-nota">Marque os reembolsos pendentes e libere. Cada título a receber gera um título a pagar no Sienge, com vencimento em 10 dias.</p>
        <div class="pr-toolbar">
          <div class="search-box-wrapper pr-busca-fila">
            <input type="text" id="pr-busca" class="search-input" placeholder="Pesquise pelo título ou nome do cliente..." style="font-style: italic;" autocomplete="off" value="${this.esc(this.busca)}">
            <i data-lucide="search" class="search-icon"></i>
          </div>
          <label class="moura-switch">
            <input type="checkbox" id="pr-ocultar" ${this.ocultarLiberados ? "checked" : ""}>
            <span class="moura-switch-track" aria-hidden="true"></span>
            <span class="moura-switch-text">Ocultar liberados</span>
          </label>
          <button type="button" class="btn btn-primary" id="pr-liberar">Liberar</button>
        </div>
        <div class="pr-periodos">
          <div class="pr-periodo">
            <span>Custas pagas pela Moura Leite</span>
            <label>De <input type="date" id="pr-ml-ini" value="${this.esc(this.mlIni)}"></label>
            <label>Até <input type="date" id="pr-ml-fim" value="${this.esc(this.mlFim)}"></label>
          </div>
          <div class="pr-periodo">
            <span>Custas pagas pela Colenci</span>
            <label>De <input type="date" id="pr-col-ini" value="${this.esc(this.colIni)}"></label>
            <label>Até <input type="date" id="pr-col-fim" value="${this.esc(this.colFim)}"></label>
          </div>
          <button type="button" class="btn btn-excel" id="pr-excel" title="Exportar tabela atual para Excel">
            <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel
          </button>
        </div>
      </div>
      <div id="pr-lista"></div>`;
    const busca = document.getElementById("pr-busca");
    const ocultar = document.getElementById("pr-ocultar");
    const liberar = document.getElementById("pr-liberar");
    if (busca) busca.addEventListener("input", () => {
      this.busca = busca.value || "";
      this.pintar();
    });
    if (ocultar) ocultar.addEventListener("change", () => {
      this.ocultarLiberados = ocultar.checked;
      this.pintar();
    });
    if (liberar) liberar.addEventListener("click", () => this.liberar());
    [["pr-ml-ini", "mlIni"], ["pr-ml-fim", "mlFim"], ["pr-col-ini", "colIni"], ["pr-col-fim", "colFim"]].forEach(([id, chave]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => {
        this[chave] = el.value || "";
        this.pintar();
      });
    });
    const excel = document.getElementById("pr-excel");
    if (excel) excel.addEventListener("click", () => this.exportExcel());
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  carga(texto, pct) {
    const lista = document.getElementById("pr-lista");
    if (!lista) return;
    lista.innerHTML = `<div class="ml-load"><div class="loading-spinner" aria-hidden="true"></div><div class="loading-status-text">${this.esc(texto)}</div><div class="ml-load-track"><div class="loading-progress-bar" style="width:${pct}%"></div></div></div>`;
  },

  async carregar() {
    if (this.carregando) return;
    this.carregando = true;
    this.carga("Carregando os reembolsos…", 35);
    const fc = this.fb();
    if (!fc) {
      this.itens = [];
      this.carregando = false;
      this.pintar();
      return;
    }
    try {
      const snap = await fc.getDocs(fc.collection(window.firebaseDb, "custas_judiciais"));
      const itens = [];
      const usados = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        data.id = d.id;
        if (data.documentNumber) usados.push(String(data.documentNumber));
        itens.push(data);
      });
      this.documentosUsados = usados;
      await this.completarProcessos(itens);
      await this.completarUnidades(itens);
      itens.sort((a, b) => {
        const pa = this.pendente(a) ? 0 : 1;
        const pb = this.pendente(b) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return String(a.saleId || "").localeCompare(String(b.saleId || ""), "pt-BR", { numeric: true })
          || String(b.liberatedAt || "").localeCompare(String(a.liberatedAt || ""));
      });
      this.itens = itens;
    } catch (e) {
      this.itens = [];
      const lista = document.getElementById("pr-lista");
      if (lista) lista.innerHTML = `<p class="cj-nota">Não consegui ler os reembolsos: ${this.esc((e && e.message) || e)}</p>`;
      this.carregando = false;
      return;
    }
    this.carregando = false;
    this.pintar();
    await this.completarSituacao(this.itens);
    this.pintar();
  },

  async completarProcessos(itens) {
    const ids = [];
    itens.forEach((item) => {
      const cid = String(item.customerId || "");
      if (cid && ids.indexOf(cid) < 0) ids.push(cid);
    });
    await Promise.all(ids.map(async (cid) => {
      let texto = "";
      if (typeof window.carregarProcessoJudicial === "function") {
        try { texto = await window.carregarProcessoJudicial(cid); } catch (e) { texto = ""; }
      }
      if (!texto && typeof window.processoJudicialDoCliente === "function") texto = window.processoJudicialDoCliente(cid);
      itens.forEach((item) => {
        if (String(item.customerId || "") !== cid) return;
        const gravado = typeof window.processoJudicialTexto === "function"
          ? window.processoJudicialTexto(item.processo)
          : String(item.processo || "").trim();
        item.processoConsulta = texto || gravado || "";
      });
    }));
  },

  textoUnidade(v) {
    if (Array.isArray(v)) {
      const u = v[0] || {};
      return u.name || u.unitName || u.description || "";
    }
    if (v && typeof v === "object") return v.name || v.unitName || "";
    return v;
  },

  extrairUnidade(sale, cc) {
    if (!sale) return null;
    const CJ = window.CustasJudiciaisApp;
    const limpar = (v) => CJ && typeof CJ.limparUnidade === "function" ? CJ.limparUnidade(v, cc) : String(v || "").trim();
    const lista = sale.salesContractUnits || (Array.isArray(sale.units) ? sale.units : []);
    const su = (lista || []).find((u) => u && (u.main === true || u.main === "S")) || (lista || [])[0] || {};
    let nome = limpar(su.name || su.unitName || sale.unitName || this.textoUnidade(sale.units));
    if (!nome && sale.unitId) {
      const partes = String(sale.unitId).split("-");
      if (partes.length >= 3) nome = limpar(partes.slice(2).join("-"));
    }
    if (!nome) return null;
    return { name: nome, id: "" };
  },

  async nomeCliente(item) {
    const atual = String(item.customerName || "").trim();
    if (atual && !/^carregando\b/i.test(atual)) return atual;
    let cid = String(item.customerId || "").replace(/\D/g, "");
    const sid = String(item.saleId || "").replace(/\D/g, "");
    if (sid) {
      try {
        const bill = await this.get("/accounts-receivable/receivable-bills/" + encodeURIComponent(sid));
        if (!cid && bill) cid = String(bill.customerId || bill.clientId || "").replace(/\D/g, "");
        const direto = bill && (bill.customerName || bill.clientName || (bill.customer && bill.customer.name));
        if (direto) return String(direto).trim();
      } catch (e) {}
    }
    if (!cid) return "";
    try {
      const cust = window.SiengeAPI && typeof SiengeAPI.getCustomer === "function"
        ? await SiengeAPI.getCustomer(cid)
        : await this.get("/customers/" + encodeURIComponent(cid));
      return String((cust && (cust.name || cust.clientName)) || "").trim();
    } catch (e) {
      return "";
    }
  },

  async unidadeRemota(item) {
    const sid = String(item.saleId || "").replace(/\D/g, "");
    const cc = String(item.costCenterId || "").replace(/\D/g, "");
    let cid = String(item.customerId || "").replace(/\D/g, "");
    let bill = null;
    if (sid) {
      try { bill = await this.get("/accounts-receivable/receivable-bills/" + encodeURIComponent(sid)); } catch (e) { bill = null; }
    }
    if (!cid && bill) cid = String(bill.customerId || bill.clientId || "").replace(/\D/g, "");
    if (bill) {
      if (!item.customerName) item.customerName = bill.customerName || bill.clientName || "";
      if (!item.companyName && bill.companyName) item.companyName = bill.companyName;
      if (!item.costCenterId) {
        const centro = bill.enterpriseId || (Array.isArray(bill.costCentersId) ? bill.costCentersId[0] : "");
        if (centro) item.costCenterId = String(centro).replace(/\D/g, "");
      }
    }
    const contratos = [];
    if (cid && window.SiengeAPI && typeof SiengeAPI.getSales === "function") {
      try {
        const sales = await SiengeAPI.getSales(cid);
        (sales || []).forEach((s) => contratos.push(s));
      } catch (e) {}
    }
    if (!contratos.length && cid) {
      try {
        const res = await this.get("/sales-contracts?customerId=" + encodeURIComponent(cid) + "&limit=200");
        ((res && res.results) || []).forEach((c) => contratos.push(c));
      } catch (e) {}
    }
    const tituloDe = (c) => String(c.receivableBillId || c.billReceivableId || "").replace(/\D/g, "");
    const centroDe = (c) => String(c.enterpriseId || c.costCenterId || "").replace(/\D/g, "");
    const centro = cc || String(item.costCenterId || "").replace(/\D/g, "");
    let sale = contratos.find((c) => sid && tituloDe(c) === sid) || null;
    if (!sale) {
      const doCentro = contratos.filter((c) => centro && centroDe(c) === centro);
      if (doCentro.length === 1) sale = doCentro[0];
    }
    if (!sale && contratos.length === 1) sale = contratos[0];
    if (sale && !item.customerName) item.customerName = sale.customerName || "";
    const achada = this.extrairUnidade(sale, centro);
    if (achada && (achada.name || achada.id)) return achada;
    const CJ = window.CustasJudiciaisApp;
    const limpar = (v) => CJ && typeof CJ.limparUnidade === "function" ? CJ.limparUnidade(v, centro) : String(v || "").trim();
    const daConta = limpar(this.textoUnidade(bill && (bill.units || bill.unityName || bill.unitName)));
    if (daConta) return { name: daConta, id: "" };
    return null;
  },

  async completarUnidades(itens) {
    const CJ = window.CustasJudiciaisApp;
    const fc = this.fb();
    await Promise.all(itens.map(async (item) => {
      const cc = item.costCenterId;
      const gravada = CJ && typeof CJ.limparUnidade === "function" ? CJ.limparUnidade(item.unitName, cc) : String(item.unitName || "").replace(/^carregando\b/i, "").trim();
      let nome = gravada;
      if (!nome && CJ && typeof CJ.unidadeConhecida === "function") nome = CJ.unidadeConhecida(item.customerId, item.saleId, cc);
      if (!nome) {
        const remota = await this.unidadeRemota(item);
        if (remota && remota.name) nome = remota.name;
      }
      const cliente = await this.nomeCliente(item);
      if (cliente) item.customerName = cliente;
      if (nome) {
        const catalogo = await this.unidade(String(cc || item.costCenterId || "").replace(/\D/g, ""), nome);
        if (catalogo && catalogo.name) nome = catalogo.name;
        item.unitName = nome;
      }
      if (!fc || !item.id) return;
      const patch = {};
      if (nome && nome !== String(item.unitName || "")) patch.unitName = nome;
      if (nome) patch.unitName = nome;
      if (cliente) patch.customerName = cliente;
      if (!Object.keys(patch).length) return;
      try {
        await fc.setDoc(fc.doc(window.firebaseDb, "custas_judiciais", item.id), patch, { merge: true });
      } catch (e) {}
    }));
  },

  pintar() {
    const lista = document.getElementById("pr-lista");
    if (!lista) return;
    const avisos = (this.retornos || []).map((r) => `<p class="pr-retorno${r.ok ? "" : " is-erro"}">${this.esc(r.texto)}</p>`).join("");
    const visiveis = this.visiveis();
    const prontos = visiveis.filter((item) => this.pronto(item));
    const todosOn = prontos.length > 0 && prontos.every((item) => this.marcados[item.id]);
    if (!visiveis.length) {
      const vazio = this.itens.length ? "Nenhum reembolso encontrado." : "Não há reembolso.";
      lista.innerHTML = avisos + `<div class="cc-scroll cj-scroll"><table class="cc-table cj-cc"><tbody><tr><td class="cj-vazio">${vazio}</td></tr></tbody></table></div>`;
      return;
    }
    const linhas = visiveis.map((item) => {
      const liberado = !this.pendente(item);
      const ok = this.pronto(item);
      const falta = [];
      if (!(Number(item.valor) > 0)) falta.push("valor");
      if (!String(item.companyId || "").replace(/\D/g, "")) falta.push("empresa do título");
      if (!String(item.costCenterId || "").replace(/\D/g, "")) falta.push("centro de custo");
      const aviso = !liberado && !ok ? `<div class="cj-nota">Falta ${this.esc(falta.join(", "))}. Edite a custa na ficha do título.</div>` : "";
      const CJ = window.CustasJudiciaisApp;
      const nomeUnidade = CJ && typeof CJ.limparUnidade === "function" ? CJ.limparUnidade(item.unitName, item.costCenterId) : String(item.unitName || "").trim();
      const proc = item.processoConsulta ? this.esc(item.processoConsulta) : "Sem número no cadastro";
      const emp = [item.companyId, item.companyName].filter(Boolean).join(" · ");
      const nAnexos = ((item.guias || []).length + (item.comprovantes || []).length + (item.anexos || []).length);
      const pagar = item.billId ? this.esc(item.billId) : "—";
      const sit = this.situacao(item);
      const programada = liberado ? (this.dataBr(item.dueDate) || "—") : "—";
      const colenci = item.reemPago ? (this.dataBr(item.pagoEm) || "—") : "—";
      return `<tr class="${liberado ? "pr-liberado" : ""}">
        <td class="pr-pagar">
          <label class="pr-th-flag">
            <input type="checkbox" data-pr="${this.esc(item.id)}" ${this.marcados[item.id] ? "checked" : ""} ${ok ? "" : "disabled"}>
            <span class="pr-bill">${pagar}</span>
          </label>
          <div class="cj-nota">Título ${this.esc(item.saleId || "—")}</div>
        </td>
        <td class="cc-nome" title="${this.esc(item.customerName || "")}">${this.esc(item.customerName || "—")}</td>
        <td class="cc-nome" title="${this.esc(emp)}">${this.esc(emp || "—")}</td>
        <td title="${this.esc(nomeUnidade || "")}">${this.esc(nomeUnidade || "—")}</td>
        <td>${this.esc(item.costCenterId || "—")}</td>
        <td>${this.esc(this.dataBr(item.data)) || "—"}</td>
        <td>${this.esc(programada)}</td>
        <td>${this.esc(colenci)}</td>
        <td><span class="pr-status ${sit.classe}">${this.esc(sit.rotulo)}</span></td>
        <td class="cc-nome">${this.esc(item.descricao || "")}${aviso}</td>
        <td class="is-right">${item.valor != null && item.valor !== "" ? this.money(item.valor) : "—"}</td>
        <td class="cc-nome" title="${proc}">${proc}</td>
        <td class="is-center">
          <button type="button" class="tvig-ico" title="Anexos" data-pr-anexos="${this.esc(item.id)}">
            <i data-lucide="paperclip" style="width:15px;height:15px;"></i>${nAnexos ? `<span class="cj-anexo-n">${nAnexos}</span>` : ""}
          </button>
        </td>
      </tr>`;
    }).join("");
    lista.innerHTML = avisos + `<div class="cc-scroll cj-scroll"><table class="cc-table cj-cc pr-cc">
      <colgroup>
        <col class="pr-c-pagar"><col><col><col><col class="pr-c-cc"><col class="cj-c-data"><col class="cj-c-data"><col class="cj-c-data"><col class="pr-c-status"><col><col class="cj-c-valor"><col><col class="cj-c-ico">
      </colgroup>
      <thead><tr>
        <th><label class="pr-th-flag"><input type="checkbox" id="pr-flag-todos" ${todosOn ? "checked" : ""}> Título a pagar</label></th><th>Cliente</th><th>Empresa</th><th>Unidade</th><th>Centro de custo</th><th>Pago pela Moura Leite</th><th>Data programada</th><th>Pago pela Colenci</th><th>Status</th><th>Do que se trata</th><th class="is-right">Valor</th><th>Processo</th><th class="is-center">Anexos</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
    lista.querySelectorAll("[data-pr]").forEach((el) => {
      el.addEventListener("change", () => {
        this.marcados[el.getAttribute("data-pr")] = el.checked;
        this.pintar();
      });
    });
    const flag = document.getElementById("pr-flag-todos");
    if (flag) flag.addEventListener("change", () => {
      prontos.forEach((item) => { this.marcados[item.id] = flag.checked; });
      this.pintar();
    });
    lista.querySelectorAll("[data-pr-anexos]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const item = this.itens.find((x) => x.id === btn.getAttribute("data-pr-anexos"));
        if (!item || !window.CustasJudiciaisApp) return;
        CustasJudiciaisApp.abrirPainelAnexos(item.guias, item.comprovantes, item.anexos);
      });
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  marcarTodos() {
    const lista = this.visiveis();
    const algum = lista.some((item) => this.pronto(item) && !this.marcados[item.id]);
    lista.forEach((item) => {
      if (this.pronto(item)) this.marcados[item.id] = algum;
    });
    this.pintar();
  },

  selecionados() {
    return this.itens.filter((item) => this.marcados[item.id] && this.pronto(item));
  },

  grupos(lista) {
    const map = new Map();
    lista.forEach((item) => {
      const k = String(item.customerId || "") + "|" + String(item.saleId || "");
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    });
    return Array.from(map.values());
  },

  async liberar() {
    if (this.liberando) return;
    const lista = this.selecionados();
    if (!lista.length) {
      alert("Marque ao menos um reembolso com valor, empresa e centro de custo.");
      return;
    }
    const grupos = this.grupos(lista);
    const linhas = grupos.map((g) => {
      const total = g.reduce((s, item) => s + (Number(item.valor) || 0), 0);
      const proc = g[0].processoConsulta || "sem número no cadastro";
      return "Título " + g[0].saleId + " · " + this.money(total) + " · processo " + proc;
    });
    const texto = "Liberar " + grupos.length + " título(s) a pagar no Sienge?\n\n" + linhas.join("\n") + "\n\nCredor 2244 · documento REEM · vencimento em 10 dias · PIX.";
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(texto) : confirm(texto);
    if (!ok) return;
    this.liberando = true;
    const feitos = [];
    const falhas = [];
    for (let i = 0; i < grupos.length; i++) {
      this.carga("Gerando o título a pagar no Sienge…", Math.round(((i + 0.2) / grupos.length) * 100));
      try {
        const gerado = await this.gerarGrupo(grupos[i]);
        const extra = gerado.avisos && gerado.avisos.length ? " " + gerado.avisos.join(" ") : "";
        feitos.push("Título a pagar " + gerado.billId + " gerado para o título " + grupos[i][0].saleId + "." + extra);
        grupos[i].forEach((item) => { delete this.marcados[item.id]; });
      } catch (e) {
        falhas.push("Não gerei o título a pagar do título " + grupos[i][0].saleId + ": " + ((e && e.message) || e));
      }
    }
    this.liberando = false;
    this.retornos = feitos.map((texto) => ({ ok: true, texto: texto })).concat(falhas.map((texto) => ({ ok: false, texto: texto })));
    await this.carregar();
    alert(this.retornos.map((r) => r.texto).join("\n") || "Nenhum título foi gerado.");
  },

  siengeAuth() {
    const c = window.SIENGE_CONFIG;
    if (!c || !c.user) return "";
    return "Basic " + btoa(c.user + ":" + c.pass);
  },

  siengeUrl(path) {
    const base = (window.SIENGE_CONFIG && window.SIENGE_CONFIG.baseUrl) || "/api/sienge-proxy";
    return String(base).replace(/\/$/, "") + path;
  },

  async siengeJson(path, options) {
    const res = await fetch(this.siengeUrl(path), Object.assign({
      headers: { Authorization: this.siengeAuth(), Accept: "application/json" }
    }, options || {}));
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    if (!res.ok) {
      const msg = body && (body.clientMessage || body.developerMessage || body.message);
      throw new Error(msg || (typeof body === "string" && body.slice(0, 400)) || ("Sienge " + res.status));
    }
    return { res: res, body: body };
  },

  async get(path) {
    if (typeof window.siengeFetchWithRetry === "function") return window.siengeFetchWithRetry(path, 2);
    const r = await this.siengeJson(path);
    return r.body;
  },

  auditar(status, summary, details) {
    if (!window.AuditService || typeof AuditService.logEvent !== "function") return;
    const u = (window.AppState && AppState.currentUser) || {};
    try {
      AuditService.logEvent({
        module: "Custas judiciais",
        action: details && details.action ? details.action : "Gerar título",
        status: status,
        summary: summary,
        user: u.name || u.nome || "",
        userEmail: u.email || "",
        customerLabel: details && details.cliente || "",
        titleId: details && details.billId ? String(details.billId) : "",
        enterpriseId: details && details.companyId ? String(details.companyId) : "",
        endpoint: details && details.endpoint || "/bills",
        method: details && details.method || "POST",
        details: details || {}
      });
    } catch (e) {}
  },

  async departamentoTesouraria() {
    if (this._dep) return this._dep;
    let list = [];
    if (window.SiengeAPI && typeof SiengeAPI.getDepartments === "function") list = await SiengeAPI.getDepartments();
    else {
      const res = await this.get("/departments?limit=200&offset=0");
      list = (res && res.results) || [];
    }
    const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const found = (list || []).find((d) => fold(d.name || d.departmentName) === "tesouraria")
      || (list || []).find((d) => fold(d.name || d.departmentName).indexOf("tesouraria") >= 0);
    const n = parseInt(found && (found.id != null ? found.id : found.departmentId), 10);
    if (!n) throw new Error("Não encontrei o departamento Tesouraria no Sienge.");
    this._dep = n;
    return n;
  },

  async garantirCentros() {
    const st = window.AppState;
    if (st && ((st.cachedCostCenters && st.cachedCostCenters.length) || (st.costCenters && st.costCenters.length))) return;
    if (!window.SiengeAPI || typeof SiengeAPI.getCostCenters !== "function") return;
    const list = await SiengeAPI.getCostCenters();
    if (st) st.cachedCostCenters = list || [];
  },

  rateio(ccId) {
    const digits = String(ccId || "").replace(/\D/g, "");
    const base = parseInt(digits, 10);
    const PP = window.ParametrizacaoParceiroApp;
    const PC = window.PrestacaoContasApp;
    const obra = PP && typeof PP.obraFromCc === "function" ? PP.obraFromCc(digits) : digits.slice(0, -2);
    let map = null;
    if (PC && typeof PC.padraoObra === "function") map = PC.padraoObra(obra);
    const ids = map ? Object.keys(map) : [];
    if (!ids.length) return [{ costCenterId: base, percentage: 100 }];
    let acc = 0;
    return ids.map((id, i) => {
      const pct = i === ids.length - 1
        ? Math.round((100 - acc) * 10000) / 10000
        : Math.round((Number(map[id]) || 0) * 10000) / 10000;
      acc += pct;
      return { costCenterId: parseInt(id, 10), percentage: pct };
    }).filter((x) => x.costCenterId && x.percentage > 0);
  },

  foldUnit(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  async unidade(ccId, nome) {
    const alvo = this.foldUnit(String(nome || "").replace(new RegExp("^" + ccId + "[\\s\\-–]*"), ""));
    if (!ccId || !alvo) return null;
    try {
      const direto = await this.get("/units?limit=20&offset=0&enterpriseId=" + encodeURIComponent(ccId) + "&name=" + encodeURIComponent(String(nome || "").trim()) + "&additionalData=NONE");
      const achou = ((direto && direto.results) || []).find((u) => this.foldUnit(u.name) === alvo || this.foldUnit(u.commercialName) === alvo);
      if (achou) return achou;
    } catch (e) {}
    let offset = 0;
    for (let g = 0; g < 15; g++) {
      const data = await this.get("/units?limit=200&offset=" + offset + "&enterpriseId=" + encodeURIComponent(ccId) + "&additionalData=NONE");
      const list = (data && data.results) || [];
      const hit = list.find((u) => this.foldUnit(u.name) === alvo || this.foldUnit(u.commercialName) === alvo);
      if (hit) return hit;
      if (list.length < 200) break;
      offset += list.length;
    }
    return null;
  },

  numeroDocumento(grupo) {
    const sid = String(grupo[0].saleId || "");
    const usados = new Set(this.documentosUsados || []);
    let doc = "custas titulo " + sid;
    let n = 2;
    while (usados.has(doc)) {
      doc = "custas titulo " + sid + " " + n;
      n += 1;
    }
    return doc;
  },

  observacao(grupo) {
    const sid = String(grupo[0].saleId || "");
    const proc = grupo[0].processoConsulta || "";
    if (proc) return "Reembolsos de custas judiciais do título " + sid + ", referentes ao processo " + proc + ".";
    return "Reembolsos de custas judiciais do título " + sid + ". O cadastro judicial não tem número de processo.";
  },

  async gerarGrupo(grupo) {
    const primeiro = grupo[0];
    const companyId = parseInt(String(primeiro.companyId).replace(/\D/g, ""), 10);
    const ccId = String(primeiro.costCenterId).replace(/\D/g, "");
    const total = Math.round(grupo.reduce((s, item) => s + (Number(item.valor) || 0), 0) * 100) / 100;
    const hoje = this.hoje();
    const due = this.maisDias(hoje, 10);
    const doc = this.numeroDocumento(grupo);
    const notes = this.observacao(grupo);
    const dep = await this.departamentoTesouraria();
    await this.garantirCentros();
    const rateio = this.rateio(ccId);
    await this.completarUnidades([primeiro]);
    const CJ = window.CustasJudiciaisApp;
    const nomeUnidade = (CJ && typeof CJ.limparUnidade === "function" ? CJ.limparUnidade(primeiro.unitName, ccId) : String(primeiro.unitName || "").trim());
    if (!nomeUnidade) throw new Error("Não encontrei a unidade do título " + primeiro.saleId + " no centro de custo " + ccId + ".");
    const catalogo = await this.unidade(ccId, nomeUnidade);
    const idCatalogo = catalogo && catalogo.id != null ? String(catalogo.id) : "";
    const candidatos = [nomeUnidade];
    if (idCatalogo && idCatalogo !== nomeUnidade) candidatos.push(idCatalogo);
    const payload = {
      debtorId: companyId,
      creditorId: this.CREDOR,
      documentIdentificationId: "REEM",
      documentNumber: doc,
      issueDate: hoje,
      installmentsNumber: 1,
      indexId: 0,
      baseDate: hoje,
      dueDate: due,
      billDate: hoje,
      totalInvoiceAmount: total,
      notes: notes,
      discount: 0,
      budgetCategories: rateio.map((r) => ({
        costCenterId: r.costCenterId,
        paymentCategoriesId: this.CONTA,
        percentage: r.percentage
      })),
      departmentsCost: [{ departmentId: dep, percentage: 100 }],
      buildingsCost: [],
      taxes: [],
      units: [{ unitId: nomeUnidade, costCenterId: parseInt(ccId, 10), percentage: 100, principal: "S" }]
    };
    let billId = "";
    let created = null;
    try {
      let ultimoErro = null;
      for (let c = 0; c < candidatos.length; c++) {
        payload.units = [{ unitId: String(candidatos[c]), costCenterId: parseInt(ccId, 10), percentage: 100, principal: "S" }];
        try {
          created = await this.siengeJson("/bills", {
            method: "POST",
            headers: {
              Authorization: this.siengeAuth(),
              Accept: "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });
          ultimoErro = null;
          break;
        } catch (erroUnidade) {
          ultimoErro = erroUnidade;
          const msg = (erroUnidade && erroUnidade.message) || "";
          if (!/n[aã]o est[aá] cadastrad/i.test(msg) || c === candidatos.length - 1) throw erroUnidade;
        }
      }
      if (ultimoErro) throw ultimoErro;
      billId = created.body && (created.body.id || created.body.billId);
      if (!billId) {
        const loc = created.res.headers.get("Location") || created.res.headers.get("location") || "";
        const last = loc.split("/").filter(Boolean).pop();
        if (last && !isNaN(parseInt(last, 10))) billId = last;
      }
      if (!billId) billId = await this.acharTitulo(companyId, doc, hoje);
      if (!billId) throw new Error("O Sienge criou o título, mas não devolveu o número.");
      billId = String(billId);
    } catch (e) {
      this.auditar("erro", "Falha ao gerar reembolso de custas do título " + primeiro.saleId + ": " + ((e && e.message) || e), {
        companyId: companyId, cliente: primeiro.customerName || "", saleId: primeiro.saleId, erro: (e && e.message) || String(e)
      });
      throw e;
    }
    const avisos = [];
    try {
      await this.enviarPix(billId);
    } catch (e) {
      avisos.push("PIX não gravado: " + ((e && e.message) || e));
      this.auditar("erro", "Título " + billId + " gerado, mas o PIX não foi gravado. Título a receber " + primeiro.saleId + ".", {
        action: "Atualizar título", method: "PATCH",
        endpoint: "/bills/" + billId + "/installments/payment-information/pix",
        billId: billId, companyId: companyId, cliente: primeiro.customerName || "", erro: (e && e.message) || String(e)
      });
    }
    const arquivos = [];
    grupo.forEach((item) => {
      (item.guias || []).forEach((a) => arquivos.push(a));
      (item.comprovantes || []).forEach((a) => arquivos.push(a));
      (item.anexos || []).forEach((a) => arquivos.push(a));
    });
    for (let i = 0; i < arquivos.length; i++) {
      try {
        await this.anexar(billId, arquivos[i]);
      } catch (e) {
        avisos.push("Anexo " + (arquivos[i].name || "") + " não subiu: " + ((e && e.message) || e));
      }
    }
    await this.marcarLiberadas(grupo, billId, doc, notes, due);
    this.auditar(avisos.length ? "erro" : "ok",
      "Título " + billId + " gerado para reembolso de custas do título " + primeiro.saleId + " · credor 2244 · empresa " + companyId + (avisos.length ? " · " + avisos[0] : ""),
      { billId: billId, companyId: companyId, cliente: primeiro.customerName || "", saleId: primeiro.saleId, documentNumber: doc, total: total, avisos: avisos });
    return { billId: billId, avisos: avisos };
  },

  async acharTitulo(companyId, doc, hoje) {
    try {
      const busca = await this.get("/bills?startDate=" + encodeURIComponent(hoje) + "&endDate=" + encodeURIComponent(hoje) + "&debtorId=" + encodeURIComponent(companyId) + "&creditorId=" + this.CREDOR);
      const found = ((busca && busca.results) || []).find((b) => String(b.documentNumber || "") === String(doc || ""));
      return found && (found.id || found.billId) || "";
    } catch (e) {
      return "";
    }
  },

  async enviarPix(billId) {
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    let list = [];
    for (let t = 1; t <= 6 && !list.length; t++) {
      try {
        const inst = await this.siengeJson("/bills/" + encodeURIComponent(billId) + "/installments");
        const body = inst.body || {};
        list = body.results || body.data || (Array.isArray(body) ? body : []);
      } catch (e) {}
      if (!list.length && t < 6) await espera(1200 * t);
    }
    if (!list.length) throw new Error("A parcela do título " + billId + " ainda não apareceu.");
    const installmentId = list[0].installmentNumber || list[0].id || 1;
    await this.siengeJson("/bills/" + encodeURIComponent(billId) + "/installments/" + encodeURIComponent(installmentId) + "/payment-information/pix", {
      method: "PATCH",
      headers: {
        Authorization: this.siengeAuth(),
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        paymentTypeId: 17,
        isUsingCreditorData: "S",
        notes: "Pagamento via PIX do credor 2244"
      })
    });
  },

  async anexar(billId, arquivo) {
    if (!arquivo || !arquivo.url) return;
    const res = await fetch(arquivo.url);
    if (!res.ok) throw new Error("não baixei o arquivo");
    const blob = await res.blob();
    const nome = String(arquivo.name || "anexo").slice(0, 80);
    const form = new FormData();
    form.append("file", blob, nome);
    const up = await fetch(this.siengeUrl("/bills/" + encodeURIComponent(billId) + "/attachments?description=" + encodeURIComponent(nome)), {
      method: "POST",
      headers: { Authorization: this.siengeAuth() },
      body: form
    });
    if (!up.ok) {
      let msg = "";
      try { msg = await up.text(); } catch (e) {}
      throw new Error(msg.slice(0, 180) || ("Sienge " + up.status));
    }
    this.auditar("ok", "Anexo " + nome + " enviado no título " + billId + ".", {
      action: "ANEXO_ENVIADO", method: "POST",
      endpoint: "/bills/" + billId + "/attachments",
      billId: billId
    });
  },

  async marcarLiberadas(grupo, billId, doc, notes, due) {
    const fc = this.fb();
    if (!fc) return;
    const quando = new Date().toISOString();
    const u = (window.AppState && AppState.currentUser) || {};
    await Promise.all(grupo.map((item) => fc.setDoc(fc.doc(window.firebaseDb, "custas_judiciais", item.id), {
      billId: String(billId),
      documentNumber: doc,
      notes: notes,
      dueDate: due,
      liberatedAt: quando,
      liberatedBy: u.name || u.nome || u.email || ""
    }, { merge: true })));
  },

  tituloPago(bill) {
    if (!bill || typeof bill !== "object") return false;
    const blob = this.fold([bill.status, bill.situation, bill.consistencyStatus, bill.installmentStatus, bill.paid].filter((v) => v != null && v !== "").join(" "));
    if (/pago|paid|quit|liquid|settl|baixad/.test(blob)) return true;
    const saldo = bill.balanceAmount != null ? Number(bill.balanceAmount) : (bill.openBalance != null ? Number(bill.openBalance) : null);
    return saldo != null && Number.isFinite(saldo) && saldo <= 0.004;
  },

  async lerTitulo(billId) {
    const bill = await this.get("/bills/" + encodeURIComponent(billId));
    let pago = this.tituloPago(bill);
    let pagoEm = pago && bill ? String(bill.payOffDate || bill.paymentDate || bill.dischargeDate || "").slice(0, 10) : "";
    if (!pago || !pagoEm) {
      try {
        const inst = await this.get("/bills/" + encodeURIComponent(billId) + "/installments");
        const list = Array.isArray(inst) ? inst : ((inst && (inst.results || inst.installments)) || []);
        if (list.length && list.every((row) => this.tituloPago(row))) pago = true;
        if (pago) {
          list.forEach((row) => {
            const d = String(row.paymentDate || row.payOffDate || row.dischargeDate || row.receiptDate || "").slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!pagoEm || d > pagoEm)) pagoEm = d;
          });
        }
      } catch (e) {}
    }
    if (!pago) pagoEm = "";
    return { pago: pago, pagoEm: pagoEm, dueDate: bill && String(bill.dueDate || "").slice(0, 10) };
  },

  async completarSituacao(itens) {
    const alvos = (itens || []).filter((item) => item && item.billId && item.reemPago == null);
    await Promise.all(alvos.map(async (item) => {
      try {
        const info = await this.lerTitulo(item.billId);
        item.reemPago = !!info.pago;
        item.pagoEm = info.pagoEm || "";
        if (!item.dueDate && info.dueDate) item.dueDate = info.dueDate;
      } catch (e) {
        item.reemPago = false;
        item.pagoEm = "";
      }
    }));
  },

  async exportExcel() {
    const XL = window.InvestimentoApp;
    if (!XL || typeof XL.ensureExcelJS !== "function") {
      alert("Não foi possível carregar o formato de Aplicações e Investimentos. Atualize a página.");
      return;
    }
    const linhas = this.visiveis();
    if (!linhas.length) {
      alert("Nenhum reembolso no período.");
      return;
    }
    let ExcelJS;
    try { ExcelJS = await XL.ensureExcelJS(); }
    catch (e) {
      alert("Não foi possível carregar a biblioteca de Excel. Recarregue a página.");
      return;
    }
    const grupos = new Map();
    linhas.forEach((item) => {
      const id = String(item.companyId || "").replace(/\D/g, "") || "0";
      if (!grupos.has(id)) grupos.set(id, []);
      grupos.get(id).push(item);
    });
    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    wb.created = new Date();
    let imgId = null;
    try {
      const logo = await XL.logoDataUrl();
      imgId = wb.addImage({ base64: logo.dataUrl, extension: logo.extension || "png" });
    } catch (e) {}
    const used = new Set();
    const gerado = XL.generatedAtLabel(new Date());
    grupos.forEach((itens, id) => {
      let nome = "";
      if (id !== "0" && typeof XL.excelSheetName === "function") {
        try { nome = XL.excelSheetName(id, used); } catch (e) { nome = ""; }
      }
      if (!nome) nome = this.nomeAba((itens[0] && itens[0].companyName) || ("Empresa " + id), used);
      const ws = wb.addWorksheet(nome, { properties: { showGridLines: false } });
      this.pintarPlanilha(ws, XL, { itens: itens, imgId: imgId, gerado: gerado, empresa: (itens[0] && itens[0].companyName) || "" });
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reembolsos_custas_" + this.hoje() + ".xlsx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },

  nomeAba(base, used) {
    let nome = String(base || "Sem empresa").replace(/[:\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sem empresa";
    let n = 2;
    while (used.has(nome.toLowerCase())) {
      const suf = "-" + (n++);
      nome = (String(base).slice(0, Math.max(1, 31 - suf.length)) + suf).slice(0, 31);
    }
    used.add(nome.toLowerCase());
    return nome;
  },

  pintarPlanilha(ws, XL, opts) {
    const itens = opts.itens || [];
    const heads = ["Título a receber", "Título a pagar", "Cliente", "Unidade", "Centro de custo", "Pago pela Moura Leite", "Data programada", "Pago pela Colenci", "Status", "Do que se trata", "Valor", "Processo"];
    const moneyFmt = "#,##0.00";
    const logoPx = Math.round(1.54 * 96 / 2.54);
    ws.properties.showGridLines = false;
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", activeCell: "B5", showGridLines: false }];
    ws.columns = heads.map((h, i) => ({ width: i === 2 || i === 9 || i === 11 ? 32 : (i === 10 ? 16 : 22) }));
    ws.mergeCells("A1:A2");
    ws.getRow(1).height = 28;
    ws.getRow(2).height = 22;
    let sub = opts.empresa || "Reembolsos de custas";
    if (this.mlIni || this.mlFim) sub += " · Moura Leite " + (this.dataBr(this.mlIni) || "…") + " a " + (this.dataBr(this.mlFim) || "…");
    if (this.colIni || this.colFim) sub += " · Colenci " + (this.dataBr(this.colIni) || "…") + " a " + (this.dataBr(this.colFim) || "…");
    const titulo = ws.getCell("A1");
    titulo.value = {
      richText: [
        { font: { name: "Calibri", size: 14, bold: true, color: { argb: "FF475569" } }, text: "Reembolsos de custas\n" },
        { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: sub }
      ]
    };
    XL.excelPaint(titulo, { fill: "FFFFFFFF", align: { vertical: "middle", horizontal: "left", wrapText: true, indent: 8 } });
    if (opts.imgId != null) {
      try { ws.addImage(opts.imgId, { tl: { col: 0.04, row: 0.08 }, ext: { width: logoPx, height: logoPx } }); } catch (e) {}
    }
    const total = itens.reduce((s, item) => s + (Number(item.valor) || 0), 0);
    const pagos = itens.filter((item) => item.reemPago).length;
    const programados = itens.filter((item) => !this.pendente(item) && !item.reemPago).length;
    [
      { label: "Quantidade", value: itens.length, fmt: "0" },
      { label: "Valor", value: total, fmt: moneyFmt },
      { label: "Pagos", value: pagos, fmt: "0" },
      { label: "Programados", value: programados, fmt: "0" }
    ].forEach((k, i) => {
      const col = 4 + i;
      const rotulo = ws.getRow(1).getCell(col);
      const valor = ws.getRow(2).getCell(col);
      rotulo.value = k.label;
      valor.value = k.value;
      XL.excelPaint(rotulo, { fill: "FFFFFFFF", font: { bold: true, size: 8, color: { argb: "FF94A3B8" } }, align: { horizontal: "right", vertical: "bottom" } });
      XL.excelPaint(valor, { fill: "FFFFFFFF", font: { bold: true, size: 12, color: { argb: "FF0F172A" } }, align: { horizontal: "right", vertical: "middle" }, numFmt: k.fmt });
    });
    ws.getRow(3).height = 8;
    const head = ws.getRow(4);
    head.height = 20;
    heads.forEach((h, i) => {
      const cell = head.getCell(i + 1);
      cell.value = h;
      XL.excelPaint(cell, {
        fill: "FF334155",
        font: { bold: true, size: 9, color: { argb: "FFFFFFFF" } },
        align: { horizontal: i === 10 ? "right" : "left", vertical: "middle" },
        border: true
      });
    });
    const CJ = window.CustasJudiciaisApp;
    itens.forEach((item, idx) => {
      const row = ws.getRow(5 + idx);
      const unidade = CJ && typeof CJ.limparUnidade === "function" ? CJ.limparUnidade(item.unitName, item.costCenterId) : String(item.unitName || "");
      const sit = this.situacao(item);
      const vals = [
        item.saleId || "",
        item.billId || "",
        item.customerName || "",
        unidade || "",
        item.costCenterId || "",
        this.dataBr(item.data),
        this.pendente(item) ? "" : this.dataBr(item.dueDate),
        item.reemPago ? this.dataBr(item.pagoEm) : "",
        sit.rotulo === "—" ? "" : sit.rotulo,
        item.descricao || "",
        Number(item.valor) || 0,
        item.processoConsulta || item.processo || ""
      ];
      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        const zero = i === 10 && !v;
        XL.excelPaint(cell, {
          fill: "FFFFFFFF",
          font: { size: 9, color: { argb: zero ? "FF94A3B8" : "FF0F172A" } },
          align: { horizontal: i === 10 ? "right" : "left", vertical: "middle" },
          border: true,
          numFmt: i === 10 ? moneyFmt : undefined
        });
      });
    });
    const tot = ws.getRow(5 + itens.length);
    heads.forEach((_, i) => {
      const cell = tot.getCell(i + 1);
      if (i === 0) cell.value = "Total";
      if (i === 10) cell.value = total;
      XL.excelPaint(cell, {
        fill: "FF475569",
        font: { bold: true, size: 9, color: { argb: "FFFFFFFF" } },
        align: { horizontal: i === 10 ? "right" : "left", vertical: "middle" },
        border: true,
        numFmt: i === 10 ? moneyFmt : undefined
      });
    });
    const foot = ws.getRow(7 + itens.length);
    foot.getCell(1).value = opts.gerado;
    XL.excelPaint(foot.getCell(1), { font: { italic: true, size: 8, color: { argb: "FF64748B" } }, align: { horizontal: "left" } });
  }
};

window.PagarReembolsoApp = PagarReembolsoApp;
document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "pagar-reembolso" && window.PagarReembolsoApp) PagarReembolsoApp.init();
});
