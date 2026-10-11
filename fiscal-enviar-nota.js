/* Fiscal › Enviar nota: o operador informa o pedido de compra, sobe a nota (e boleto ou outros anexos) e confirma
   a data e a forma de pagamento. O envio entra na fila do operador fiscal (Fiscal › Inserir nota), que lança no Sienge.
   Firestore: fiscal_notas_envio/{id} · Storage: fiscal-notas/{id}/… */
window.FilaNotasFiscais = {
  COL: "fiscal_notas_envio",
  FORMAS: ["Boleto", "PIX", "Transferência (TED)", "Débito em conta", "Cartão de crédito", "Outra"],
  TIPOS_ANEXO: { nota: "Nota fiscal", boleto: "Boleto", outro: "Outro" },
  MAX_MB: 20,
  STATUS: {
    pendente: { rot: "Aguardando fiscal", cls: "is-wait" },
    em_lancamento: { rot: "Em lançamento", cls: "is-info" },
    lancada: { rot: "Lançada no Sienge", cls: "is-ok" },
    devolvida: { rot: "Devolvida", cls: "is-erro" },
    cancelada: { rot: "Cancelada", cls: "is-off" }
  },

  fb() {
    const db = window.firebaseDb;
    const f = window.firebaseCollections;
    return db && f && f.doc ? { db, f } : null;
  },

  usuario() {
    const u = (window.AppState && AppState.currentUser) || {};
    return {
      nome: u.name || u.nome || u.email || "",
      email: String(u.email || "").toLowerCase(),
      sienge: String(u.sienge_user || "").trim()
    };
  },

  /** Login do Sienge, nunca o nome completo. Envios antigos são achados pelo e-mail ou pelo nome cadastrado. */
  usuarioSienge(nome, email, gravado) {
    const pronto = String(gravado || "").trim();
    if (pronto) return pronto;
    const eu = (window.AppState && AppState.currentUser) || {};
    const mail = String(email || "").toLowerCase();
    const alvo = String(nome || "").trim().toUpperCase();
    if (eu.sienge_user && ((mail && String(eu.email || "").toLowerCase() === mail) || (alvo && String(eu.name || eu.nome || "").trim().toUpperCase() === alvo))) {
      return String(eu.sienge_user).trim();
    }
    let users = [];
    try { users = JSON.parse(localStorage.getItem("crm_users") || "[]") || []; } catch (e) { users = []; }
    const u = users.find((x) => mail && String(x.email || "").toLowerCase() === mail)
      || users.find((x) => alvo && String(x.name || "").trim().toUpperCase() === alvo)
      || users.find((x) => alvo && String(x.sienge_user || "").replace(/\./g, " ").trim().toUpperCase() === alvo);
    return u && u.sienge_user ? String(u.sienge_user).trim() : "";
  },

  async excluir(id) {
    const fb = this.fb();
    if (!fb || typeof fb.f.deleteDoc !== "function") throw new Error("Firebase indisponível");
    await fb.f.deleteDoc(fb.f.doc(fb.db, this.COL, id));
  },

  aberta(item) {
    return item && (item.status === "pendente" || item.status === "em_lancamento");
  },

  /** Envio deste pedido na base do fiscal (prioriza o que ainda está em análise). */
  doPedido(lista, doc) {
    const alvo = String(doc || "").replace(/\s/g, "");
    const dig = alvo.replace(/\D/g, "");
    if (!alvo) return null;
    const rank = { em_lancamento: 0, pendente: 1, devolvida: 2, lancada: 3 };
    const hits = (lista || []).filter((x) => {
      if (!x || x.status === "cancelada") return false;
      return [x.pedido, x.pedidoApi].some((v) => {
        const n = String(v || "").replace(/\s/g, "");
        return n && (n === alvo || n.replace(/\D/g, "") === dig);
      });
    });
    hits.sort((a, b) => (rank[a.status] == null ? 9 : rank[a.status]) - (rank[b.status] == null ? 9 : rank[b.status]) || (b.criadoEm || 0) - (a.criadoEm || 0));
    return hits[0] || null;
  },

  /** Tag e botão da previsão: em análise fiscal, ou enviar/corrigir quando o pedido já pode ir ao fiscal. */
  acaoPedidoHtml(doc, lista) {
    const ped = String(doc || "").trim();
    if (!/^\d{3,}$/.test(ped)) return "";
    const item = this.doPedido(lista, ped);
    const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    let tag = "";
    if (item && (item.status === "pendente" || item.status === "em_lancamento")) {
      tag = `<span class="cprev-tag cprev-tag-fiscal" title="Nota enviada e aguardando o lançamento do fiscal">Em análise fiscal</span>`;
      return `<span class="cprev-fiscal-acoes">${tag}</span>`;
    }
    if (item && item.status === "devolvida") {
      tag = `<span class="cprev-tag cprev-tag-previsao" title="${esc(item.motivoDevolucao || "Devolvida pelo fiscal")}">Nota devolvida</span>`;
    }
    const rot = item && item.status === "devolvida" ? "Corrigir envio" : "Enviar ao fiscal";
    const id = item && item.status === "devolvida" ? item.id : "";
    return `<span class="cprev-fiscal-acoes">${tag}<button type="button" class="cprev-fiscal-btn" onclick="event.stopPropagation(); FilaNotasFiscais.abrirEnvio('${esc(ped)}','${esc(id)}')">${rot}</button></span>`;
  },

  /** Abre Enviar nota com o pedido. Se a nota foi devolvida, abre a correção desse envio. */
  abrirEnvio(pedido, idEnvio) {
    const ped = String(pedido || "").trim();
    if (!ped) return;
    if (window.ComprasControleApp && typeof ComprasControleApp.fecharTitulo === "function") ComprasControleApp.fecharTitulo();
    if (typeof window.switchTab === "function") window.switchTab("fiscal-enviar-nota", "Enviar nota ao fiscal");
    const abrir = () => {
      const app = window.EnviarNotaApp;
      if (!app) return;
      const item = idEnvio && (app.state && app.state.lista || []).concat(this._ultimo || []).find((x) => x && x.id === idEnvio);
      if (item && item.status === "devolvida") {
        if (!app.state || !app.state.lista || !app.state.lista.some((x) => x.id === idEnvio)) {
          app.state = app.novoEstado();
          app.state.lista = (this._ultimo || []).slice();
          app.state.listaCarregada = true;
        }
        app.corrigir(idEnvio);
        return;
      }
      app.state = app.novoEstado();
      app.state.pedidoId = ped;
      app.init();
      app.buscarPedido();
    };
    setTimeout(abrir, 40);
  },

  async listar() {
    const fb = this.fb();
    if (!fb) throw new Error("Firebase indisponível");
    const { collection, getDocs, query, orderBy, limit } = fb.f;
    const snap = await getDocs(query(collection(fb.db, this.COL), orderBy("criadoEm", "desc"), limit(400)));
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  },

  /** Acompanha a fila em tempo real (um listener só, compartilhado entre Enviar nota e Inserir nota). */
  ouvir(fn) {
    this._ouvintes = this._ouvintes || [];
    if (!this._ouvintes.includes(fn)) this._ouvintes.push(fn);
    const copia = () => this._ultimo.map((x) => JSON.parse(JSON.stringify(x)));
    if (this._unsub) { if (this._ultimo) fn(copia()); return; }
    const fb = this.fb();
    if (!fb || !fb.f.onSnapshot) return;
    const { collection, query, orderBy, limit, onSnapshot } = fb.f;
    this._unsub = onSnapshot(query(collection(fb.db, this.COL), orderBy("criadoEm", "desc"), limit(400)), (snap) => {
      this._ultimo = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      this._ouvintes.forEach((cb) => { try { cb(copia()); } catch (e) { console.warn("[Fila notas]", e); } });
    }, (e) => {
      console.warn("[Fila notas] tempo real indisponível", e);
      this._unsub = null;
    });
  },

  novoId() {
    return `NF${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  },

  async salvar(id, dados) {
    const fb = this.fb();
    if (!fb) throw new Error("Firebase indisponível");
    await fb.f.setDoc(fb.f.doc(fb.db, this.COL, id), JSON.parse(JSON.stringify(dados)), { merge: true });
  },

  /** Muda o envio e registra no histórico quem fez o quê. */
  async atualizar(item, patch, acao, msg) {
    const u = this.usuario();
    const historico = (item.historico || []).concat([{ em: Date.now(), por: u.nome, porEmail: u.email, acao, msg: msg || "" }]).slice(-40);
    const dados = Object.assign({}, patch, { historico, atualizadoEm: Date.now() });
    await this.salvar(item.id, dados);
    Object.assign(item, dados);
    return item;
  },

  async subirAnexos(id, anexos) {
    const fb = this.fb();
    const { ref, uploadBytes, getDownloadURL } = (fb && fb.f) || {};
    if (!window.firebaseStorage || !ref || !uploadBytes || !getDownloadURL) throw new Error("Firebase Storage indisponível");
    const out = [];
    for (let i = 0; i < anexos.length; i++) {
      const a = anexos[i];
      if (!a.file) { out.push({ nome: a.nome, tipo: a.tipo, url: a.url, path: a.path, contentType: a.contentType || "", size: a.size || 0 }); continue; }
      const safe = String(a.file.name || "anexo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "anexo";
      const path = `fiscal-notas/${id}/${Date.now()}_${i}_${safe}`;
      const r = ref(window.firebaseStorage, path);
      await uploadBytes(r, a.file, { contentType: a.file.type || "application/octet-stream" });
      out.push({ nome: a.file.name || safe, tipo: a.tipo, url: await getDownloadURL(r), path, contentType: a.file.type || "", size: Number(a.file.size) || 0 });
    }
    return out;
  },

  /** Baixa o anexo como File (para ler a nota e anexar no pedido do Sienge). */
  async baixar(a) {
    const urls = [a.url];
    const m = String(a.url || "").match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/(.+)$/);
    if (m) urls.push(`/proxy-storage/${m[1]}`);
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (!r.ok) continue;
        const b = await r.blob();
        return new File([b], a.nome || "anexo", { type: a.contentType || b.type || "" });
      } catch (e) {}
    }
    throw new Error(`não consegui baixar o anexo ${a.nome || ""}`);
  },

  statusHtml(item, esc) {
    const st = this.STATUS[item.status] || { rot: item.status || "—", cls: "is-off" };
    let extra = "";
    if (item.status === "em_lancamento" && item.assumidoPor) extra = ` · ${esc(item.assumidoPor)}`;
    if (item.status === "lancada" && item.seqSienge) extra = ` · seq. ${esc(item.seqSienge)}`;
    return `<span class="fnf-pill ${st.cls}">${esc(st.rot)}${extra}</span>`;
  },

  anexosHtml(item, esc) {
    return (item.anexos || []).map((a) => `<a class="fnf-anexo" href="${esc(a.url)}" target="_blank" rel="noopener" title="${esc(a.nome)}"><i data-lucide="${a.tipo === "boleto" ? "barcode" : (a.tipo === "nota" ? "file-text" : "paperclip")}"></i>${esc(this.TIPOS_ANEXO[a.tipo] || "Anexo")}</a>`).join(" ");
  },

  pagamentoTxt(item, dataBr) {
    const p = item.pagamento || {};
    return [p.data ? dataBr(p.data) : "", p.forma || ""].filter(Boolean).join(" · ") || "—";
  },

  /** Estilo compartilhado entre Enviar nota e a fila do Inserir nota. */
  css() {
    return `
      .fnf-tab { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .fnf-tab th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #64748b; padding: 8px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
      .fnf-tab td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
      .fnf-tab td small { display: block; color: #64748b; font-size: 0.74rem; margin-top: 2px; }
      .fnf-tab .num { text-align: right; white-space: nowrap; }
      .fnf-tab .fnf-acoes { white-space: nowrap; text-align: right; }
      .fnf-tab .fnf-acoes .btn { height: 32px; min-width: 168px; justify-content: center; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px; padding: 0 10px; margin-left: 4px; box-sizing: border-box; }
      .fnf-tab .fnf-acoes .btn i { width: 13px; height: 13px; }
      .fnf-pill { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 0.72rem; font-weight: 700; white-space: nowrap; }
      .fnf-pill.is-wait { background: #fff7ed; color: #c2410c; }
      .fnf-pill.is-info { background: #eff6ff; color: #1d4ed8; }
      .fnf-pill.is-ok { background: #ecfdf5; color: #105436; }
      .fnf-pill.is-erro { background: #fef2f2; color: #b91c1c; }
      .fnf-pill.is-off { background: #f1f5f9; color: #64748b; }
      .fnf-anexo { display: inline-flex; align-items: center; gap: 4px; margin: 0 6px 2px 0; color: #105436; font-weight: 600; text-decoration: none; font-size: 0.78rem; }
      .fnf-anexo:hover { text-decoration: underline; }
      .fnf-anexo i { width: 13px; height: 13px; }
      .fnf-tab td small.fnf-motivo { color: #b91c1c; font-weight: 700; font-size: 0.78rem; }
      .fnf-tab tr.fnf-devolvida td { background: #fef2f2; }
      .fnf-barra { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
      .fnf-barra select { height: 34px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 10px; font-size: 0.84rem; background: #fff; }
      .fnf-vazio { color: #64748b; font-size: 0.85rem; padding: 18px 4px; text-align: center; }`;
  }
};

window.EnviarNotaApp = {
  state: null,

  novoEstado() {
    const ant = this.state || {};
    return {
      aba: ant.aba || "enviar",
      pedidoId: "", pedidoApi: "", pedidoNome: "", pedido: null, credor: null, cc: null, empresaCc: "", previsao: null,
      carregando: "", erro: "", abertas: [],
      banco: { contas: [], pix: [], formas: [], erro: "" },
      anexos: [], previewIdx: -1, preview: "", previewLendo: "",
      pag: { data: "", forma: "", detalhe: "" },
      formaManual: "",
      numeroNota: "", serieNota: "", valorNota: "", linhaBoleto: "",
      lendoNota: "", leituraErro: "", leituraToken: 0, fiscal: null,
      obs: "",
      enviando: "", feito: "", editandoId: "",
      lista: ant.lista || [], listaCarregada: !!ant.listaCarregada, listaErro: "", listaCarregando: false, todos: !!ant.todos, verLancadas: !!ant.verLancadas
    };
  },

  voltarBudget() {
    if (typeof switchTab === "function") switchTab("marketing-budget", "Budget");
  },

  init() {
    if (!this.state) this.state = this.novoEstado();
    this.render();
    if (!this.empresas) this.carregarEmpresas();
    if (this.state.aba === "minhas") this.carregarLista(true);
    FilaNotasFiscais.ouvir(this._aoMudar || (this._aoMudar = (lista) => this.aoMudarFila(lista)));
  },

  /** Fila mudou no Firebase (ex.: o fiscal devolveu ou lançou): atualiza a lista sem tirar o foco de quem está digitando. */
  aoMudarFila(lista) {
    const s = this.state;
    if (!s) return;
    s.lista = lista;
    s.listaCarregada = true;
    if (s.aba === "minhas") this.render();
    else this.pintarAbas();
  },

  async carregarEmpresas() {
    const lista = window.SiengeApiService && SiengeApiService.getCompanies ? await SiengeApiService.getCompanies().catch(() => []) : [];
    this.empresas = (lista || []).map((c) => ({ id: String(c.id), nome: c.name || c.tradeName || `Empresa ${c.id}` }));
    if (this.state && this.state.pedido) this.render();
  },

  /* ---------- utilitários ---------- */
  esc(v) { return InserirNotaApp.esc(v); },
  money(v) { return InserirNotaApp.money(v); },
  dataBr(iso) { return InserirNotaApp.dataBr(iso); },
  num(v) { return InserirNotaApp.num(v); },
  hojeIso() { return InserirNotaApp.hojeIso(); },
  podeEditar() {
    return typeof window.hasCrmPerm === "function" && window.hasCrmPerm("sub_fiscal_geral_enviar_nota_editar");
  },
  nomeEmpresa(id) {
    const e = (this.empresas || []).find((c) => c.id === String(id));
    return e ? e.nome : "";
  },

  setAba(aba) {
    this.state.aba = aba;
    this.render();
    if (aba === "minhas") this.carregarLista(true);
  },

  /* ---------- pedido ---------- */
  async buscarPedido() {
    const s = this.state;
    const digitado = String((document.getElementById("env-pedido") || {}).value || s.pedidoId || "").trim();
    const id = InserirNotaApp.idApi(digitado);
    if (!id) return;
    Object.assign(s, { pedidoId: digitado, pedidoApi: id, pedidoNome: digitado, pedido: null, credor: null, cc: null, empresaCc: "", previsao: null, erro: "", abertas: [], feito: "", banco: { contas: [], pix: [], formas: [], erro: "" } });
    s.carregando = "Buscando o pedido no Sienge…";
    this.render();
    try {
      const pedido = await InserirNotaApp.get(`/purchase-orders/${id}`);
      if (!pedido || typeof pedido !== "object" || pedido.id == null) throw new Error("pedido não encontrado");
      s.pedido = pedido;
      s.pedidoApi = String(pedido.id);
      s.pedidoNome = String(pedido.formattedPurchaseOrderId || digitado);
      const [credor, cc, previsao, fila, banco] = await Promise.all([
        InserirNotaApp.get(`/creditors/${encodeURIComponent(pedido.supplierId)}`).catch(() => null),
        InserirNotaApp.centroDeCusto(pedido),
        InserirNotaApp.previsaoFinanceira(pedido).catch(() => null),
        FilaNotasFiscais.listar().catch(() => []),
        this.dadosBancarios(pedido.supplierId)
      ]);
      s.banco = banco;
      s.lista = Array.isArray(fila) ? fila : (s.lista || []);
      s.listaCarregada = true;
      s.credor = credor && typeof credor === "object"
        ? { id: String(pedido.supplierId), nome: credor.name || credor.tradeName || `Fornecedor ${pedido.supplierId}`, doc: InserirNotaApp.digits(credor.cnpj || credor.cpf) }
        : { id: String(pedido.supplierId), nome: `Fornecedor ${pedido.supplierId}`, doc: "" };
      s.cc = cc;
      s.empresaCc = cc.companyId;
      s.previsao = previsao;
      s.abertas = s.lista.filter((x) => FilaNotasFiscais.aberta(x) && String(x.pedidoApi) === s.pedidoApi && x.id !== s.editandoId);
      if (!s.pag.data && previsao && previsao.parcelas.length) {
        const hoje = this.hojeIso();
        const p = previsao.parcelas.find((x) => x.vencimento >= hoje) || previsao.parcelas[0];
        s.pag.data = p.vencimento;
      }
      this.sugerirForma();
      if (s._fonteNota) this.analisarFiscal(s.leituraToken);
    } catch (e) {
      const msg = String((e && e.message) || e || "");
      s.erro = /404|não encontrado/i.test(msg) ? `Pedido ${id} não encontrado no Sienge.`
        : (/403/.test(msg) ? "O usuário da API não tem permissão para consultar pedidos de compra." : `Não consegui buscar o pedido: ${msg}`);
    }
    s.carregando = "";
    this.render();
  },

  /* ---------- dados bancários do credor (cadastro no Sienge) ---------- */
  async dadosBancarios(credorId) {
    const out = { contas: [], pix: [], formas: [], erro: "" };
    if (credorId == null || credorId === "") return out;
    const id = encodeURIComponent(credorId);
    const [contas, pix] = await Promise.all([
      InserirNotaApp.get(`/creditors/${id}/bank-informations?limit=100`).catch((e) => { out.erro = String((e && e.message) || e); return null; }),
      InserirNotaApp.get(`/creditors/${id}/pix-informations?limit=100`).catch((e) => { out.erro = out.erro || String((e && e.message) || e); return null; })
    ]);
    const padrao = (x) => ["S", "Y", "TRUE", "1"].includes(String(x && x.defaultFlag).toUpperCase());
    const bancos = InserirNotaApp.lista(contas);
    out.contas = bancos.filter((b) => b && (b.accountNumber || b.agency)).map((b) => ({
      txt: this.contaTxt(b), padrao: padrao(b), favorecido: b.nameOfRecipient || "", doc: InserirNotaApp.digits(b.cpf || b.cnpj)
    }));
    out.formas = bancos.filter((b) => b && (b.paymentForm || b.paymentTypeName)).map((b) => ({
      forma: String(b.paymentForm || b.paymentTypeName).trim(), padrao: padrao(b)
    }));
    out.pix = InserirNotaApp.lista(pix).filter((p) => p && (p.key || p.keyPix)).map((p) => ({
      txt: `${String(p.type || p.keyPixType || "").trim().toUpperCase() || "Chave"}: ${String(p.key || p.keyPix).trim()}`, padrao: padrao(p)
    }));
    return out;
  },

  contaTxt(b) {
    const tipo = { C: "Conta corrente", CHECKING: "Conta corrente", P: "Poupança", SAVING: "Poupança", SAVINGS: "Poupança" }[String(b.accountType || "").toUpperCase()] || "";
    const banco = b.nameOfBank ? `${b.nameOfBank}${b.bank ? ` (${b.bank})` : ""}` : (b.bank ? `Banco ${b.bank}` : "");
    const conta = `${b.accountNumber || ""}${b.checkDigit ? "-" + b.checkDigit : ""}`;
    return [banco, b.agency ? `Ag. ${b.agency}` : "", conta ? `Conta ${conta}` : "", tipo].filter(Boolean).join(" · ");
  },

  /** Opções de destino do pagamento para a forma escolhida: chaves PIX ou contas do cadastro do credor. */
  destinos(forma) {
    const b = this.state.banco;
    if (forma === "PIX") return b.pix;
    if (forma === "Transferência (TED)" || forma === "Débito em conta") return b.contas;
    return null;
  },

  /** Mantém o destino só se ele existir no cadastro do credor; senão usa o padrão do Sienge (ou o único cadastrado). */
  ajustarDestino() {
    const pag = this.state.pag;
    const ops = this.destinos(pag.forma);
    if (!ops) return;
    if (ops.some((o) => o.txt === pag.detalhe)) return;
    const pad = ops.find((o) => o.padrao) || (ops.length === 1 ? ops[0] : null);
    pag.detalhe = pad ? pad.txt : "";
  },

  setForma(forma) {
    const s = this.state;
    const pag = s.pag;
    s.formaManual = forma;
    if (pag.forma !== forma) pag.detalhe = "";
    pag.forma = forma;
    if (forma === "Boleto" && s.linhaBoleto) pag.detalhe = s.linhaBoleto;
    this.ajustarDestino();
    this.render();
    if (forma === "Boleto") this.lerBoletoAnexo();
  },

  /** Forma padrão do cadastro bancário do credor no Sienge (paymentForm). */
  formaDoTexto(txt) {
    const pf = String(txt || "").toUpperCase();
    if (!pf) return "";
    if (pf.includes("PIX")) return "PIX";
    if (pf.includes("CART")) return "Cartão de crédito";
    if (pf.includes("DÉBITO") || pf.includes("DEBITO")) return "Débito em conta";
    if (pf.includes("TRANSFER") || pf.includes("TED") || pf.includes("DOC") || pf.includes("BANK-TRANSFER")) return "Transferência (TED)";
    if (pf.includes("BOLETO")) return "Boleto";
    return "";
  },

  formaDoCredor() {
    const formas = (this.state.banco && this.state.banco.formas) || [];
    const escolhida = formas.find((c) => c.padrao) || formas[0];
    return escolhida ? this.formaDoTexto(escolhida.forma) : "";
  },

  linhaBoleto(texto) {
    const t = String(texto || "").replace(/[^\d.\s]/g, " ").replace(/\s+/g, " ");
    const m = t.match(/\d{5}\.?\d{5}\s+\d{5}\.?\d{6}\s+\d{5}\.?\d{6}\s+\d\s+\d{14}/);
    if (m) return m[0].replace(/\s+/g, " ").trim();
    const b = String(texto || "").replace(/\D/g, "");
    const i = b.search(/(\d{47})/);
    return i >= 0 ? b.slice(i, i + 47) : "";
  },

  async textoDeArquivo(file) {
    if (!file) return "";
    const buf = await file.arrayBuffer();
    const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 64))).trim();
    if (/^\uFEFF?</.test(inicio) || /\.xml$/i.test(file.name || "")) return new TextDecoder("utf-8").decode(buf);
    if (/^%PDF/.test(inicio)) {
      const itens = window.NotaFiscalCheck ? await NotaFiscalCheck.itensDoPdf(buf) : [];
      let texto = itens.map((i) => i.s).join("\n");
      if (!this.linhaBoleto(texto) && window.InserirNotaApp && typeof InserirNotaApp.pdfParaCanvas === "function") {
        const canvas = await InserirNotaApp.pdfParaCanvas(buf);
        const celulas = await this.ocr(canvas, this.state.leituraToken || 0);
        texto = texto + "\n" + celulas.map((c) => c.s).join("\n");
      }
      return texto;
    }
    if (/^image\//.test(file.type || "") && window.InserirNotaApp && typeof InserirNotaApp.imagemParaCanvas === "function") {
      const canvas = await InserirNotaApp.imagemParaCanvas(file);
      const celulas = await this.ocr(canvas, this.state.leituraToken || 0);
      return celulas.map((c) => c.s).join("\n");
    }
    return "";
  },

  /** Lê a linha digitável do anexo marcado como boleto e preenche o pagamento. */
  lerBoletoAnexo() {
    const s = this.state;
    const token = (s.boletoToken || 0) + 1;
    s.boletoToken = token;
    const a = (s.anexos || []).find((x) => x.tipo === "boleto");
    if (!a) return;
    const pronto = a.file ? Promise.resolve(a.file) : FilaNotasFiscais.baixar(a);
    pronto.then((file) => this.textoDeArquivo(file)).then((texto) => {
      if (s.boletoToken !== token) return;
      const linha = this.linhaBoleto(texto);
      if (!linha) return;
      s.linhaBoleto = linha;
      if (!s.formaManual || s.formaManual === "Boleto" || s.pag.forma === "Boleto") {
        s.pag.forma = "Boleto";
        s.pag.detalhe = linha;
      }
      this.render();
    }).catch((e) => console.warn("[Enviar nota] linha do boleto", e));
  },

  temBoleto() {
    const s = this.state;
    return s.anexos.some((a) => a.tipo === "boleto") || !!s.linhaBoleto;
  },

  /** Boleto no envio manda a forma. Sem boleto, usa a forma cadastrada no credor. */
  sugerirForma() {
    const s = this.state;
    const pag = s.pag;
    if (this.temBoleto()) {
      if (pag.forma !== "Boleto") pag.detalhe = "";
      pag.forma = "Boleto";
      if (s.linhaBoleto && !String(pag.detalhe || "").trim()) pag.detalhe = s.linhaBoleto;
      return;
    }
    if (s.formaManual) {
      pag.forma = s.formaManual;
      this.ajustarDestino();
      return;
    }
    const forma = this.formaDoCredor();
    if (pag.forma !== forma) pag.detalhe = "";
    pag.forma = forma;
    this.ajustarDestino();
  },

  /* ---------- anexos ---------- */
  adicionarArquivos(input) {
    const s = this.state;
    const files = Array.from((input && input.files) || []);
    const grandes = files.filter((f) => f.size > FilaNotasFiscais.MAX_MB * 1024 * 1024);
    if (grandes.length) alert(`Arquivo acima de ${FilaNotasFiscais.MAX_MB} MB não entra: ${grandes.map((f) => f.name).join(", ")}`);
    files.filter((f) => f.size <= FilaNotasFiscais.MAX_MB * 1024 * 1024).forEach((file) => {
      if (s.anexos.some((a) => a.file && a.file.name === file.name && a.file.size === file.size)) return;
      const temNota = s.anexos.some((a) => a.tipo === "nota");
      const ehNota = /\.(pdf|xml)$/i.test(file.name) || /^image\//.test(file.type);
      const tipo = /boleto/i.test(file.name) ? "boleto" : (!temNota && ehNota ? "nota" : "outro");
      s.anexos.push({ file, nome: file.name, tipo, size: file.size, contentType: file.type });
    });
    if (input) input.value = "";
    this.agendarLeitura();
    this.sugerirForma();
    this.lerBoletoAnexo();
    if (s.previewIdx < 0) {
      const i = s.anexos.findIndex((a) => a.tipo === "nota");
      if (i >= 0) { this.verAnexo(i); return; }
    }
    this.render();
  },

  setTipoAnexo(i, tipo) {
    const a = this.state.anexos[i];
    if (a) a.tipo = tipo;
    this.agendarLeitura();
    this.sugerirForma();
    this.lerBoletoAnexo();
    this.render();
  },

  removerAnexo(i) {
    const s = this.state;
    s.anexos.splice(i, 1);
    if (s.previewIdx === i) { s.previewIdx = -1; s.preview = ""; }
    else if (s.previewIdx > i) s.previewIdx--;
    this.agendarLeitura();
    this.sugerirForma();
    this.lerBoletoAnexo();
    this.render();
  },

  /** Lê número, valor e boleto do arquivo da nota. Os campos não aparecem na tela. */
  agendarLeitura() {
    const s = this.state;
    const token = (s.leituraToken || 0) + 1;
    s.leituraToken = token;
    const a = s.anexos.find((x) => x.tipo === "nota");
    if (!a) {
      s.lendoNota = "";
      s.leituraErro = "";
      if (!s.anexos.some((x) => x.tipo === "boleto")) s.linhaBoleto = "";
      s.fiscal = null;
      if (!s.editandoId) {
        s.numeroNota = "";
        s.serieNota = "";
        s.valorNota = "";
      }
      return;
    }
    s.lendoNota = "Lendo o número e o valor da nota…";
    s.leituraErro = "";
    const pronto = a.file ? Promise.resolve(a.file) : FilaNotasFiscais.baixar(a);
    pronto.then((file) => this.lerNota(file, token)).catch((e) => {
      if (s.leituraToken !== token) return;
      s.lendoNota = "";
      if (!s.numeroNota) s.leituraErro = `Não consegui ler a nota: ${(e && e.message) || e}`;
      this.render();
    });
  },

  async lerNota(file, token) {
    const s = this.state;
    try {
      const buf = await file.arrayBuffer();
      if (s.leituraToken !== token) return;
      const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 64))).trim();
      let nota = null;
      let texto = "";
      if (/^\uFEFF?</.test(inicio) || /\.xml$/i.test(file.name)) {
        const xml = new TextDecoder("utf-8").decode(buf);
        nota = InserirNotaApp.lerXml(xml);
        texto = xml;
      } else if (/^%PDF/.test(inicio)) {
        const itens = window.NotaFiscalCheck ? await NotaFiscalCheck.itensDoPdf(buf) : [];
        if (s.leituraToken !== token) return;
        texto = itens.map((i) => i.s).join("\n");
        if (itens.length >= 20) nota = InserirNotaApp.extrair(InserirNotaApp.celulasPdf(itens));
        else {
          const canvas = await InserirNotaApp.pdfParaCanvas(buf);
          if (s.leituraToken !== token) return;
          const celulas = await this.ocr(canvas, token);
          if (s.leituraToken !== token) return;
          texto = texto || celulas.map((c) => c.s).join("\n");
          nota = InserirNotaApp.extrair(celulas);
        }
      } else if (/^image\//.test(file.type)) {
        const canvas = await InserirNotaApp.imagemParaCanvas(file);
        if (s.leituraToken !== token) return;
        const celulas = await this.ocr(canvas, token);
        if (s.leituraToken !== token) return;
        texto = celulas.map((c) => c.s).join("\n");
        nota = InserirNotaApp.extrair(celulas);
      } else {
        throw new Error("formato não reconhecido; use PDF, XML ou imagem");
      }
      if (s.leituraToken !== token) return;
      s.numeroNota = (nota && nota.numero) || "";
      s.serieNota = (nota && nota.serie) || "";
      s.valorNota = nota && nota.valor != null ? nota.valor : "";
      s.linhaBoleto = this.linhaBoleto(texto);
      s.leituraErro = s.numeroNota ? "" : "Não consegui ler o número da nota no arquivo.";
      s._fonteNota = { xml: /^\s*</.test(texto) ? texto : "", texto, buf, nome: file.name || "", nota };
      s.fiscal = { carregando: true, erros: [], avisos: [], oks: [], infos: [], itens: [] };
    } catch (e) {
      if (s.leituraToken !== token) return;
      s.linhaBoleto = "";
      if (!s.numeroNota) s.leituraErro = `Não consegui ler a nota: ${(e && e.message) || e}`;
    }
    s.lendoNota = "";
    this.sugerirForma();
    this.lerBoletoAnexo();
    this.render();
    if (s._fonteNota) this.analisarFiscal(token);
  },

  async cnpjEmpresa() {
    const id = this.state.empresaCc;
    if (!id) return { cnpj: "", nome: "" };
    const c = await InserirNotaApp.get(`/companies/${encodeURIComponent(id)}`).catch(() => null);
    return {
      cnpj: InserirNotaApp.digits(c && (c.cnpj || c.cpfCnpj || c.documentNumber || "")),
      nome: (c && (c.tradeName || c.name)) || this.nomeEmpresa(id)
    };
  },

  async itensDoPedido() {
    const id = this.state.pedidoApi;
    if (!id) return [];
    const res = await InserirNotaApp.get(`/purchase-orders/${id}/items?limit=200`).catch(() => null);
    return InserirNotaApp.lista(res).map((it) => {
      const qtd = Number(it.quantity) || 0;
      const unit = Number(it.netPrice) || Number(it.unitPrice) || 0;
      const valor = Number(it.totalAmount != null ? it.totalAmount : it.totalPrice) || Math.round(unit * qtd * 100) / 100;
      return {
        descricao: [it.resourceDescription, it.detailDescription].filter(Boolean).join(" ") || `Item ${it.itemNumber}`,
        qtd, valor
      };
    });
  },

  async analisarFiscal(token) {
    const s = this.state;
    const fonte = s._fonteNota;
    if (!fonte || !window.NotaFiscalCheck) return;
    s.fiscal = { carregando: true, erros: [], avisos: [], oks: [], infos: [], itens: [] };
    this.pintarFiscal();
    try {
      const [itensPedido, empresa] = await Promise.all([this.itensDoPedido(), this.cnpjEmpresa()]);
      if (s.leituraToken !== token) return;
      s.fiscal = await NotaFiscalCheck.conferirEnvio({
        xml: fonte.xml, texto: fonte.texto, buf: fonte.buf, nome: fonte.nome, nota: fonte.nota,
        credorDoc: s.credor && s.credor.doc, empresaCnpj: empresa.cnpj, empresaNome: empresa.nome, itensPedido
      });
    } catch (e) {
      if (s.leituraToken !== token) return;
      s.fiscal = { carregando: false, nivel: "aviso", erros: [], oks: [], infos: [], itens: [], avisos: [`Não consegui concluir a análise fiscal: ${(e && e.message) || e}`] };
    }
    if (s.leituraToken === token) this.render();
  },

  pintarFiscal() {
    const el = document.getElementById("env-fiscal");
    if (!el || !window.NotaFiscalCheck) return;
    el.innerHTML = NotaFiscalCheck.painelEnvio(this.state.fiscal);
  },

  async ocr(canvas, token) {
    const s = this.state;
    s.lendoNota = "Carregando o leitor de imagem…";
    this.pintarConferencia();
    await InserirNotaApp.carregarTesseract();
    const worker = await Tesseract.createWorker("por", 1, {
      logger: (m) => {
        if (s.leituraToken !== token) return;
        if (m.status === "recognizing text" && m.progress != null) {
          s.lendoNota = `Lendo a nota… ${Math.round(m.progress * 100)}%`;
          this.pintarConferencia();
        }
      }
    });
    try {
      const { data } = await worker.recognize(canvas);
      const E = canvas._escala || 1;
      const celulas = [];
      (data.lines || []).forEach((l) => {
        const ws = (l.words || []).filter((w) => String(w.text || "").trim());
        if (!ws.length) return;
        const h = Math.max(...ws.map((w) => w.bbox.y1 - w.bbox.y0));
        let cur = null;
        ws.forEach((w) => {
          if (cur && w.bbox.x0 - cur.x1 * E < h * 1.1) {
            cur.s += " " + w.text;
            cur.x1 = w.bbox.x1 / E;
          } else {
            cur = { s: w.text, x0: w.bbox.x0 / E, x1: w.bbox.x1 / E, y: l.bbox.y0 / E };
            celulas.push(cur);
          }
        });
      });
      return celulas;
    } finally {
      await worker.terminate();
    }
  },

  mesmoNumero(a, b) {
    const n = (v) => String(v || "").replace(/\D/g, "").replace(/^0+/, "");
    const na = n(a);
    const nb = n(b);
    return !!na && na === nb;
  },

  docCredor(c) {
    return InserirNotaApp.digits((c && (c.doc || c.cnpj || c.cpf)) || "");
  },

  /** Mesma nota (número + fornecedor) já enviada pelo CRM, mesmo que em outro pedido. */
  duplicadaNaFila() {
    const s = this.state;
    if (!s.numeroNota) return null;
    const doc = this.docCredor(s.credor);
    const idCred = s.credor && String(s.credor.id || "");
    const serie = String(s.serieNota || "").trim().toUpperCase();
    return (s.lista || []).find((x) => {
      if (!x || x.id === s.editandoId || x.status === "cancelada") return false;
      if (!this.mesmoNumero(x.numeroNota, s.numeroNota)) return false;
      const serieX = String(x.serieNota || "").trim().toUpperCase();
      if (serie && serieX && serie !== serieX) return false;
      const docX = this.docCredor(x.fornecedor);
      if (doc && docX) return doc === docX;
      const idX = x.fornecedor && String(x.fornecedor.id || "");
      return !!(idCred && idX && idCred === idX);
    }) || null;
  },

  async verAnexo(i) {
    const s = this.state;
    const a = s.anexos[i];
    if (!a) return;
    s.previewIdx = i;
    s.preview = "";
    s.previewLendo = "Abrindo o anexo…";
    this.render();
    try {
      const file = a.file || await FilaNotasFiscais.baixar(a);
      const buf = await file.arrayBuffer();
      const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 8)));
      let canvas = null;
      if (/^%PDF/.test(inicio)) canvas = await InserirNotaApp.pdfParaCanvas(buf);
      else if (/^image\//.test(file.type)) canvas = await InserirNotaApp.imagemParaCanvas(file);
      if (s.previewIdx !== i) return;
      s.preview = canvas ? canvas.toDataURL("image/jpeg", 0.85) : "";
      s.previewLendo = canvas ? "" : "Este anexo não tem visualização (XML ou outro formato).";
    } catch (e) {
      if (s.previewIdx === i) s.previewLendo = `Não consegui abrir o anexo: ${(e && e.message) || e}`;
    }
    this.render();
  },

  setPag(campo, valor) {
    this.state.pag[campo] = String(valor == null ? "" : valor);
    this.pintarConferencia();
  },

  setCampo(campo, valor) {
    this.state[campo] = String(valor == null ? "" : valor);
    this.pintarConferencia();
  },

  /* ---------- conferência ---------- */
  conferir() {
    const s = this.state;
    const erros = [];
    const avisos = [];
    const oks = [];
    const p = s.pedido;
    if (!p) return { erros: ["Busque o pedido de compra."], avisos, oks };
    const status = String(p.status || "").toUpperCase();
    if (status === "CANCELED") erros.push("O pedido está cancelado.");
    if (status === "FULLY_DELIVERED") erros.push("O pedido já foi totalmente atendido: não há saldo para lançar outra nota.");
    if (p.authorized === false) avisos.push("O pedido ainda não foi autorizado no Sienge: o fiscal só consegue lançar depois da autorização.");

    const notas = s.anexos.filter((a) => a.tipo === "nota");
    if (!notas.length) erros.push("Anexe a nota fiscal (PDF, XML ou imagem) e marque o tipo \"Nota fiscal\".");
    else oks.push(`${notas.length === 1 ? "Nota fiscal anexada" : `${notas.length} arquivos de nota anexados`}${s.anexos.length > notas.length ? ` + ${s.anexos.length - notas.length} outro(s) anexo(s)` : ""}.`);
    if (s.lendoNota) erros.push(s.lendoNota);
    else if (notas.length && s.leituraErro) erros.push(s.leituraErro);
    else if (notas.length && s.numeroNota) {
      const valorLido = this.num(s.valorNota);
      oks.push(`Nota ${s.numeroNota}${s.serieNota ? "/" + s.serieNota : ""} lida do arquivo${valorLido != null ? `, no valor de ${this.money(valorLido)}` : ""}.`);
    }

    const dup = this.duplicadaNaFila();
    if (dup) {
      const st = (FilaNotasFiscais.STATUS[dup.status] || {}).rot || dup.status || "enviada";
      const quando = dup.criadoEm ? new Date(dup.criadoEm).toLocaleDateString("pt-BR") : "";
      erros.push(`A NF ${s.numeroNota} deste fornecedor já está na base de notas enviadas (pedido ${dup.pedido || "—"}, ${st}${quando ? " em " + quando : ""}${dup.criadoPor ? " por " + dup.criadoPor : ""}). A mesma nota não pode ir ao fiscal de novo, mesmo em outro pedido.`);
    }

    const pag = s.pag;
    if (!pag.data) erros.push("Confirme a data de pagamento.");
    else if (pag.data < this.hojeIso()) avisos.push(`A data de pagamento (${this.dataBr(pag.data)}) já passou.`);
    if (!pag.forma) erros.push(s.pedido && !this.temBoleto() ? "Escolha a forma de pagamento. O cadastro do credor não informa uma forma padrão." : "Escolha a forma de pagamento.");
    else if (this.temBoleto()) oks.push(s.anexos.some((a) => a.tipo === "boleto") ? "Boleto anexado: pagamento em boleto." : "Boleto identificado na nota: pagamento em boleto.");
    else if (!s.formaManual && pag.forma === this.formaDoCredor()) oks.push(`Forma de pagamento do cadastro do credor: ${pag.forma}.`);
    if (pag.forma === "Boleto" && !this.temBoleto()) avisos.push("Forma de pagamento boleto sem boleto anexado: anexe o boleto se ele não estiver no mesmo arquivo da nota.");
    const ops = this.destinos(pag.forma);
    if (ops) {
      const oque = pag.forma === "PIX" ? "chave PIX" : "conta bancária";
      if (!ops.length) erros.push(`O credor não tem ${oque} cadastrada no Sienge${s.banco.erro ? ` (não consegui consultar: ${s.banco.erro})` : ""}. Cadastre no credor ou escolha outra forma de pagamento.`);
      else if (!pag.detalhe) erros.push(`Escolha a ${oque} do cadastro do credor.`);
      else oks.push(`${pag.forma === "PIX" ? "Chave PIX" : "Conta"} do cadastro do credor: ${pag.detalhe}.`);
    }

    const prev = s.previsao;
    if (prev && prev.parcelas.length && pag.data && !prev.parcelas.some((x) => x.vencimento === pag.data)) {
      avisos.push(`A previsão financeira do pedido vence em ${prev.parcelas.map((x) => this.dataBr(x.vencimento)).join(", ")}; o pagamento informado é ${this.dataBr(pag.data)}.`);
    }
    const valor = this.num(s.valorNota);
    if (valor != null && prev && prev.valor != null && Math.abs(prev.valor - valor) > 0.05) {
      avisos.push(`O valor da nota (${this.money(valor)}) é diferente da previsão financeira do pedido (${this.money(prev.valor)}).`);
    }
    const fiscal = s.fiscal;
    if (fiscal && fiscal.carregando) erros.push("Ainda estou cruzando a nota com o pedido, o CNAE e o endereço da empresa.");
    else if (fiscal) {
      (fiscal.erros || []).forEach((t) => erros.push(t));
      (fiscal.avisos || []).forEach((t) => avisos.push(t));
      (fiscal.infos || []).forEach((t) => avisos.push(t));
      (fiscal.oks || []).forEach((t) => oks.push(t));
    }
    const outras = s.abertas.filter((x) => !dup || x.id !== dup.id);
    if (outras.length) avisos.push(`Este pedido já tem ${outras.length} nota(s) na fila do fiscal (${outras.map((x) => `${x.numeroNota ? "NF " + x.numeroNota + " · " : ""}enviada por ${x.criadoPor || "?"} em ${new Date(x.criadoEm).toLocaleDateString("pt-BR")}`).join("; ")}).`);
    return { erros, avisos, oks };
  },

  /* ---------- envio ---------- */
  async enviar() {
    const s = this.state;
    if (!this.podeEditar()) { alert("Sem permissão para enviar notas ao fiscal."); return; }
    try {
      s.lista = await FilaNotasFiscais.listar();
      s.listaCarregada = true;
    } catch (e) {
      alert("Não consegui consultar a base de notas enviadas. O envio não foi feito.");
      return;
    }
    const c = this.conferir();
    if (c.erros.length) { this.render(); alert(c.erros.join("\n")); return; }
    const nf = s.numeroNota ? ` NF ${s.numeroNota}${s.serieNota ? "/" + s.serieNota : ""}` : "";
    const msg = `Enviar ao fiscal a nota${nf} do pedido ${s.pedidoNome} (${s.credor ? s.credor.nome : ""}), com pagamento em ${this.dataBr(s.pag.data)} por ${s.pag.forma}?`
      + (c.avisos.length ? `\n\nAtenção:\n• ${c.avisos.join("\n• ")}` : "");
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;
    const u = FilaNotasFiscais.usuario();
    const id = s.editandoId || FilaNotasFiscais.novoId();
    s.enviando = "Subindo os anexos…";
    this.render();
    try {
      const anexos = await FilaNotasFiscais.subirAnexos(id, s.anexos);
      s.enviando = "Enviando para a fila do fiscal…";
      this.render();
      const antigo = s.editandoId ? (s.lista.find((x) => x.id === id) || { id }) : { id };
      const dados = {
        status: "pendente",
        pedido: s.pedidoNome, pedidoApi: s.pedidoApi,
        fornecedor: s.credor,
        empresa: s.empresaCc || "", cc: s.cc ? { id: s.cc.id, nome: s.cc.nome || "" } : null,
        valorPedido: s.pedido.totalAmount != null ? Number(s.pedido.totalAmount) : null,
        previsao: s.previsao,
        numeroNota: String(s.numeroNota || "").trim(),
        serieNota: String(s.serieNota || "").trim(),
        valorNota: this.num(s.valorNota),
        pagamento: { data: s.pag.data, forma: s.pag.forma, detalhe: String(s.pag.detalhe || "").trim() },
        observacao: String(s.obs || "").trim(),
        anexos,
        motivoDevolucao: "", assumidoPor: "", assumidoPorEmail: ""
      };
      if (!s.editandoId) Object.assign(dados, { criadoEm: Date.now(), criadoPor: u.nome, criadoPorEmail: u.email, criadoPorSienge: u.sienge });
      await FilaNotasFiscais.atualizar(Object.assign(antigo, s.editandoId ? {} : { historico: [] }), dados, s.editandoId ? "reenviada" : "enviada");
      this.auditar(`Nota do pedido ${s.pedidoNome} ${s.editandoId ? "reenviada" : "enviada"} ao fiscal · pagamento ${this.dataBr(s.pag.data)} ${s.pag.forma}`, { id, pedido: s.pedidoNome, anexos: anexos.length });
      const feito = `Nota do pedido ${s.pedidoNome} ${s.editandoId ? "reenviada" : "enviada"} ao fiscal. Acompanhe em "Minhas notas enviadas".`;
      this.state = this.novoEstado();
      this.state.feito = feito;
      this.state.listaCarregada = false;
    } catch (e) {
      s.enviando = "";
      alert(`Não consegui enviar a nota ao fiscal: ${(e && e.message) || e}`);
    }
    this.render();
  },

  auditar(summary, details) {
    if (!window.AuditService || typeof AuditService.logEvent !== "function") return;
    const u = FilaNotasFiscais.usuario();
    try {
      AuditService.logEvent({ module: "Fiscal", action: "Enviar nota", status: "ok", summary, user: u.nome, userEmail: u.email, details: details || {} });
    } catch (e) {}
  },

  /* ---------- minhas notas enviadas ---------- */
  async carregarLista(forcar) {
    const s = this.state;
    if (s.listaCarregando || (s.listaCarregada && !forcar)) return;
    s.listaCarregando = true;
    s.listaErro = "";
    this.render();
    try {
      s.lista = await FilaNotasFiscais.listar();
      s.listaCarregada = true;
    } catch (e) {
      s.listaErro = `Não consegui carregar os envios: ${(e && e.message) || e}`;
    }
    s.listaCarregando = false;
    this.render();
  },

  setTodos(v) {
    this.state.todos = !!v;
    this.render();
  },

  setVerLancadas(v) {
    this.state.verLancadas = !!v;
    this.render();
  },

  async cancelar(id) {
    const item = this.state.lista.find((x) => x.id === id);
    if (!item || item.status !== "pendente") return;
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(`Cancelar o envio da nota do pedido ${item.pedido}? Ela sai da fila do fiscal.`) : confirm("Cancelar o envio?");
    if (!ok) return;
    try {
      await FilaNotasFiscais.atualizar(item, { status: "cancelada" }, "cancelada");
      this.auditar(`Envio da nota do pedido ${item.pedido} cancelado`, { id });
    } catch (e) {
      alert(`Não consegui cancelar: ${(e && e.message) || e}`);
    }
    this.render();
  },

  async excluir(id) {
    const item = this.state.lista.find((x) => x.id === id);
    if (!item || item.status === "lancada") return;
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm(`Excluir o envio da nota do pedido ${item.pedido}? Ele sai da fila e não dá para desfazer.`)
      : confirm("Excluir o envio?");
    if (!ok) return;
    try {
      await FilaNotasFiscais.excluir(id);
      this.state.lista = this.state.lista.filter((x) => x.id !== id);
      this.auditar(`Envio da nota do pedido ${item.pedido} excluído`, { id });
    } catch (e) {
      alert(`Não consegui excluir: ${(e && e.message) || e}`);
    }
    this.render();
  },

  /** Devolvida pelo fiscal: carrega no formulário para corrigir e reenviar o mesmo envio. */
  corrigir(id) {
    const item = this.state.lista.find((x) => x.id === id);
    if (!item) return;
    const s = this.novoEstado();
    Object.assign(s, {
      aba: "enviar", editandoId: id, pedidoId: item.pedido,
      anexos: (item.anexos || []).map((a) => Object.assign({}, a)),
      pag: Object.assign({ data: "", forma: "", detalhe: "" }, item.pagamento || {}),
      numeroNota: item.numeroNota || "",
      serieNota: item.serieNota || "",
      formaManual: (item.pagamento && item.pagamento.forma) || "",
      valorNota: item.valorNota != null ? item.valorNota : "",
      obs: item.observacao || ""
    });
    this.state = s;
    this.render();
    this.agendarLeitura();
    this.buscarPedido();
    const i = s.anexos.findIndex((a) => a.tipo === "nota");
    if (i >= 0) this.verAnexo(i);
  },

  /* ---------- tela ---------- */
  pintarConferencia() {
    const el = document.getElementById("env-conf");
    if (!el) return;
    el.innerHTML = this.conferenciaHtml();
    const btn = document.getElementById("env-enviar");
    if (btn) btn.disabled = !!this.state.enviando || this.conferir().erros.length > 0 || !this.podeEditar();
  },

  conferenciaHtml() {
    const c = this.conferir();
    const linha = (t, cls, ic) => `<li class="${cls}"><span>${ic}</span>${this.esc(t)}</li>`;
    return `<ul class="inf-check">${c.erros.map((t) => linha(t, "is-erro", "✗")).join("")}${c.avisos.map((t) => linha(t, "is-aviso", "!")).join("")}${c.oks.map((t) => linha(t, "is-ok", "✓")).join("")}</ul>`;
  },

  pedidoHtml() {
    const s = this.state;
    const p = s.pedido;
    if (!p) return s.erro ? `<p class="inf-erro">${this.esc(s.erro)}</p>` : `<p class="inf-muted">Informe o número do pedido de compra da nota.</p>`;
    const sit = { PENDING: "Pendente", PARTIALLY_DELIVERED: "Parcialmente entregue", FULLY_DELIVERED: "Totalmente atendido", CANCELED: "Cancelado" }[String(p.status || "").toUpperCase()] || p.status || "—";
    const emp = s.empresaCc ? `empresa ${this.esc(s.empresaCc)}${this.nomeEmpresa(s.empresaCc) ? " - " + this.esc(this.nomeEmpresa(s.empresaCc)) : ""}` : "empresa não identificada";
    return `<div class="inf-grid">
      <div><label>Fornecedor</label><b>${this.esc(s.credor ? s.credor.nome : p.supplierId)}</b><small>${this.esc(s.credor && s.credor.doc ? InserirNotaApp.docFmt(s.credor.doc) : `código ${p.supplierId}`)}</small></div>
      <div><label>Centro de custo</label><b>${this.esc((s.cc && s.cc.id) || "—")}${s.cc && s.cc.nome ? ` - ${this.esc(s.cc.nome)}` : ""}</b><small>${emp}</small></div>
      <div><label>Pedido ${this.esc(s.pedidoNome)}</label><b>${this.dataBr(p.date)}</b><small>${this.esc(p.paymentCondition || "")}</small></div>
      <div><label>Situação</label><b>${this.esc(sit)}</b><small>${p.authorized ? "autorizado" : (p.authorized === false ? "não autorizado" : "")}</small></div>
      <div><label>Total do pedido</label><b>${p.totalAmount != null ? this.money(p.totalAmount) : "—"}</b></div>
    </div>
    ${InserirNotaApp.previsaoHtml(s.previsao)}`;
  },

  anexosHtml() {
    const s = this.state;
    const tipos = FilaNotasFiscais.TIPOS_ANEXO;
    const linhas = s.anexos.map((a, i) => `<li class="${s.previewIdx === i ? "is-sel" : ""}">
        <i data-lucide="${a.tipo === "boleto" ? "barcode" : (a.tipo === "nota" ? "file-text" : "paperclip")}"></i>
        <button type="button" class="env-anexo-nome" onclick="EnviarNotaApp.verAnexo(${i})" title="Ver ao lado">${this.esc(a.nome)}</button>
        <small>${a.size ? `${(a.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : ""}${a.file ? "" : " · já enviado"}</small>
        <select onchange="EnviarNotaApp.setTipoAnexo(${i}, this.value)">${Object.keys(tipos).map((k) => `<option value="${k}" ${a.tipo === k ? "selected" : ""}>${tipos[k]}</option>`).join("")}</select>
        <button type="button" class="env-x" onclick="EnviarNotaApp.removerAnexo(${i})" title="Remover"><i data-lucide="x"></i></button>
      </li>`).join("");
    return `<label class="inf-file"><i data-lucide="paperclip"></i><span>Adicionar anexos (nota fiscal, boleto e outros) · PDF, XML ou imagem</span>
        <input type="file" multiple accept=".pdf,.xml,image/*" onchange="EnviarNotaApp.adicionarArquivos(this)"></label>
      ${linhas ? `<ul class="env-anexos">${linhas}</ul>` : ""}`;
  },

  pagamentoHtml() {
    const s = this.state;
    const pag = s.pag;
    const formas = FilaNotasFiscais.FORMAS;
    const prev = s.previsao;
    const sug = prev && prev.parcelas.length ? `Previsão financeira do pedido: ${prev.parcelas.map((x) => `${this.dataBr(x.vencimento)} · ${this.money(x.valor)}`).join(" | ")}` : "";
    const ops = this.destinos(pag.forma);
    let destino;
    if (ops) {
      const rot = pag.forma === "PIX" ? "Chave PIX do credor (cadastro no Sienge)" : "Conta do credor (cadastro no Sienge)";
      destino = !s.pedido ? `<input disabled placeholder="Busque o pedido para trazer o cadastro do credor">`
        : (ops.length ? `<select onchange="EnviarNotaApp.setPag('detalhe', this.value)"><option value="">Escolha…</option>${ops.map((o) => `<option value="${this.esc(o.txt)}" ${pag.detalhe === o.txt ? "selected" : ""}>${this.esc(o.txt)}${o.padrao ? " (padrão)" : ""}</option>`).join("")}</select>`
          : `<input disabled class="env-sem-cad" value="Nenhuma ${pag.forma === "PIX" ? "chave PIX" : "conta"} cadastrada no credor">`);
      destino = `<label>${rot}</label>${destino}`;
    } else {
      const rot = pag.forma === "Boleto" ? "Linha digitável" : "Detalhe do pagamento";
      destino = `<label>${rot}</label><input value="${this.esc(pag.detalhe)}" placeholder="${pag.forma === "Boleto" ? "Preenchida pelo boleto anexado" : ""}" oninput="EnviarNotaApp.setPag('detalhe', this.value)">`;
    }
    return `<div class="inf-form">
        <div><label>Data de pagamento</label><input type="date" value="${this.esc(pag.data)}" onchange="EnviarNotaApp.setPag('data', this.value)"></div>
        <div><label>Forma de pagamento</label><select onchange="EnviarNotaApp.setForma(this.value)"><option value="">Escolha…</option>${formas.map((f) => `<option ${pag.forma === f ? "selected" : ""}>${this.esc(f)}</option>`).join("")}</select></div>
        <div class="inf-span2">${destino}</div>
        <div class="inf-span2"><label>Observação para o fiscal</label><input value="${this.esc(s.obs)}" oninput="EnviarNotaApp.setCampo('obs', this.value)"></div>
      </div>
      ${sug ? `<p class="inf-muted">${this.esc(sug)}</p>` : ""}`;
  },

  enviarHtml() {
    const s = this.state;
    const pode = this.podeEditar();
    const bloqueado = !!s.enviando || this.conferir().erros.length > 0 || !pode;
    const prevAnexo = s.anexos[s.previewIdx];
    return `<div class="inf-wrap">
        <div>
          ${s.feito ? `<div class="inf-resultado is-ok"><b>${this.esc(s.feito)}</b></div>` : ""}
          ${this.devolvidasHtml()}
          ${s.editandoId ? `<div class="inf-resultado is-erro"><b>Corrigindo envio devolvido pelo fiscal</b><p>Ajuste o que foi pedido e clique em <b>Reenviar ao fiscal</b>.</p></div>` : ""}
          <div class="inf-card">
            <h3><i data-lucide="clipboard-list"></i> Pedido de compra</h3>
            <div class="inf-busca">
              <input id="env-pedido" placeholder="Nº do pedido (ex.: 110540 ou 123/26)" value="${this.esc(s.pedidoId)}" onkeydown="if(event.key==='Enter')EnviarNotaApp.buscarPedido()">
              <button type="button" class="btn btn-primary inf-btn-sm" style="height:38px;" onclick="EnviarNotaApp.buscarPedido()" ${s.carregando ? "disabled" : ""}><i data-lucide="search"></i> Buscar pedido</button>
              ${s.carregando ? `<span class="inf-muted"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> ${this.esc(s.carregando)}</span>` : ""}
            </div>
            ${this.pedidoHtml()}
          </div>
          <div class="inf-card">
            <h3><i data-lucide="paperclip"></i> Anexos</h3>
            ${this.anexosHtml()}
          </div>
          <div class="inf-card">
            <h3><i data-lucide="calendar-check"></i> Pagamento</h3>
            ${this.pagamentoHtml()}
          </div>
          <div class="inf-card">
            <h3><i data-lucide="list-checks"></i> Conferência</h3>
            <div id="env-conf">${this.conferenciaHtml()}</div>
            <div id="env-fiscal">${window.NotaFiscalCheck ? NotaFiscalCheck.painelEnvio(s.fiscal) : ""}</div>
            <div class="inf-acoes">
              <button type="button" class="btn btn-outline" onclick="EnviarNotaApp.limpar()" ${s.enviando ? "disabled" : ""}><i data-lucide="rotate-ccw"></i> ${s.editandoId ? "Desistir da correção" : "Limpar"}</button>
              <button type="button" id="env-enviar" class="btn btn-primary" onclick="EnviarNotaApp.enviar()" ${bloqueado ? "disabled" : ""}
                title="${pode ? "" : "Sem permissão de edição em Fiscal › Enviar nota"}">
                ${s.enviando ? `<span class="btn-spin"></span> ${this.esc(s.enviando)}` : `<i data-lucide="send"></i> ${s.editandoId ? "Reenviar ao fiscal" : "Enviar ao fiscal"}`}</button>
            </div>
          </div>
        </div>
        <div class="inf-preview">
          <div class="inf-card">
            <h3><i data-lucide="image"></i> ${prevAnexo ? this.esc(prevAnexo.nome) : "Anexo"}</h3>
            ${s.previewLendo ? `<p class="inf-muted">${s.previewLendo.startsWith("Abrindo") ? `<span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> ` : ""}${this.esc(s.previewLendo)}</p>` : ""}
            ${s.preview ? `<div class="inf-lupa-area" onmousemove="InserirNotaApp.lupa(event)" onmouseleave="InserirNotaApp.lupa(event, true)" onwheel="InserirNotaApp.zoomLupa(event)">
                <img src="${s.preview}" alt="Anexo" draggable="false"><div class="inf-lupa"></div></div>
              <p class="inf-lupa-dica"><i data-lucide="zoom-in"></i> Passe o mouse para ampliar · role a roda do mouse sobre a nota para mudar o zoom: <strong class="inf-lupa-zoom">${(InserirNotaApp._zoom || 2.5).toLocaleString("pt-BR")}x</strong></p>`
              : (s.previewLendo ? "" : `<p class="inf-muted">Clique no nome de um anexo para ver aqui.</p>`)}
          </div>
        </div>
      </div>`;
  },

  devolvidasHtml() {
    const s = this.state;
    if (s.editandoId) return "";
    const u = FilaNotasFiscais.usuario();
    const dev = s.lista.filter((x) => x.status === "devolvida" && x.criadoPorEmail === u.email);
    if (!dev.length) return "";
    return `<div class="inf-resultado is-erro"><b>${dev.length === 1 ? "1 nota devolvida" : `${dev.length} notas devolvidas`} pelo fiscal para corrigir</b>
      <ul>${dev.slice(0, 5).map((x) => `<li>Pedido ${this.esc(x.pedido)}: ${this.esc(x.motivoDevolucao || "sem motivo")}</li>`).join("")}</ul>
      <p><a href="javascript:void(0)" onclick="EnviarNotaApp.setAba('minhas')">Ver em Minhas notas enviadas</a></p></div>`;
  },

  limpar() {
    const aba = this.state.aba;
    this.state = this.novoEstado();
    this.state.aba = aba;
    this.render();
  },

  minhasHtml() {
    const s = this.state;
    const u = FilaNotasFiscais.usuario();
    const minhas = s.todos ? s.lista : s.lista.filter((x) => (u.email && x.criadoPorEmail === u.email) || (!u.email && x.criadoPor === u.nome));
    const lista = s.verLancadas ? minhas : minhas.filter((x) => x.status !== "lancada");
    const quem = (nome, email, gravado) => FilaNotasFiscais.usuarioSienge(nome, email, gravado);
    const esc = (v) => this.esc(v);
    const corpo = s.listaCarregando ? `<p class="fnf-vazio"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> Carregando…</p>`
      : (s.listaErro ? `<p class="inf-erro">${esc(s.listaErro)}</p>`
        : (!lista.length ? `<p class="fnf-vazio">Nenhuma nota enviada${s.todos ? "" : " por você"}.</p>`
          : `<table class="fnf-tab"><thead><tr><th>Enviada em</th><th>Pedido</th><th>Fornecedor</th><th>Pagamento</th><th>Anexos</th><th>Situação</th><th></th></tr></thead><tbody>
            ${lista.map((x) => `<tr class="${x.status === "devolvida" ? "fnf-devolvida" : ""}">
              <td>${new Date(x.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}<small>${esc(quem(x.criadoPor, x.criadoPorEmail, x.criadoPorSienge))}</small></td>
              <td><b>${esc(x.pedido)}</b>${x.numeroNota ? `<small>NF ${esc(x.numeroNota)}</small>` : ""}</td>
              <td>${esc(x.fornecedor ? x.fornecedor.nome : "")}${x.valorNota != null ? `<small>${this.money(x.valorNota)}</small>` : ""}</td>
              <td>${esc(FilaNotasFiscais.pagamentoTxt(x, (d) => this.dataBr(d)))}${x.pagamento && x.pagamento.detalhe ? `<small>${esc(x.pagamento.detalhe)}</small>` : ""}</td>
              <td>${FilaNotasFiscais.anexosHtml(x, esc)}</td>
              <td>${FilaNotasFiscais.statusHtml(Object.assign({}, x, { assumidoPor: quem(x.assumidoPor, x.assumidoPorEmail, x.assumidoPorSienge) }), esc)}${x.status === "devolvida" && x.motivoDevolucao ? `<small class="fnf-motivo">${esc(x.motivoDevolucao)}${quem(x.devolvidoPor, x.devolvidoPorEmail, x.devolvidoPorSienge) ? ` · ${esc(quem(x.devolvidoPor, x.devolvidoPorEmail, x.devolvidoPorSienge))}` : ""}</small>` : ""}</td>
              <td class="fnf-acoes">
                ${x.status === "devolvida" && this.podeEditar() ? `<button type="button" class="btn btn-primary" onclick="EnviarNotaApp.corrigir('${esc(x.id)}')"><i data-lucide="pencil"></i> Corrigir</button>` : ""}
                ${x.status === "pendente" && this.podeEditar() ? `<button type="button" class="btn btn-cancel" onclick="EnviarNotaApp.cancelar('${esc(x.id)}')"><i data-lucide="x"></i> Cancelar</button>` : ""}
                ${x.status !== "lancada" && this.podeEditar() ? `<button type="button" class="btn fnf-excluir" onclick="EnviarNotaApp.excluir('${esc(x.id)}')"><i data-lucide="trash-2"></i> Excluir</button>` : ""}
              </td>
            </tr>`).join("")}</tbody></table>`));
    return `<div class="inf-card" style="margin:16px 20px;">
        <div class="fnf-barra">
          <label class="inf-chk"><input type="checkbox" ${s.todos ? "checked" : ""} onchange="EnviarNotaApp.setTodos(this.checked)"> Mostrar envios de todos os operadores</label>
          <label class="moura-switch" title="Desligado, as notas que o fiscal já lançou no Sienge ficam de fora. Ligue para vê-las de novo.">
            <input type="checkbox" ${s.verLancadas ? "checked" : ""} onchange="EnviarNotaApp.setVerLancadas(this.checked)">
            <span class="moura-switch-track" aria-hidden="true"></span>
            <span class="moura-switch-text">Mostrar notas já lançadas no Sienge</span>
          </label>
          <button type="button" class="btn btn-outline inf-btn-sm" onclick="EnviarNotaApp.carregarLista(true)" ${s.listaCarregando ? "disabled" : ""}><i data-lucide="refresh-cw"></i> Atualizar</button>
        </div>
        ${corpo}
      </div>`;
  },

  abasHtml() {
    const s = this.state;
    const u = FilaNotasFiscais.usuario();
    const devolvidas = s.lista.filter((x) => x.status === "devolvida" && x.criadoPorEmail === u.email).length;
    const tabs = [
      { id: "enviar", label: s.editandoId ? "Corrigir envio" : "Enviar nota", icon: "send" },
      { id: "minhas", label: "Minhas notas enviadas", icon: "list-checks", n: devolvidas, titulo: devolvidas ? `${devolvidas} nota(s) devolvida(s) pelo fiscal para corrigir` : "" }
    ];
    return tabs.map((t) => `<button type="button" role="tab" aria-selected="${s.aba === t.id}" class="ml-tab ${s.aba === t.id ? "is-active" : ""}" ${t.titulo ? `title="${this.esc(t.titulo)}"` : ""} onclick="EnviarNotaApp.setAba('${t.id}')"><i data-lucide="${t.icon}"></i> ${t.label}${t.n ? ` <span class="ml-tab-count env-tab-alerta">${t.n}</span>` : ""}</button>`).join("");
  },

  pintarAbas() {
    const el = document.getElementById("env-tabs");
    if (!el) return;
    el.innerHTML = this.abasHtml();
    if (window.lucide) lucide.createIcons();
  },

  render() {
    const root = document.getElementById("enviar-nota-root");
    if (!root) return;
    const s = this.state || (this.state = this.novoEstado());
    root.innerHTML = `
      <style>
        ${InserirNotaApp.css()}
        ${FilaNotasFiscais.css()}
        .env-tabs { margin: 16px 20px 0; }
        .env-anexos { list-style: none; margin: 10px 0 0; padding: 0; }
        .env-anexos li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 6px; font-size: 0.84rem; }
        .env-anexos li.is-sel { border-color: #105436; background: #f0fdf4; }
        .env-anexos li > i { width: 16px; height: 16px; color: #105436; flex: 0 0 16px; }
        .env-anexos small { color: #64748b; white-space: nowrap; }
        .env-anexos select { height: 30px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 6px; font-size: 0.8rem; margin-left: auto; background: #fff; }
        .env-anexo-nome { background: none; border: 0; padding: 0; color: #0f172a; font: inherit; font-weight: 600; cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .env-anexo-nome:hover { color: #105436; text-decoration: underline; }
        .env-x { background: none; border: 0; cursor: pointer; color: #94a3b8; display: inline-flex; padding: 2px; }
        .env-x:hover { color: #b91c1c; }
        .env-x i { width: 16px; height: 16px; }
        .ml-tab .env-tab-alerta, .ml-tab.is-active .env-tab-alerta { background: #fee2e2; color: #b91c1c; }
        .env-sem-cad { color: #b91c1c !important; background: #fef2f2 !important; }
        #enviar-nota-root .fnf-tab .fnf-acoes .btn { height: 28px; min-width: 0; font-size: 0.72rem; padding: 0 8px; }
        #enviar-nota-root .fnf-tab .fnf-acoes .fnf-excluir { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
        #enviar-nota-root .fnf-tab .fnf-acoes .fnf-excluir:hover { background: #fef2f2; }
        .env-voltar { margin: 16px 20px 0; }
        .env-voltar .btn { height: 34px; display: inline-flex; align-items: center; gap: 6px; }
      </style>
      ${window._voltarBudget ? `<div class="env-voltar"><button type="button" class="btn btn-outline" onclick="EnviarNotaApp.voltarBudget()"><i data-lucide="arrow-left"></i> Voltar para o Budget</button></div>` : ""}
      <div class="ml-tabs env-tabs" id="env-tabs" role="tablist">${this.abasHtml()}</div>
      ${s.aba === "minhas" ? this.minhasHtml() : this.enviarHtml()}`;
    if (window.lucide) lucide.createIcons();
  }
};
