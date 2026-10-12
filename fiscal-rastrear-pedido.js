/* Fiscal › Rastrear pedido: sobe a nota fiscal e procura no Sienge um pedido de compra do mesmo fornecedor,
   comparando valor, saldo em aberto, data e empresa do tomador. */
window.RastrearPedidoApp = {
  state: null,

  novoEstado() {
    return { arquivo: "", lendo: "", erro: "", nota: null, credor: null, linhas: [], mais: 0, buscou: false };
  },

  init() {
    if (!this.state) this.state = this.novoEstado();
    this.render();
  },

  esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(v) {
    return window.InserirNotaApp ? InserirNotaApp.money(v) : (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  dataBr(iso) {
    return window.InserirNotaApp ? InserirNotaApp.dataBr(iso) : (iso || "—");
  },

  docFmt(d) {
    return window.InserirNotaApp ? InserirNotaApp.docFmt(d) : String(d || "");
  },

  perto(a, b) {
    if (a == null || b == null) return false;
    const tol = Math.max(1, Math.abs(Number(b)) * 0.005);
    return Math.abs(Number(a) - Number(b)) <= tol;
  },

  /* ---------- leitura da nota ---------- */
  async subir(input) {
    const file = input && input.files && input.files[0];
    if (input) input.value = "";
    if (!file) return;
    await this.ler(file);
  },

  soltar(ev) {
    ev.preventDefault();
    const box = document.getElementById("rpd-drop");
    if (box) box.classList.remove("is-over");
    const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (file) this.ler(file);
  },

  async ler(file) {
    const s = this.state || (this.state = this.novoEstado());
    Object.assign(s, { arquivo: file.name || "nota", lendo: "Lendo a nota…", erro: "", nota: null, credor: null, linhas: [], mais: 0, buscou: false });
    this.render();
    try {
      const nota = await this.lerArquivo(file);
      if (!nota || (!nota.cnpjPrestador && !nota.nomePrestador)) {
        s.lendo = "";
        s.erro = "Não consegui ler o fornecedor desta nota. Use o XML ou um PDF com o texto da nota.";
        s.nota = nota;
        this.render();
        return;
      }
      s.nota = nota;
      s.lendo = "Buscando o fornecedor e os pedidos no Sienge…";
      this.render();
      await this.buscar(nota);
    } catch (e) {
      s.lendo = "";
      s.erro = `Não consegui ler a nota: ${(e && e.message) || e}`;
      this.render();
    }
  },

  async lerArquivo(file) {
    const App = window.InserirNotaApp;
    if (!App) throw new Error("a leitura de nota não está disponível");
    const buf = await file.arrayBuffer();
    const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 64))).trim();
    if (/^\uFEFF?</.test(inicio) || /\.xml$/i.test(file.name)) {
      const xml = new TextDecoder("utf-8").decode(buf);
      const nota = App.lerXml(xml);
      return Object.assign(nota, this.extraXml(xml), { origem: "XML" });
    }
    if (/^%PDF/.test(inicio)) {
      const itens = window.NotaFiscalCheck ? await NotaFiscalCheck.itensDoPdf(buf) : [];
      if (itens.length >= 20) return Object.assign(App.extrair(App.celulasPdf(itens)), { origem: "PDF", itens: [] });
      const canvas = await App.pdfParaCanvas(buf);
      const celulas = await this.ocr(canvas);
      return Object.assign(App.extrair(celulas), { origem: "PDF", itens: [] });
    }
    if (/^image\//.test(file.type)) {
      const canvas = await App.imagemParaCanvas(file);
      const celulas = await this.ocr(canvas);
      return Object.assign(App.extrair(celulas), { origem: "imagem", itens: [] });
    }
    throw new Error("formato não reconhecido; use PDF, XML ou imagem");
  },

  extraXml(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const tag = (raiz, ...nomes) => {
      const base = raiz || doc;
      for (const nome of nomes) {
        const el = base.getElementsByTagNameNS("*", nome)[0] || base.getElementsByTagName(nome)[0];
        if (el && String(el.textContent).trim()) return String(el.textContent).trim();
      }
      return "";
    };
    const emit = doc.getElementsByTagNameNS("*", "emit")[0]
      || doc.getElementsByTagNameNS("*", "prest")[0]
      || doc.getElementsByTagNameNS("*", "Prestador")[0]
      || doc.getElementsByTagNameNS("*", "PrestadorServico")[0];
    const tot = doc.getElementsByTagNameNS("*", "ICMSTot")[0];
    const vNf = tot ? tag(tot, "vNF") : "";
    const dets = Array.from(doc.getElementsByTagNameNS("*", "det"));
    const itens = dets.slice(0, 40).map((d) => tag(d, "xProd")).filter(Boolean);
    const desc = tag(null, "xDescServ", "Discriminacao");
    if (desc && !itens.length) itens.push(desc);
    const out = {
      nomePrestador: emit ? (tag(emit, "xNome", "RazaoSocial", "NomeFantasia") || "") : "",
      itens
    };
    if (vNf) {
      const n = Number(String(vNf).replace(",", "."));
      if (Number.isFinite(n)) out.valor = n;
    }
    return out;
  },

  async ocr(canvas) {
    const s = this.state;
    const App = window.InserirNotaApp;
    s.lendo = "Carregando o leitor de imagem…";
    this.pintarStatus();
    await App.carregarTesseract();
    const worker = await Tesseract.createWorker("por", 1, {
      logger: (m) => {
        if (m.status === "recognizing text" && m.progress != null) {
          s.lendo = `Lendo a nota… ${Math.round(m.progress * 100)}%`;
          this.pintarStatus();
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

  pintarStatus() {
    const el = document.getElementById("rpd-status");
    if (el && this.state) el.textContent = this.state.lendo || "";
  },

  /* ---------- pedidos ---------- */
  async buscar(nota) {
    const s = this.state;
    const App = window.InserirNotaApp;
    try {
      const credor = await this.acharCredor(nota);
      s.credor = credor;
      if (!credor) {
        s.lendo = "";
        s.erro = nota.cnpjPrestador
          ? `Não achei um credor no Sienge com o documento ${this.docFmt(nota.cnpjPrestador)}.`
          : "A nota não trouxe o CNPJ do fornecedor, e a busca pelo nome não achou o credor.";
        this.render();
        return;
      }
      s.lendo = `Buscando pedidos de ${credor.nome}…`;
      this.pintarStatus();
      const pedidos = await this.pedidosDoFornecedor(credor.id);
      const visiveis = pedidos.filter((p) => !window.EnviarNotaApp || EnviarNotaApp.pedidoPermitido(p));
      const ordenados = visiveis.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const abertos = ordenados.filter((p) => String(p.status || "").toUpperCase() !== "CANCELED");
      const candidatos = abertos.slice(0, 40);
      s.lendo = candidatos.length ? "Comparando tomador, valor e saldo dos pedidos…" : "";
      this.pintarStatus();
      const empresas = await this.empresas();
      const linhas = [];
      for (const p of candidatos) {
        const detalhe = await this.detalhePedido(p, nota, empresas);
        if (detalhe && this.mostrar(detalhe)) linhas.push(detalhe);
      }
      linhas.sort((a, b) => b.pts - a.pts || String(b.data || "").localeCompare(String(a.data || "")));
      s.linhas = linhas;
      s.buscou = true;
      s.mais = Math.max(0, abertos.length - candidatos.length);
      s.lendo = "";
      if (!visiveis.length) s.erro = "Este fornecedor não tem pedido de compra no seu acesso.";
    } catch (e) {
      s.lendo = "";
      s.erro = `Não consegui buscar os pedidos: ${(e && e.message) || e}`;
    }
    this.render();
  },

  async acharCredor(nota) {
    const App = window.InserirNotaApp;
    const dig = App.digits(nota.cnpjPrestador);
    let lista = [];
    if (dig.length === 14) lista = App.lista(await App.get(`/creditors?limit=15&cnpj=${encodeURIComponent(dig)}`).catch(() => null));
    else if (dig.length === 11) lista = App.lista(await App.get(`/creditors?limit=15&cpf=${encodeURIComponent(dig)}`).catch(() => null));
    if (!lista.length && nota.nomePrestador && nota.nomePrestador.length >= 4 && dig.length < 11) {
      lista = App.lista(await App.get(`/creditors?limit=15&name=${encodeURIComponent(nota.nomePrestador.slice(0, 60))}`).catch(() => null));
    }
    const c = lista.find((x) => x && (x.id != null || x.creditorId != null));
    if (!c) return null;
    const id = c.id != null ? c.id : c.creditorId;
    const doc = App.digits(c.cnpj || c.cpf || dig);
    return { id, nome: c.name || c.tradeName || nota.nomePrestador || `Credor ${id}`, doc };
  },

  async pedidosDoFornecedor(id) {
    const App = window.InserirNotaApp;
    const out = [];
    let offset = 0;
    for (let i = 0; i < 6; i++) {
      const res = await App.get(`/purchase-orders?supplierId=${encodeURIComponent(id)}&limit=50&offset=${offset}`);
      const lista = App.lista(res);
      out.push(...lista);
      const total = res && res.resultSetMetadata && Number(res.resultSetMetadata.count);
      offset += lista.length;
      if (!lista.length || lista.length < 50 || (total && offset >= total)) break;
    }
    return out;
  },

  async empresas() {
    const App = window.InserirNotaApp;
    if (App.state && App.state.empresas && App.state.empresas.length) return App.state.empresas;
    const lista = window.SiengeApiService && SiengeApiService.getCompanies ? await SiengeApiService.getCompanies().catch(() => []) : [];
    return (lista || []).map((c) => ({ id: String(c.id), nome: c.name || c.tradeName || `Empresa ${c.id}`, cnpj: App.digits(c.cnpj || c.cnpjCpf) }));
  },

  async detalhePedido(p, nota, empresas) {
    const App = window.InserirNotaApp;
    const id = String(p.id);
    const valorPedido = p.totalAmount != null ? Number(p.totalAmount) : null;
    let cc = null;
    let empresaOk = null;
    const dig = (v) => String(v || "").replace(/\D/g, "");
    if (nota.cnpjTomador && App.centroDeCusto) {
      cc = await App.centroDeCusto(p).catch(() => null);
      if (cc && cc.companyId) {
        const emp = empresas.find((e) => e.id === String(cc.companyId));
        if (emp && emp.cnpj) empresaOk = dig(emp.cnpj) === dig(nota.cnpjTomador);
        if (emp) cc.empresaNome = emp.nome;
      }
    }
    if (empresaOk === false) return null;
    let aberto = null;
    let descricoes = [];
    const precisaSaldo = !(valorPedido != null && (this.perto(nota.valor, valorPedido) || this.perto(nota.liquido, valorPedido)));
    if (precisaSaldo) {
      const saldo = await this.saldoAberto(id).catch(() => null);
      if (saldo) { aberto = saldo.aberto; descricoes = saldo.desc; }
    }
    return this.pontuar(p, nota, { valorPedido, aberto, descricoes, cc, empresaOk });
  },

  async saldoAberto(id) {
    const App = window.InserirNotaApp;
    const itens = App.lista(await App.get(`/purchase-orders/${encodeURIComponent(id)}/items?limit=80`));
    let aberto = 0;
    const desc = [];
    for (const it of itens.slice(0, 8)) {
      const unit = Number(it.netPrice) || Number(it.unitPrice) || 0;
      const nome = [it.resourceDescription, it.detailDescription].filter(Boolean).join(" ");
      if (nome) desc.push(nome);
      const ent = App.lista(await App.get(`/purchase-orders/${encodeURIComponent(id)}/items/${it.itemNumber}/delivery-schedules?limit=40`).catch(() => null));
      if (!ent.length) {
        const qtd = Number(it.quantity) || 0;
        aberto += Number(it.totalAmount != null ? it.totalAmount : it.totalPrice) || unit * qtd;
      } else {
        ent.forEach((e) => { aberto += Math.max(0, Number(e.openQuantity) || 0) * unit; });
      }
    }
    return { aberto: Math.round(aberto * 100) / 100, desc };
  },

  pontuar(p, nota, d) {
    const st = String(p.status || "").toUpperCase();
    const motivos = [];
    let pts = 0;
    const valores = [nota.valor, nota.liquido].filter((v) => v != null);
    const igualPedido = valores.some((v) => this.perto(v, d.valorPedido));
    const igualAberto = d.aberto != null && valores.some((v) => this.perto(v, d.aberto));
    const cabe = d.aberto != null && valores.some((v) => v > 0 && v <= d.aberto + 1);
    if (igualPedido) { pts += 50; motivos.push("Valor igual ao do pedido"); }
    else if (igualAberto) { pts += 48; motivos.push("Valor igual ao saldo em aberto"); }
    else if (cabe) { pts += 28; motivos.push("O valor cabe no saldo em aberto"); }
    else if (d.valorPedido != null && valores.some((v) => v > 0 && v < d.valorPedido)) { pts += 12; motivos.push("Valor menor que o total do pedido"); }
    else if (valores.length && (d.valorPedido != null || d.aberto != null)) motivos.push("Valor diferente do pedido");

    if (st === "FULLY_DELIVERED") motivos.push("Pedido já atendido");
    else if (st === "CANCELED") { pts -= 40; motivos.push("Pedido cancelado"); }
    else { pts += 18; motivos.push(st === "PARTIALLY_DELIVERED" ? "Pedido com entrega parcial" : "Pedido em aberto"); }
    if (p.authorized === false) { pts -= 8; motivos.push("Pedido ainda não autorizado"); }
    else if (p.authorized === true) pts += 4;

    const data = String(p.date || "").slice(0, 10);
    if (data && nota.emissao) {
      if (data <= nota.emissao) pts += 8;
      else { pts -= 12; motivos.push("Pedido posterior à emissão da nota"); }
    }
    if (d.empresaOk === true) { pts += 16; motivos.push("Empresa do centro de custo é a do tomador"); }
    else if (d.empresaOk === false) { pts -= 20; motivos.push("Empresa do pedido é outra"); }
    if (this.itensParecem(nota.itens, d.descricoes)) { pts += 10; motivos.push("Itens parecidos com os da nota"); }

    let nivel = "fraco";
    const abertoStatus = st !== "CANCELED" && st !== "FULLY_DELIVERED";
    if (st !== "CANCELED" && (igualPedido || igualAberto)) nivel = "compativel";
    else if (abertoStatus && (cabe || d.empresaOk === true || this.itensParecem(nota.itens, d.descricoes))) nivel = "possivel";
    const situacao = st === "CANCELED" ? "Cancelado"
      : (st === "FULLY_DELIVERED" ? "Atendido"
        : (p.authorized === false ? "Não autorizado"
          : (st === "PARTIALLY_DELIVERED" ? "Parcial" : "Em aberto")));
    return {
      id: String(p.id),
      numero: String(p.formattedPurchaseOrderId || p.id),
      data,
      valorPedido: d.valorPedido,
      aberto: d.aberto,
      situacao,
      nivel,
      pts,
      motivos,
      empresaOk: d.empresaOk,
      valorOk: igualPedido || igualAberto,
      cabeNoAberto: !!(cabe && d.aberto > 0),
      cc: d.cc && d.cc.id ? `${d.cc.id}${d.cc.nome ? " - " + d.cc.nome : ""}` : ""
    };
  },

  /* Outra empresa que não é o tomador fica de fora. Valor distante só entra se ainda couber no saldo em aberto. */
  mostrar(l) {
    if (!l || l.empresaOk === false) return false;
    if (l.valorOk) return true;
    return !!(l.cabeNoAberto && l.situacao !== "Atendido" && l.situacao !== "Cancelado");
  },

  itensParecem(daNota, doPedido) {
    const tok = (lista) => {
      const s = (lista || []).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return new Set(s.split(/[^a-z0-9]+/).filter((w) => w.length > 4));
    };
    const a = tok(daNota);
    const b = tok(doPedido);
    if (a.size < 1 || b.size < 1) return false;
    let n = 0;
    a.forEach((w) => { if (b.has(w)) n += 1; });
    return n >= 2;
  },

  abrirEnvio(numero) {
    if (window.FilaNotasFiscais) FilaNotasFiscais.abrirEnvio(numero, "");
  },

  /* ---------- tela ---------- */
  css() {
    return `
      .rpd { padding: 4px 2px 28px; }
      .rpd-drop { margin: 0 0 14px; padding: 22px; border: 1.5px dashed #94a3b8; border-radius: 12px; background: #fff; text-align: center; }
      .rpd-drop.is-over { border-color: #105436; background: #f0fdf4; }
      .rpd-drop p { margin: 8px 0 0; color: #64748b; font-size: 0.82rem; }
      .rpd-nota, .rpd-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
      .rpd-nota { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 16px; }
      .rpd-k { display: block; font-size: 0.68rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .03em; }
      .rpd-v { font-size: 0.92rem; color: #0f172a; font-weight: 650; }
      .rpd-status, .rpd-muted { color: #64748b; font-size: 0.82rem; }
      .rpd-erro { margin: 0 0 12px; padding: 10px 12px; background: #fef2f2; color: #991b1b; border-radius: 8px; font-size: 0.84rem; }
      .rpd-scroll { overflow: auto; }
      .rpd-grid { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
      .rpd-grid th, .rpd-grid td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; white-space: nowrap; }
      .rpd-grid th { background: #105436; color: #fff; font-size: 0.68rem; }
      .rpd-grid td.rpd-mot { white-space: normal; color: #475569; min-width: 220px; }
      .rpd-grid tbody tr.is-compativel td { background: #ecfdf5; }
      .rpd-grid tbody tr.is-possivel td { background: #fffbeb; }
      .rpd-tag { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700; }
      .rpd-tag.is-compativel { background: #dcfce7; color: #166534; }
      .rpd-tag.is-possivel { background: #fef3c7; color: #92400e; }
      .rpd-tag.is-fraco { background: #f1f5f9; color: #475569; }
      .rpd-num { text-align: right; font-variant-numeric: tabular-nums; }
      .rpd-grid th.rpd-num { text-align: right; }
      @media (max-width: 900px) { .rpd-nota { grid-template-columns: 1fr 1fr; } }`;
  },

  render() {
    const root = document.getElementById("rastrear-pedido-root");
    if (!root) return;
    const s = this.state || this.novoEstado();
    root.innerHTML = `<style>${this.css()}</style><div class="rpd">${this.corpo(s)}</div>`;
    if (window.lucide) lucide.createIcons();
  },

  corpo(s) {
    const n = s.nota;
    return `
      <p class="rpd-muted">Suba o PDF ou o XML da nota. A lista mostra pedido do mesmo fornecedor, da empresa do tomador, com valor próximo da nota ou com saldo em aberto que ainda comporte esse valor.</p>
      <div id="rpd-drop" class="rpd-drop" ondragover="event.preventDefault(); this.classList.add('is-over')" ondragleave="this.classList.remove('is-over')" ondrop="RastrearPedidoApp.soltar(event)">
        <button type="button" class="btn btn-primary" onclick="document.getElementById('rpd-file').click()"><i data-lucide="upload"></i> Subir nota fiscal</button>
        <input id="rpd-file" type="file" accept=".xml,.pdf,image/*" hidden onchange="RastrearPedidoApp.subir(this)">
        <p>${s.arquivo ? this.esc(s.arquivo) : "PDF, XML ou imagem. Arraste o arquivo para cá."}</p>
        ${s.lendo ? `<p id="rpd-status">${this.esc(s.lendo)}</p>` : `<p id="rpd-status"></p>`}
      </div>
      ${s.erro ? `<div class="rpd-erro">${this.esc(s.erro)}</div>` : ""}
      ${n ? this.notaHtml(n, s.credor) : ""}
      ${n && s.buscou && !s.linhas.length && !s.lendo && !s.erro ? `<p class="rpd-muted">Nenhum pedido deste fornecedor combina com o tomador e o valor desta nota.</p>` : ""}
      ${s.linhas.length ? this.tabela(s) : ""}`;
  },

  notaHtml(n, credor) {
    const valor = n.valor != null ? n.valor : n.liquido;
    const campos = [
      ["Nota", [n.numero, n.serie].filter(Boolean).join("/") || "—"],
      ["Emissão", n.emissao ? this.dataBr(n.emissao) : "—"],
      ["Fornecedor", credor ? credor.nome : (n.nomePrestador || "—")],
      ["Documento", this.docFmt(n.cnpjPrestador) || "—"],
      ["Valor", valor != null ? this.money(valor) : "—"],
      ["Líquido", n.liquido != null ? this.money(n.liquido) : "—"],
      ["Tomador", this.docFmt(n.cnpjTomador) || "—"],
      ["Leitura", n.origem || "—"]
    ];
    return `<div class="rpd-nota">${campos.map(([k, v]) => `<div><span class="rpd-k">${k}</span><span class="rpd-v">${this.esc(v)}</span></div>`).join("")}</div>`;
  },

  tabela(s) {
    const rot = { compativel: "Compatível", possivel: "Possível", fraco: "Fraco" };
    const linhas = s.linhas.map((l) => `<tr class="is-${l.nivel}">
      <td><b>${this.esc(l.numero)}</b></td>
      <td>${this.esc(l.situacao)}</td>
      <td>${l.data ? this.dataBr(l.data) : "—"}</td>
      <td class="rpd-num">${l.valorPedido != null ? this.money(l.valorPedido) : "—"}</td>
      <td class="rpd-num">${l.aberto != null ? this.money(l.aberto) : "—"}</td>
      <td>${this.esc(l.cc || "—")}</td>
      <td><span class="rpd-tag is-${l.nivel}">${rot[l.nivel] || "Fraco"}</span></td>
      <td class="rpd-mot">${this.esc(l.motivos.join(". "))}</td>
      <td><button type="button" class="btn btn-outline" style="height:32px;padding:0 10px;" onclick="RastrearPedidoApp.abrirEnvio('${this.esc(l.numero)}')">Enviar nota</button></td>
    </tr>`).join("");
    const extra = s.mais ? `<p class="rpd-muted">Mais ${s.mais} pedido(s) deste fornecedor ficaram de fora desta comparação (cancelados ou mais antigos).</p>` : "";
    return `<div class="rpd-card"><div class="rpd-scroll"><table class="rpd-grid">
      <thead><tr>
        <th>Pedido</th><th>Situação</th><th>Data</th><th class="rpd-num">Valor</th><th class="rpd-num">Saldo</th><th>Centro de custo</th><th>Leitura</th><th>Por quê</th><th></th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>${extra}</div>`;
  }
};

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "fiscal-rastrear-pedido" && window.RastrearPedidoApp) RastrearPedidoApp.init();
});
