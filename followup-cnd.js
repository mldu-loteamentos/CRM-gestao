/* Follow-up de CND/CPD depois do distrato sem restituição. */
const FollowupCndApp = {
  itens: [],
  _seq: 0,
  _gravando: Promise.resolve(),
  carregado: false,
  empIds: [],
  ccIds: [],
  empOpen: false,
  ccOpen: false,
  empQuery: "",
  ccQuery: "",
  ordem: "prazo",
  dir: "asc",
  LS: "crm_followup_cnd",
  ACK: "crm_followup_cnd_popup",

  semAcento(t) {
    return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  },

  classificarTexto(texto) {
    const t = this.semAcento(texto).replace(/\s+/g, " ");
    if (!t.trim()) {
      return { tipo: "ilegivel", certidao: false, follow: false, rotulo: "PDF sem texto" };
    }
    const temCertidao = /CERTIDAO/.test(t);
    const temPrefeitura = /PREFEITURA|MUNICIPIO|MUNICIPAL|CADASTRO IMOBILIARIO|SECRETARIA/.test(t);
    const certidao = temCertidao && (temPrefeitura || /IPTU/.test(t));
    const efeito = /POSITIVA COM EFEITO|EFEITO DE NEGATIVA|CND COM EFEITO POSITIV|COM EFEITO POSITIV/.test(t);
    const positiva = /CERTIDAO POSITIVA|POSITIVA DE DEBITO|POSITIVA DO CADASTRO/.test(t);
    const negativa = /CERTIDAO NEGATIVA|NEGATIVA DE DEBITO/.test(t);
    if (certidao && efeito) return { tipo: "cpen", certidao: true, follow: true, rotulo: "CND com efeito positiva" };
    if (certidao && positiva) return { tipo: "cpd", certidao: true, follow: true, rotulo: "CPD (certidão positiva de débitos)" };
    if (certidao && negativa) return { tipo: "cnd", certidao: true, follow: false, rotulo: "CND (certidão negativa de débitos)" };
    if (certidao) return { tipo: "certidao", certidao: true, follow: true, rotulo: "certidão da prefeitura" };
    const extrato = /EXTRATO/.test(t) && /IPTU|DEBITO|IMPOSTO|PAGAMENTO/.test(t);
    const boleto = /BOLETO|LINHA DIGITAVEL|DAM |GUIA DE RECOLHIMENTO/.test(t) && /IPTU|PREFEITURA|MUNICIP/.test(t);
    if (extrato) return { tipo: "extrato", certidao: false, follow: true, rotulo: "extrato de IPTU" };
    if (boleto) return { tipo: "boleto", certidao: false, follow: true, rotulo: "boleto de IPTU" };
    return { tipo: "outro", certidao: false, follow: false, rotulo: "outro documento" };
  },

  async lerPdf(file) {
    const lib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
    if (!lib || !file) return "";
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
    let text = "";
    const pages = Math.min(pdf.numPages || 1, 2);
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      text += "\n" + (tc.items || []).map(function(it) { return it.str || ""; }).join(" ");
    }
    return text;
  },

  async classificarArquivo(file) {
    if (!file) return { tipo: "outro", certidao: false, follow: false, rotulo: "outro documento" };
    const nome = String(file.name || "").toLowerCase();
    const pdf = file.type === "application/pdf" || nome.endsWith(".pdf");
    if (!pdf) return { tipo: "outro", certidao: false, follow: false, rotulo: "arquivo sem texto" };
    let texto = "";
    try { texto = await this.lerPdf(file); } catch (e) { texto = ""; }
    return this.classificarTexto(texto);
  },

  esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  },

  hoje() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  somaDias(iso, n) {
    const p = String(iso || "").slice(0, 10).split("-");
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(d.getTime())) return this.hoje();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  fmt(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    if (p.length !== 3 || p[0].length !== 4) return "—";
    return p[2] + "/" + p[1] + "/" + p[0];
  },

  eu() {
    const u = (typeof window.crmUsuarioEfetivo === "function" && window.crmUsuarioEfetivo())
      || (window.AuditService && AuditService.currentUser && AuditService.currentUser())
      || {};
    return {
      nome: String(u.name || "").replace(/ no usuário .+$/i, "").trim() || "Operador",
      email: String(u.email || "").trim().toLowerCase()
    };
  },

  souEu(item) {
    const e = this.eu();
    const mail = String(item && item.responsavelEmail || "").toLowerCase();
    if (e.email && mail && e.email === mail) return true;
    if (!mail && e.nome && this.semAcento(e.nome) === this.semAcento(item && item.responsavelNome)) return true;
    return false;
  },

  ccDe(id) {
    const chave = String(id || "").split(",")[0].trim();
    const lista = (window.AppState && AppState.cachedCostCenters) || (window.CentrosCustoState && CentrosCustoState.costCenters) || [];
    return lista.find(function(c) { return c && String(c.id) === chave; }) || null;
  },

  empresaDe(cc) {
    if (!cc) return { id: "", nome: "" };
    const id = String(cc.idCompany || cc.companyId || "");
    const empresas = (window.AppState && AppState.cachedCompanies) || (window.CentrosCustoState && CentrosCustoState.companies) || [];
    const emp = empresas.find(function(c) { return c && String(c.id) === id; });
    const nome = emp ? (emp.tradeName || emp.corporateName || emp.name || "") : "";
    return { id: id, nome: String(nome || "").trim() };
  },

  async matriculaDe(ccId, unidade) {
    if (!window.SiengeApiService || typeof SiengeApiService.getUnitDetails !== "function") return "";
    const nome = String(unidade || "").replace(/^\d{4,6}\s*[-–]\s*/, "").trim();
    if (!ccId || !nome) return "";
    try {
      const res = await SiengeApiService.getUnitDetails(ccId, nome);
      const u = (res && res.results && res.results[0]) || {};
      return String(u.legalRegistrationNumber || u.legalregistrationnumber || u.realEstateRegistration || "").trim();
    } catch (e) {
      return "";
    }
  },

  relatoDe(item) {
    const onde = [item.empreendimento, item.unidade].filter(Boolean).join(" — ");
    return onde + " teve distrato realizado em " + this.fmt(item.dataDistrato) + " e apresentou " + (item.documento || "documento de IPTU") + ".";
  },

  async carregar() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(this.LS) || "null"); } catch (e) { local = null; }
    if (local && Array.isArray(local.itens)) {
      this.itens = local.itens;
      this._seq = Number(local.seq) || 0;
    }
    const fc = window.firebaseCollections;
    if (!fc || !window.firebaseDb) {
      this.carregado = true;
      return;
    }
    try {
      const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", "followup_cnd"));
      const remoto = snap && snap.exists && snap.exists() ? snap.data() : null;
      if (remoto && Array.isArray(remoto.itens) && Number(remoto.seq || 0) >= this._seq) {
        this.itens = remoto.itens;
        this._seq = Number(remoto.seq) || this._seq;
        localStorage.setItem(this.LS, JSON.stringify({ itens: this.itens, seq: this._seq }));
      }
    } catch (e) {}
    this.carregado = true;
  },

  persistir() {
    this._seq += 1;
    const seq = this._seq;
    const itens = this.itens.slice();
    try { localStorage.setItem(this.LS, JSON.stringify({ itens: itens, seq: seq })); } catch (e) {}
    const fc = window.firebaseCollections;
    if (!fc || !window.firebaseDb) return Promise.resolve();
    const job = this._gravando.then(async () => {
      if (seq !== FollowupCndApp._seq) return;
      await fc.setDoc(fc.doc(window.firebaseDb, "config", "followup_cnd"), {
        itens: itens,
        seq: seq,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    });
    this._gravando = job.catch(function() {});
    return job;
  },

  documentoDoDistrato(leitura) {
    const c = leitura && leitura.cnd && leitura.cnd.classe;
    const e = leitura && leitura.certidao && leitura.certidao.classe;
    const partes = [];
    if (c && (c.tipo === "extrato" || c.tipo === "boleto")) partes.push(c.rotulo);
    if (c && c.certidao && c.follow) partes.push(c.rotulo);
    if (e && e.certidao && e.follow && partes.indexOf(e.rotulo) < 0) partes.push(e.rotulo);
    return partes.filter(Boolean).join(" e ");
  },

  async registrarDoDistrato(dados) {
    const d = dados || {};
    const doc = this.documentoDoDistrato(d.leitura);
    if (!doc) return;
    const client = d.client || {};
    await this.carregar();
    const saleId = String(client.saleId || "").replace(/^B-/i, "").split("-")[0];
    const aberto = this.itens.find(function(it) { return String(it.saleId) === saleId && !it.cndEntregue; });
    const ccRaw = client.costCenterId;
    const ccId = String(Array.isArray(ccRaw) ? (ccRaw[0] || "") : (ccRaw || "")).split(",")[0].trim();
    const cc = this.ccDe(ccId);
    const emp = this.empresaDe(cc);
    const unidade = String(client.unitName || client.unitLabel || "").trim();
    const empreendimento = cc ? (ccId + " - " + String(cc.name || "").trim()) : (ccId || "Empreendimento");
    const cidade = typeof window.extractCityFromCostCenter === "function"
      ? (window.extractCityFromCostCenter(ccId, (cc && cc.name) || "") || "")
      : "";
    const op = this.eu();
    const data = String(d.data || this.hoje()).slice(0, 10);
    const matricula = await this.matriculaDe(ccId, unidade);
    const base = aberto || {
      id: "cnd-" + (saleId || Date.now()),
      criadoEm: new Date().toISOString()
    };
    const item = Object.assign(base, {
      customerId: String(client.customerId || ""),
      customerName: String(client.customerName || ""),
      saleId: saleId,
      contractId: d.contract && d.contract.id != null ? String(d.contract.id) : (base.contractId || ""),
      costCenterId: ccId,
      companyId: emp.id,
      empresaNome: emp.nome,
      empreendimento: empreendimento,
      unidade: unidade,
      cidade: cidade,
      matricula: matricula || base.matricula || "",
      dataDistrato: data,
      prazo: this.somaDias(data, 10),
      documento: doc,
      responsavelNome: op.nome,
      responsavelEmail: op.email,
      cndEntregue: false,
      cndEntregueEm: ""
    });
    item.relato = this.relatoDe(item);
    if (aberto) {
      const i = this.itens.indexOf(aberto);
      this.itens[i] = item;
    } else {
      this.itens.push(item);
    }
    await this.persistir();
  },

  empresaItens() {
    const map = new Map();
    this.itens.forEach((it) => {
      const id = String(it.companyId || "");
      if (!id || map.has(id)) return;
      const nome = String(it.empresaNome || "").trim().toUpperCase();
      map.set(id, { id: id, label: id + (nome ? " - " + nome : "") });
    });
    return Array.from(map.values()).sort(function(a, b) { return a.label.localeCompare(b.label, "pt"); });
  },

  ccItens() {
    const emp = (this.empIds || []).map(String);
    const map = new Map();
    this.itens.forEach((it) => {
      if (emp.length && !emp.includes(String(it.companyId || ""))) return;
      const id = String(it.costCenterId || "");
      if (!id || map.has(id)) return;
      const nome = String(it.empreendimento || "").replace(/^\d+\s*-\s*/, "").trim().toUpperCase();
      map.set(id, { id: id, label: id + (nome ? " - " + nome : "") });
    });
    return Array.from(map.values()).sort(function(a, b) { return Number(a.id) - Number(b.id); });
  },

  lista() {
    let lista = this.itens.slice();
    const emp = (this.empIds || []).map(String);
    const ccs = (this.ccIds || []).map(String);
    if (emp.length) lista = lista.filter(function(it) { return emp.includes(String(it.companyId || "")); });
    if (ccs.length) lista = lista.filter(function(it) { return ccs.includes(String(it.costCenterId || "")); });
    const chave = this.ordem;
    const dir = this.dir === "desc" ? -1 : 1;
    const app = this;
    const valor = function(it) {
      if (chave === "cndEntregue") return app.situacao(it).txt;
      return it[chave] || "";
    };
    lista.sort(function(a, b) {
      const va = app.semAcento(valor(a));
      const vb = app.semAcento(valor(b));
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return lista;
  },

  situacao(it) {
    if (it.cndEntregue) return { txt: "CND na unidade", cls: "fcnd-ok" };
    if (String(it.prazo || "") <= this.hoje()) return { txt: "CND pendente", cls: "fcnd-pendente" };
    return { txt: "No prazo", cls: "" };
  },

  th(campo, rotulo) {
    return `<th onclick="FollowupCndApp.ordenar('${campo}')">${rotulo} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
  },

  ordenar(campo) {
    if (this.ordem === campo) this.dir = this.dir === "asc" ? "desc" : "asc";
    else { this.ordem = campo; this.dir = "asc"; }
    this.render();
  },

  filtroHtml(id, label, itens, selected, open, query, nouns) {
    if (!window.MlEmpresaFilter) return "";
    return MlEmpresaFilter.html({
      id: id,
      label: label,
      items: itens,
      selectedIds: selected,
      open: open,
      query: query,
      emptyMeansAll: true,
      nouns: nouns
    });
  },

  bindFiltros() {
    if (!window.MlEmpresaFilter) return;
    const app = this;
    MlEmpresaFilter.bind("fcnd-emp", {
      toggleOpen() {
        app.empOpen = !app.empOpen;
        if (app.empOpen) app.ccOpen = false;
        app.render();
      },
      setQuery(q) { app.empQuery = q || ""; app.atualizarLista("fcnd-emp"); },
      toggleId(id, on) { app.alternar("empIds", id, on); },
      selectAll() { app.empIds = app.empresaItens().map(function(x) { return x.id; }); app.render(); },
      selectNone() { app.empIds = []; app.render(); }
    });
    MlEmpresaFilter.bind("fcnd-cc", {
      toggleOpen() {
        app.ccOpen = !app.ccOpen;
        if (app.ccOpen) app.empOpen = false;
        app.render();
      },
      setQuery(q) { app.ccQuery = q || ""; app.atualizarLista("fcnd-cc"); },
      toggleId(id, on) { app.alternar("ccIds", id, on); },
      selectAll() { app.ccIds = app.ccItens().map(function(x) { return x.id; }); app.render(); },
      selectNone() { app.ccIds = []; app.render(); }
    });
  },

  atualizarLista(id) {
    const box = document.getElementById(id + "-list");
    if (!box || !window.MlEmpresaFilter) return;
    const emp = id === "fcnd-emp";
    box.innerHTML = MlEmpresaFilter.listHtml({
      id: id,
      items: emp ? this.empresaItens() : this.ccItens(),
      selectedIds: emp ? this.empIds : this.ccIds,
      query: emp ? this.empQuery : this.ccQuery
    });
  },

  alternar(chave, id, on) {
    const lista = (this[chave] || []).map(String);
    const i = lista.indexOf(String(id));
    if (on && i < 0) lista.push(String(id));
    if (!on && i >= 0) lista.splice(i, 1);
    this[chave] = lista;
    this.render();
  },

  render() {
    const root = document.getElementById("followup-cnd-root");
    if (!root) return;
    const nounsEmp = { singular: "empresa", plural: "empresas", none: "Nenhuma empresa", noMatch: "Nenhuma empresa com esse nome." };
    const nounsCc = { singular: "centro de custo", plural: "centros de custo", none: "Nenhum centro de custo", noMatch: "Nenhum centro de custo com esse nome." };
    const linhas = this.lista();
    const corpo = linhas.length ? linhas.map((it) => {
      const sit = this.situacao(it);
      const acao = (!it.cndEntregue && this.souEu(it))
        ? `<button type="button" class="btn btn-primary btn-sm" onclick="FollowupCndApp.abrirPopup(['${String(it.id).replace(/'/g, "")}'])">Anexar CND</button>`
        : "—";
      return `<tr>
        <td class="fcnd-relato" title="${this.esc(it.relato)}">${this.esc(it.relato || this.relatoDe(it))}</td>
        <td>${this.esc(it.empreendimento || "—")}</td>
        <td>${this.esc(it.unidade || "—")}</td>
        <td>${this.esc(this.fmt(it.dataDistrato))}</td>
        <td title="${this.esc(it.documento)}">${this.esc(it.documento || "—")}</td>
        <td title="${this.esc(it.responsavelEmail)}">${this.esc(it.responsavelNome || "—")}</td>
        <td>${this.esc(this.fmt(it.prazo))}</td>
        <td class="${sit.cls}">${sit.txt}</td>
        <td class="is-center">${acao}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="9" style="text-align:center;padding:28px;color:#64748b;">Nenhum distrato aguardando conferência de IPTU.</td></tr>`;
    root.innerHTML = `<div class="cc-page fcnd-page">
      <p style="margin:0 0 12px;font-size:0.85rem;color:#64748b;line-height:1.45;">Distrato sem restituição em que o lote apresentou certidão positiva, CND com efeito positiva, extrato ou boleto de IPTU. O operador que anexou o documento confere o pagamento, para o lote não voltar ao comercial com dívida ativa.</p>
      <div class="cc-toolbar">
        <div class="cc-filters">
          ${this.filtroHtml("fcnd-emp", "Empresas", this.empresaItens(), this.empIds, this.empOpen, this.empQuery, nounsEmp)}
          ${this.filtroHtml("fcnd-cc", "Centros de custo", this.ccItens(), this.ccIds, this.ccOpen, this.ccQuery, nounsCc)}
        </div>
        <div class="cc-toolbar-actions">
          <button type="button" class="btn btn-primary cc-atualizar" onclick="FollowupCndApp.abrir()">
            <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Atualizar
          </button>
        </div>
      </div>
      <div class="cc-scroll">
        <table class="cc-table">
          <thead><tr>
            ${this.th("relato", "Acompanhamento")}
            ${this.th("empreendimento", "Empreendimento")}
            ${this.th("unidade", "Unidade")}
            ${this.th("dataDistrato", "Distrato")}
            ${this.th("documento", "Documento")}
            ${this.th("responsavelNome", "Responsável")}
            ${this.th("prazo", "Prazo da CND")}
            ${this.th("cndEntregue", "Situação")}
            <th class="is-center is-acao"></th>
          </tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
    </div>`;
    this.bindFiltros();
    if (window.lucide) {
      try { window.lucide.createIcons({ root: root }); } catch (e) { try { window.lucide.createIcons(); } catch (e2) {} }
    }
  },

  async abrir() {
    const root = document.getElementById("followup-cnd-root");
    if (root && !this.carregado) {
      root.innerHTML = `<div class="cc-page"><div style="text-align:center;padding:40px;color:#64748b;"><div class="spinner" style="margin-bottom:15px;"></div><p>Carregando o follow-up…</p></div></div>`;
    }
    await this.carregar();
    this.render();
  },

  popupVisto(id) {
    try {
      const ack = JSON.parse(localStorage.getItem(this.ACK) || "{}");
      const e = this.eu();
      return ack.day === this.hoje() && ack.email === e.email && Array.isArray(ack.ids) && ack.ids.indexOf(id) >= 0;
    } catch (e) { return false; }
  },

  marcarPopup(ids) {
    const e = this.eu();
    let ack = {};
    try { ack = JSON.parse(localStorage.getItem(this.ACK) || "{}"); } catch (err) { ack = {}; }
    const mesmos = ack.day === this.hoje() && ack.email === e.email && Array.isArray(ack.ids) ? ack.ids : [];
    ids.forEach(function(id) { if (mesmos.indexOf(id) < 0) mesmos.push(id); });
    try { localStorage.setItem(this.ACK, JSON.stringify({ day: this.hoje(), email: e.email, ids: mesmos })); } catch (err) {}
  },

  async avisar() {
    try { await this.carregar(); } catch (e) { return; }
    const hoje = this.hoje();
    const app = this;
    const pend = this.itens.filter(function(it) {
      return it && !it.cndEntregue && String(it.prazo || "") <= hoje && app.souEu(it) && !app.popupVisto(it.id);
    });
    if (!pend.length) return;
    this.abrirPopup(pend.map(function(it) { return it.id; }), true);
  },

  linhaPopup(it) {
    const cidade = it.cidade || "Cidade não identificada";
    const matricula = it.matricula || "não localizada no cadastro";
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px;">
      <p style="margin:0 0 8px;font-weight:700;color:#0f172a;">${this.esc(it.relato || this.relatoDe(it))}</p>
      <div class="fcnd-pop-grade">
        <span>Cidade</span><strong>${this.esc(cidade)}</strong>
        <span>Empreendimento</span><strong>${this.esc(it.empreendimento || "—")}</strong>
        <span>Unidade</span><strong>${this.esc(it.unidade || "—")}</strong>
        <span>Matrícula</span><strong>${this.esc(matricula)}</strong>
      </div>
      <label style="display:block;font-size:0.82rem;font-weight:700;margin-bottom:4px;">CND do lote</label>
      <input type="file" class="fcnd-arq" data-id="${this.esc(it.id)}" accept=".pdf,application/pdf" style="width:100%;box-sizing:border-box;padding:8px;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc;">
      <p class="fcnd-arq-msg" data-id="${this.esc(it.id)}" style="margin:6px 0 0;font-size:0.78rem;color:#64748b;"></p>
    </div>`;
  },

  abrirPopup(ids, automatico) {
    const listaIds = Array.isArray(ids) ? ids : [ids];
    const itens = listaIds.map((id) => this.itens.find(function(it) { return it.id === id; })).filter(Boolean);
    if (!itens.length) return;
    let pop = document.getElementById("followup-cnd-pop");
    if (pop) pop.remove();
    pop = document.createElement("div");
    pop.id = "followup-cnd-pop";
    pop.style.cssText = "position:fixed;inset:0;background:rgba(12,41,29,0.55);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px;";
    const blocos = itens.map((it) => this.linhaPopup(it)).join("");
    pop.innerHTML = `<div style="background:#fff;border-radius:12px;width:min(640px,100%);max-height:min(88vh,760px);overflow:auto;box-shadow:0 18px 40px rgba(0,0,0,0.22);">
      <div style="background:#105436;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="color:#fff;font-size:0.95rem;font-weight:800;">Providenciar a CND</div>
        <button type="button" class="btn btn-fechar" onclick="FollowupCndApp.fecharPopup(${automatico ? "true" : "false"})">Fechar</button>
      </div>
      <div style="padding:18px;">
        <p style="margin:0 0 12px;font-size:0.86rem;color:#334155;line-height:1.45;">Passaram 10 dias corridos do distrato. Providencie a CND do lote. Cidade, empreendimento, unidade e matrícula estão abaixo para a pesquisa na prefeitura. A certidão sobe no anexo da unidade.</p>
        ${blocos}
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" class="btn btn-cancel" onclick="FollowupCndApp.fecharPopup(${automatico ? "true" : "false"})">Cancelar</button>
          <button type="button" class="btn btn-primary" id="fcnd-enviar" onclick="FollowupCndApp.enviarCnd()">Enviar CND</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(pop);
  },

  fecharPopup(lembrar) {
    if (lembrar) {
      const ids = Array.from(document.querySelectorAll("#followup-cnd-pop .fcnd-arq")).map(function(el) { return el.getAttribute("data-id"); }).filter(Boolean);
      this.marcarPopup(ids);
    }
    const pop = document.getElementById("followup-cnd-pop");
    if (pop) pop.remove();
  },

  async enviarCnd() {
    const inputs = Array.from(document.querySelectorAll("#followup-cnd-pop .fcnd-arq"));
    const btn = document.getElementById("fcnd-enviar");
    const comArquivo = inputs.filter(function(el) { return el.files && el.files[0]; });
    if (!comArquivo.length) {
      if (window.showToast) window.showToast("Anexe a CND em PDF.", "warning");
      return;
    }
    if (btn) btn.disabled = true;
    let algum = false;
    for (let i = 0; i < comArquivo.length; i++) {
      const el = comArquivo[i];
      const id = el.getAttribute("data-id");
      const msg = document.querySelector('#followup-cnd-pop .fcnd-arq-msg[data-id="' + id + '"]');
      const item = this.itens.find(function(it) { return it.id === id; });
      const file = el.files[0];
      if (!item) continue;
      let classe = null;
      try { classe = await this.classificarArquivo(file); } catch (e) { classe = null; }
      if (!classe || !classe.certidao || classe.tipo !== "cnd") {
        if (msg) {
          msg.style.color = "#9a3412";
          msg.textContent = classe && classe.certidao
            ? "Esta certidão ainda não é negativa. O follow-up continua até a CND."
            : "Envie o PDF da certidão negativa da prefeitura. O texto precisa ser legível.";
        }
        continue;
      }
      try {
        if (msg) { msg.style.color = "#64748b"; msg.textContent = "Enviando para a unidade…"; }
        const unidadePronta = /^\d{4,6}\s*[-–]/.test(String(item.unidade || ""));
        const unitLabel = unidadePronta ? item.unidade : ((item.costCenterId ? item.costCenterId + " - " : "") + (item.unidade || ""));
        await window.nexUploadToSiengeUnit(item.customerId, item.saleId, file, ["CND", "CERTIDAO NEGATIVA DE DEBITO", "CERTIDAO NEGATIVA DE DEBITO IPTU"], {
          titulo: item.saleId,
          unitLabel: unitLabel
        }, "followup-cnd");
        item.cndEntregue = true;
        item.cndEntregueEm = new Date().toISOString();
        item.relato = this.relatoDe(item);
        algum = true;
        if (msg) { msg.style.color = "#105436"; msg.textContent = "CND gravada no anexo da unidade."; }
      } catch (e) {
        if (msg) { msg.style.color = "#9a3412"; msg.textContent = "A CND não subiu na unidade. " + ((e && e.message) || ""); }
      }
    }
    if (algum) {
      try { await this.persistir(); } catch (e) {}
      if (document.getElementById("followup-cnd-root")) this.render();
      const idsPop = inputs.map(function(el) { return el.getAttribute("data-id"); });
      const restam = this.itens.filter(function(it) { return idsPop.indexOf(it.id) >= 0 && !it.cndEntregue; });
      if (!restam.length) this.fecharPopup(false);
    }
    if (btn) btn.disabled = false;
  }
};

window.FollowupCndApp = FollowupCndApp;
