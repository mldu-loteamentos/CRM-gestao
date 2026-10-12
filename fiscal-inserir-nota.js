/* Fiscal › Validar nota: cadastra a nota fiscal de compra no Sienge a partir das entregas de um pedido de compra.
   Sienge: POST /purchase-invoices (cabeçalho) → POST /purchase-invoices/{seq}/items/purchase-orders/delivery-schedules (itens).
   A API não informa impostos, condição de pagamento nem consiste a nota: isso é finalizado no Sienge.
   Leitura da nota: XML, PDF com texto ou, se for imagem, OCR (Tesseract.js carregado só quando preciso). */
window.InserirNotaApp = {
  TESSERACT_URL: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  TOL: 0.05,
  DOCUMENTOS: ["NFS", "NFSE", "NF", "NFE", "RPA", "FAT"],
  MOTIVOS_CANCELAMENTO_KEY: "crm_fiscal_motivos_cancelamento",

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
      itemAnexoNota: null,
      validado: false
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
    if (!id) {
      if (window.EnviarNotaApp) { EnviarNotaApp._buscaAlvo = "inserir"; EnviarNotaApp.abrirBuscaPedidos(); }
      return;
    }
    Object.assign(s, { pedidoId: digitado, pedidoApi: id, pedidoNome: digitado, pedido: null, credor: null, itens: [], erro: "", empresaCc: "", cc: null, previsao: null, qtdEditada: false, duplicada: null, criada: null, resultado: null });
    s.carregando = "Buscando o pedido no Sienge…";
    this.render();
    try {
      const pedido = await this.get(`/purchase-orders/${id}`);
      if (!pedido || typeof pedido !== "object" || pedido.id == null) throw new Error("pedido não encontrado");
      if (window.EnviarNotaApp && !EnviarNotaApp.pedidoPermitido(pedido)) {
        s.carregando = "";
        s.erro = "Esse pedido é de um departamento fora do seu acesso.";
        this.render();
        EnviarNotaApp._buscaAlvo = "inserir";
        EnviarNotaApp.abrirBuscaPedidos();
        return;
      }
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
      const sumiu = /404|não encontrado/i.test(msg);
      s.erro = sumiu ? `Pedido ${id} não encontrado no seu acesso.`
        : (/403/.test(msg) ? "O usuário da API não tem permissão para consultar pedidos de compra." : `Não consegui buscar o pedido: ${msg}`);
      this.render();
      if (sumiu && window.EnviarNotaApp) { EnviarNotaApp._buscaAlvo = "inserir"; EnviarNotaApp.abrirBuscaPedidos(); }
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
    if (!s._mantemValidacao) this.invalidarValidacao();
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

    if (s.credor && window.FilaNotasFiscais) FilaNotasFiscais.avisosAprendidos(s.credor.doc).forEach((t) => avisos.push(t));
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
    if (!s.validado) { alert("Clique em Validar antes de inserir a nota no Sienge."); return; }
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
      + "A nota gera o título no contas a pagar. O CRM envia o anexo e a forma de pagamento nesse título. Impostos e a consistência da nota continuam no Sienge.";
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;

    const log = [];
    s.resultado = null;
    try {
      if (!s.criada) {
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
        s.criada = { seq: String(seq) };
        log.push(`Nota criada no Sienge (sequencial ${seq}).`);
        this.auditar("ok", `Nota ${cab.documentId} ${cab.number} criada (sequencial ${seq}) para o pedido ${s.pedidoNome}`, { cabecalho: cab, log });
      }
      s.enviando = "Incluindo os itens do pedido na nota…";
      this.render();
      const corpo = { deliveriesOrder: entregas, copyNotesPurchaseOrders: false, copyNotesResources: false, copyAttachmentsPurchaseOrders: false };
      const r2 = await this.enviar(`/purchase-invoices/${s.criada.seq}/items/purchase-orders/delivery-schedules`, { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const itens = this.lista(r2.body);
      log.push(`${itens.length || entregas.length} item(ns) incluído(s).`);
      await this.completarTitulo(s.criada.seq, log);
      s.resultado = { ok: true, seq: s.criada.seq, log, itens };
      this.auditar("ok", `Nota ${f.documento} ${f.numero} enviada ao Sienge (sequencial ${s.criada.seq})${s.billId ? ", título " + s.billId : ""} · pedido ${s.pedidoNome}`, { entregas, log });
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
    if (s.resultado && s.resultado.ok) this.subir();
  },

  subir() {
    const main = document.querySelector(".main-content");
    const root = document.getElementById("inserir-nota-root");
    if (main) main.scrollTo({ top: 0, behavior: "smooth" });
    if (root) root.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  /** O título nasce junto com os itens da nota. O Sienge pode demorar um instante para devolver o billId. */
  async tituloDaNota(seq) {
    for (let i = 0; i < 5; i++) {
      const inv = await this.get(`/purchase-invoices/${encodeURIComponent(seq)}`).catch(() => null);
      const id = inv && inv.billId;
      if (id != null && id !== "") return String(id);
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
    return "";
  },

  async anexarNoTitulo(billId, file, descricao) {
    const fd = new FormData();
    const nome = String(file.name || "anexo.pdf").slice(-100);
    fd.append("file", file, nome);
    const q = encodeURIComponent(String(descricao || nome).slice(0, 499));
    await this.enviar(`/bills/${encodeURIComponent(billId)}/attachments?description=${q}`, { body: fd });
  },

  async completarTitulo(seq, log) {
    const s = this.state;
    const f = s.form;
    s.enviando = "Localizando o título no contas a pagar…";
    this.render();
    const billId = await this.tituloDaNota(seq);
    s.billId = billId || "";
    if (!billId) {
      log.push("A nota entrou, mas o Sienge ainda não devolveu o número do título. O anexo e a forma de pagamento não foram enviados.");
      return;
    }
    log.push(`Título ${billId} no contas a pagar.`);
    if (f.anexar) {
      const arquivos = [];
      const nf = `NF ${f.numero}${f.serie ? "/" + f.serie : ""}`;
      if (s.arquivo) arquivos.push({ file: s.arquivo, desc: nf });
      const extras = s.item && window.FilaNotasFiscais
        ? (s.item.anexos || []).filter((a) => a !== s.itemAnexoNota && !(a.tipo === "nota" && s.arquivo))
        : [];
      for (const a of extras) {
        try {
          const rot = FilaNotasFiscais.TIPOS_ANEXO[a.tipo] || "Anexo";
          arquivos.push({ file: await FilaNotasFiscais.baixar(a), desc: `${rot} ${nf}` });
        } catch (e) {
          log.push(`Não consegui baixar ${a.nome || "o anexo"} para o título: ${e.message}`);
        }
      }
      for (const arq of arquivos) {
        s.enviando = "Anexando no título…";
        this.render();
        try {
          await this.anexarNoTitulo(billId, arq.file, arq.desc);
          log.push(`Anexo enviado no título ${billId}: ${arq.desc}.`);
        } catch (e) {
          log.push(`Não consegui anexar no título ${billId}: ${e.message}`);
        }
      }
    }
    const pag = s.item && s.item.pagamento;
    const venc = pag && pag.data ? String(pag.data).slice(0, 10) : "";
    const valor = this.valorNota() != null ? this.valorNota() : this.totalItens();
    s.enviando = "Ajustando as parcelas do título…";
    this.render();
    try {
      const aviso = await this.consistirParcelas(billId, valor, venc);
      if (aviso) log.push(aviso);
    } catch (e) {
      log.push(`Não consegui ajustar as parcelas do título ${billId}: ${e.message}`);
    }
    if (pag && pag.forma) {
      s.enviando = "Gravando a forma de pagamento no título…";
      this.render();
      try {
        const msg = await this.informarPagamento(billId, pag);
        if (msg) log.push(msg);
      } catch (e) {
        log.push(`Não consegui gravar a forma de pagamento no título ${billId}: ${e.message}`);
      }
    }
  },

  /**
   * O Sienge deixa o título incompleto por soma de parcelas enquanto as parcelas
   * (vindas da previsão do pedido) não fecham o valor da nota. Abrir a aba Título
   * e salvar faz essa conta na tela. Aqui a parcela única recebe o valor da nota
   * e o vencimento confirmado pelo operador.
   */
  async consistirParcelas(billId, valor, vencimento) {
    const alvo = Number.isFinite(Number(valor)) ? Number(Number(valor).toFixed(2)) : null;
    const ler = () => this.get(`/bills/${encodeURIComponent(billId)}/installments`).then((r) => this.lista(r)).catch(() => []);
    let inst = [];
    for (let i = 0; i < 3 && !inst.length; i++) {
      inst = await ler();
      if (!inst.length) await new Promise((r) => setTimeout(r, 800));
    }
    if (!inst.length) return "O título ainda não tem parcela. Abra a aba Título no Sienge e salve para o sistema reconhecer o título.";
    const valorDe = (p) => Number(p.originalAmount != null ? p.originalAmount : p.amount) || 0;
    const idDe = (p, i) => (p.installmentNumber != null ? p.installmentNumber : (p.installmentId != null ? p.installmentId : i + 1));
    const soma = inst.reduce((t, p) => t + valorDe(p), 0);
    const fecha = alvo == null || Math.abs(soma - alvo) <= 0.02;
    const dataOk = !vencimento || inst.every((p) => String(p.dueDate || "").slice(0, 10) === vencimento);
    if (fecha && dataOk && inst.length === 1) return "";
    if (inst.length > 1 && alvo != null) {
      await this.enviar(`/bills/${encodeURIComponent(billId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ installmentsNumber: 1, totalInvoiceAmount: alvo }, vencimento ? { dueDate: vencimento } : {}))
      }).catch(() => {});
      const deNovo = await ler();
      if (deNovo.length) inst = deNovo;
    }
    const body = {};
    if (vencimento) body.dueDate = vencimento;
    if (alvo != null) {
      body.originalAmount = alvo;
      body.amount = alvo;
    }
    await this.enviar(`/bills/${encodeURIComponent(billId)}/installments/${encodeURIComponent(idDe(inst[0], 0))}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    for (let i = 1; i < inst.length; i++) {
      const id = idDe(inst[i], i);
      const path = `/bills/${encodeURIComponent(billId)}/installments/${encodeURIComponent(id)}`;
      const apagou = await this.enviar(path, { method: "DELETE" }).then(() => true).catch(() => false);
      if (!apagou) {
        await this.enviar(path, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originalAmount: 0, amount: 0 })
        }).catch(() => {});
      }
    }
    return "";
  },

  contaDaTransferencia(pag) {
    const c = pag && pag.conta;
    const partida = (txt) => {
      const m = String(txt || "").match(/^(\d+)[^\d](\w+)$/);
      return m ? { numero: m[1], digito: m[2] } : { numero: String(txt || "").replace(/\D/g, ""), digito: "" };
    };
    if (c && (c.banco || c.agencia || c.conta)) {
      const conta = partida(c.conta);
      return {
        banco: String(c.banco || "").replace(/\D/g, ""),
        agencia: (String(c.agencia || "").match(/\d+/) || [""])[0],
        numero: conta.numero,
        digito: conta.digito,
        tipo: /poup/i.test(c.tipo || "") ? "P" : "C",
        favorecido: c.favorecido || ""
      };
    }
    const t = String((pag && pag.detalhe) || "");
    const conta = t.match(/Conta\s+(\d+)\s*-\s*(\w+)/i);
    return {
      banco: (t.match(/\((\d{3})\)/) || [])[1] || "",
      agencia: (String((t.match(/Ag\.?\s*([\d.\-]+)/i) || [])[1] || "").match(/\d+/) || [""])[0],
      numero: conta ? conta[1] : "",
      digito: conta ? conta[2] : "",
      tipo: /poup/i.test(t) ? "P" : "C",
      favorecido: ""
    };
  },

  async informarPagamento(billId, pag) {
    const inst = this.lista(await this.get(`/bills/${encodeURIComponent(billId)}/installments`));
    const parcela = (inst[0] && (inst[0].installmentNumber || inst[0].id)) || 1;
    const forma = String(pag.forma || "");
    const base = `/bills/${encodeURIComponent(billId)}/installments/${encodeURIComponent(parcela)}/payment-information`;
    const json = (path, body) => this.enviar(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (/boleto/i.test(forma)) {
      const linha = String(pag.detalhe || "").replace(/\D/g, "");
      if (linha.length !== 47) throw new Error("o boleto não tem linha digitável de 47 dígitos");
      const codigo = window.BoletoCheck && typeof BoletoCheck.linhaBancariaParaCodigo === "function" ? BoletoCheck.linhaBancariaParaCodigo(linha) : "";
      const body = {
        notes: `Pagamento em ${this.dataBr(pag.data)} · boleto`,
        boletoBancarioManualBarCodeNumber: linha,
        documentNumber: String(this.state.form.numero || "")
      };
      if (codigo && codigo.length === 44) body.boletoBancarioBarCodeNumber = codigo;
      await json(`${base}/boleto-bancario`, body);
      return "";
    }
    if (/pix/i.test(forma)) {
      await json(`${base}/pix`, {
        paymentTypeId: 17,
        isUsingCreditorData: "S",
        notes: pag.detalhe ? `PIX: ${pag.detalhe}` : "Pagamento via PIX (chave do credor)"
      });
      return "";
    }
    if (/transf|ted|d[eé]bito/i.test(forma)) {
      const conta = this.contaDaTransferencia(pag);
      if (!conta.banco || !conta.agencia || !conta.numero) {
        throw new Error("a transferência precisa de banco, agência e conta separados");
      }
      const body = {
        beneficiaryBankCode: conta.banco,
        beneficiaryBankBranchNumber: conta.agencia,
        beneficiaryAccountNumber: conta.numero,
        beneficiaryAccountType: conta.tipo,
        notes: `Pagamento em ${this.dataBr(pag.data)} · ${forma}`
      };
      if (conta.digito) body.beneficiaryAccountDigit = conta.digito;
      if (conta.favorecido) body.beneficiaryName = conta.favorecido;
      const path = `${base}/bank-transfer`;
      try {
        await this.enviar(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } catch (e) {
        await json(path, body);
      }
      return "";
    }
    throw new Error(`a forma ${forma} não tem um tipo de pagamento correspondente no título`);
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
        customerId: s.pedido && s.pedido.supplierId != null ? String(s.pedido.supplierId) : "",
        enterpriseId: s.form && s.form.companyId != null ? String(s.form.companyId) : "",
        titleId: s.billId || "",
        endpoint: "/purchase-invoices", method: "POST",
        details: Object.assign({ pedido: s.pedidoNome, pedidoApi: s.pedidoApi, documento: s.form.documento, numero: s.form.numero, serie: s.form.serie, empresa: s.form.companyId }, details || {})
      });
    } catch (e) {}
  },

  /* ---------- eventos ---------- */
  setCampo(campo, valor) {
    const f = this.state.form;
    f[campo] = typeof f[campo] === "boolean" ? !!valor : String(valor == null ? "" : valor);
    if (["numero", "serie", "documento", "emissao", "companyId"].includes(campo)) this.invalidarValidacao();
    if (["numero", "serie", "documento"].includes(campo)) {
      if (campo !== "documento" && /^NF\b/.test(f.notes || "")) f.notes = this.observacaoPadrao();
      clearTimeout(this._dupT);
      this._dupT = setTimeout(() => this.verificarDuplicada(), 600);
    }
    this.pintarConferencia();
  },

  setValorNota(v) {
    this.invalidarValidacao();
    const s = this.state;
    s.nota = s.nota || { origem: "digitado" };
    s.nota.valor = this.num(v);
    this.distribuir();
    this.render();
  },

  setQtd(item, entrega, v) {
    this.invalidarValidacao();
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
    const abertas = itens.filter((x) => FilaNotasFiscais.aberta(x)).sort((a, b) => dia(a).localeCompare(dia(b)) || (a.criadoEm || 0) - (b.criadoEm || 0));
    const acompanhamento = itens.filter((x) => x.status === "devolvida" || x.status === "excluida");
    return abertas.concat(acompanhamento);
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
    s.validado = !!item.validadoEm;
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
        s._mantemValidacao = !!item.validadoEm;
        await this.lerArquivo({ files: [file] });
        s._mantemValidacao = false;
        s.validado = !!item.validadoEm;
      } catch (e) {
        s._mantemValidacao = false;
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

  invalidarValidacao() {
    const s = this.state;
    if (!s || s._mantemValidacao || (!s.validado && !(s.item && s.item.validadoEm))) return;
    s.validado = false;
    const item = s.item;
    if (item && item.validadoEm && window.FilaNotasFiscais) {
      item.validadoEm = 0;
      item.validadoPor = "";
      FilaNotasFiscais.atualizar(item, { validadoEm: 0, validadoPor: "" }, "validacao-desfeita").catch(() => {});
    }
  },

  async validar() {
    const s = this.state;
    if (!this.podeEditar()) { alert("Sem permissão para inserir notas no Sienge."); return; }
    const c = this.conferir();
    if (c.erros.length) { alert("Ainda há pendência na conferência:\n\n" + c.erros.join("\n")); return; }
    s.validado = true;
    const item = s.item;
    if (item && window.FilaNotasFiscais) {
      const u = FilaNotasFiscais.usuario();
      try {
        await FilaNotasFiscais.atualizar(item, { validadoEm: Date.now(), validadoPor: u.nome }, "validada", "Nota conferida antes do lançamento");
      } catch (e) {
        s.validado = false;
        alert(`Não consegui registrar a validação: ${(e && e.message) || e}`);
        return;
      }
    }
    this.render();
  },

  motivosCancelamento() {
    const base = [
      "Valor do serviço ou da mercadoria errado",
      "CNPJ ou nome do tomador errado",
      "CNPJ ou razão social do prestador errado",
      "Imposto, retenção ou alíquota errados",
      "Discriminação que altera o serviço, a mercadoria ou o fato gerador",
      "Data de emissão errada",
      "Município de incidência do ISS errado",
      "Nota em duplicidade",
      "Nota emitida para outro pedido, empresa ou centro de custo"
    ];
    let extra = [];
    try { extra = JSON.parse(localStorage.getItem(this.MOTIVOS_CANCELAMENTO_KEY) || "[]"); } catch (e) { extra = []; }
    if (!Array.isArray(extra)) extra = [];
    const vistos = new Set(base.map((t) => t.toLowerCase()));
    extra.forEach((t) => {
      const s = String(t || "").trim();
      if (s && !vistos.has(s.toLowerCase())) { vistos.add(s.toLowerCase()); base.push(s); }
    });
    return base;
  },

  devolver(id) {
    const item = this.fila.itens.find((x) => x.id === id) || (this.state.item && this.state.item.id === id ? this.state.item : null);
    if (!item || !this.podeEditar()) return;
    this._devItem = item;
    this._devTipo = "cancelamento";
    this.fecharDevolver();
    const pop = document.createElement("div");
    pop.id = "fnf-dev";
    pop.className = "fnf-dev";
    pop.innerHTML = this.devolucaoModalHtml(item);
    pop.addEventListener("click", (ev) => { if (ev.target === pop) this.fecharDevolver(); });
    document.body.appendChild(pop);
    if (window.lucide) lucide.createIcons();
  },

  devolucaoModalHtml(item) {
    const esc = (v) => this.esc(v);
    return `<div class="fnf-dev-box" role="dialog" aria-modal="true">
      <h3>Devolver a nota do pedido ${esc(item.pedido)}</h3>
      <p class="inf-muted">${esc(item.fornecedor && item.fornecedor.nome || "")}${item.numeroNota ? ` · NF ${esc(item.numeroNota)}` : ""}. A orientação abaixo chega para quem enviou a nota.</p>
      <div class="fnf-dev-ops">
        <button type="button" class="fnf-dev-op ${this._devTipo === "cancelamento" ? "is-on" : ""}" onclick="InserirNotaApp.tipoDevolucao('cancelamento')"><b>Cancelar nota</b><small>O operador reenvia neste mesmo pedido a nota nova e a nota cancelada com a tarja.</small></button>
        <button type="button" class="fnf-dev-op ${this._devTipo === "carta" ? "is-on" : ""}" onclick="InserirNotaApp.tipoDevolucao('carta')"><b>Pedir carta de correção</b><small>Gera um documento com o que foi informado e o que deveria ser.</small></button>
      </div>
      <div id="fnf-dev-corpo">${this._devTipo === "carta" ? this.cartaDevolucaoHtml() : this.cancelamentoDevolucaoHtml()}</div>
      <label class="inf-muted" for="fnf-dev-extra">Orientação extra para o operador</label>
      <textarea id="fnf-dev-extra" placeholder="O que a pessoa que enviou a nota precisa fazer, além do motivo marcado."></textarea>
      <div class="fnf-dev-acoes">
        <button type="button" class="btn btn-cancel" onclick="InserirNotaApp.fecharDevolver()">Cancelar</button>
        <button type="button" id="fnf-dev-ok" class="btn btn-primary" onclick="InserirNotaApp.confirmarDevolver()">Devolver ao operador</button>
      </div>
    </div>`;
  },

  cancelamentoDevolucaoHtml() {
    const esc = (v) => this.esc(v);
    const checks = this.motivosCancelamento().map((m) => `<label><input type="checkbox" name="motivo" value="${esc(m)}"> <span>${esc(m)}</span></label>`).join("");
    return `<p class="inf-muted">Carta de correção não altera valor, imposto, tomador, prestador nem a descrição do serviço. Nestes casos a nota precisa ser cancelada:</p>
      <div class="fnf-motivos" id="fnf-motivos">${checks}</div>
      <button type="button" class="btn btn-outline inf-btn-sm" onclick="InserirNotaApp.adicionarMotivoCancelamento()"><i data-lucide="plus"></i> Adicionar motivo</button>
      <p class="inf-muted" style="margin-top:10px;">O operador usa o mesmo pedido, anexa a nota nova e a nota cancelada com a tarja de cancelada. Sem a nota cancelada o sistema não deixa começar outro envio nesse pedido.</p>`;
  },

  camposCarta() {
    return [
      "Informações complementares",
      "Endereço do tomador (logradouro, número ou complemento)",
      "Bairro do tomador",
      "CEP do tomador",
      "E-mail do tomador",
      "Telefone do tomador",
      "Inscrição municipal",
      "Discriminação complementar, sem alterar o serviço",
      "Dados de transporte ou veículo",
      "Grafia da razão social, sem trocar a pessoa"
    ];
  },

  cartaDevolucaoHtml() {
    const linha = () => `<div class="fnf-carta-linha"><select data-k="campo">${this.camposCarta().map((c) => `<option value="${this.esc(c)}">${this.esc(c)}</option>`).join("")}</select><input data-k="informado" placeholder="O que foi informado"><input data-k="deveria" placeholder="O que deveria ser"></div>`;
    return `<p class="inf-muted">O campo já lista o que a carta de correção pode alterar. Valor, imposto, tomador, prestador e a descrição do serviço continuam no cancelamento.</p>
      <div class="fnf-carta-h"><span>Campo</span><span>Informado na nota</span><span>Deveria ser</span></div>
      <div class="fnf-carta-linhas" id="fnf-carta-linhas">${linha()}</div>
      <button type="button" class="btn btn-outline inf-btn-sm" onclick="InserirNotaApp.adicionarLinhaCarta()"><i data-lucide="plus"></i> Adicionar linha</button>`;
  },

  tipoDevolucao(tipo) {
    this._devTipo = tipo === "carta" ? "carta" : "cancelamento";
    const box = document.querySelector("#fnf-dev .fnf-dev-box");
    if (!box || !this._devItem) return;
    const extra = (document.getElementById("fnf-dev-extra") || {}).value || "";
    box.outerHTML = this.devolucaoModalHtml(this._devItem).replace('id="fnf-dev-extra"', `id="fnf-dev-extra"`);
    const ta = document.getElementById("fnf-dev-extra");
    if (ta) ta.value = extra;
    if (window.lucide) lucide.createIcons();
  },

  async adicionarMotivoCancelamento() {
    const pergunta = "Novo motivo de cancelamento";
    const resp = typeof window.mouraPrompt === "function" ? await window.mouraPrompt(pergunta, "") : prompt(pergunta);
    const txt = String(resp || "").trim();
    if (!txt) return;
    let extra = [];
    try { extra = JSON.parse(localStorage.getItem(this.MOTIVOS_CANCELAMENTO_KEY) || "[]"); } catch (e) { extra = []; }
    if (!Array.isArray(extra)) extra = [];
    if (!this.motivosCancelamento().some((t) => t.toLowerCase() === txt.toLowerCase())) {
      extra.push(txt);
      localStorage.setItem(this.MOTIVOS_CANCELAMENTO_KEY, JSON.stringify(extra));
    }
    const marcados = new Set([...document.querySelectorAll("#fnf-motivos input:checked")].map((el) => el.value));
    marcados.add(txt);
    const box = document.getElementById("fnf-motivos");
    if (!box) return;
    const esc = (v) => this.esc(v);
    box.innerHTML = this.motivosCancelamento().map((m) => `<label><input type="checkbox" name="motivo" value="${esc(m)}" ${marcados.has(m) ? "checked" : ""}> <span>${esc(m)}</span></label>`).join("");
  },

  adicionarLinhaCarta() {
    const box = document.getElementById("fnf-carta-linhas");
    if (!box) return;
    const div = document.createElement("div");
    div.className = "fnf-carta-linha";
    div.innerHTML = `<select data-k="campo">${this.camposCarta().map((c) => `<option value="${this.esc(c)}">${this.esc(c)}</option>`).join("")}</select><input data-k="informado" placeholder="O que foi informado"><input data-k="deveria" placeholder="O que deveria ser">`;
    box.appendChild(div);
  },

  fecharDevolver() {
    const pop = document.getElementById("fnf-dev");
    if (pop) pop.remove();
  },

  async confirmarDevolver() {
    const item = this._devItem;
    if (!item) return;
    const btn = document.getElementById("fnf-dev-ok");
    const extra = String((document.getElementById("fnf-dev-extra") || {}).value || "").trim();
    const u = FilaNotasFiscais.usuario();
    const tipo = this._devTipo === "carta" ? "carta" : "cancelamento";
    let patch;
    let txt;
    if (tipo === "cancelamento") {
      const motivos = [...document.querySelectorAll("#fnf-motivos input[name=motivo]:checked")].map((el) => el.value).filter(Boolean);
      if (!motivos.length) { alert("Marque ao menos um motivo de cancelamento."); return; }
      txt = [
        "Cancele esta nota e reenvie neste mesmo pedido a nota nova e a nota cancelada, com a tarja de cancelada.",
        "Sem a nota cancelada anexada, o pedido continua amarrado e o sistema não deixa começar outro envio.",
        "",
        "Motivos:",
        ...motivos.map((m) => "• " + m),
        extra ? "" : "",
        extra ? "Orientação: " + extra : ""
      ].filter((x) => x !== "").join("\n");
      patch = {
        status: "devolvida", devolucaoTipo: "cancelamento", motivosCancelamento: motivos, motivoDevolucao: txt,
        devolvidoPor: u.nome, devolvidoPorSienge: u.sienge, devolvidoEm: Date.now(), assumidoPor: "", assumidoPorEmail: "",
        validadoEm: 0, validadoPor: ""
      };
    } else {
      const campo = (row, k) => String((row.querySelector(`[data-k="${k}"]`) || {}).value || "").trim();
      const linhas = [...document.querySelectorAll("#fnf-carta-linhas .fnf-carta-linha")].map((row) => ({
        campo: campo(row, "campo"),
        informado: campo(row, "informado"),
        deveria: campo(row, "deveria")
      })).filter((l) => l.informado || l.deveria);
      if (!linhas.length) { alert("Preencha pelo menos um campo: o que foi informado ou o que deveria ser. As outras linhas você adiciona depois."); return; }
      txt = [
        "Emita carta de correção. O documento em anexo mostra o que foi informado e o que deveria ser.",
        ...linhas.map((l) => `• ${l.campo || "Campo"}: informado “${l.informado}” · deveria ser “${l.deveria}”`),
        extra ? "Orientação: " + extra : ""
      ].filter(Boolean).join("\n");
      patch = {
        status: "devolvida", devolucaoTipo: "carta", cartaLinhas: linhas, motivoDevolucao: txt,
        devolvidoPor: u.nome, devolvidoPorSienge: u.sienge, devolvidoEm: Date.now(), assumidoPor: "", assumidoPorEmail: "",
        validadoEm: 0, validadoPor: ""
      };
    }
    if (btn) { btn.disabled = true; btn.textContent = "Devolvendo…"; }
    try {
      await FilaNotasFiscais.atualizar(item, patch, "devolvida", txt);
      const file = await this.documentoDevolucao(item, patch, extra);
      const [anexo] = await FilaNotasFiscais.subirAnexos(item.id, [{ file, tipo: "carta" }]);
      const anexos = (item.anexos || []).filter((a) => a.tipo !== "carta").concat([anexo]);
      await FilaNotasFiscais.atualizar(item, { anexos }, "carta-anexada", "Documento da devolução");
      FilaNotasFiscais.aprender(item, patch).catch(() => {});
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Devolver ao operador"; }
      alert(`Não consegui devolver: ${(e && e.message) || e}`);
      return;
    }
    this.auditar("ok", `Nota do pedido ${item.pedido} devolvida (${tipo}) ao operador ${item.criadoPor || ""}`, { filaId: item.id });
    this.fecharDevolver();
    this._devItem = null;
    if (this.state.item && this.state.item.id === item.id) {
      this.state = this.novoEstado();
      this.aba = "fila";
    }
    this.render();
  },

  async documentoDevolucao(item, patch, extra) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("gerador de PDF indisponível");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const m = 18;
    let y = 18;
    let logo = null;
    if (window.InvestimentoApp && typeof InvestimentoApp.logoDataUrl === "function") {
      try { logo = await InvestimentoApp.logoDataUrl(); } catch (e) { logo = null; }
    }
    if (logo && logo.dataUrl) {
      try { pdf.addImage(logo.dataUrl, logo.extension === "jpeg" ? "JPEG" : "PNG", m, 12, 22, 22); } catch (e) { /* segue sem a imagem */ }
    }
    const empId = item.empresa || "";
    const emp = (this.state.empresas || []).find((c) => String(c.id) === String(empId));
    const empresa = emp ? `${emp.id} - ${emp.nome}` : (empId ? `Empresa ${empId}` : "Moura Leite");
    pdf.setFont("times", "bold");
    pdf.setFontSize(13);
    pdf.text(empresa, logo && logo.dataUrl ? m + 26 : m, 20);
    pdf.setFont("times", "normal");
    pdf.setFontSize(10);
    pdf.text("Devolução de nota fiscal", logo && logo.dataUrl ? m + 26 : m, 26);
    y = 42;
    const w = 210 - m * 2;
    const bloco = (txt, size, style) => {
      pdf.setFont("times", style || "normal");
      pdf.setFontSize(size);
      pdf.splitTextToSize(String(txt || ""), w).forEach((ln) => {
        if (y > 270) { pdf.addPage(); y = 20; }
        pdf.text(ln, m, y);
        y += size * 0.42 + 1.6;
      });
    };
    const carta = patch.devolucaoTipo === "carta";
    bloco(carta ? "Solicitação de carta de correção" : "Recusa da nota fiscal", 15, "bold");
    y += 2;
    const forn = item.fornecedor && item.fornecedor.nome ? item.fornecedor.nome : "—";
    bloco(`Pedido ${item.pedido || "—"}`, 12, "normal");
    bloco(`Nota fiscal ${item.numeroNota || "—"}${item.serieNota ? "/" + item.serieNota : ""}${item.valorNota != null ? " · " + this.money(item.valorNota) : ""}`, 12, "normal");
    bloco(`Fornecedor: ${forn}`, 12, "normal");
    y += 3;
    bloco(carta ? "O que a carta de correção deve alterar" : "Motivo da recusa", 13, "bold");
    if (carta) {
      (patch.cartaLinhas || []).forEach((l, i) => {
        bloco(`${i + 1}. ${l.campo || "Campo"}`, 12, "bold");
        bloco(`Informado na nota: ${l.informado || "—"}`, 11, "normal");
        bloco(`Deveria ser: ${l.deveria || "—"}`, 11, "normal");
        y += 1;
      });
    } else {
      (patch.motivosCancelamento || []).forEach((motivo) => bloco(`• ${motivo}`, 12, "normal"));
    }
    if (extra) { y += 2; bloco("Orientação", 13, "bold"); bloco(extra, 12, "normal"); }
    y += 6;
    const u = FilaNotasFiscais.usuario();
    const dia = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
    bloco(`Botucatu, ${dia}.`, 12, "normal");
    y += 10;
    bloco("________________________________", 12, "normal");
    bloco(u.nome || "Operador fiscal", 12, "bold");
    bloco("Operador fiscal", 11, "italic");
    const fone = FilaNotasFiscais.telefoneCorporativo(u.email);
    y += 4;
    bloco(fone
      ? `Se o fornecedor ou o contador precisar de apoio, o contato é o telefone corporativo ${fone}.`
      : "Se o fornecedor ou o contador precisar de apoio, o contato é o telefone corporativo do operador fiscal.", 11, "normal");
    const blob = pdf.output("blob");
    const nome = `${carta ? "carta-correcao" : "devolucao"}-pedido-${String(item.pedido || "nota").replace(/[^\w.-]+/g, "_")}.pdf`;
    return new File([blob], nome, { type: "application/pdf" });
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
      ["abertas", `Acompanhamento (${conta((x) => FilaNotasFiscais.aberta(x) || x.status === "devolvida" || x.status === "excluida")})`],
      ["lancada", `Lançadas (${conta((x) => x.status === "lancada")})`],
      ["devolvida", `Devolvidas (${conta((x) => x.status === "devolvida")})`],
      ["excluida", `Excluídas (${conta((x) => x.status === "excluida")})`],
      ["cancelada", `Canceladas (${conta((x) => x.status === "cancelada")})`],
      ["todas", `Todas (${f.itens.length})`]
    ];
    const corpo = f.carregando && !f.itens.length ? `<p class="fnf-vazio"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> Carregando a fila…</p>`
      : (f.erro ? `<p class="inf-erro">${esc(f.erro)}</p>`
        : (!lista.length ? `<p class="fnf-vazio">${f.filtro === "abertas" ? "Nenhuma nota em aberto, devolvida ou excluída." : "Nenhuma nota nesta situação."}</p>`
          : `<div class="fnf-fila">${lista.map((x) => {
              const p = x.pagamento || {};
              const atrasado = FilaNotasFiscais.aberta(x) && p.data && p.data < hoje;
              const aberta = FilaNotasFiscais.aberta(x);
              const validada = !!x.validadoEm;
              const valor = x.valorNota != null ? this.money(x.valorNota) : (x.previsao && x.previsao.valor != null ? `previsão ${this.money(x.previsao.valor)}` : "");
              const quando = x.criadoEm ? new Date(x.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
              return `<article class="fnf-fila-item">
                <div>
                  <div class="fnf-fila-top">
                    <b>Pedido ${esc(x.pedido)}</b>
                    ${x.numeroNota ? `<span>NF ${esc(x.numeroNota)}</span>` : ""}
                    <span class="fnf-forn">${esc(x.fornecedor ? x.fornecedor.nome : "")}</span>
                    ${valor ? `<span>${esc(valor)}</span>` : ""}
                    ${FilaNotasFiscais.statusHtml(x, esc)}
                  </div>
                  <div class="fnf-fila-meta">
                    <span class="${atrasado ? "fnf-atrasado" : ""}">${this.dataBr(p.data)}${p.forma ? " · " + esc(p.forma) : ""}${p.detalhe ? " · " + esc(p.detalhe) : ""}</span>
                    <span>${x.empresa ? `Empresa ${esc(x.empresa)}` : "Empresa —"}${x.cc && x.cc.id ? ` · CC ${esc(x.cc.id)}${x.cc.nome ? " - " + esc(x.cc.nome) : ""}` : ""}</span>
                    <span>${esc(x.criadoPor || "")}${quando ? " · " + esc(quando) : ""}</span>
                    <span>${FilaNotasFiscais.anexosHtml(x, esc)}</span>
                    ${validada ? `<span>Validada${x.validadoPor ? " por " + esc(x.validadoPor) : ""}</span>` : ""}
                  </div>
                  ${x.observacao ? `<div class="fnf-fila-meta"><span title="${esc(x.observacao)}">“${esc(x.observacao.length > 90 ? x.observacao.slice(0, 90) + "…" : x.observacao)}”</span></div>` : ""}
                  ${FilaNotasFiscais.motivoHtml(x, esc)}
                </div>
                <div class="fnf-fila-lado">
                  ${aberta && pode ? `<div class="fnf-fila-acoes">
                    <button type="button" class="btn btn-outline inf-btn-sm" onclick="InserirNotaApp.lancarDaFila('${esc(x.id)}')"><i data-lucide="list-checks"></i> Abrir</button>
                    <button type="button" class="btn btn-primary inf-btn-sm" ${validada ? "" : "disabled"} title="${validada ? "Abrir o lançamento" : "Valide a nota antes de lançar no Sienge"}" onclick="InserirNotaApp.lancarDaFila('${esc(x.id)}')"><i data-lucide="file-up"></i> ${x.status === "em_lancamento" && validada ? "Continuar" : "Lançar"}</button>
                    <button type="button" class="btn btn-outline inf-btn-sm" onclick="InserirNotaApp.devolver('${esc(x.id)}')"><i data-lucide="corner-up-left"></i> Devolver</button>
                  </div>` : ""}
                </div>
              </article>`;
            }).join("")}</div>`));
    return `<div class="inf-card" style="margin:16px 20px;">
        <div class="fnf-barra">
          <select onchange="InserirNotaApp.setFiltroFila(this.value)">${filtros.map(([v, t]) => `<option value="${v}" ${f.filtro === v ? "selected" : ""}>${t}</option>`).join("")}</select>
          <span class="inf-muted">Por data de pagamento. Abra a nota, confira e clique em <b>Validar</b>. <b>Lançar</b> só libera depois dessa confirmação.</span>
          <button type="button" class="btn btn-outline inf-btn-sm" onclick="InserirNotaApp.carregarFila(true)" ${f.carregando ? "disabled" : ""}><i data-lucide="refresh-cw"></i> Atualizar</button>
        </div>
        ${corpo}
      </div>`;
  },

  /* ---------- tela ---------- */
  /** Lupa circular que acompanha o mouse e amplia a região da nota. */
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
    const D = 148;
    if (!lente.style.backgroundImage) lente.style.backgroundImage = `url("${img.src}")`;
    lente.style.display = "block";
    lente.style.width = `${D}px`;
    lente.style.height = `${D}px`;
    area.classList.add("is-ativa");
    lente.style.left = `${Math.max(0, Math.min(r.width - D, x - D / 2))}px`;
    lente.style.top = `${Math.max(0, Math.min(r.height - D, y - D / 2))}px`;
    lente.style.backgroundSize = `${r.width * z}px ${r.height * z}px`;
    lente.style.backgroundPosition = `${D / 2 - x * z}px ${D / 2 - y * z}px`;
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
    const c = this.conferir();
    const s = this.state;
    const travado = !!s.enviando || c.erros.length > 0 || !this.podeEditar();
    const btn = document.getElementById("inf-inserir");
    if (btn) btn.disabled = !!s.enviando;
    const v = document.getElementById("inf-validar");
    if (v) {
      v.disabled = travado || !!s.validado;
      v.textContent = s.validado ? "Validada" : "Validar";
      v.classList.toggle("btn-primary", !s.validado);
      v.classList.toggle("btn-outline", !!s.validado);
    }
    const h = document.getElementById("inf-validacao");
    if (h) h.textContent = s.validado
      ? "Nota validada. Pode inserir no Sienge."
      : "Clique em Validar depois de conferir. Inserir no Sienge só libera depois dessa confirmação.";
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
    return `<div class="inf-pedido">
      <div><span>Fornecedor</span><div><b>${this.esc(s.credor ? s.credor.nome : p.supplierId)}</b><small>${this.esc(s.credor && s.credor.doc ? this.docFmt(s.credor.doc) : `código ${p.supplierId}`)}</small></div></div>
      <div><span>Centro de custo</span><div><b>${this.esc((s.cc && s.cc.id) || "—")}${s.cc && s.cc.nome ? ` - ${this.esc(s.cc.nome)}` : ""}</b><small>${s.empresaCc ? `empresa ${this.esc(s.empresaCc)}${this.nomeEmpresa(s.empresaCc) ? " - " + this.esc(this.nomeEmpresa(s.empresaCc)) : ""}` : "empresa não identificada"}</small></div></div>
      <div><span>Pedido ${this.esc(s.pedidoNome)}</span><div><b>${this.dataBr(p.date)}</b><small>${s.pedidoApi !== s.pedidoNome ? `id na API ${this.esc(s.pedidoApi)} · ` : ""}${this.esc(p.paymentCondition || "")}</small></div></div>
      <div><span>Situação</span><div><b>${this.esc(sit)}</b>${p.authorized || p.authorized === false ? `<small>${p.authorized ? "autorizado" : "não autorizado"}</small>` : ""}</div></div>
      <div><span>Total do pedido</span><div><b>${p.totalAmount != null ? this.money(p.totalAmount) : "—"}</b></div></div>
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
    const blocos = s.itens.map((it) => {
      const preco = `${this.money(it.preco)}${it.unidade ? `/${this.esc(it.unidade)}` : ""}`;
      if (!it.entregas.length) {
        return `<article class="inf-entrega">
          <header><b>Item ${this.esc(it.itemNumber)}</b><span>${this.esc(it.descricao)}</span><small>${preco}</small></header>
          <p class="inf-muted">${it.semEntregas ? "Não consegui ler as entregas deste item." : "Sem entregas programadas."}</p>
        </article>`;
      }
      const linhas = it.entregas.map((e) => {
        const valor = (Number(e.qtd) || 0) * it.preco;
        return `<tr class="${e.saldo <= 0 ? "is-sem-saldo" : ""}">
          <td>Entrega ${this.esc(e.n)}${e.data ? `<small>${this.dataBr(e.data)}</small>` : ""}</td>
          <td class="num">${this.qtdFmt(e.saldo)}</td>
          <td class="num"><input class="inf-qtd" value="${this.esc(e.qtd ? String(e.qtd).replace(".", ",") : "")}" ${e.saldo <= 0 ? "disabled" : ""}
            onchange="InserirNotaApp.setQtd('${it.itemNumber}', '${e.n}', this.value)"></td>
          <td class="num">${this.money(valor)}</td>
        </tr>`;
      }).join("");
      return `<article class="inf-entrega">
        <header><b>Item ${this.esc(it.itemNumber)}</b><span>${this.esc(it.descricao)}</span><small>Preço líquido ${preco}</small></header>
        <table class="inf-tab"><thead><tr><th>Entrega</th><th class="num">Saldo</th><th class="num">Qtd. a faturar</th><th class="num">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
      </article>`;
    }).join("");
    const total = this.totalItens();
    const valor = this.valorNota();
    const fecha = valor != null && Math.abs(total - valor) <= this.TOL;
    return `<div class="inf-entregas">${blocos}</div>
      <div class="inf-entrega-total"><span>Total dos itens${valor != null ? ` · nota ${this.money(valor)}` : ""}</span><b class="${valor == null ? "" : (fecha ? "is-ok" : "is-erro")}">${this.money(total)}</b></div>
      <div class="inf-linha-acoes">
        <label class="inf-chk"><input type="checkbox" ${s.form.manterSaldo ? "checked" : ""} onchange="InserirNotaApp.setCampo('manterSaldo', this.checked)"> Manter o saldo restante do pedido em aberto</label>
        ${s.qtdEditada ? `<button type="button" class="btn btn-outline inf-btn-sm" onclick="InserirNotaApp.redistribuir()"><i data-lucide="rotate-ccw"></i> Recalcular pelo valor da nota</button>` : ""}
      </div>`;
  },

  resultadoHtml() {
    const r = this.state.resultado;
    if (!r) return "";
    if (r.ok) {
      const nfs = /^nfs/i.test(String(this.state.form.documento || ""));
      const titulo = this.state.billId ? ` Título ${this.state.billId}` : "";
      const txt = nfs
        ? `Sucesso!. Nota enviada ao Sienge. Confira os impostos retidos.${titulo}`
        : `Sucesso!. Nota enviada ao Sienge.${titulo}`;
      const falhas = (r.log || []).filter((t) => /não consegui|não entrou|não recebeu|ainda não tem parcela|falha/i.test(t));
      return `<div class="inf-resultado is-ok"><b>${this.esc(txt)}</b>${falhas.length ? `<ul>${falhas.map((t) => `<li>${this.esc(t)}</li>`).join("")}</ul>` : ""}</div>`;
    }
    const motivo = r.erro || (r.log || []).slice(-1)[0] || "A nota não foi criada.";
    return `<div class="inf-resultado is-erro"><b>${r.seq ? `A nota foi criada (sequencial ${this.esc(r.seq)}), mas os itens não entraram.` : "A nota não foi criada."}</b><p>${this.esc(motivo)}</p></div>`;
  },

  css() {
    return `
        .inf-wrap { padding: 20px; max-width: none; margin: 0 auto; display: grid; grid-template-columns: minmax(420px, 0.78fr) minmax(0, 1.55fr); gap: 16px; align-items: start; }
        .inf-wrap > div { min-width: 0; }
        .inf-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
        .inf-card h3 { margin: 0 0 10px; font-size: 0.95rem; color: #105436; display: flex; align-items: center; gap: 8px; }
        .inf-card h3 i { width: 16px; height: 16px; }
        .inf-muted { color: #64748b; font-size: 0.82rem; margin: 6px 0; }
        .inf-erro { color: #b91c1c; font-size: 0.85rem; margin: 6px 0; }
        .inf-busca { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
        .inf-busca input { height: 38px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 12px; font-size: 0.95rem; width: 180px; }
        .inf-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
        .inf-pedido { display: flex; flex-direction: column; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-top: 4px; }
        .inf-pedido > div { display: grid; grid-template-columns: 148px minmax(0, 1fr); gap: 12px; align-items: start; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; }
        .inf-pedido > div:last-child { border-bottom: 0; }
        .inf-pedido > div > span { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; padding-top: 3px; }
        .inf-pedido b { display: block; font-size: 0.92rem; color: #0f172a; line-height: 1.35; }
        .inf-pedido small { display: block; color: #64748b; font-size: 0.78rem; margin-top: 2px; line-height: 1.35; }
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
        .inf-entregas { display: flex; flex-direction: column; gap: 10px; }
        .inf-entrega { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #fff; }
        .inf-entrega header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .inf-entrega header b { color: #105436; white-space: nowrap; }
        .inf-entrega header span { flex: 1; min-width: 160px; color: #0f172a; }
        .inf-entrega header small, .inf-entrega > .inf-muted { color: #64748b; }
        .inf-entrega > .inf-muted { margin: 0; padding: 10px 12px; }
        .inf-entrega .inf-tab td small { display: block; color: #64748b; }
        .inf-entrega-total { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; padding: 8px 2px 0; font-weight: 800; }
        .inf-entrega-total .is-ok { color: #105436; } .inf-entrega-total .is-erro { color: #b91c1c; }
        .inf-tab { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .inf-tab th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #64748b; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        .inf-tab td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .inf-tab .num { text-align: right; white-space: nowrap; }
        .inf-tab small { color: #94a3b8; }
        .inf-tab tfoot td { font-weight: 800; border-bottom: 0; }
        .inf-tab .is-ok { color: #105436; } .inf-tab .is-erro { color: #b91c1c; }
        .inf-tab tr.is-sem-saldo td { color: #94a3b8; }
        .inf-qtd { width: 100%; max-width: 72px; height: 30px; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 6px; text-align: right; }
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
        .inf-lupa-area { position: relative; overflow: hidden; border-radius: 8px; cursor: crosshair; }
        .inf-lupa-area.is-ativa { cursor: crosshair; }
        .inf-lupa { position: absolute; display: none; width: 148px; height: 148px; border-radius: 50%; border: 3px solid #105436; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28); background-color: #fff; background-repeat: no-repeat; pointer-events: none; z-index: 5; }
        .inf-lupa-dica { display: flex; align-items: center; gap: 6px; margin: 8px 0 0; color: #64748b; font-size: 0.76rem; }
        .inf-lupa-dica i { width: 14px; height: 14px; }
        .inf-resultado { border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; font-size: 0.85rem; }
        .inf-resultado.is-ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
        .inf-resultado.is-erro { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
        .inf-resultado ul { margin: 6px 0; padding-left: 18px; }
        .inf-resultado p { margin: 6px 0 0; }
        @media (max-width: 1100px) { .inf-wrap { grid-template-columns: 1fr; } .inf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 720px) { .inf-pedido > div { grid-template-columns: 1fr; gap: 2px; } }`;
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
    const travado = !!s.enviando || this.conferir().erros.length > 0 || !pode;
    const bloqueado = travado || !s.validado;
    return `
      <div class="inf-wrap">
        <div>
          ${this.resultadoHtml()}
          ${this.itemHtml()}
          <div class="inf-card">
            <h3><i data-lucide="clipboard-list"></i> Pedido de compra</h3>
            <div class="inf-busca">
              <input id="inf-pedido" placeholder="Nº do pedido" title="Pode digitar como aparece no Sienge; no sequencial anual (123/26) o CRM converte para o id da API (26000123)." value="${this.esc(s.pedidoId)}" onkeydown="if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();InserirNotaApp.buscarPedido()}">
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
            <label class="inf-chk" style="margin-top:10px;"><input type="checkbox" ${s.form.anexar ? "checked" : ""} onchange="InserirNotaApp.setCampo('anexar', this.checked)"> Anexar ${s.item && (s.item.anexos || []).length > 1 ? "a nota e os outros anexos do envio" : "o arquivo da nota"} no título do contas a pagar</label>
            <p id="inf-validacao" class="inf-muted">${s.validado ? "Nota validada. Pode inserir no Sienge." : "Clique em Validar depois de conferir. Inserir no Sienge só libera depois dessa confirmação."}</p>
            <div class="inf-acoes">
              <button type="button" class="btn btn-outline" onclick="InserirNotaApp.recomecar()" ${s.enviando ? "disabled" : ""}><i data-lucide="rotate-ccw"></i> Recomeçar</button>
              <button type="button" id="inf-validar" class="btn ${s.validado ? "btn-outline" : "btn-primary"}" onclick="InserirNotaApp.validar()" ${(travado || s.validado) ? "disabled" : ""}>${s.validado ? "Validada" : "Validar"}</button>
              <button type="button" id="inf-inserir" class="btn btn-primary" onclick="InserirNotaApp.inserir()" ${s.enviando ? "disabled" : ""}
                title="${pode ? (s.validado ? "" : "Valide a nota antes de inserir no Sienge") : "Sem permissão de edição em Fiscal › Validar nota"}">
                ${s.enviando ? `<span class="btn-spin"></span> ${this.esc(s.enviando)}` : `<i data-lucide="upload"></i> Inserir no Sienge`}</button>
            </div>
          </div>
        </div>
        <div class="inf-preview">
          <div class="inf-card">
            <h3><i data-lucide="image"></i> Nota anexada</h3>
            ${s.preview ? `<div class="inf-lupa-area" onmousemove="InserirNotaApp.lupa(event)" onmouseleave="InserirNotaApp.lupa(event, true)" onwheel="InserirNotaApp.zoomLupa(event)">
                <img src="${s.preview}" alt="Nota fiscal" draggable="false"><div class="inf-lupa"></div></div>
              <p class="inf-lupa-dica"><i data-lucide="zoom-in"></i> Passe o mouse: a lupa amplia a nota · role a roda para o zoom: <strong class="inf-lupa-zoom">${(this._zoom || 2.5).toLocaleString("pt-BR")}x</strong></p>` : `<p class="inf-muted">${s.arquivo && /\.xml$/i.test(s.arquivo.name) ? "Nota em XML: os campos foram lidos direto do arquivo." : "A imagem da nota aparece aqui para conferir os campos."}</p>`}
          </div>
        </div>
      </div>`;
  }
};
