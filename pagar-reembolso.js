/* Libera custas judiciais pendentes e gera o título a pagar REEM no Sienge. */
const PagarReembolsoApp = {
  itens: [],
  documentosUsados: [],
  marcados: {},
  retornos: [],
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
    root.innerHTML = `<div class="cc-toolbar pr-toolbar">
        <p class="cj-nota">Marque os reembolsos pendentes e libere. Cada título a receber gera um título a pagar no Sienge, com vencimento em 10 dias.</p>
        <div class="cc-toolbar-actions">
          <button type="button" class="btn btn-outline" id="pr-todos">Marcar todos</button>
          <button type="button" class="btn btn-primary" id="pr-liberar">Liberar</button>
        </div>
      </div>
      <div id="pr-lista"></div>`;
    const todos = document.getElementById("pr-todos");
    const liberar = document.getElementById("pr-liberar");
    if (todos) todos.addEventListener("click", () => this.marcarTodos());
    if (liberar) liberar.addEventListener("click", () => this.liberar());
  },

  carga(texto, pct) {
    const lista = document.getElementById("pr-lista");
    if (!lista) return;
    lista.innerHTML = `<div class="ml-load"><div class="loading-spinner" aria-hidden="true"></div><div class="loading-status-text">${this.esc(texto)}</div><div class="ml-load-track"><div class="loading-progress-bar" style="width:${pct}%"></div></div></div>`;
  },

  async carregar() {
    if (this.carregando) return;
    this.carregando = true;
    this.carga("Carregando os reembolsos pendentes…", 35);
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
        if (this.pendente(data)) itens.push(data);
      });
      this.documentosUsados = usados;
      await this.completarProcessos(itens);
      await this.completarUnidades(itens);
      itens.sort((a, b) => String(a.saleId || "").localeCompare(String(b.saleId || "")) || String(a.data || "").localeCompare(String(b.data || "")));
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
    if (!this.itens.length) {
      lista.innerHTML = avisos + `<div class="cc-scroll cj-scroll"><table class="cc-table cj-cc"><tbody><tr><td class="cj-vazio">Não há reembolso pendente.</td></tr></tbody></table></div>`;
      return;
    }
    const linhas = this.itens.map((item) => {
      const ok = this.pronto(item);
      const falta = [];
      if (!(Number(item.valor) > 0)) falta.push("valor");
      if (!String(item.companyId || "").replace(/\D/g, "")) falta.push("empresa do título");
      if (!String(item.costCenterId || "").replace(/\D/g, "")) falta.push("centro de custo");
      const aviso = ok ? "" : `<div class="cj-nota">Falta ${this.esc(falta.join(", "))}. Edite a custa na ficha do título.</div>`;
      const CJ = window.CustasJudiciaisApp;
      const nomeUnidade = CJ && typeof CJ.limparUnidade === "function" ? CJ.limparUnidade(item.unitName, item.costCenterId) : String(item.unitName || "").trim();
      const proc = item.processoConsulta ? this.esc(item.processoConsulta) : "Sem número no cadastro";
      const emp = [item.companyId, item.companyName].filter(Boolean).join(" · ");
      const nAnexos = ((item.guias || []).length + (item.comprovantes || []).length);
      return `<tr>
        <td class="is-center"><input type="checkbox" data-pr="${this.esc(item.id)}" ${this.marcados[item.id] ? "checked" : ""} ${ok ? "" : "disabled"}></td>
        <td><strong>${this.esc(item.saleId || "—")}</strong></td>
        <td class="cc-nome" title="${this.esc(item.customerName || "")}">${this.esc(item.customerName || "—")}</td>
        <td class="cc-nome" title="${this.esc(emp)}">${this.esc(emp || "—")}</td>
        <td title="${this.esc(nomeUnidade || "")}">${this.esc(nomeUnidade || "—")}</td>
        <td>${this.esc(item.costCenterId || "—")}</td>
        <td>${this.esc(this.dataBr(item.data))}</td>
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
        <col class="pr-c-check"><col class="pr-c-tit"><col><col><col><col class="pr-c-cc"><col class="cj-c-data"><col><col class="cj-c-valor"><col><col class="cj-c-ico">
      </colgroup>
      <thead><tr>
        <th class="is-center"></th><th>Título</th><th>Cliente</th><th>Empresa</th><th>Unidade</th><th>Centro de custo</th><th>Data</th><th>Do que se trata</th><th class="is-right">Valor</th><th>Processo</th><th class="is-center">Anexos</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
    lista.querySelectorAll("[data-pr]").forEach((el) => {
      el.addEventListener("change", () => {
        this.marcados[el.getAttribute("data-pr")] = el.checked;
      });
    });
    lista.querySelectorAll("[data-pr-anexos]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const item = this.itens.find((x) => x.id === btn.getAttribute("data-pr-anexos"));
        if (!item || !window.CustasJudiciaisApp) return;
        CustasJudiciaisApp.abrirPainelAnexos(item.guias, item.comprovantes, btn);
      });
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  marcarTodos() {
    const algum = this.itens.some((item) => this.pronto(item) && !this.marcados[item.id]);
    this.itens.forEach((item) => {
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
  }
};

window.PagarReembolsoApp = PagarReembolsoApp;
document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "pagar-reembolso" && window.PagarReembolsoApp) PagarReembolsoApp.init();
});
