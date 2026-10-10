/* Fiscal › Inserir nota: cadastra a nota fiscal de compra no Sienge a partir das entregas de um pedido de compra.
   Sienge: POST /purchase-invoices (cabeçalho) → POST /purchase-invoices/{seq}/items/purchase-orders/delivery-schedules (itens).
   A API não informa impostos, condição de pagamento nem consiste a nota: isso é finalizado no Sienge.
   Leitura da nota: XML, PDF com texto ou, se for imagem, OCR (Tesseract.js carregado só quando preciso). */
window.InserirNotaApp = {
  TESSERACT_URL: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  TOL: 0.05,
  DOCUMENTOS: ["NFS", "NFSE", "NF", "NFE", "RPA", "FAT"],

  state: null,
  aba: "fila",
  fila: { itens: [], carregando: false, carregada: false, erro: "", filtro: "abertas" },

  novoEstado() {
    const hoje = this.hojeIso();
    return {
      pedidoId: "",
      pedido: null,
      credor: null,
      itens: [],
      empresas: [],
      empresaCc: "",
      cc: null,
      previsao: null,
      carregando: "",
      erro: "",
      nota: null,
      lendo: "",
      leituraErro: "",
      preview: "",
      form: { documento: "NFS", numero: "", serie: "", emissao: "", movimento: hoje, companyId: "", notes: "", manterSaldo: true, anexar: true },
      qtdEditada: false,
      duplicada: null,
      enviando: "",
      criada: null,
      resultado: null,
      item: null,
      itemAnexoNota: null
    };
  },

  init() {
    if (!this.state) this.state = this.novoEstado();
    this.render();
    if (!this.state.empresas.length) this.carregarEmpresas().then(() => { this.escolherEmpresa(); this.render(); });
    if (this.aba === "fila") this.carregarFila(true);
    if (window.FilaNotasFiscais) FilaNotasFiscais.ouvir(this._aoMudar || (this._aoMudar = (lista) => this.aoMudarFila(lista)));
  },

  /** Fila mudou no Firebase (envio novo, devolução, lançamento): atualiza sem mexer no lançamento em andamento. */
  aoMudarFila(lista) {
    this.fila.itens = lista;
    this.fila.carregada = true;
    if (this.aba === "fila") this.render();
    else this.pintarAbas();
  },

  async carregarEmpresas() {
    const s = this.state;
    if (s.empresas.length) return;
    const lista = window.SiengeApiService && SiengeApiService.getCompanies ? await SiengeApiService.getCompanies().catch(() => []) : [];
    s.empresas = (lista || []).map((c) => ({ id: String(c.id), nome: c.name || c.tradeName || `Empresa ${c.id}`, cnpj: this.digits(c.cnpj || c.cnpjCpf) }));
  },

  /* ---------- utilitários ---------- */
  esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },
  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },
  qtdFmt(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  },
  digits(v) {
    return String(v == null ? "" : v).replace(/\D/g, "");
  },
  num(v) {
    return window.NotaFiscalCheck ? NotaFiscalCheck.num(v) : (Number(String(v).replace(/\./g, "").replace(",", ".")) || null);
  },
  docFmt(d) {
    return window.NotaFiscalCheck ? NotaFiscalCheck.docFmt(d) : this.digits(d);
  },
  hojeIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  dataBr(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "—");
  },
  brParaIso(t) {
    const m = String(t || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const i = String(t || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    return i ? `${i[1]}-${i[2]}-${i[3]}` : "";
  },
  lista(res) {
    return Array.isArray(res) ? res : ((res && (res.results || res.data)) || []);
  },
  podeEditar() {
    return typeof window.hasCrmPerm === "function" && window.hasCrmPerm("sub_fiscal_geral_inserir_nota_editar");
  },
  usuario() {
    const u = (window.AppState && AppState.currentUser) || {};
    return { nome: u.name || u.nome || u.email || "", email: u.email || "" };
  },

  /* ---------- Sienge ---------- */
  async get(path) {
    return window.siengeFetchWithRetry(path, 1);
  },

  async enviar(path, opts) {
    const base = ((window.SIENGE_CONFIG && SIENGE_CONFIG.baseUrl) || "/api/sienge-proxy").replace(/\/$/, "");
    const headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
    if (typeof getBasicAuthHeader === "function") headers.Authorization = getBasicAuthHeader();
    const res = await fetch(base + path, { method: opts.method || "POST", headers, body: opts.body });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    if (!res.ok) {
      const det = body && typeof body === "object"
        ? (body.clientMessage || body.developerMessage || body.message || (Array.isArray(body.errors) ? body.errors.map((e) => e.message || e).join("; ") : ""))
        : String(body || "");
      const err = new Error(`${det || "Sienge recusou"} (HTTP ${res.status})`);
      err.status = res.status;
      throw err;
    }
    return { res, body };
  },

  /* ---------- pedido ---------- */
  /** Id do pedido na API (parâmetro 415 do Sienge): sequencial contínuo é o próprio número;
      no sequencial anual, "123/19" vira "19000123" (ano com 2 dígitos + número com 6). */
  idApi(txt) {
    const t = String(txt || "").trim();
    const anual = t.match(/^(\d{1,6})\s*\/\s*(\d{2}|\d{4})$/);
    if (anual) return anual[2].slice(-2) + anual[1].padStart(6, "0");
    return this.digits(t);
  },

  async buscarPedido() {
    const s = this.state;
    const digitado = String((document.getElementById("inf-pedido") || {}).value || s.pedidoId || "").trim();
    const id = this.idApi(digitado);
    if (!id) return;
    Object.assign(s, { pedidoId: digitado, pedidoApi: id, pedidoNome: digitado, pedido: null, credor: null, itens: [], erro: "", empresaCc: "", cc: null, previsao: null, qtdEditada: false, duplicada: null, criada: null, resultado: null });
    s.carregando = "Buscando o pedido no Sienge…";
    this.render();
    try {
      const pedido = await this.get(`/purchase-orders/${id}`);
      if (!pedido || typeof pedido !== "object" || pedido.id == null) throw new Error("pedido não encontrado");
      s.pedido = pedido;
      s.pedidoApi = String(pedido.id);
      s.pedidoNome = String(pedido.formattedPurchaseOrderId || digitado);
      s.carregando = "Buscando itens e entregas do pedido…";
      this.render();
      const [itensRes, credor, cc, previsao] = await Promise.all([
        this.get(`/purchase-orders/${id}/items?limit=200`),
        this.get(`/creditors/${encodeURIComponent(pedido.supplierId)}`).catch(() => null),
        this.centroDeCusto(pedido),
        this.previsaoFinanceira(pedido),
        this.carregarEmpresas()
      ]);
      s.credor = credor && typeof credor === "object"
        ? { id: pedido.supplierId, nome: credor.name || credor.tradeName || `Fornecedor ${pedido.supplierId}`, doc: this.digits(credor.cnpj || credor.cpf) }
        : { id: pedido.supplierId, nome: `Fornecedor ${pedido.supplierId}`, doc: "" };
      s.cc = cc;
      s.empresaCc = cc.companyId;
      s.previsao = previsao;
      const itens = this.lista(itensRes);
      const out = [];
      for (const it of itens) {
        const ent = await this.get(`/purchase-orders/${id}/items/${it.itemNumber}/delivery-schedules?limit=200`).catch(() => null);
        out.push({
          itemNumber: it.itemNumber,
          descricao: [it.resourceCode, it.resourceDescription, it.detailDescription].filter(Boolean).join(" · ") || `Item ${it.itemNumber}`,
          unidade: it.unitOfMeasure || "",
          quantidade: Number(it.quantity) || 0,
          preco: Number(it.netPrice) || Number(it.unitPrice) || 0,
          entregas: this.lista(ent).map((e) => ({
            n: e.deliveryScheduleNumber,
            data: e.sheduledDate || e.scheduledDate || "",
            prevista: Number(e.sheduledQuantity != null ? e.sheduledQuantity : e.scheduledQuantity) || 0,
            entregue: Number(e.deliveredQuantity) || 0,
            saldo: Math.max(0, Number(e.openQuantity) || 0),
            qtd: 0
          })),
          semEntregas: !ent
        });
      }
      s.itens = out;
      this.escolherEmpresa();
      this.distribuir();
      s.carregando = "";
      this.render();
      this.verificarDuplicada();
      if (s._fonteNota) this.analisarFiscal();
    } catch (e) {
      s.carregando = "";
      const msg = String((e && e.message) || e || "");
      s.erro = /404|não encontrado/i.test(msg) ? `Pedido ${id} não encontrado no Sienge.`
        : (/403/.test(msg) ? "O usuário da API não tem permissão para consultar pedidos de compra." : `Não consegui buscar o pedido: ${msg}`);
      this.render();
    }
  },

  /** Centro de custo do pedido (ou o da previsão financeira) e a empresa dona dele. A empresa nunca vem da obra:
      obra que virou SPE fica na empresa antiga (ex.: obra 14200 na empresa 1, CCs 14201 e 14202 na empresa 6). */
  async centroDeCusto(pedido) {
    const out = { id: String(pedido.costCenterId || ""), nome: "", companyId: "" };
    if (!out.id && pedido.forecastBillId) {
      try {
        const ap = this.lista(await this.get(`/bills/${encodeURIComponent(pedido.forecastBillId)}/budget-categories`));
        const maior = ap.filter((a) => a && a.costCenterId != null)
          .sort((a, b) => (Number(b.percentage || b.rate) || 0) - (Number(a.percentage || a.rate) || 0))[0];
        if (maior) out.id = String(maior.costCenterId);
      } catch (e) {}
    }
    if (!out.id) return out;
    const empresaDe = (c) => c && String(c.idCompany || c.companyId || (c.company && c.company.id) || "");
    try {
      const lista = JSON.parse(localStorage.getItem("crm_cost_centers_data") || "[]");
      const hit = Array.isArray(lista) && lista.find((c) => c && String(c.id) === out.id);
      if (hit) { out.nome = hit.name || ""; out.companyId = empresaDe(hit); }
    } catch (e) {}
    if (out.companyId) return out;
    try {
      const cc = await this.get(`/cost-centers/${encodeURIComponent(out.id)}`);
      out.nome = out.nome || (cc && cc.name) || "";
      out.companyId = empresaDe(cc);
    } catch (e) {}
    return out;
  },

  /** Título de previsão do pedido (documento PPC): valor e parcelas programadas. */
  async previsaoFinanceira(pedido) {
    const id = pedido.forecastBillId;
    if (!id) return null;
    const [bill, parc] = await Promise.all([
      this.get(`/bills/${encodeURIComponent(id)}`).catch(() => null),
      this.get(`/bills/${encodeURIComponent(id)}/installments`).catch(() => null)
    ]);
    const parcelas = this.lista(parc).map((p) => ({
      vencimento: String(p.dueDate || p.date || "").slice(0, 10),
      valor: Number(p.originalAmount != null ? p.originalAmount : p.amount) || 0
    })).filter((p) => p.vencimento || p.valor);
    const valor = bill && bill.totalInvoiceAmount != null ? Number(bill.totalInvoiceAmount) : (parcelas.length ? parcelas.reduce((t, p) => t + p.valor, 0) : null);
    return { titulo: String(id), documento: pedido.forecastDocumentId || (bill && bill.documentIdentificationId) || "PPC", valor, parcelas };
  },

  /** Empresa da nota: a do CNPJ do tomador; sem nota lida, a do centro de custo do pedido. */
  escolherEmpresa() {
    const s = this.state;
    const toma = s.nota && s.nota.cnpjTomador;
    const pelaNota = toma ? s.empresas.find((c) => c.cnpj === toma) : null;
    if (pelaNota) s.form.companyId = pelaNota.id;
    else if (s.empresaCc) s.form.companyId = s.empresaCc;
  },

  /** Preenche as quantidades com o saldo das entregas, na ordem, até fechar o valor da nota. */
  distribuir() {
    const s = this.state;
    if (s.qtdEditada) return;
    const valor = Number(this.valorNota()) || 0;
    let resta = valor;
    s.itens.forEach((it) => it.entregas.forEach((e) => {
      if (!valor) { e.qtd = 0; return; }
      if (resta <= 0.004 || !it.preco || e.saldo <= 0) { e.qtd = 0; return; }
      const cheio = e.saldo * it.preco;
      e.qtd = cheio <= resta + 0.005 ? e.saldo : Math.round((resta / it.preco) * 10000) / 10000;
      resta = Math.round((resta - e.qtd * it.preco) * 100) / 100;
    }));
  },

  totalItens() {
    return Math.round(this.state.itens.reduce((t, it) => t + it.entregas.reduce((u, e) => u + (Number(e.qtd) || 0) * it.preco, 0), 0) * 100) / 100;
  },

  valorNota() {
    const n = this.state.nota;
    return n ? (n.valor != null ? n.valor : n.liquido) : null;
  },

  async verificarDuplicada() {
    const s = this.state;
    const numero = s.form.numero;
    if (!s.pedido || !numero) { s.duplicada = null; return; }
    const chave = `${s.pedido.supplierId}|${numero}|${s.form.serie}|${s.form.documento}`;
    if (s.duplicada && s.duplicada.chave === chave) return;
    s.duplicada = { chave, conferindo: true };
    this.pintarConferencia();
    try {
      const res = await this.get(`/purchase-invoices?supplierId=${encodeURIComponent(s.pedido.supplierId)}&number=${encodeURIComponent(numero)}&limit=20`);
      if (!s.duplicada || s.duplicada.chave !== chave) return;
      const achada = this.lista(res).find((n) => String(n.number) === String(numero)
        && (!s.form.serie || !n.series || String(n.series).trim().toUpperCase() === s.form.serie.trim().toUpperCase()));
      s.duplicada = { chave, achada: achada || null };
    } catch (e) {
      if (s.duplicada && s.duplicada.chave === chave) s.duplicada = { chave, erro: String((e && e.message) || e) };
    }
    this.pintarConferencia();
  },

  /* ---------- leitura da nota ---------- */
  async lerArquivo(input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    const s = this.state;
    s.arquivo = file;
    s.nota = null;
    s.leituraErro = "";
    s.preview = "";
    s.lendo = "Abrindo o arquivo…";
    s.qtdEditada = false;
    this.render();
    try {
      const buf = await file.arrayBuffer();
      const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 64))).trim();
      let nota = null;
      if (/^\uFEFF?</.test(inicio) || /\.xml$/i.test(file.name)) {
        nota = this.lerXml(new TextDecoder("utf-8").decode(buf));
        nota.origem = "XML";
      } else if (/^%PDF/.test(inicio)) {
        const canvas = await this.pdfParaCanvas(buf);
        s.preview = canvas.toDataURL("image/jpeg", 0.85);
        this.render();
        const itens = window.NotaFiscalCheck ? await NotaFiscalCheck.itensDoPdf(buf) : [];
        if (itens.length >= 20) {
          nota = this.extrair(this.celulasPdf(itens));
          nota.origem = "texto do PDF";
        } else {
          nota = this.extrair(await this.ocr(canvas));
          nota.origem = "leitura da imagem (OCR)";
        }
      } else if (/^image\//.test(file.type)) {
        const canvas = await this.imagemParaCanvas(file);
        s.preview = canvas.toDataURL("image/jpeg", 0.85);
        this.render();
        nota = this.extrair(await this.ocr(canvas));
        nota.origem = "leitura da imagem (OCR)";
      } else {
        throw new Error("formato não reconhecido; use PDF, XML ou imagem");
      }
      s.nota = nota;
      s._fonteNota = { buf, nome: file.name || "", nota };
      s.fiscal = { carregando: true, erros: [], avisos: [], oks: [], infos: [], itens: [] };
      const f = s.form;
      if (nota.numero) f.numero = nota.numero;
      if (nota.serie) f.serie = nota.serie;
      if (nota.emissao) f.emissao = nota.emissao;
      f.notes = this.observacaoPadrao();
      this.escolherEmpresa();
      this.distribuir();
    } catch (e) {
      s.leituraErro = `Não consegui ler a nota: ${(e && e.message) || e}. Preencha os campos manualmente.`;
    }
    s.lendo = "";
    this.render();
    this.verificarDuplicada();
    if (s._fonteNota) this.analisarFiscal();
  },

  async analisarFiscal() {
    const s = this.state;
    const fonte = s._fonteNota;
    if (!fonte || !window.NotaFiscalCheck) return;
    const token = (s._fiscalToken = (s._fiscalToken || 0) + 1);
    s.fiscal = { carregando: true, erros: [], avisos: [], oks: [], infos: [], itens: [] };
    const el = document.getElementById("inf-fiscal");
    if (el) el.innerHTML = NotaFiscalCheck.painelEnvio(s.fiscal);
    try {
      let cnpj = "";
      let nome = "";
      if (s.form.companyId) {
        const c = await this.get(`/companies/${encodeURIComponent(s.form.companyId)}`).catch(() => null);
        cnpj = this.digits(c && (c.cnpj || c.cpfCnpj || c.documentNumber || ""));
        nome = (c && (c.tradeName || c.name)) || this.nomeEmpresa(s.form.companyId);
      }
      if (s._fiscalToken !== token) return;
      const itensPedido = (s.itens || []).map((it) => {
        const qtd = (it.entregas || []).reduce((t, e) => t + (Number(e.qtd) || 0), 0) || Number(it.quantidade) || 0;
        return { descricao: it.descricao || "", qtd, valor: Math.round(((Number(it.preco) || 0) * qtd) * 100) / 100 };
      });
      s.fiscal = await NotaFiscalCheck.conferirEnvio({
        buf: fonte.buf, nome: fonte.nome, nota: fonte.nota,
        credorDoc: s.credor && s.credor.doc, empresaCnpj: cnpj, empresaNome: nome, itensPedido
      });
    } catch (e) {
      if (s._fiscalToken !== token) return;
      s.fiscal = { carregando: false, erros: [], oks: [], infos: [], itens: [], avisos: [`Não consegui concluir a análise fiscal: ${(e && e.message) || e}`] };
    }
    if (s._fiscalToken !== token) return;
    this.render();
  },

  observacaoPadrao() {
    const s = this.state;
    const f = s.form;
    const pag = s.item && s.item.pagamento;
    return [`NF ${f.numero || ""}${f.serie ? "/" + f.serie : ""}`.trim(), s.pedidoNome ? `pedido ${s.pedidoNome}` : "",
      pag && pag.data ? `pagamento ${this.dataBr(pag.data)}${pag.forma ? " " + pag.forma : ""}` : "", "inserida pelo CRM"].filter(Boolean).join(" · ");
  },

  async pdfParaCanvas(buf) {
    const lib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
    if (!lib) throw new Error("leitor de PDF indisponível");
    const pdf = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    canvas._escala = 2.5;
    return canvas;
  },

  imagemParaCanvas(file) {
    return new Promise((ok, falha) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        canvas._escala = img.naturalWidth / 595;
        URL.revokeObjectURL(img.src);
        ok(canvas);
      };
      img.onerror = () => falha(new Error("imagem inválida"));
      img.src = URL.createObjectURL(file);
    });
  },

  carregarTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (this._tessVoo) return this._tessVoo;
    this._tessVoo = new Promise((ok, falha) => {
      const sc = document.createElement("script");
      sc.src = this.TESSERACT_URL;
      sc.onload = () => ok();
      sc.onerror = () => { this._tessVoo = null; falha(new Error("não consegui carregar o leitor de imagem (OCR)")); };
      document.head.appendChild(sc);
    });
    return this._tessVoo;
  },

  /** OCR da página: devolve células (palavras próximas da mesma linha) em pontos de PDF. */
  async ocr(canvas) {
    const s = this.state;
    s.lendo = "Carregando o leitor de imagem (OCR)…";
    this.render();
    await this.carregarTesseract();
    const worker = await Tesseract.createWorker("por", 1, {
      logger: (m) => {
        if (m.status === "recognizing text" && m.progress != null) {
          const txt = `Lendo a imagem da nota… ${Math.round(m.progress * 100)}%`;
          if (txt !== s.lendo) { s.lendo = txt; this.pintarLeitura(); }
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

  celulasPdf(itens) {
    const ord = itens.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const celulas = [];
    ord.forEach((it) => {
      const c = celulas[celulas.length - 1];
      if (c && Math.abs(c.y - it.y) < 2.5 && it.x - c.x1 < 6) {
        c.s += " " + it.s;
        c.x1 = it.x + it.w;
      } else {
        celulas.push({ s: it.s, x0: it.x, x1: it.x + it.w, y: it.y });
      }
    });
    return celulas;
  },

  /** Campos da nota a partir das células: o valor fica logo abaixo do rótulo (alinhado por sobreposição) ou ao lado dele. */
  extrair(celulas) {
    const ord = celulas.slice().sort((a, b) => a.y - b.y || a.x0 - b.x0);
    const texto = ord.map((c) => c.s).join("\n");
    const achar = (rotulos, aceita) => {
      for (const re of rotulos) {
        let melhor = null;
        ord.forEach((r) => {
          if (r.s.length > 140) return;
          const m = r.s.match(re);
          if (!m) return;
          const depois = r.s.slice(m.index + m[0].length).replace(/^[\s:\-–]+/, "");
          if (depois && aceita(depois)) { melhor = melhor && melhor.d <= 0 ? melhor : { d: 0, s: depois }; return; }
          const larg = Math.max(1, r.s.length);
          let fim = m.index + m[0].length;
          const fecha = r.s.slice(fim).indexOf(")");
          if (fecha >= 0 && fecha < 30) fim += fecha + 1;
          const lx0 = r.x0 + (r.x1 - r.x0) * (m.index / larg);
          const lx1 = r.x0 + (r.x1 - r.x0) * (fim / larg);
          ord.forEach((v) => {
            const dy = v.y - r.y;
            if (dy < 3 || dy > 32 || !aceita(v.s)) return;
            const sobre = Math.min(lx1, v.x1) - Math.max(lx0, v.x0);
            if (sobre <= 0 && Math.abs(v.x0 - lx0) > 8) return;
            const d = dy + (sobre > 0 ? 0 : 12);
            if (!melhor || d < melhor.d) melhor = { d, s: v.s };
          });
        });
        if (melhor) return melhor.s;
      }
      return null;
    };
    const ehValor = (t) => /\d[\d.]*,\d{2}\b/.test(t) && !/\d{2}\/\d{2}\/\d{4}/.test(t);
    const valor = (rotulos) => { const v = achar(rotulos, ehValor); return v == null ? null : this.num(v); };
    const n = {};

    const ns = achar([/n[uú]mero\s*\/\s*s[eé]rie/i, /n[uú]mero da nfs-?e/i, /n[uú]mero da nota( fiscal)?/i, /n[º°o]\.?\s*da\s*(nfs-?e|nota)/i, /^n[uú]mero$/i, /^nota (fiscal )?n[º°o]/i],
      (t) => /^\s*\d{1,12}\b/.test(t));
    if (ns) {
      const m = ns.match(/^\s*(\d{1,12})\s*(?:[\/\-]\s*([A-Za-z0-9]{1,5}))?/);
      if (m) { n.numero = String(Number(m[1])); if (m[2]) n.serie = m[2].toUpperCase(); }
    }
    if (!n.numero) {
      const m = texto.match(/n[uú]mero(?: da (?:nfs-?e|nota))?\s*[:\-]?\s*(\d{1,12})/i);
      if (m) n.numero = String(Number(m[1]));
    }
    if (!n.serie) {
      const sr = achar([/^s[eé]rie$/i, /s[eé]rie da nota/i], (t) => /^\s*[A-Za-z0-9]{1,5}\s*$/.test(t));
      if (sr) n.serie = sr.trim().toUpperCase();
    }

    const em = achar([/data e hora (da )?emiss[aã]o/i, /data (da )?emiss[aã]o/i, /emitida em/i, /^emiss[aã]o$/i, /data e hora da nfs-?e/i], (t) => /\d{2}\/\d{2}\/\d{4}/.test(t));
    n.emissao = this.brParaIso(em || (texto.match(/\d{2}\/\d{2}\/\d{4}/) || [""])[0]);

    const cnpjs = [];
    const reCnpj = /\d{2}[.,]?\d{3}[.,]?\d{3}\s*\/\s*\d{4}\s*-?\s*\d{2}/g;
    let m;
    while ((m = reCnpj.exec(texto))) cnpjs.push({ i: m.index, d: this.digits(m[0]) });
    const depoisDe = (re) => {
      const p = texto.search(re);
      if (p < 0) return "";
      const c = cnpjs.find((x) => x.i > p);
      return c ? c.d : "";
    };
    n.cnpjPrestador = depoisDe(/prestador|emitente/i) || (cnpjs[0] && cnpjs[0].d) || "";
    n.cnpjTomador = depoisDe(/tomador/i) || (cnpjs.find((c) => c.d !== n.cnpjPrestador) || {}).d || "";

    n.valor = valor([/valor total da (nfs-?e|nota)/i, /valor (total )?d[oa]s? servi[cç]os?/i, /valor da opera[cç][aã]o/i, /valor bruto/i, /total da nota/i, /valor total/i]);
    n.liquido = valor([/valor l[ií]quido/i]);
    n.retencoes = valor([/^reten[cç][oõ]es\s*\(r\$\)/i, /total (das )?reten[cç][oõ]es/i, /valor (total )?(das )?reten[cç][oõ]es/i]);
    if (n.valor == null && n.liquido != null) n.valor = Math.round((n.liquido + (n.retencoes || 0)) * 100) / 100;
    return n;
  },

  lerXml(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("XML inválido");
    const tag = (raiz, ...nomes) => {
      for (const nome of nomes) {
        const el = (raiz || doc).getElementsByTagNameNS("*", nome)[0] || (raiz || doc).getElementsByTagName(nome)[0];
        if (el && String(el.textContent).trim()) return String(el.textContent).trim();
      }
      return null;
    };
    const grupo = (...nomes) => { for (const g of nomes) { const el = doc.getElementsByTagNameNS("*", g)[0]; if (el) return el; } return null; };
    const prest = grupo("prest", "emit", "Prestador", "PrestadorServico");
    const toma = grupo("toma", "dest", "Tomador", "TomadorServico");
    const base = window.NotaFiscalCheck ? NotaFiscalCheck.lerXml(xml) || {} : {};
    const n = {
      numero: (tag(null, "nNFSe", "nNF", "Numero") || "").replace(/^0+(?=\d)/, ""),
      serie: (tag(null, "serie", "Serie") || "").toUpperCase(),
      emissao: this.brParaIso(tag(null, "dhEmi", "dhProc", "DataEmissao", "dEmi") || ""),
      cnpjPrestador: this.digits(prest ? tag(prest, "CNPJ", "Cnpj") : ""),
      cnpjTomador: this.digits(toma ? tag(toma, "CNPJ", "Cnpj") : ""),
      valor: base.valorServico != null ? base.valorServico : this.num(tag(null, "vNF", "vServ", "ValorServicos")),
      liquido: base.liquido != null ? base.liquido : null,
      retencoes: base.totalRetencoes != null ? base.totalRetencoes : null
    };
    if (/^\d{4}-\d{2}-\d{2}/.test(String(tag(null, "dhEmi", "DataEmissao") || ""))) n.emissao = String(tag(null, "dhEmi", "DataEmissao")).slice(0, 10);
    return n;
  },

  /* ---------- conferência ---------- */
  conferir() {
    const s = this.state;
    const f = s.form;
    const p = s.pedido;
    const n = s.nota;
    const erros = [];
    const avisos = [];
    const oks = [];
    if (!p) return { erros: ["Busque o pedido de compra."], avisos, oks };
    const status = String(p.status || "").toUpperCase();
    if (status === "CANCELED") erros.push("O pedido está cancelado.");
    if (p.authorized === false) erros.push("O pedido ainda não foi autorizado no Sienge.");
    else if (p.authorized === true) oks.push("Pedido autorizado.");
    if (status === "FULLY_DELIVERED") erros.push("O pedido já foi totalmente atendido: não há saldo para faturar.");

    if (!f.documento || !f.numero) erros.push("Informe o documento e o número da nota.");
    if (!f.companyId) erros.push("Escolha a empresa da nota.");
    if (!f.emissao) avisos.push("Sem data de emissão: o Sienge usará a data de hoje.");

    if (n && n.cnpjPrestador && s.credor && s.credor.doc) {
      if (n.cnpjPrestador === s.credor.doc) oks.push(`CNPJ do prestador confere com o fornecedor do pedido (${this.docFmt(n.cnpjPrestador)}).`);
      else erros.push(`A nota é de ${this.docFmt(n.cnpjPrestador)}, mas o fornecedor do pedido é ${this.docFmt(s.credor.doc)}.`);
    } else if (n) avisos.push("Não consegui confirmar o CNPJ do prestador na nota: confira o fornecedor.");

    const emp = s.empresas.find((c) => c.id === String(f.companyId));
    if (n && n.cnpjTomador && emp && emp.cnpj) {
      if (n.cnpjTomador === emp.cnpj) oks.push(`CNPJ do tomador confere com a empresa ${emp.id}.`);
      else erros.push(`O tomador da nota é ${this.docFmt(n.cnpjTomador)}, mas a empresa escolhida (${emp.id}) tem CNPJ ${this.docFmt(emp.cnpj)}.`);
    }
    if (s.empresaCc && f.companyId) {
      const ccTxt = s.cc ? `${s.cc.id}${s.cc.nome ? " - " + s.cc.nome : ""}` : "";
      if (String(f.companyId) !== String(s.empresaCc)) erros.push(`O centro de custo do pedido (${ccTxt}) é da empresa ${s.empresaCc}, mas a nota está na empresa ${f.companyId}.`);
      else oks.push(`Empresa ${f.companyId} é a do centro de custo do pedido (${ccTxt}).`);
    } else if (s.cc && s.cc.id && !s.empresaCc) {
      avisos.push(`Não consegui confirmar a empresa do centro de custo ${s.cc.id}: confira a empresa da nota.`);
    } else if (s.cc && !s.cc.id) {
      avisos.push("O pedido não informa o centro de custo: confira a empresa da nota (a empresa da obra pode ser outra, como na obra 14200).");
    }
    const prev = s.previsao;
    const vNota = this.valorNota();
    if (prev && prev.valor != null && vNota != null) {
      if (Math.abs(prev.valor - vNota) <= this.TOL) oks.push(`Valor da nota igual ao da previsão financeira do pedido (${prev.documento} ${prev.titulo}, ${this.money(prev.valor)}).`);
      else avisos.push(`A previsão financeira do pedido (${prev.documento} ${prev.titulo}) é de ${this.money(prev.valor)}, e a nota é de ${this.money(vNota)}.`);
    }

    const entregas = s.itens.flatMap((it) => it.entregas.filter((e) => Number(e.qtd) > 0).map((e) => ({ it, e })));
    if (!entregas.length) erros.push("Nenhuma entrega com quantidade a faturar.");
    entregas.forEach(({ it, e }) => {
      if (Number(e.qtd) > e.saldo + 0.00001) erros.push(`Item ${it.itemNumber}, entrega ${e.n}: quantidade ${this.qtdFmt(e.qtd)} maior que o saldo ${this.qtdFmt(e.saldo)}.`);
    });
    const total = this.totalItens();
    const valor = this.valorNota();
    if (valor != null && entregas.length) {
      if (Math.abs(total - valor) <= this.TOL) oks.push(`Itens somam ${this.money(total)}, igual ao valor da nota.`);
      else erros.push(`Os itens somam ${this.money(total)}, mas a nota é de ${this.money(valor)}.`);
    } else if (entregas.length) avisos.push("Valor da nota não lido: confira o total dos itens com a nota.");
    if (n && n.retencoes > 0.009) avisos.push(`A nota tem ${this.money(n.retencoes)} de retenções: lance os impostos ao finalizar a nota no Sienge.`);
    const pag = s.item && s.item.pagamento;
    if (pag && (pag.data || pag.forma)) avisos.push(`Pagamento confirmado pelo operador: ${this.pagamentoTxt(pag)}. Lance esta condição ao finalizar a nota no Sienge.`);

    const dup = s.duplicada;
    if (dup && dup.achada) erros.push(`Esta nota já está cadastrada no Sienge (sequencial ${dup.achada.sequentialNumber}, emissão ${this.dataBr(dup.achada.issueDate)}).`);
    else if (dup && dup.conferindo) avisos.push("Conferindo se a nota já existe no Sienge…");
    else if (dup && dup.erro) avisos.push("Não consegui conferir se a nota já existe no Sienge.");
    else if (dup) oks.push("Nota ainda não cadastrada no Sienge.");
    const fiscal = s.fiscal;
    if (fiscal && fiscal.carregando) erros.push("Ainda estou cruzando a nota com o pedido, o CNAE e o endereço da empresa.");
    else if (fiscal) {
      (fiscal.erros || []).forEach((t) => erros.push(t));
      (fiscal.avisos || []).forEach((t) => avisos.push(t));
      (fiscal.infos || []).forEach((t) => avisos.push(t));
      (fiscal.oks || []).forEach((t) => oks.push(t));
    }
    return { erros, avisos, oks };
  },

  /* ---------- gravação ---------- */
  async inserir() {
    const s = this.state;
    if (!this.podeEditar()) { alert("Sem permissão para inserir notas no Sienge."); return; }
    const c = this.conferir();
    if (c.erros.length) { alert(c.erros.join("\n")); return; }
    const f = s.form;
    const entregas = s.itens.flatMap((it) => it.entregas.filter((e) => Number(e.qtd) > 0).map((e) => ({
      purchaseOrderId: Number(s.pedidoApi), itemNumber: Number(it.itemNumber), deliveryScheduleNumber: Number(e.n),
      deliveredQuantity: Number(e.qtd), keepBalance: !!f.manterSaldo
    })));
    const total = this.totalItens();
    const msg = `Inserir no Sienge a nota ${f.documento} ${f.numero}${f.serie ? "/" + f.serie : ""} de ${s.credor ? s.credor.nome : ""}, `
      + `no valor de ${this.money(total)}, com ${entregas.length} entrega(s) do pedido ${s.pedidoNome}?\n\n`
      + "A nota fica \"em inclusão\" no Sienge: depois confira impostos e condição de pagamento e consista a nota para gerar o título.";
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;

    const log = [];
    let anexou = false;
    s.resultado = null;
    try {
      if (!s.criada) {
        const nf = `NF ${f.numero}${f.serie ? "/" + f.serie : ""}`;
        if (f.anexar && s.arquivo) {
          s.enviando = "Anexando a nota no pedido…";
          this.render();
          try {
            await this.anexarNoPedido(s.arquivo, nf);
            anexou = true;
            log.push("Nota anexada no pedido.");
          } catch (e) {
            log.push(`Não consegui anexar a nota no pedido: ${e.message}`);
          }
        }
        const extras = f.anexar && s.item ? (s.item.anexos || []).filter((a) => a !== s.itemAnexoNota && !(a.tipo === "nota" && s.arquivo)) : [];
        for (const a of extras) {
          const rot = (window.FilaNotasFiscais && FilaNotasFiscais.TIPOS_ANEXO[a.tipo]) || "Anexo";
          s.enviando = `Anexando ${rot.toLowerCase()} no pedido…`;
          this.render();
          try {
            await this.anexarNoPedido(await FilaNotasFiscais.baixar(a), `${rot} ${nf}`);
            anexou = true;
            log.push(`${rot} (${a.nome}) anexado no pedido.`);
          } catch (e) {
            log.push(`Não consegui anexar ${a.nome} no pedido: ${e.message}`);
          }
        }
        s.enviando = "Criando a nota no Sienge…";
        this.render();
        const cab = {
          documentId: f.documento.trim().toUpperCase(),
          number: String(f.numero).trim(),
          supplierId: Number(s.pedido.supplierId),
          companyId: Number(f.companyId),
          movementDate: f.movimento || this.hojeIso(),
          notes: f.notes || this.observacaoPadrao()
        };
        if (f.serie) cab.series = String(f.serie).trim();
        if (f.emissao) cab.issueDate = f.emissao;
        const r = await this.enviar("/purchase-invoices", { headers: { "Content-Type": "application/json" }, body: JSON.stringify(cab) });
        let seq = r.body && r.body.sequentialNumber;
        if (!seq) {
          const loc = r.res.headers.get("Location") || r.res.headers.get("location") || "";
          seq = loc.split("/").filter(Boolean).pop();
        }
        if (!seq || isNaN(Number(seq))) throw new Error("o Sienge criou a nota, mas não devolveu o número sequencial");
        s.criada = { seq: String(seq), anexou };
        log.push(`Nota criada no Sienge (sequencial ${seq}).`);
        this.auditar("ok", `Nota ${cab.documentId} ${cab.number} criada (sequencial ${seq}) para o pedido ${s.pedidoNome}`, { cabecalho: cab, log });
      }
      s.enviando = "Incluindo os itens do pedido na nota…";
      this.render();
      const corpo = { deliveriesOrder: entregas, copyNotesPurchaseOrders: false, copyNotesResources: false, copyAttachmentsPurchaseOrders: !!(s.criada.anexou || anexou) };
      const r2 = await this.enviar(`/purchase-invoices/${s.criada.seq}/items/purchase-orders/delivery-schedules`, { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const itens = this.lista(r2.body);
      log.push(`${itens.length || entregas.length} item(ns) incluído(s).`);
      s.resultado = { ok: true, seq: s.criada.seq, log, itens };
      this.auditar("ok", `Itens do pedido ${s.pedidoNome} incluídos na nota sequencial ${s.criada.seq} · ${this.money(total)}`, { entregas, log });
      s.duplicada = Object.assign({}, s.duplicada, { achada: { sequentialNumber: s.criada.seq, issueDate: f.emissao } });
      if (s.item) {
        const u = FilaNotasFiscais.usuario();
        try {
          await FilaNotasFiscais.atualizar(s.item, { status: "lancada", seqSienge: s.criada.seq, numeroNota: String(f.numero), lancadoPor: u.nome, lancadoPorEmail: u.email, lancadoEm: Date.now() },
            "lançada", `sequencial ${s.criada.seq}`);
          log.push("Nota marcada como lançada na fila do fiscal.");
        } catch (e) {
          log.push(`A nota entrou no Sienge, mas não consegui marcar como lançada na fila: ${e.message}`);
        }
      }
      s.criada = null;
    } catch (e) {
      const m = (e && e.message) || String(e);
      log.push(m);
      s.resultado = { ok: false, seq: s.criada ? s.criada.seq : "", log, erro: m };
      this.auditar("erro", s.criada
        ? `Nota sequencial ${s.criada.seq} criada, mas os itens do pedido ${s.pedidoNome} não entraram: ${m}`
        : `Falha ao criar a nota ${f.numero} do pedido ${s.pedidoNome}: ${m}`, { log });
    }
    s.enviando = "";
    this.render();
  },

  async anexarNoPedido(file, descricao) {
    const fd = new FormData();
    fd.append("description", String(descricao).slice(0, 100));
    fd.append("attachment", file, String(file.name || "anexo.pdf").slice(-100));
    await this.enviar(`/purchase-orders/${encodeURIComponent(this.state.pedidoApi)}/attachments`, { body: fd });
  },

  pagamentoTxt(pag) {
    return [pag.data ? this.dataBr(pag.data) : "", pag.forma || "", pag.detalhe || ""].filter(Boolean).join(" · ");
  },

  auditar(status, summary, details) {
    if (!window.AuditService || typeof AuditService.logEvent !== "function") return;
    const s = this.state;
    const u = this.usuario();
    try {
      AuditService.logEvent({
        module: "Fiscal", action: "Inserir nota", status, summary,
        user: u.nome, userEmail: u.email,
        customerLabel: s.credor ? s.credor.nome : "",
        endpoint: "/purchase-invoices", method: "POST",
        details: Object.assign({ pedido: s.pedidoNome, pedidoApi: s.pedidoApi, documento: s.form.documento, numero: s.form.numero, serie: s.form.serie, empresa: s.form.companyId }, details || {})
      });
    } catch (e) {}
  },

  /* ---------- eventos ---------- */
  setCampo(campo, valor) {
    const f = this.state.form;
    f[campo] = typeof f[campo] === "boolean" ? !!valor : String(valor == null ? "" : valor);
    if (["numero", "serie", "documento"].includes(campo)) {
      if (campo !== "documento" && /^NF\b/.test(f.notes || "")) f.notes = this.observacaoPadrao();
      clearTimeout(this._dupT);
      this._dupT = setTimeout(() => this.verificarDuplicada(), 600);
    }
    this.pintarConferencia();
  },

  setValorNota(v) {
    const s = this.state;
    s.nota = s.nota || { origem: "digitado" };
    s.nota.valor = this.num(v);
    this.distribuir();
    this.render();
  },

  setQtd(item, entrega, v) {
    const s = this.state;
    const it = s.itens.find((x) => String(x.itemNumber) === String(item));
    const e = it && it.entregas.find((x) => String(x.n) === String(entrega));
    if (!e) return;
    e.qtd = Math.max(0, this.num(v) || 0);
    s.qtdEditada = true;
    this.render();
  },

  redistribuir() {
    this.state.qtdEditada = false;
    this.distribuir();
    this.render();
  },

  recomecar() {
    const item = this.state.item;
    if (item && FilaNotasFiscais.aberta(item)) { this.lancarDaFila(item.id); return; }
    this.state = this.novoEstado();
    this.render();
  },

  /* ---------- fila do fiscal (notas enviadas pelos operadores em Fiscal › Enviar nota) ---------- */
  setAba(aba) {
    this.aba = aba;
    this.render();
    if (aba === "fila") this.carregarFila(true);
  },

  async carregarFila(forcar) {
    const f = this.fila;
    if (!window.FilaNotasFiscais || f.carregando || (f.carregada && !forcar)) return;
    f.carregando = true;
    f.erro = "";
    this.render();
    try {
      f.itens = await FilaNotasFiscais.listar();
      f.carregada = true;
    } catch (e) {
      f.erro = `Não consegui carregar a fila: ${(e && e.message) || e}`;
    }
    f.carregando = false;
    this.render();
  },

  setFiltroFila(v) {
    this.fila.filtro = v;
    this.render();
  },

  filaFiltrada() {
    const { itens, filtro } = this.fila;
    if (filtro === "todas") return itens;
    if (filtro !== "abertas") return itens.filter((x) => x.status === filtro);
    const dia = (x) => String((x.pagamento && x.pagamento.data) || "9999");
    return itens.filter((x) => FilaNotasFiscais.aberta(x)).sort((a, b) => dia(a).localeCompare(dia(b)) || (a.criadoEm || 0) - (b.criadoEm || 0));
  },

  async confirmar(msg) {
    return typeof window.mouraConfirm === "function" ? window.mouraConfirm(msg) : confirm(msg);
  },

  /** Assume a nota da fila: busca o pedido, baixa a nota enviada e lê os campos como se o arquivo tivesse sido escolhido aqui. */
  async lancarDaFila(id) {
    const item = this.fila.itens.find((x) => x.id === id);
    if (!item) return;
    if (!this.podeEditar()) { alert("Sem permissão para inserir notas no Sienge."); return; }
    const u = FilaNotasFiscais.usuario();
    if (item.status === "em_lancamento" && item.assumidoPorEmail && item.assumidoPorEmail !== u.email
      && !(await this.confirmar(`${item.assumidoPor || "Outro usuário"} já está lançando esta nota. Assumir mesmo assim?`))) return;
    if (item.status !== "em_lancamento" || item.assumidoPorEmail !== u.email) {
      try {
        await FilaNotasFiscais.atualizar(item, { status: "em_lancamento", assumidoPor: u.nome, assumidoPorEmail: u.email, assumidoEm: Date.now() }, "assumida");
      } catch (e) {
        alert(`Não consegui assumir a nota: ${(e && e.message) || e}`);
        return;
      }
    }
    this.state = this.novoEstado();
    const s = this.state;
    s.item = item;
    s.pedidoId = item.pedido;
    if (item.numeroNota) s.form.numero = item.numeroNota;
    this.aba = "lancar";
    this.render();
    await this.buscarPedido();
    if (this.state !== s) return;
    const anexo = (item.anexos || []).find((a) => a.tipo === "nota");
    if (anexo) {
      s.lendo = "Baixando a nota enviada pelo operador…";
      this.render();
      try {
        const file = await FilaNotasFiscais.baixar(anexo);
        s.itemAnexoNota = anexo;
        await this.lerArquivo({ files: [file] });
      } catch (e) {
        s.lendo = "";
        s.leituraErro = `${(e && e.message) || e}. Abra a nota no card do envio, salve e escolha o arquivo aqui.`;
      }
    }
    if (this.state !== s) return;
    if (item.valorNota != null && (!s.nota || s.nota.valor == null)) {
      s.nota = Object.assign(s.nota || { origem: "valor informado pelo operador" }, { valor: Number(item.valorNota) });
      this.distribuir();
    }
    if (item.numeroNota && !s.form.numero) s.form.numero = item.numeroNota;
    s.form.notes = this.observacaoPadrao();
    this.render();
    this.verificarDuplicada();
  },

  async devolver(id) {
    const item = this.fila.itens.find((x) => x.id === id) || (this.state.item && this.state.item.id === id ? this.state.item : null);
    if (!item || !this.podeEditar()) return;
    const pergunta = `Devolver ao operador a nota do pedido ${item.pedido}? Escreva o motivo: ele aparece para quem enviou corrigir e reenviar.`;
    const motivo = typeof window.mouraPrompt === "function" ? await window.mouraPrompt(pergunta, "") : prompt(pergunta);
    if (motivo == null) return;
    const txt = String(motivo).trim();
    if (!txt) { alert("Informe o motivo da devolução."); return; }
    const u = FilaNotasFiscais.usuario();
    try {
      await FilaNotasFiscais.atualizar(item, { status: "devolvida", motivoDevolucao: txt, devolvidoPor: u.nome, devolvidoEm: Date.now(), assumidoPor: "", assumidoPorEmail: "" }, "devolvida", txt);
    } catch (e) {
      alert(`Não consegui devolver: ${(e && e.message) || e}`);
      return;
    }
    this.auditar("ok", `Nota do pedido ${item.pedido} devolvida ao operador ${item.criadoPor || ""}: ${txt}`, { filaId: id });
    if (this.state.item && this.state.item.id === id) {
      this.state = this.novoEstado();
      this.aba = "fila";
    }
    this.render();
  },

  /** Larga a nota assumida: ela volta para a fila como "aguardando fiscal". */
  async soltar(id) {
    const item = this.state.item && this.state.item.id === id ? this.state.item : this.fila.itens.find((x) => x.id === id);
    if (!item) return;
    try {
      if (item.status === "em_lancamento") await FilaNotasFiscais.atualizar(item, { status: "pendente", assumidoPor: "", assumidoPorEmail: "" }, "voltou para a fila");
    } catch (e) {
      alert(`Não consegui devolver para a fila: ${(e && e.message) || e}`);
      return;
    }
    this.state = this.novoEstado();
    this.aba = "fila";
    this.render();
  },

  itemHtml() {
    const it = this.state.item;
    if (!it) return "";
    const p = it.pagamento || {};
    const quando = it.criadoEm ? new Date(it.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
    const esc = (v) => this.esc(v);
    const aberta = FilaNotasFiscais.aberta(it);
    return `<div class="inf-card inf-item">
        <h3><i data-lucide="inbox"></i> Enviada por ${esc(it.criadoPor || "operador")}${quando ? ` em ${quando}` : ""} · ${FilaNotasFiscais.statusHtml(it, esc)}</h3>
        <div class="inf-grid">
          <div><label>Data de pagamento</label><b>${this.dataBr(p.data)}</b></div>
          <div><label>Forma de pagamento</label><b>${esc(p.forma || "—")}</b>${p.detalhe ? `<small>${esc(p.detalhe)}</small>` : ""}</div>
          <div><label>Informado</label><b>${it.numeroNota ? `NF ${esc(it.numeroNota)}` : "—"}</b>${it.valorNota != null ? `<small>${this.money(it.valorNota)}</small>` : ""}</div>
          <div><label>Anexos</label>${FilaNotasFiscais.anexosHtml(it, esc) || "—"}</div>
        </div>
        ${it.observacao ? `<p class="inf-prev"><i data-lucide="message-square"></i><span>${esc(it.observacao)}</span></p>` : ""}
        ${aberta ? `<div class="inf-acoes">
          <button type="button" class="btn btn-outline" onclick="InserirNotaApp.soltar('${esc(it.id)}')"><i data-lucide="undo-2"></i> Deixar na fila</button>
          <button type="button" class="btn btn-outline" onclick="InserirNotaApp.devolver('${esc(it.id)}')"><i data-lucide="corner-up-left"></i> Devolver ao operador</button>
        </div>` : ""}
      </div>`;
  },

  filaHtml() {
    const f = this.fila;
    const esc = (v) => this.esc(v);
    const lista = this.filaFiltrada();
    const hoje = this.hojeIso();
    const pode = this.podeEditar();
    const conta = (fn) => f.itens.filter(fn).length;
    const filtros = [
      ["abertas", `Abertas (${conta((x) => FilaNotasFiscais.aberta(x))})`],
      ["lancada", `Lançadas (${conta((x) => x.status === "lancada")})`],
      ["devolvida", `Devolvidas (${conta((x) => x.status === "devolvida")})`],
      ["cancelada", `Canceladas (${conta((x) => x.status === "cancelada")})`],
      ["todas", `Todas (${f.itens.length})`]
    ];
    const corpo = f.carregando && !f.itens.length ? `<p class="fnf-vazio"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> Carregando a fila…</p>`
      : (f.erro ? `<p class="inf-erro">${esc(f.erro)}</p>`
        : (!lista.length ? `<p class="fnf-vazio">${f.filtro === "abertas" ? "Nenhuma nota esperando lançamento." : "Nenhuma nota nesta situação."}</p>`
          : `<table class="fnf-tab"><thead><tr><th>Pagamento</th><th>Pedido</th><th>Fornecedor</th><th>Empresa / CC</th><th>Anexos</th><th>Enviada por</th><th>Situação</th><th></th></tr></thead><tbody>
            ${lista.map((x) => {
              const p = x.pagamento || {};
              const atrasado = FilaNotasFiscais.aberta(x) && p.data && p.data < hoje;
              const aberta = FilaNotasFiscais.aberta(x);
              return `<tr>
                <td><span class="${atrasado ? "fnf-atrasado" : ""}">${this.dataBr(p.data)}</span><small>${esc(p.forma || "")}${p.detalhe ? ` · ${esc(p.detalhe)}` : ""}</small></td>
                <td><b>${esc(x.pedido)}</b>${x.numeroNota ? `<small>NF ${esc(x.numeroNota)}</small>` : ""}</td>
                <td>${esc(x.fornecedor ? x.fornecedor.nome : "")}<small>${x.valorNota != null ? this.money(x.valorNota) : (x.previsao && x.previsao.valor != null ? `previsão ${this.money(x.previsao.valor)}` : "")}</small></td>
                <td>${x.empresa ? `Empresa ${esc(x.empresa)}` : "—"}${x.cc && x.cc.id ? `<small>CC ${esc(x.cc.id)}${x.cc.nome ? " - " + esc(x.cc.nome) : ""}</small>` : ""}</td>
                <td>${FilaNotasFiscais.anexosHtml(x, esc)}</td>
                <td>${esc(x.criadoPor || "")}<small>${x.criadoEm ? new Date(x.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}</small>${x.observacao ? `<small title="${esc(x.observacao)}">“${esc(x.observacao.length > 60 ? x.observacao.slice(0, 60) + "…" : x.observacao)}”</small>` : ""}</td>
                <td>${FilaNotasFiscais.statusHtml(x, esc)}${x.status === "devolvida" && x.motivoDevolucao ? `<small class="fnf-motivo">${esc(x.motivoDevolucao)}</small>` : ""}</td>
                <td class="fnf-acoes">${aberta && pode ? `
                  <button type="button" class="btn btn-primary" onclick="InserirNotaApp.lancarDaFila('${esc(x.id)}')"><i data-lucide="file-up"></i> ${x.status === "em_lancamento" ? "Continuar" : "Lançar"}</button>
                  <button type="button" class="btn btn-outline" onclick="InserirNotaApp.devolver('${esc(x.id)}')"><i data-lucide="corner-up-left"></i> Devolver</button>` : ""}</td>
              </tr>`;
            }).join("")}</tbody></table>`));
    return `<div class="inf-card" style="margin:16px 20px;">
        <div class="fnf-barra">
          <select onchange="InserirNotaApp.setFiltroFila(this.value)">${filtros.map(([v, t]) => `<option value="${v}" ${f.filtro === v ? "selected" : ""}>${t}</option>`).join("")}</select>
          <span class="inf-muted">Notas enviadas pelos operadores em Fiscal › Enviar nota, por data de pagamento. Clique em <b>Lançar</b> para conferir e inserir no Sienge.</span>
          <button type="button" class="btn btn-outline inf-btn-sm" onclick="InserirNotaApp.carregarFila(true)" ${f.carregando ? "disabled" : ""}><i data-lucide="refresh-cw"></i> Atualizar</button>
        </div>
        ${corpo}
      </div>`;
  },

  /* ---------- tela ---------- */
  /** Lupa sobre a imagem da nota: a lente mostra a mesma imagem ampliada em volta do ponteiro. */
  lupa(ev, sair) {
    const area = ev.currentTarget;
    const lente = area && area.querySelector(".inf-lupa");
    const img = area && area.querySelector("img");
    if (!lente || !img) return;
    const r = img.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    if (sair || x < 0 || y < 0 || x > r.width || y > r.height) {
      lente.style.display = "none";
      area.classList.remove("is-ativa");
      return;
    }
    const z = this._zoom || 2.5;
    const L = lente.offsetWidth || 360;
    if (!lente.style.backgroundImage) lente.style.backgroundImage = `url("${img.src}")`;
    lente.style.display = "block";
    area.classList.add("is-ativa");
    lente.style.left = `${x - L / 2}px`;
    lente.style.top = `${y - L / 2}px`;
    lente.style.backgroundSize = `${r.width * z}px ${r.height * z}px`;
    lente.style.backgroundPosition = `${L / 2 - x * z}px ${L / 2 - y * z}px`;
  },

  zoomLupa(ev) {
    ev.preventDefault();
    const z = (this._zoom || 2.5) + (ev.deltaY < 0 ? 0.5 : -0.5);
    this._zoom = Math.min(6, Math.max(1.5, z));
    const rot = ev.currentTarget && ev.currentTarget.parentElement && ev.currentTarget.parentElement.querySelector(".inf-lupa-zoom");
    if (rot) rot.textContent = `${this._zoom.toLocaleString("pt-BR")}x`;
    this.lupa(ev);
  },

  pintarLeitura() {
    const el = document.getElementById("inf-lendo");
    if (el) el.textContent = this.state.lendo;
  },

  pintarConferencia() {
    const el = document.getElementById("inf-conf");
    if (!el) return;
    el.innerHTML = this.conferenciaHtml();
    const btn = document.getElementById("inf-inserir");
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
    if (!p) return s.erro ? `<p class="inf-erro">${this.esc(s.erro)}</p>` : `<p class="inf-muted">Informe o número do pedido de compra para trazer fornecedor, empresa e entregas em aberto.</p>`;
    const sit = { PENDING: "Pendente", PARTIALLY_DELIVERED: "Parcialmente entregue", FULLY_DELIVERED: "Totalmente atendido", CANCELED: "Cancelado" }[String(p.status || "").toUpperCase()] || p.status || "—";
    return `<div class="inf-grid">
      <div><label>Fornecedor</label><b>${this.esc(s.credor ? s.credor.nome : p.supplierId)}</b><small>${this.esc(s.credor && s.credor.doc ? this.docFmt(s.credor.doc) : `código ${p.supplierId}`)}</small></div>
      <div><label>Centro de custo</label><b>${this.esc((s.cc && s.cc.id) || "—")}${s.cc && s.cc.nome ? ` - ${this.esc(s.cc.nome)}` : ""}</b><small>${s.empresaCc ? `empresa ${this.esc(s.empresaCc)}${this.nomeEmpresa(s.empresaCc) ? " - " + this.esc(this.nomeEmpresa(s.empresaCc)) : ""}` : "empresa não identificada"}</small></div>
      <div><label>Pedido ${this.esc(s.pedidoNome)}</label><b>${this.dataBr(p.date)}</b><small>${s.pedidoApi !== s.pedidoNome ? `id na API ${this.esc(s.pedidoApi)} · ` : ""}${this.esc(p.paymentCondition || "")}</small></div>
      <div><label>Situação</label><b>${this.esc(sit)}</b><small>${p.authorized ? "autorizado" : (p.authorized === false ? "não autorizado" : "")}</small></div>
      <div><label>Total do pedido</label><b>${p.totalAmount != null ? this.money(p.totalAmount) : "—"}</b></div>
    </div>
    ${this.previsaoHtml()}`;
  },

  nomeEmpresa(id) {
    const e = this.state.empresas.find((c) => c.id === String(id));
    return e ? e.nome : "";
  },

  previsaoHtml(prev = this.state.previsao) {
    if (!prev) return `<p class="inf-muted">O pedido não tem título de previsão financeira.</p>`;
    const parc = prev.parcelas.length
      ? prev.parcelas.map((x) => `${this.dataBr(x.vencimento)} · ${this.money(x.valor)}`).join(" | ")
      : "parcelas não lidas";
    return `<p class="inf-prev"><i data-lucide="calendar-clock"></i><span><b>Previsão financeira:</b> ${this.esc(prev.documento)} ${this.esc(prev.titulo)} · ${prev.valor != null ? this.money(prev.valor) : "valor não lido"} · vencimento ${this.esc(parc)}</span></p>`;
  },

  notaHtml() {
    const s = this.state;
    const f = s.form;
    const n = s.nota;
    const empOpts = [`<option value="">Escolha a empresa…</option>`].concat(s.empresas
      .slice().sort((a, b) => Number(a.id) - Number(b.id))
      .map((c) => `<option value="${this.esc(c.id)}" ${String(f.companyId) === c.id ? "selected" : ""}>${this.esc(c.id)} - ${this.esc(c.nome)}</option>`));
    if (f.companyId && !s.empresas.some((c) => c.id === String(f.companyId))) empOpts.push(`<option value="${this.esc(f.companyId)}" selected>${this.esc(f.companyId)}</option>`);
    const docs = this.DOCUMENTOS.includes(f.documento) ? this.DOCUMENTOS : this.DOCUMENTOS.concat([f.documento]);
    const lido = n ? `<p class="inf-muted">Lido por ${this.esc(n.origem || "")}${n.cnpjPrestador ? ` · prestador ${this.esc(this.docFmt(n.cnpjPrestador))}` : ""}${n.cnpjTomador ? ` · tomador ${this.esc(this.docFmt(n.cnpjTomador))}` : ""}${n.retencoes != null ? ` · retenções ${this.money(n.retencoes)}` : ""}${n.liquido != null ? ` · líquido ${this.money(n.liquido)}` : ""}. Confira os campos com a nota ao lado.</p>` : "";
    return `
      <label class="inf-file"><i data-lucide="file-up"></i><span>${s.arquivo ? this.esc(s.arquivo.name) : "Escolher a nota (PDF, XML ou imagem)"}</span>
        <input type="file" accept=".pdf,.xml,image/*" onchange="InserirNotaApp.lerArquivo(this)"></label>
      ${s.lendo ? `<p class="inf-muted"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> <span id="inf-lendo">${this.esc(s.lendo)}</span></p>` : ""}
      ${s.leituraErro ? `<p class="inf-erro">${this.esc(s.leituraErro)}</p>` : ""}
      ${lido}
      <div class="inf-form">
        <div><label>Documento</label><select onchange="InserirNotaApp.setCampo('documento', this.value)">${docs.map((d) => `<option ${d === f.documento ? "selected" : ""}>${this.esc(d)}</option>`).join("")}</select></div>
        <div><label>Número</label><input value="${this.esc(f.numero)}" oninput="InserirNotaApp.setCampo('numero', this.value)"></div>
        <div><label>Série</label><input value="${this.esc(f.serie)}" oninput="InserirNotaApp.setCampo('serie', this.value)"></div>
        <div><label>Emissão</label><input type="date" value="${this.esc(f.emissao)}" onchange="InserirNotaApp.setCampo('emissao', this.value)"></div>
        <div><label>Data do movimento</label><input type="date" value="${this.esc(f.movimento)}" onchange="InserirNotaApp.setCampo('movimento', this.value)"></div>
        <div><label>Valor da nota</label><input value="${n && n.valor != null ? this.esc(n.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })) : ""}" placeholder="0,00" onchange="InserirNotaApp.setValorNota(this.value)"></div>
        <div class="inf-span2"><label>Empresa</label><select onchange="InserirNotaApp.setCampo('companyId', this.value)">${empOpts.join("")}</select></div>
        <div class="inf-span4"><label>Observação</label><input value="${this.esc(f.notes)}" oninput="InserirNotaApp.setCampo('notes', this.value)"></div>
      </div>`;
  },

  itensHtml() {
    const s = this.state;
    if (!s.pedido) return "";
    if (!s.itens.length) return `<p class="inf-muted">O pedido não tem itens.</p>`;
    const linhas = [];
    s.itens.forEach((it) => {
      if (!it.entregas.length) {
        linhas.push(`<tr><td>${it.itemNumber}</td><td>${this.esc(it.descricao)}</td><td colspan="6" class="inf-muted">${it.semEntregas ? "Não consegui ler as entregas deste item." : "Sem entregas programadas."}</td></tr>`);
        return;
      }
      it.entregas.forEach((e, i) => {
        const valor = (Number(e.qtd) || 0) * it.preco;
        linhas.push(`<tr class="${e.saldo <= 0 ? "is-sem-saldo" : ""}">
          <td>${i === 0 ? it.itemNumber : ""}</td>
          <td>${i === 0 ? this.esc(it.descricao) : ""}</td>
          <td>${e.n}${e.data ? ` · ${this.dataBr(e.data)}` : ""}</td>
          <td class="num">${this.money(it.preco)}${it.unidade ? `<small>/${this.esc(it.unidade)}</small>` : ""}</td>
          <td class="num">${this.qtdFmt(e.saldo)}</td>
          <td class="num"><input class="inf-qtd" value="${this.esc(e.qtd ? String(e.qtd).replace(".", ",") : "")}" ${e.saldo <= 0 ? "disabled" : ""}
            onchange="InserirNotaApp.setQtd('${it.itemNumber}', '${e.n}', this.value)"></td>
          <td class="num">${this.money(valor)}</td>
        </tr>`);
      });
    });
    const total = this.totalItens();
    const valor = this.valorNota();
    const fecha = valor != null && Math.abs(total - valor) <= this.TOL;
    return `<table class="inf-tab"><thead><tr><th>Item</th><th>Insumo</th><th>Entrega</th><th class="num">Preço líquido</th><th class="num">Saldo</th><th class="num">Qtd. a faturar</th><th class="num">Valor</th></tr></thead>
      <tbody>${linhas.join("")}</tbody>
      <tfoot><tr><td colspan="6">Total dos itens${valor != null ? ` · nota ${this.money(valor)}` : ""}</td><td class="num ${valor == null ? "" : (fecha ? "is-ok" : "is-erro")}">${this.money(total)}</td></tr></tfoot></table>
      <div class="inf-linha-acoes">
        <label class="inf-chk"><input type="checkbox" ${s.form.manterSaldo ? "checked" : ""} onchange="InserirNotaApp.setCampo('manterSaldo', this.checked)"> Manter o saldo restante do pedido em aberto</label>
        ${s.qtdEditada ? `<button type="button" class="btn btn-outline inf-btn-sm" onclick="InserirNotaApp.redistribuir()"><i data-lucide="rotate-ccw"></i> Recalcular pelo valor da nota</button>` : ""}
      </div>`;
  },

  resultadoHtml() {
    const r = this.state.resultado;
    if (!r) return "";
    return `<div class="inf-resultado ${r.ok ? "is-ok" : "is-erro"}">
      <b>${r.ok ? `Nota inserida no Sienge · sequencial ${this.esc(r.seq)}` : (r.seq ? `A nota foi criada (sequencial ${this.esc(r.seq)}), mas os itens não entraram` : "A nota não foi criada")}</b>
      <ul>${r.log.map((t) => `<li>${this.esc(t)}</li>`).join("")}</ul>
      ${r.ok ? `<p>Agora, no Sienge, abra a nota ${this.esc(r.seq)}: confira os impostos e a condição de pagamento${this.state.item && this.state.item.pagamento ? ` (<b>${this.esc(this.pagamentoTxt(this.state.item.pagamento))}</b>)` : ""} e consista a nota para gerar o título.</p>`
        : (r.seq ? `<p>Corrija o motivo acima e clique em <b>Inserir no Sienge</b> de novo: o CRM tenta incluir os itens na mesma nota ${this.esc(r.seq)}, sem criar outra.</p>` : "")}
    </div>`;
  },

  css() {
    return `
        .inf-wrap { padding: 20px; max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 1fr); gap: 16px; align-items: start; }
        .inf-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
        .inf-card h3 { margin: 0 0 10px; font-size: 0.95rem; color: #105436; display: flex; align-items: center; gap: 8px; }
        .inf-card h3 i { width: 16px; height: 16px; }
        .inf-muted { color: #64748b; font-size: 0.82rem; margin: 6px 0; }
        .inf-erro { color: #b91c1c; font-size: 0.85rem; margin: 6px 0; }
        .inf-busca { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
        .inf-busca input { height: 38px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 12px; font-size: 0.95rem; width: 180px; }
        .inf-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
        .inf-grid label, .inf-form label { display: block; font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 3px; }
        .inf-grid b { display: block; font-size: 0.86rem; color: #0f172a; }
        .inf-grid small { color: #64748b; font-size: 0.75rem; }
        .inf-prev { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.82rem; color: #334155; }
        .inf-prev i { width: 16px; height: 16px; color: #105436; flex: 0 0 16px; }
        .inf-form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
        .inf-form input, .inf-form select { width: 100%; height: 36px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 10px; font-size: 0.86rem; background: #fff; box-sizing: border-box; }
        .inf-span2 { grid-column: span 2; } .inf-span4 { grid-column: span 4; }
        .inf-file { display: flex; align-items: center; gap: 8px; border: 1px dashed #94a3b8; border-radius: 8px; padding: 10px 12px; cursor: pointer; color: #334155; font-size: 0.86rem; }
        .inf-file i { width: 18px; height: 18px; color: #105436; }
        .inf-file input { display: none; }
        .inf-tab { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .inf-tab th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #64748b; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        .inf-tab td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .inf-tab .num { text-align: right; white-space: nowrap; }
        .inf-tab small { color: #94a3b8; }
        .inf-tab tfoot td { font-weight: 800; border-bottom: 0; }
        .inf-tab .is-ok { color: #105436; } .inf-tab .is-erro { color: #b91c1c; }
        .inf-tab tr.is-sem-saldo td { color: #94a3b8; }
        .inf-qtd { width: 90px; height: 30px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 8px; text-align: right; }
        .inf-linha-acoes { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
        .inf-chk { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; color: #334155; }
        .inf-btn-sm { height: 32px; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; }
        .inf-btn-sm i { width: 14px; height: 14px; }
        .inf-check { list-style: none; margin: 0; padding: 0; font-size: 0.84rem; }
        .inf-check li { display: flex; gap: 8px; padding: 4px 0; }
        .inf-check li span { font-weight: 800; width: 14px; flex: 0 0 14px; }
        .inf-check .is-erro { color: #b91c1c; } .inf-check .is-aviso { color: #c2410c; } .inf-check .is-ok { color: #105436; } .inf-check .is-info { color: #0f766e; }
        .nfchk-tab { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-top: 8px; }
        .nfchk-tab th, .nfchk-tab td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        .nfchk-tab th { font-size: 0.68rem; text-transform: uppercase; color: #64748b; }
        .inf-acoes { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
        .inf-acoes .btn { height: 38px; display: inline-flex; align-items: center; gap: 8px; padding: 0 16px; }
        .inf-acoes .btn i { width: 16px; height: 16px; }
        .inf-preview { position: sticky; top: 12px; }
        .inf-preview img { width: 100%; display: block; border: 1px solid #e2e8f0; border-radius: 8px; }
        .inf-lupa-area { position: relative; overflow: hidden; border-radius: 8px; cursor: zoom-in; }
        .inf-lupa-area.is-ativa { cursor: none; }
        .inf-lupa { position: absolute; display: none; width: 360px; height: 360px; border-radius: 50%; border: 3px solid #105436; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28); background-color: #fff; background-repeat: no-repeat; pointer-events: none; z-index: 5; }
        .inf-lupa-dica { display: flex; align-items: center; gap: 6px; margin: 8px 0 0; color: #64748b; font-size: 0.76rem; }
        .inf-lupa-dica i { width: 14px; height: 14px; }
        .inf-resultado { border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; font-size: 0.85rem; }
        .inf-resultado.is-ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
        .inf-resultado.is-erro { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
        .inf-resultado ul { margin: 6px 0; padding-left: 18px; }
        .inf-resultado p { margin: 6px 0 0; }
        @media (max-width: 1100px) { .inf-wrap { grid-template-columns: 1fr; } .inf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`;
  },

  render() {
    const root = document.getElementById("inserir-nota-root");
    if (!root) return;
    if (!this.state) this.state = this.novoEstado();
    const fila = !!window.FilaNotasFiscais;
    const aba = fila ? this.aba : "lancar";
    root.innerHTML = `
      <style>
        ${this.css()}
        ${fila ? FilaNotasFiscais.css() : ""}
        .inf-tabs { margin: 16px 20px 0; }
        .inf-item { border-color: #105436; background: #f8fdf9; }
        .inf-item .inf-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .fnf-atrasado { color: #b91c1c; font-weight: 700; }
      </style>
      ${fila ? `<div class="ml-tabs inf-tabs" id="inf-tabs" role="tablist">${this.abasHtml()}</div>` : ""}
      ${aba === "fila" ? this.filaHtml() : this.lancarHtml()}`;
    if (window.lucide) lucide.createIcons();
  },

  abasHtml() {
    const abertas = this.fila.itens.filter((x) => FilaNotasFiscais.aberta(x)).length;
    const item = this.state.item;
    const tabs = [
      { id: "fila", label: "Fila do fiscal", icon: "inbox", n: abertas },
      { id: "lancar", label: item ? `Lançando pedido ${item.pedido}` : "Lançar nota", icon: "file-up" }
    ];
    return tabs.map((t) => `<button type="button" role="tab" aria-selected="${this.aba === t.id}" class="ml-tab ${this.aba === t.id ? "is-active" : ""}" onclick="InserirNotaApp.setAba('${t.id}')"><i data-lucide="${t.icon}"></i> ${this.esc(t.label)}${t.n ? ` <span class="ml-tab-count">${t.n}</span>` : ""}</button>`).join("");
  },

  pintarAbas() {
    const el = document.getElementById("inf-tabs");
    if (!el) return;
    el.innerHTML = this.abasHtml();
    if (window.lucide) lucide.createIcons();
  },

  lancarHtml() {
    const s = this.state;
    const pode = this.podeEditar();
    const bloqueado = !!s.enviando || this.conferir().erros.length > 0 || !pode;
    return `
      <div class="inf-wrap">
        <div>
          ${this.resultadoHtml()}
          ${this.itemHtml()}
          <div class="inf-card">
            <h3><i data-lucide="clipboard-list"></i> Pedido de compra</h3>
            <div class="inf-busca">
              <input id="inf-pedido" placeholder="Nº do pedido (ex.: 110540 ou 123/26)" title="Pode digitar como aparece no Sienge; no sequencial anual (123/26) o CRM converte para o id da API (26000123)." value="${this.esc(s.pedidoId)}" onkeydown="if(event.key==='Enter')InserirNotaApp.buscarPedido()">
              <button type="button" class="btn btn-primary inf-btn-sm" style="height:38px;" onclick="InserirNotaApp.buscarPedido()" ${s.carregando ? "disabled" : ""}><i data-lucide="search"></i> Buscar pedido</button>
              ${s.carregando ? `<span class="inf-muted"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> ${this.esc(s.carregando)}</span>` : ""}
            </div>
            ${this.pedidoHtml()}
          </div>
          <div class="inf-card">
            <h3><i data-lucide="file-text"></i> Nota fiscal</h3>
            ${this.notaHtml()}
          </div>
          ${s.pedido ? `<div class="inf-card"><h3><i data-lucide="package-check"></i> Entregas do pedido a faturar</h3>${this.itensHtml()}</div>` : ""}
          <div class="inf-card">
            <h3><i data-lucide="list-checks"></i> Conferência</h3>
            <div id="inf-conf">${this.conferenciaHtml()}</div>
            <div id="inf-fiscal">${window.NotaFiscalCheck ? NotaFiscalCheck.painelEnvio(s.fiscal) : ""}</div>
            <label class="inf-chk" style="margin-top:10px;"><input type="checkbox" ${s.form.anexar ? "checked" : ""} onchange="InserirNotaApp.setCampo('anexar', this.checked)"> Anexar ${s.item && (s.item.anexos || []).length > 1 ? "a nota e os outros anexos do envio (boleto etc.)" : "o arquivo da nota"} no pedido e copiar para a nota no Sienge</label>
            <div class="inf-acoes">
              <button type="button" class="btn btn-outline" onclick="InserirNotaApp.recomecar()" ${s.enviando ? "disabled" : ""}><i data-lucide="rotate-ccw"></i> Recomeçar</button>
              <button type="button" id="inf-inserir" class="btn btn-primary" onclick="InserirNotaApp.inserir()" ${bloqueado ? "disabled" : ""}
                title="${pode ? "" : "Sem permissão de edição em Fiscal › Inserir nota"}">
                ${s.enviando ? `<span class="btn-spin"></span> ${this.esc(s.enviando)}` : `<i data-lucide="upload"></i> Inserir no Sienge`}</button>
            </div>
          </div>
        </div>
        <div class="inf-preview">
          <div class="inf-card">
            <h3><i data-lucide="image"></i> Nota anexada</h3>
            ${s.preview ? `<div class="inf-lupa-area" onmousemove="InserirNotaApp.lupa(event)" onmouseleave="InserirNotaApp.lupa(event, true)" onwheel="InserirNotaApp.zoomLupa(event)">
                <img src="${s.preview}" alt="Nota fiscal" draggable="false"><div class="inf-lupa"></div></div>
              <p class="inf-lupa-dica"><i data-lucide="zoom-in"></i> Passe o mouse para ampliar · role a roda do mouse sobre a nota para mudar o zoom: <strong class="inf-lupa-zoom">${(this._zoom || 2.5).toLocaleString("pt-BR")}x</strong></p>` : `<p class="inf-muted">${s.arquivo && /\.xml$/i.test(s.arquivo.name) ? "Nota em XML: os campos foram lidos direto do arquivo." : "A imagem da nota aparece aqui para conferir os campos."}</p>`}
          </div>
        </div>
      </div>`;
  }
};
