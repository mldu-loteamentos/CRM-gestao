/* Conferência fiscal do título a pagar: impostos retidos lançados no Sienge × nota fiscal anexada × atividade (CNAE) do prestador.
   Impostos: GET /bills/{id}/taxes. Nota: anexo PDF (DANFSe e layouts municipais com texto) ou XML, lido no navegador.
   CNAE e Simples Nacional: cadastro público do CNPJ (BrasilAPI). As regras de retenção por atividade só geram "atenção". */
window.NotaFiscalCheck = {
  CACHE_KEY: "crm_nf_check_v2",
  CNPJ_KEY: "crm_cnpj_receita_v1",
  TTL: 12 * 3600 * 1000,
  CNPJ_TTL: 30 * 86400 * 1000,
  TOL: 0.02,
  _voo: {},
  _cnpjVoo: {},

  /* Atividades em que a retenção costuma ser obrigatória. inss: 11% (cessão de mão de obra ou empreitada);
     irrf: alíquota do IR na fonte; csrf: PIS/COFINS/CSLL 4,65% (Lei 10.833, art. 30). Simples: anexoIV indica INSS retido. */
  ATIVIDADES: [
    { id: "construcao", nome: "construção civil", cnae: /^4[123]/, desc: /constru[cç]|empreitada|terraplen|paviment|alvenar|edifica|reforma|drenagem pluvial|galeria/, inss: true, irrf: 0, csrf: false, anexoIV: true },
    { id: "limpeza", nome: "limpeza, conservação e jardinagem", cnae: /^(812|8130|3701|3702|3811|3812|3821|3822|3900)/, desc: /limpeza|conserva[cç][aã]o|desentup|hidrojat|dedetiz|desratiz|jardin|jardim|paisag|poda|capina|ro[cç]ada|zeladori|varri[cç]|coleta de (lixo|res[ií]duo)/, inss: true, irrf: 1, csrf: true, anexoIV: true },
    { id: "vigilancia", nome: "vigilância e segurança", cnae: /^801/, desc: /vigil[aâ]ncia|seguran[cç]a patrimonial|portaria|monitoramento/, inss: true, irrf: 1, csrf: true, anexoIV: true },
    { id: "maodeobra", nome: "locação de mão de obra", cnae: /^78/, desc: /m[aã]o de obra|terceiriza/, inss: true, irrf: 1, csrf: true, anexoIV: false },
    { id: "profissional", nome: "serviço profissional (RIR, art. 714)", cnae: /^(62|69|702|711|712|7319|741|742|749|862|863|864)/, desc: /consultori|engenhari|arquitet|advoc|jur[ií]dic|contab|auditori|projeto|topograf|avalia[cç][aã]o|per[ií]cia|assessori/, inss: false, irrf: 1.5, csrf: true, anexoIV: false },
    { id: "manutencao", nome: "manutenção e reparação", cnae: /^(33|952)/, desc: /manuten[cç][aã]o|repara[cç][aã]o|conserto/, inss: false, irrf: 0, csrf: true, anexoIV: false }
  ],

  /* Subitens da lista anexa à LC 116/2003 (4 primeiros dígitos do código de tributação nacional) ligados às atividades acima.
     O código de serviço da nota vale mais que o texto livre da descrição. */
  SERVICOS_LC116: {
    "0701": ["profissional", "Engenharia, agronomia, arquitetura, urbanismo, paisagismo e congêneres"],
    "0702": ["construcao", "Execução de obras de construção civil"],
    "0703": ["profissional", "Elaboração de planos, estudos e projetos de engenharia"],
    "0704": ["construcao", "Demolição"],
    "0705": ["construcao", "Reparação, conservação e reforma de edifícios, estradas, pontes e congêneres"],
    "0709": ["limpeza", "Varrição, coleta, remoção e tratamento de resíduos"],
    "0710": ["limpeza", "Limpeza, manutenção e conservação de vias, imóveis, parques e jardins"],
    "0711": ["limpeza", "Decoração e jardinagem, inclusive corte e poda de árvores"],
    "0713": ["limpeza", "Dedetização, desinfecção, desratização e congêneres"],
    "0717": ["construcao", "Escoramento, contenção de encostas e congêneres"],
    "0719": ["profissional", "Acompanhamento e fiscalização de obras de engenharia e arquitetura"],
    "0720": ["profissional", "Aerofotogrametria, cartografia, topografia e congêneres"],
    "1102": ["vigilancia", "Vigilância, segurança ou monitoramento de bens e pessoas"],
    "1401": ["manutencao", "Revisão, conserto e manutenção de máquinas, veículos e equipamentos"],
    "1402": ["manutencao", "Assistência técnica"],
    "1701": ["profissional", "Assessoria ou consultoria de qualquer natureza"],
    "1705": ["maodeobra", "Fornecimento de mão de obra"],
    "1714": ["profissional", "Advocacia"],
    "1716": ["profissional", "Auditoria"],
    "1719": ["profissional", "Contabilidade"],
    "1720": ["profissional", "Consultoria e assessoria econômica ou financeira"]
  },

  esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  pct(v) {
    return `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
  },

  fold(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  },

  digits(v) {
    return String(v == null ? "" : v).replace(/\D/g, "");
  },

  docFmt(d) {
    d = this.digits(d);
    if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    return d || "—";
  },

  cnaeFmt(c) {
    c = this.digits(c).padStart(7, "0");
    return `${c.slice(0, 4)}-${c[4]}/${c.slice(5)}`;
  },

  /** "R$ 3.500,00" → 3500 · "4,57 %" → 4.57 · "-" → null. */
  num(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const t = String(v).replace(/\s/g, "");
    const m = t.match(/-?\d[\d.,]*/);
    if (!m) return null;
    let s = m[0].replace(/[.,]$/, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  },

  /** NFS-e do Simples imprime a alíquota municipal e deixa o ISS apurado zerado: o recolhimento é pelo DAS. */
  issZeradoNoSimples(nota) {
    if (!nota) return false;
    if (Number(nota.valorIss) > 0.004) return false;
    return nota.simples === "sim" || nota.simples === "mei";
  },

  difere(a, b) {
    return a != null && b != null && Math.abs(Number(a) - Number(b)) > this.TOL;
  },

  tipo(nome) {
    const t = this.fold(nome);
    if (/inss|previd/.test(t)) return "INSS";
    if (/\biss/.test(t)) return "ISS";
    if (/irrf|\bir\b|renda/.test(t)) return "IRRF";
    if (/csrf|pcc|pis.?\/?.?cofins|cofins.?\/?.?csll|contrib.*socia/.test(t)) return "CSRF";
    if (/\bpis/.test(t)) return "PIS";
    if (/cofins/.test(t)) return "COFINS";
    if (/csll/.test(t)) return "CSLL";
    return "";
  },

  /** NF-e de mercadoria, conta de energia (NF3e), NFC-e e CT-e não têm retenção na fonte. */
  semRetencao(docId, docNome) {
    return /^(nfe|nf-e|nf3e|nfce|nfcom|cte|ct-e|danfe)/i.test(String(docId || "").trim()) || /mercadoria|produto|energia/i.test(String(docNome || ""));
  },

  ehServico(docId, docNome) {
    const id = String(docId || "").trim();
    if (/^nfj$/i.test(id) || /colaboradores?\s+pj/i.test(String(docNome || ""))) return true;
    return /^(nfs|nfse|nfts|nfsa|rpa|nfps)/i.test(id) || /servi[cç]o/i.test(String(docNome || ""));
  },

  /** NFS e NFJ (nota interna de colaborador PJ). As outras espécies não entram nessa aba. */
  ehNfsOuNfj(docId, docNome) {
    const id = String(docId || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (id === "NFS" || id === "NFSE" || id === "NFJ") return true;
    const nome = String(docNome || "");
    return /colaboradores?\s+pj/i.test(nome) || /nota fiscal de servi/i.test(nome);
  },

  flagSim(v) {
    return v === true || v === 1 || v === "1" || v === "S" || v === "s" || v === "true" || v === "SIM";
  },

  /** Credor pessoa jurídica marcado como colaborador (ou funcionário) no Sienge. */
  ehColaboradorPj(c) {
    if (!c || typeof c !== "object") return false;
    const tipo = String(c.personType || c.type || "").toUpperCase();
    const doc = String(c.cnpj || c.cpf || c.registerNumber || c.cpfCnpj || "").replace(/\D/g, "");
    const pj = tipo === "J" || tipo.includes("JUR") || doc.length === 14;
    if (!pj) return false;
    const tipos = JSON.stringify(c.types || c.creditorTypes || c.typeDescriptions || "").toLowerCase();
    if (/colabor/.test(tipos)) return true;
    if (this.flagSim(c.collaborator) || this.flagSim(c.colaborador) || this.flagSim(c.isCollaborator)) return true;
    if (this.flagSim(c.employee) || this.flagSim(c.funcionario) || this.flagSim(c.isEmployee)) return true;
    return false;
  },

  normNumeroNota(v) {
    return String(v || "").replace(/\D/g, "").replace(/^0+/, "");
  },

  /** NFE fica à parte. NFS, NFSE e NFJ são a mesma nota de serviço. */
  especieNota(id) {
    const d = String(id || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (d === "NFE") return "NFE";
    if (d === "NFS" || d === "NFSE" || d === "NFJ" || d === "NFTS" || d === "NFPS") return "NFS";
    return "";
  },

  escolherNotaExistente(lista, o) {
    const companyId = String(o.companyId || "");
    const supplierId = String(o.supplierId || "");
    const alvo = o.alvo;
    return (lista || []).find((n) => {
      if (!n) return false;
      if (String(n.companyId || "") !== companyId) return false;
      if (String(n.supplierId || "") !== supplierId) return false;
      if (this.normNumeroNota(n.number) !== alvo) return false;
      if (n.documentId && !this.especieNota(n.documentId)) return false;
      return true;
    }) || null;
  },

  textoNotaExistente(n, extra) {
    const x = extra || {};
    const doc = String((n && n.documentId) || x.documento || "Nota").toUpperCase();
    const num = (n && n.number) || x.numero || "";
    const emp = (n && n.companyId) || x.companyId || "";
    const seq = n && n.sequentialNumber ? `, sequencial ${n.sequentialNumber}` : "";
    const tit = n && n.billId ? `, título ${n.billId}` : "";
    return `A ${doc} ${num} já está no Sienge para a empresa ${emp} e este credor${seq}${tit}. O envio foi recusado.`;
  },

  /** Nota já lançada: mesma empresa tomadora, mesmo credor e mesmo número de NFE, NFS ou NFJ. */
  async notaExistente(o) {
    const companyId = String((o && o.companyId) || "").trim();
    const supplierId = String((o && o.supplierId) || "").trim();
    const numero = String((o && o.numero) || "").trim();
    const alvo = this.normNumeroNota(numero);
    if (!companyId || !supplierId || !alvo) return null;
    if (typeof window.siengeFetchWithRetry !== "function") throw new Error("API do Sienge indisponível");
    const pedidos = [numero];
    if (alvo !== numero) pedidos.push(alvo);
    const vistos = [];
    for (const n of pedidos) {
      const path = `/purchase-invoices?companyId=${encodeURIComponent(companyId)}&supplierId=${encodeURIComponent(supplierId)}&number=${encodeURIComponent(n)}&limit=50`;
      const res = await window.siengeFetchWithRetry(path, 1);
      const rows = Array.isArray(res) ? res : ((res && (res.results || res.data)) || []);
      vistos.push.apply(vistos, rows);
      const hit = this.escolherNotaExistente(vistos, { companyId, supplierId, alvo, documento: o.documento });
      if (hit) return hit;
    }
    return null;
  },

  /* ---------- cache ---------- */
  lerCache(chave) {
    try { return JSON.parse(localStorage.getItem(chave) || "{}") || {}; } catch (e) { return {}; }
  },

  gravarCache(chave, mapa, max) {
    const ids = Object.keys(mapa).sort((a, b) => (mapa[b].em || 0) - (mapa[a].em || 0)).slice(0, max);
    const out = {};
    ids.forEach((k) => { out[k] = mapa[k]; });
    try { localStorage.setItem(chave, JSON.stringify(out)); } catch (e) {}
  },

  /* ---------- Sienge ---------- */
  async impostosDoTitulo(billId) {
    let res;
    try {
      res = await window.siengeFetchWithRetry(`/bills/${encodeURIComponent(billId)}/taxes?limit=100`, 1);
    } catch (e) {
      if (Number(e && e.status) === 404 || /\b404\b/.test(String(e && e.message || ""))) return [];
      throw e;
    }
    const lista = Array.isArray(res) ? res : ((res && (res.results || res.data)) || []);
    const pick = (o, ks) => { for (const k of ks) if (o[k] != null && o[k] !== "") return o[k]; return null; };
    return lista.filter((t) => t && typeof t === "object").map((t) => {
      const id = pick(t, ["taxId", "id", "taxTypeId"]);
      const nome = String(pick(t, ["taxName", "name", "description", "taxDescription", "taxAcronym", "acronym", "taxTypeName"]) || id || "").trim();
      let tipo = this.tipo(nome);
      if (!tipo && /^(iss|irrf|inss|pis|cofins|csll|csrf)$/i.test(String(id || ""))) tipo = String(id).toUpperCase();
      if (!tipo && pick(t, ["ibgeCityId", "cityId", "ibgeCode"])) tipo = "ISS";
      const base = this.num(pick(t, ["taxableBaseAmount", "taxBase", "baseAmount", "calculationBase", "taxableBase", "baseValue"]));
      const aliquota = this.num(pick(t, ["rate", "taxRate", "aliquot", "aliquota", "percentage"]));
      let valor = this.num(pick(t, ["amount", "value", "taxAmount", "retainedAmount", "taxValue", "retainedValue"]));
      if (!(valor > 0.004) && base > 0 && aliquota > 0) valor = Math.round(base * aliquota) / 100;
      return {
        id: id != null ? String(id) : "",
        nome: nome || (id != null ? `Imposto ${id}` : "Imposto"),
        tipo,
        base,
        aliquota,
        valor: valor || 0
      };
    }).filter((t) => t.valor > 0.004);
  },

  async anexos(billId) {
    const data = await window.siengeFetchWithRetry(`/bills/${encodeURIComponent(billId)}/attachments`, 1);
    return ((data && data.results) || []).map((a) => ({
      id: a.attachmentid != null ? a.attachmentid : a.attachmentId,
      name: String(a.name || ""),
      description: String(a.description || "").trim()
    })).filter((a) => a.id != null && a.id !== "");
  },

  async baixar(billId, attachmentId) {
    const base = (window.SIENGE_CONFIG && window.SIENGE_CONFIG.baseUrl) || "/api/sienge-proxy";
    const headers = {};
    if (typeof getBasicAuthHeader === "function") headers.Authorization = getBasicAuthHeader();
    const res = await fetch(`${base}/bills/${encodeURIComponent(billId)}/attachments/${encodeURIComponent(attachmentId)}`, { headers });
    if (!res.ok) throw new Error(`anexo ${res.status}`);
    return { buf: await res.arrayBuffer(), tipo: String(res.headers.get("content-type") || "") };
  },

  async docDoCredor(credorId) {
    if (!credorId) return "";
    if (window.GerarPagamentoApp && typeof GerarPagamentoApp.carregarCredor === "function") {
      const c = await GerarPagamentoApp.carregarCredor(String(credorId));
      if (c && !c.erro) return this.digits(c.doc);
    }
    const cad = await window.siengeFetchWithRetry(`/creditors/${encodeURIComponent(credorId)}`, 1);
    return this.digits(cad && (cad.cnpj || cad.cpf));
  },

  /* ---------- cadastro público do CNPJ ---------- */
  receita(cnpj) {
    cnpj = this.digits(cnpj);
    if (cnpj.length !== 14) return Promise.resolve(null);
    const cache = this.lerCache(this.CNPJ_KEY);
    if (cache[cnpj] && cache[cnpj].d && cache[cnpj].d.cep != null && Date.now() - cache[cnpj].em < this.CNPJ_TTL) return Promise.resolve(cache[cnpj].d);
    if (this._cnpjVoo[cnpj]) return this._cnpjVoo[cnpj];
    this._cnpjVoo[cnpj] = (async () => {
      const d = await this.consultarCnpj(cnpj);
      const c = this.lerCache(this.CNPJ_KEY);
      c[cnpj] = { em: Date.now(), d };
      this.gravarCache(this.CNPJ_KEY, c, 400);
      return d;
    })().finally(() => { delete this._cnpjVoo[cnpj]; });
    return this._cnpjVoo[cnpj];
  },

  async consultarCnpj(cnpj) {
    const fontes = [() => this.cnpjPeloProxy(cnpj), () => this.cnpjPelaBrasil(cnpj)];
    let ultimo = "consulta do CNPJ falhou";
    for (const fonte of fontes) {
      try {
        const d = await fonte();
        if (d && (d.razao || d.cnae || d.cep)) return d;
      } catch (e) {
        ultimo = (e && e.message) || ultimo;
      }
    }
    throw new Error(ultimo);
  },

  async cnpjPeloProxy(cnpj) {
    const res = await fetch("/api/cnpj?cnpj=" + encodeURIComponent(cnpj));
    if (!res.ok) throw new Error(res.status === 404 ? "CNPJ não encontrado no cadastro da Receita" : `consulta do CNPJ falhou (${res.status})`);
    const j = await res.json();
    if (!j || j.erro) throw new Error((j && j.erro) || "consulta do CNPJ falhou");
    return j;
  },

  async cnpjPelaBrasil(cnpj) {
    const res = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + cnpj);
    if (!res.ok) throw new Error(res.status === 404 ? "CNPJ não encontrado no cadastro da Receita" : `consulta do CNPJ falhou (${res.status})`);
    const j = await res.json();
    return {
      razao: j.razao_social || "",
      cnae: j.cnae_fiscal != null ? String(j.cnae_fiscal) : "",
      cnaeDesc: j.cnae_fiscal_descricao || "",
      secundarios: (Array.isArray(j.cnaes_secundarios) ? j.cnaes_secundarios : [])
        .filter((c) => c && Number(c.codigo)).map((c) => ({ codigo: String(c.codigo), descricao: c.descricao || "" })),
      simples: j.opcao_pelo_simples === true ? true : (j.opcao_pelo_simples === false ? false : null),
      mei: j.opcao_pelo_mei === true,
      situacao: j.descricao_situacao_cadastral || "",
      cidade: [j.municipio, j.uf].filter(Boolean).join("/"),
      logradouro: j.logradouro || "",
      numero: j.numero != null ? String(j.numero) : "",
      bairro: j.bairro || "",
      municipio: j.municipio || "",
      uf: j.uf || "",
      cep: j.cep != null ? String(j.cep) : ""
    };
  },

  /* ---------- leitura da nota ---------- */
  escolherNotas(anexos) {
    const txt = (a) => this.fold(`${a.description} ${a.name}`);
    const lista = (anexos || []).filter((a) => !/boleto|comprovante|\bguia\b|darf|\bgps\b|recibo de pag/.test(txt(a)));
    const peso = (a) => (/\bnf|nota|danfs|nfs|fatura|\.xml$/.test(txt(a)) ? 0 : 1) + (/\.xml$/i.test(a.name) ? -0.5 : 0);
    return lista.sort((a, b) => peso(a) - peso(b)).slice(0, 3);
  },

  async lerNota(billId, anexos) {
    const lista = this.escolherNotas(anexos || await this.anexos(billId));
    if (!lista.length) return { semAnexo: true };
    let ultimo = null;
    for (const a of lista) {
      try {
        const { buf, tipo } = await this.baixar(billId, a.id);
        const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 64))).trim();
        let campos = null;
        if (/^<|^\uFEFF?</.test(inicio) || /xml/i.test(tipo)) campos = this.lerXml(new TextDecoder("utf-8").decode(buf));
        else if (/^%PDF/.test(inicio)) campos = this.lerPdfItens(await this.itensDoPdf(buf));
        if (!campos) continue;
        campos.anexo = a.description || a.name || "Anexo";
        if (campos.valorServico != null || campos.liquido != null || campos.totalRetencoes != null || campos.baseIss != null) return campos;
        ultimo = campos;
      } catch (e) {
        ultimo = ultimo || { ilegivel: true, anexo: a.description || a.name, erro: (e && e.message) || "" };
      }
    }
    return Object.assign({ ilegivel: true }, ultimo || {}, { ilegivel: true });
  },

  async itensDoPdf(buf) {
    const lib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
    if (!lib) throw new Error("leitor de PDF indisponível");
    const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
    const itens = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      tc.items.forEach((it) => {
        const s = String(it.str || "").replace(/\s+/g, " ").trim();
        if (s) itens.push({ s, x: it.transform[4], y: (p - 1) * 5000 + (vp.height - it.transform[5]), w: it.width || 0 });
      });
    }
    return itens;
  },

  /** Rótulo com o valor embaixo (DANFSe nacional) ou ao lado ("Valor líquido: R$ 3.340,05"). */
  lerPdfItens(itens) {
    if (!itens.length) return null;
    const ordenados = itens.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const linhas = [];
    ordenados.forEach((it) => {
      const l = linhas[linhas.length - 1];
      if (l && Math.abs(l.y - it.y) < 2.5) l.itens.push(it);
      else linhas.push({ y: it.y, itens: [it] });
    });
    const texto = linhas.map((l) => l.itens.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ")).join("\n");
    const abaixo = (rotulo) => {
      let melhor = null;
      ordenados.forEach((r) => {
        if (r.s.length > 70 || !rotulo.test(r.s)) return;
        ordenados.forEach((v) => {
          const dy = v.y - r.y;
          if (dy < 2.5 || dy > 28 || v.x < r.x - 6 || v.x > r.x + Math.max(70, r.w * 0.6)) return;
          const d = dy + Math.abs(v.x - r.x) * 0.2;
          if (!melhor || d < melhor.d) melhor = { d, s: v.s };
        });
      });
      return melhor ? melhor.s : null;
    };
    const aoLado = (rotulo) => {
      const src = rotulo.source.replace(/^\^/, "").replace(/\$$/, "");
      const m = texto.match(new RegExp(`(?:${src})\\s*[=:\\-–]?\\s*((?:R\\$\\s*)?-?\\d[\\d.,]*\\s*%?|retido[^\\n]{0,30}|n[aã]o retido|sim|n[aã]o)`, "i"));
      return m ? m[1] : null;
    };
    const campo = (rotulos, valorTexto) => {
      for (const r of rotulos) {
        const v = abaixo(r);
        if (v != null && (valorTexto || this.num(v) != null || /^-$/.test(v))) return v;
        const l = aoLado(r);
        if (l != null) return l;
      }
      return null;
    };
    const valor = (rotulos) => {
      const v = campo(rotulos, false);
      if (v == null) return null;
      if (/^-$/.test(String(v).trim())) return 0;
      return this.num(v);
    };
    const retIss = campo([/^reten[cç][aã]o do issqn$/i, /^iss(qn)? retido$/i, /^iss(qn)? retido na fonte$/i], true);
    const simples = campo([/simples nacional/i, /^optante (pelo )?simples/i], true);
    const n = {
      valorServico: valor([/^valor da opera[cç][aã]o ?\/ ?servi[cç]o$/i, /^valor (total )?do(s)? servi[cç]o(s)?( \(r\$\))?$/i, /^valor total da nota$/i]),
      baseIss: valor([/^bc issqn$/i, /^base de c[aá]lculo( do iss(qn)?)?( \(r\$\))?$/i]),
      aliquotaIss: valor([/^al[ií]quota aplicada$/i, /^al[ií]quota( do iss(qn)?)?( \(%\))?$/i]),
      valorIss: valor([/^issqn apurado$/i, /^valor do iss(qn)?( \(r\$\))?$/i, /^iss(qn)? \(r\$\)$/i]),
      irrf: valor([/^irrf$/i, /^(valor )?(do )?ir(rf)?( retido)?( \(r\$\))?$/i]),
      inss: valor([/^contribui[cç][aã]o previdenci[aá]ria - retida$/i, /^(valor )?(do )?inss( retido)?( \(r\$\))?$/i]),
      csrf: valor([/^contribui[cç][oõ]es sociais - retidas$/i]),
      pis: valor([/^(valor )?(do )?pis( retido)?( \(r\$\))?$/i]),
      cofins: valor([/^(valor )?(da )?cofins( retid[oa])?( \(r\$\))?$/i]),
      csll: valor([/^(valor )?(da )?csll( retid[oa])?( \(r\$\))?$/i]),
      totalRetencoes: valor([/^total das reten[cç][oõ]es/i, /^(valor )?(total )?(das )?reten[cç][oõ]es( federais)?$/i]),
      liquido: valor([/^valor l[ií]quido( da nfs-?e| da nota)?( \(r\$\))?$/i]),
      codigo: campo([/^c[oó]digo de tributa[cç][aã]o nacional( ?\/ ?municipal)?$/i, /^item da lista/i, /^c[oó]digo do servi[cç]o$/i], true),
      descricao: campo([/^descri[cç][aã]o do servi[cç]o$/i, /^discrimina[cç][aã]o do(s)? servi[cç]o(s)?$/i], true),
      numero: campo([/^n[uú]mero da nfs-?e$/i, /^n[uú]mero da nota$/i], true)
    };
    n.issRetido = retIss == null ? null : (/n[aã]o/i.test(retIss) ? false : /retid|sim|tomador|intermedi/i.test(retIss));
    n.simplesTexto = simples || "";
    n.simples = this.lerSimples(simples);
    if (n.simples == null && /simples nacional na data de compet[eê]ncia[\s\S]{0,60}\bsim\b/i.test(texto)) n.simples = "sim";
    if (n.simples == null && /simples nacional na data de compet[eê]ncia[\s\S]{0,60}\bn[aã]o\b/i.test(texto)) n.simples = "nao";
    n.cnpjs = [...new Set((texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || []).map((c) => this.digits(c)))];
    n.cnpjPrestador = this.cnpjApos(texto, /prestador de servi[cç]os?|dados do prestador|(?:^|\n)\s*prestador\b|emitente/i);
    const naColuna = this.valorNaColuna(itens, /^valor l[ií]quido( da nfs-?e| da nota)?( \(r\$\))?$/i);
    if (naColuna != null && naColuna > 0 && !(n.liquido > 0.004)) n.liquido = naColuna;
    const totalDeclarado = this.valorDeclarado(texto, /valor total da nota/i);
    const liquidoDeclarado = this.valorDeclarado(texto, /valor l[ií]quido da nota/i);
    if (!(n.valorServico > 0.004) && totalDeclarado > 0.004) n.valorServico = totalDeclarado;
    if (!(n.liquido > 0.004) && liquidoDeclarado > 0.004) n.liquido = liquidoDeclarado;
    const retidoNota = (n.inss || 0) + (n.irrf || 0) + (n.pis || 0) + (n.cofins || 0) + (n.csll || 0) + (n.csrf || 0) + (n.issRetido && n.valorIss ? n.valorIss : 0);
    if (!(n.liquido > 0.004) && n.valorServico > 0.004 && retidoNota < 0.009) n.liquido = n.valorServico;
    if (!(n.liquido > 0.004) && !(n.valorServico > 0.004)) n.liquido = null;
    return n;
  },

  /** CNPJ ou CPF que aparece logo depois de um rótulo (prestador da nota, beneficiário do boleto). */
  cnpjApos(texto, rotulo) {
    const src = rotulo.source || String(rotulo);
    const m = String(texto || "").match(new RegExp("(?:" + src + ")[\\s\\S]{0,280}?(\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}|\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2})", "i"));
    return m ? this.digits(m[1]) : "";
  },

  /**
   * Valor impresso junto do rótulo ("VALOR TOTAL DA NOTA = R$ 255,00")
   * ou na última coluna da linha de baixo ("VALOR LÍQUIDO DA NOTA (R$)").
   * Zero solto da tabela de retenção não conta.
   */
  valorDeclarado(texto, rotulo) {
    const linhas = String(texto || "").split("\n");
    const re = rotulo instanceof RegExp ? rotulo : new RegExp(rotulo, "i");
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const m = linha.match(re);
      if (!m) continue;
      const depois = linha.slice(m.index + m[0].length);
      const mesma = depois.match(/^\s*(?:\([^)]*\))?\s*[=:\-–]?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/);
      if (mesma) {
        const n = this.num(mesma[1]);
        if (n > 0.004) return n;
      }
      const prox = linhas[i + 1] || "";
      const vals = [];
      const reV = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g;
      let vm;
      while ((vm = reV.exec(prox))) {
        const n = this.num(vm[1]);
        if (n != null) vals.push(n);
      }
      const positivo = vals.filter((n) => n > 0.004);
      if (positivo.length) return positivo[positivo.length - 1];
    }
    return null;
  },

  /** Valor na coluna do rótulo, na linha de baixo. Evita pegar o primeiro número da linha seguinte. */
  valorNaColuna(itens, rotulo) {
    const ordenados = (itens || []).slice().sort((a, b) => a.y - b.y || a.x - b.x);
    let rot = null;
    ordenados.forEach((r) => {
      if (!r || r.s.length > 80 || !rotulo.test(r.s)) return;
      if (!rot || r.y < rot.y) rot = r;
    });
    if (!rot) return null;
    const esq = (rot.x || 0) - 8;
    const dir = (rot.x || 0) + Math.max(rot.w || 0, 40) + 90;
    let melhor = null;
    ordenados.forEach((v) => {
      const dy = v.y - rot.y;
      if (dy < 2 || dy > 36) return;
      const n = this.num(v.s);
      if (n == null) return;
      const x = v.x || 0;
      if (x < esq || x > dir) return;
      const dx = Math.abs(x - (rot.x || 0));
      if (!melhor || dx < melhor.dx) melhor = { dx, n };
    });
    return melhor ? melhor.n : null;
  },

  textoPdf(itens) {
    const ordenados = (itens || []).slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const linhas = [];
    ordenados.forEach((it) => {
      const l = linhas[linhas.length - 1];
      if (l && Math.abs(l.y - it.y) < 2.5) l.itens.push(it);
      else linhas.push({ y: it.y, itens: [it] });
    });
    return linhas.map((l) => l.itens.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ")).join("\n");
  },

  /** CPF/CNPJ do beneficiário impresso no boleto anexado ao título. */
  async cnpjBeneficiarioBoleto(billId) {
    const id = String(billId || "");
    if (!id) return "";
    this._boletoBenef = this._boletoBenef || {};
    if (this._boletoBenef[id] != null) return this._boletoBenef[id];
    let doc = "";
    try {
      const anexos = await this.anexos(id);
      const boletos = (anexos || []).filter((a) => /boleto/.test(this.fold(`${a.description} ${a.name}`)) && !/comprovante/.test(this.fold(`${a.description} ${a.name}`)));
      for (const a of boletos.slice(0, 2)) {
        const { buf } = await this.baixar(id, a.id);
        const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 64))).trim();
        if (!/^%PDF/.test(inicio)) continue;
        const texto = this.textoPdf(await this.itensDoPdf(buf));
        doc = this.cnpjApos(texto, /benefici[aá]rio|cedente/i);
        if (doc) break;
      }
    } catch (e) {
      doc = "";
    }
    this._boletoBenef[id] = doc || "";
    return this._boletoBenef[id];
  },

  lerSimples(t) {
    if (!t) return null;
    const f = this.fold(t);
    if (/nao optante|^nao$/.test(f)) return "nao";
    if (/\bmei\b|microempreendedor/.test(f)) return "mei";
    if (/optante|^sim$|me\/epp/.test(f)) return "sim";
    return null;
  },

  /** XML da NFS-e nacional (DPS/infNFSe) e layouts ABRASF. */
  lerXml(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return null;
    const tag = (...nomes) => {
      for (const nome of nomes) {
        const el = doc.getElementsByTagNameNS("*", nome)[0] || doc.getElementsByTagName(nome)[0];
        if (el && String(el.textContent).trim()) return String(el.textContent).trim();
      }
      return null;
    };
    const num = (...nomes) => { const v = tag(...nomes); return v == null ? null : Number(String(v).replace(",", ".")); };
    const tpNac = tag("tpRetISSQN");
    const tpAbrasf = tag("IssRetido");
    const opNac = tag("opSimpNac");
    const opAbrasf = tag("OptanteSimplesNacional");
    const prest = doc.getElementsByTagNameNS("*", "prest")[0] || doc.getElementsByTagNameNS("*", "emit")[0] || doc.getElementsByTagNameNS("*", "Prestador")[0];
    const cnpjPrest = prest ? ((prest.getElementsByTagNameNS("*", "CNPJ")[0] || {}).textContent || "") : (tag("CNPJ") || "");
    const pis = num("vPis", "ValorPis");
    const cofins = num("vCofins", "ValorCofins");
    const tpPisCofins = tag("tpRetPisCofins");
    return {
      valorServico: num("vServ", "ValorServicos"),
      baseIss: num("vBC", "BaseCalculo"),
      aliquotaIss: (() => { const a = num("pAliqAplic", "pAliq", "Aliquota"); return a != null && a < 1 && a > 0 ? a * 100 : a; })(),
      valorIss: num("vISSQN", "ValorIss"),
      issRetido: tpNac != null ? tpNac !== "1" : (tpAbrasf != null ? tpAbrasf === "1" : null),
      irrf: num("vRetIRRF", "ValorIr"),
      inss: num("vRetCP", "ValorInss"),
      csrf: null,
      pis: tpPisCofins === "2" ? 0 : pis,
      cofins: tpPisCofins === "2" ? 0 : cofins,
      csll: num("vRetCSLL", "ValorCsll"),
      totalRetencoes: num("vTotalRet"),
      liquido: num("vLiq", "ValorLiquidoNfse"),
      codigo: tag("cTribNac", "ItemListaServico", "CodigoTributacaoMunicipio"),
      descricao: tag("xDescServ", "Discriminacao"),
      numero: tag("nNFSe", "Numero"),
      simplesTexto: opNac ? ({ 1: "Não optante", 2: "MEI", 3: "Optante ME/EPP" }[opNac] || opNac) : (opAbrasf ? (opAbrasf === "1" ? "Optante" : "Não optante") : ""),
      simples: opNac ? ({ 1: "nao", 2: "mei", 3: "sim" }[opNac] || null) : (opAbrasf ? (opAbrasf === "1" ? "sim" : "nao") : null),
      cnpjs: [this.digits(cnpjPrest)].filter((c) => c.length === 14)
    };
  },

  /* ---------- análise ---------- */
  /** Dados do título que não dependem do valor da parcela: impostos no Sienge, nota anexada e cadastro do prestador. */
  coletar(billId, credorId, anexos) {
    const key = String(billId);
    const cache = this.lerCache(this.CACHE_KEY);
    if (cache[key] && Date.now() - cache[key].em < this.TTL) return Promise.resolve(cache[key].d);
    if (this._voo[key]) return this._voo[key];
    this._voo[key] = (async () => {
      const falhas = [];
      const msg = (e) => (e && e.message) || "falha na consulta";
      const [impostos, nota, credorDoc] = await Promise.all([
        this.impostosDoTitulo(billId).catch((e) => { falhas.push(`Não consegui ler os impostos do título no Sienge (${msg(e)}).`); return null; }),
        this.lerNota(billId, anexos).catch((e) => { falhas.push(`Não consegui abrir os anexos do título (${msg(e)}).`); return null; }),
        this.docDoCredor(credorId).catch(() => "")
      ]);
      const cnpj = credorDoc && credorDoc.length === 14 ? credorDoc
        : (nota && nota.cnpjs && nota.cnpjs.length === 1 && !credorDoc ? nota.cnpjs[0] : "");
      let empresa = null;
      if (cnpj) empresa = await this.receita(cnpj).catch((e) => { falhas.push(`Não consegui consultar o CNAE do prestador (${msg(e)}).`); return null; });
      const d = { impostos, nota, credorDoc, cnpj, empresa, falhas };
      if (!falhas.length) {
        const c = this.lerCache(this.CACHE_KEY);
        c[key] = { em: Date.now(), d };
        this.gravarCache(this.CACHE_KEY, c, 300);
      }
      return d;
    })().finally(() => { delete this._voo[key]; });
    return this._voo[key];
  },

  /** opts: { billId, credorId, bruto (valor do título/parcela), anexos? } */
  async analisar(opts) {
    const d = await this.coletar(opts.billId, opts.credorId, opts.anexos);
    return this.avaliar(d, opts);
  },

  /** "07.11.02 / -", "071102", "7.11" → subitem 07.11 da LC 116 com a atividade correspondente. */
  servicoLc116(codigo) {
    const t = String(codigo || "").split("/")[0].trim();
    const m = t.match(/^(\d{1,2})\.(\d{2})/);
    let chave = m ? m[1].padStart(2, "0") + m[2] : "";
    if (!chave) {
      const d = this.digits(t);
      if (d.length === 4 || d.length === 6) chave = d.slice(0, 4);
    }
    if (!chave) return null;
    const s = this.SERVICOS_LC116[chave];
    return {
      item: `${chave.slice(0, 2)}.${chave.slice(2)}`,
      nome: s ? s[1] : "",
      atividade: s ? this.ATIVIDADES.find((a) => a.id === s[0]) || null : null
    };
  },

  /** Atividade do serviço: código LC 116 da nota primeiro, depois a descrição; CNAEs comparados pelo código e pela descrição. */
  atividadeDe(n, e) {
    const servico = n ? this.servicoLc116(n.codigo) : null;
    const pelaNotaCod = servico ? servico.atividade : null;
    const f = this.fold(n ? n.descricao : "");
    const pelaDesc = f ? this.ATIVIDADES.filter((a) => a.desc.test(f)) : [];
    const cnaes = e ? [{ codigo: e.cnae, descricao: e.cnaeDesc }].concat(e.secundarios || []).filter((c) => c && c.codigo) : [];
    const pelosCnaes = [];
    cnaes.forEach((c) => {
      const dg = this.digits(c.codigo);
      const fd = this.fold(c.descricao);
      this.ATIVIDADES.forEach((a) => {
        if ((a.cnae.test(dg) || (fd && a.desc.test(fd))) && !pelosCnaes.includes(a)) pelosCnaes.push(a);
      });
    });
    const candidatos = pelaNotaCod ? [pelaNotaCod] : pelaDesc;
    const cabe = candidatos.find((a) => pelosCnaes.includes(a)) || null;
    const conflito = cnaes.length && candidatos.length && !cabe ? (pelaNotaCod ? "codigo" : "descricao") : "";
    return { servico, pelaNotaCod, pelaDesc, pelosCnaes, cnaes, conflito, atividade: cabe || pelaNotaCod || pelaDesc[0] || pelosCnaes[0] || null };
  },

  avaliar(d, opts) {
    const r = {
      billId: String(opts.billId), bruto: Number(opts.bruto) || 0, impostos: d.impostos || [], nota: d.nota, empresa: d.empresa,
      cnpj: d.cnpj, credorDoc: d.credorDoc, retido: 0, liquido: null, linhas: [], atividade: null,
      erros: [], avisos: [], infos: (d.falhas || []).slice(), nivel: "info", resumo: ""
    };
    const T = this.TOL;
    const imp = r.impostos;
    r.retido = Math.round(imp.reduce((t, x) => t + x.valor, 0) * 100) / 100;
    if (r.bruto) r.liquido = Math.round((r.bruto - r.retido) * 100) / 100;

    imp.forEach((x) => {
      if (x.base != null && x.aliquota != null && x.base > 0 && Math.abs(x.base * x.aliquota / 100 - x.valor) > T) {
        r.avisos.push(`${x.nome} no Sienge: base ${this.money(x.base)} × ${this.pct(x.aliquota)} = ${this.money(x.base * x.aliquota / 100)}, mas o valor lançado é ${this.money(x.valor)}.`);
      }
    });

    const n = d.nota && !d.nota.semAnexo && !d.nota.ilegivel ? d.nota : null;
    if (d.nota && d.nota.semAnexo) r.infos.push("O título não tem nota fiscal anexada para conferir a retenção.");
    else if (d.nota && d.nota.ilegivel) {
      const motivo = String(d.nota.erro || "");
      const nome = d.nota.anexo || "anexo";
      if (/leitor de PDF/i.test(motivo)) r.infos.push("Não consegui abrir o leitor de PDF para ler a nota.");
      else if (motivo) r.infos.push(`Não consegui ler a nota "${nome}": ${motivo}`);
      else r.infos.push(`Não consegui ler o texto da nota "${nome}" (pode ser imagem escaneada): confira a retenção na nota.`);
    }

    if (n) {
      const issNota = n.issRetido ? (n.valorIss || 0) : 0;
      const pcc = n.csrf != null && n.csrf > 0 ? n.csrf : (n.pis || 0) + (n.cofins || 0) + (n.csll || 0);
      const somaNota = Math.round((issNota + (n.irrf || 0) + (n.inss || 0) + pcc) * 100) / 100;
      const retNota = n.totalRetencoes != null ? n.totalRetencoes : somaNota;
      r.retidoNota = retNota;

      if (n.baseIss && n.aliquotaIss && n.valorIss != null && Math.abs(n.baseIss * n.aliquotaIss / 100 - n.valorIss) > T && !this.issZeradoNoSimples(n)) {
        r.avisos.push(`Na nota, o ISS não fecha: base ${this.money(n.baseIss)} × ${this.pct(n.aliquotaIss)} = ${this.money(n.baseIss * n.aliquotaIss / 100)}, mas a nota mostra ${this.money(n.valorIss)}.`);
      }
      if (n.valorServico != null && n.liquido != null && Math.abs(n.valorServico - retNota - n.liquido) > T) {
        r.avisos.push(`Na nota, serviço ${this.money(n.valorServico)} − retenções ${this.money(retNota)} = ${this.money(n.valorServico - retNota)}, mas o líquido da nota é ${this.money(n.liquido)}.`);
      }

      if (!d.impostos && retNota > T) {
        r.avisos.push(`A nota tem retenção de ${this.money(retNota)}; não consegui confirmar se o imposto foi lançado no título do Sienge.`);
      }
      if (d.impostos) {
        if (retNota > T && r.retido <= T) {
          r.erros.push(`A nota tem retenção de ${this.money(retNota)}, mas o título não tem imposto retido lançado no Sienge: o pagamento sairia pelo valor bruto.`);
        } else if (retNota <= T && r.retido > T) {
          r.erros.push(`O título tem ${this.money(r.retido)} de imposto retido no Sienge, mas a nota não destaca retenção.`);
        } else if (Math.abs(retNota - r.retido) > T) {
          r.erros.push(`Imposto retido no Sienge (${this.money(r.retido)}) diferente da retenção da nota (${this.money(retNota)}).`);
        }
      }

      const naNota = {
        ISS: n.issRetido ? { base: n.baseIss, aliquota: n.aliquotaIss, valor: n.valorIss || 0 } : null,
        IRRF: n.irrf > 0 ? { valor: n.irrf } : null,
        INSS: n.inss > 0 ? { valor: n.inss } : null,
        CSRF: pcc > 0 ? { valor: pcc } : null
      };
      const doSienge = {};
      imp.forEach((x) => {
        const t = ["PIS", "COFINS", "CSLL"].includes(x.tipo) ? "CSRF" : (x.tipo || "?");
        const o = doSienge[t] || (doSienge[t] = { nomes: [], base: null, aliquota: 0, valor: 0, n: 0 });
        o.nomes.push(x.nome);
        o.valor += x.valor;
        o.aliquota += x.aliquota || 0;
        o.base = x.base != null ? x.base : o.base;
        o.n += 1;
      });
      const semTipo = doSienge["?"];
      const totalFecha = !!d.impostos && Math.abs(retNota - r.retido) <= T;
      ["ISS", "IRRF", "INSS", "CSRF"].forEach((t) => {
        const s = doSienge[t];
        const nt = naNota[t];
        if (!s && !nt) return;
        const linha = { tipo: t, sienge: s ? { base: s.base, aliquota: s.n === 1 || t === "CSRF" ? s.aliquota : null, valor: s.valor } : null, nota: nt, ok: true };
        if (s && nt) {
          if (this.difere(s.valor, nt.valor)) { linha.ok = false; r.avisos.push(`${t}: lançado ${this.money(s.valor)} no Sienge, a nota retém ${this.money(nt.valor)}.`); }
          if (t === "ISS" && this.difere(s.base, nt.base)) { linha.ok = false; r.avisos.push(`ISS: base ${this.money(s.base)} no Sienge, a nota usa ${this.money(nt.base)}.`); }
          if (t === "ISS" && s.n === 1 && nt.aliquota != null && s.aliquota && Math.abs(s.aliquota - nt.aliquota) > 0.005) {
            linha.ok = false;
            r.avisos.push(`ISS: alíquota ${this.pct(s.aliquota)} no Sienge, a nota usa ${this.pct(nt.aliquota)}.`);
          }
        } else if (nt && semTipo && totalFecha) {
          linha.ok = null;
        } else if (nt && d.impostos && r.retido > T) {
          linha.ok = false;
          r.avisos.push(`A nota retém ${t} (${this.money(nt.valor)}), mas esse imposto não está lançado no título.`);
        } else if (s && !nt && retNota > T) {
          linha.ok = false;
          r.avisos.push(`${t} de ${this.money(s.valor)} lançado no Sienge, mas a nota não retém esse imposto.`);
        }
        r.linhas.push(linha);
      });
      if (semTipo) {
        const nomes = Array.from(new Set(semTipo.nomes)).join(", ");
        r.linhas.push({ tipo: "Sem tipo no Sienge", detalhe: nomes, sienge: { valor: semTipo.valor, base: null, aliquota: null }, nota: null, ok: totalFecha ? true : null });
        if (totalFecha) r.infos.push(`O Sienge não informa o tipo de cada imposto retido (${nomes}): conferido pelo total, ${this.money(r.retido)} no Sienge = ${this.money(retNota)} na nota.`);
      }
      if (!n.issRetido && n.valorIss > T) {
        r.linhas.unshift({ tipo: "ISS", destacado: true, sienge: null, nota: { base: n.baseIss, aliquota: n.aliquotaIss, valor: n.valorIss }, ok: true });
        r.infos.push(`ISS de ${this.money(n.valorIss)}${n.aliquotaIss ? ` (${this.pct(n.aliquotaIss)})` : ""} destacado na nota e não retido: recolhido pelo prestador, não entra no desconto do pagamento.`);
      }

      if (n.valorServico != null && r.bruto && this.difere(n.valorServico, r.bruto)) {
        r.avisos.push(`Valor do serviço na nota (${this.money(n.valorServico)}) diferente do valor do título (${this.money(r.bruto)}).`);
      }
      if (!(Number(n.liquido) > 0.004) && Number(n.valorServico) > 0.004 && retNota <= T) {
        n.liquido = Math.round((Number(n.valorServico) - retNota) * 100) / 100;
      }
      if (!(Number(n.liquido) > 0.004)) n.liquido = Number(n.valorServico) > 0.004 ? n.liquido : null;
      if (n.liquido != null && r.liquido != null && this.difere(n.liquido, r.liquido) && !this.difere(n.valorServico, r.bruto)) {
        r.erros.push(`Valor líquido da nota ${this.money(n.liquido)} diferente do líquido do título (${this.money(r.bruto)} − ${this.money(r.retido)} = ${this.money(r.liquido)}).`);
      }
      if (d.credorDoc && d.credorDoc.length === 14 && n.cnpjs && n.cnpjs.length && !n.cnpjs.includes(d.credorDoc)) {
        r.avisos.push(`A nota anexada não traz o CNPJ do credor (${this.docFmt(d.credorDoc)}): pode ser nota de outro fornecedor.`);
      }
      if (n.aliquotaIss != null && n.aliquotaIss > 0 && (n.aliquotaIss < 2 - 0.001 || n.aliquotaIss > 5 + 0.001)) {
        r.avisos.push(`Alíquota de ISS ${this.pct(n.aliquotaIss)} fora do intervalo legal de 2% a 5% (LC 116).`);
      }
    } else if (r.retido > T) {
      r.linhas = Object.values(imp.reduce((m, x) => {
        const t = ["PIS", "COFINS", "CSLL"].includes(x.tipo) ? "CSRF" : (x.tipo || "Outros");
        const o = m[t] || (m[t] = { tipo: t, sienge: { base: x.base, aliquota: 0, valor: 0 }, nota: null, ok: true });
        o.sienge.valor += x.valor;
        o.sienge.aliquota += x.aliquota || 0;
        return m;
      }, {}));
    }

    r.retidoPagamento = d.impostos ? r.retido : (r.retidoNota || 0);

    this.avaliarAtividade(r, d, n);

    if (r.erros.length) r.nivel = "erro";
    else if (r.avisos.length) r.nivel = "aviso";
    else if (n) r.nivel = "ok";
    r.resumo = r.erros[0] || r.avisos[0] || (n
      ? (r.retido > T ? `Retenção de ${this.money(r.retido)} confere com a nota` : "Sem retenção, como na nota")
      : (r.retido > T ? `Imposto retido de ${this.money(r.retido)} no Sienge (nota não conferida)` : "Nota não conferida"));
    return r;
  },

  /** Retenções que a atividade e o regime do prestador costumam exigir (só alerta, não bloqueia). */
  avaliarAtividade(r, d, n) {
    const e = d.empresa;
    const at = this.atividadeDe(n, e);
    r.atividade = at.atividade ? at.atividade.nome : "";
    r.servicoLc = at.servico && at.servico.nome ? `${at.servico.item} ${at.servico.nome}` : "";
    r.atividadeConflito = at.conflito;
    if (e && e.situacao && !/ativa/i.test(e.situacao)) r.avisos.push(`CNPJ do prestador com situação "${e.situacao}" na Receita.`);
    const cnaesTxt = at.cnaes.slice(0, 4).map((c) => `${this.cnaeFmt(c.codigo)}${c.descricao ? " " + c.descricao : ""}`).join("; ") + (at.cnaes.length > 4 ? "; …" : "");
    if (at.conflito === "codigo") {
      r.avisos.push(`O código de serviço da nota (${at.servico.item} ${at.servico.nome}) é de ${at.pelaNotaCod.nome}, e nenhum CNAE do prestador é dessa atividade (${cnaesTxt}). Confira no cartão CNPJ se ele pode emitir esse serviço.`);
    } else if (at.conflito === "descricao") {
      r.infos.push(`A descrição da nota lembra ${at.pelaDesc.map((a) => a.nome).join(" ou ")}, e não identifiquei CNAE do prestador com essa atividade (${cnaesTxt}). Sem o código de serviço legível na nota, vale só como conferência visual.`);
    }
    const regime = (n && n.simples) || (e ? (e.mei ? "mei" : (e.simples === true ? "sim" : (e.simples === false ? "nao" : null))) : null);
    r.regime = regime;
    if (n && n.simples && e && ((n.simples === "nao") !== (e.simples === false && !e.mei))) {
      r.infos.push(`Regime na nota (${n.simplesTexto}) diferente do cadastro público do CNPJ (${e.mei ? "MEI" : (e.simples ? "Simples Nacional" : "fora do Simples")}). Vale o que está na nota.`);
    }
    const a = at.atividade;
    const dica = at.conflito === "descricao" ? r.infos : r.avisos;
    const tem = (t) => r.impostos.some((x) => x.tipo === t || (t === "CSRF" && ["PIS", "COFINS", "CSLL", "CSRF"].includes(x.tipo)))
      || (n && ((t === "IRRF" && n.irrf > 0) || (t === "INSS" && n.inss > 0) || (t === "CSRF" && ((n.csrf || 0) + (n.pis || 0) + (n.cofins || 0) + (n.csll || 0)) > 0)));
    const base = r.bruto || (n && n.valorServico) || 0;
    if (regime === "mei") {
      ["IRRF", "INSS", "CSRF"].forEach((t) => { if (tem(t)) r.avisos.push(`Prestador MEI: em regra não há retenção de ${t === "CSRF" ? "PIS/COFINS/CSLL" : t}.`); });
      return;
    }
    if (regime === "sim") {
      if (tem("IRRF")) r.avisos.push("Prestador do Simples Nacional: em regra não há retenção de IR na fonte.");
      if (tem("CSRF")) r.avisos.push("Prestador do Simples Nacional: em regra não há retenção de PIS/COFINS/CSLL.");
      if (a && a.anexoIV && !tem("INSS")) {
        dica.push(`Atividade de ${a.nome} (anexo IV do Simples): se for cessão de mão de obra ou empreitada, há retenção de 11% de INSS (${this.money(base * 0.11)}). Confirme com o fiscal.`);
      }
      return;
    }
    if (!a || regime !== "nao") return;
    if (a.csrf && !tem("CSRF") && base * 0.0465 > 10) dica.push(`Atividade de ${a.nome}: costuma ter retenção de PIS/COFINS/CSLL de 4,65% (${this.money(base * 0.0465)}).`);
    if (a.irrf && !tem("IRRF") && base * a.irrf / 100 > 10) dica.push(`Atividade de ${a.nome}: costuma ter IR na fonte de ${this.pct(a.irrf)} (${this.money(base * a.irrf / 100)}).`);
    if (a.inss && !tem("INSS")) dica.push(`Atividade de ${a.nome}: com cessão de mão de obra ou empreitada, há retenção de 11% de INSS (${this.money(base * 0.11)}).`);
  },

  /* ---------- conferência na entrada da nota (pedido × nota × CNAE × endereço) ---------- */
  tagEl(raiz, ...nomes) {
    if (!raiz) return "";
    for (const nome of nomes) {
      const el = (raiz.getElementsByTagNameNS && raiz.getElementsByTagNameNS("*", nome)[0])
        || (raiz.getElementsByTagName && raiz.getElementsByTagName(nome)[0]);
      if (el && String(el.textContent).trim()) return String(el.textContent).trim();
    }
    return "";
  },

  grupoXml(doc, ...nomes) {
    for (const nome of nomes) {
      const el = doc.getElementsByTagNameNS("*", nome)[0];
      if (el) return el;
    }
    return null;
  },

  itensDoXml(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return [];
    const dets = Array.from(doc.getElementsByTagNameNS("*", "det"));
    if (dets.length) {
      return dets.map((det) => {
        const prod = det.getElementsByTagNameNS("*", "prod")[0] || det;
        return {
          descricao: this.tagEl(prod, "xProd", "xDescServ"),
          qtd: this.num(this.tagEl(prod, "qCom", "qTrib")),
          valor: this.num(this.tagEl(prod, "vProd", "vServ")),
          unidade: this.tagEl(prod, "uCom")
        };
      }).filter((i) => i.descricao || i.valor != null);
    }
    const desc = this.tagEl(doc, "xDescServ", "Discriminacao");
    const valor = this.num(this.tagEl(doc, "vServ", "ValorServicos", "vLiq"));
    if (desc || valor != null) return [{ descricao: desc || "Serviço da nota", qtd: 1, valor, unidade: "" }];
    return [];
  },

  enderecoNoXml(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return null;
    const toma = this.grupoXml(doc, "toma", "dest", "Tomador", "TomadorServico");
    const base = toma || doc;
    const end = (toma && (toma.getElementsByTagNameNS("*", "end")[0] || toma.getElementsByTagNameNS("*", "Endereco")[0])) || this.grupoXml(doc, "enderToma", "enderDest");
    const raiz = end || base;
    const cnpj = toma ? this.digits(this.tagEl(toma, "CNPJ", "Cnpj")) : "";
    const out = {
      cnpj: cnpj.length === 14 ? cnpj : "",
      logradouro: this.tagEl(raiz, "xLgr", "Logradouro", "xEnd"),
      numero: this.tagEl(raiz, "nro", "Numero"),
      bairro: this.tagEl(raiz, "xBairro", "Bairro"),
      municipio: this.tagEl(raiz, "xMun", "Municipio", "xMunTom"),
      uf: this.tagEl(raiz, "UF", "Uf"),
      cep: this.digits(this.tagEl(raiz, "CEP", "Cep"))
    };
    if (!out.logradouro && !out.cep && !out.municipio && !out.cnpj) return null;
    return out;
  },

  enderecoNoTexto(texto) {
    const t = String(texto || "");
    const i = t.search(/tomador do servi[cç]o|tomador do servico/i);
    if (i < 0) {
      const cep = (t.match(/\b(\d{5})-?(\d{3})\b/) || [])[0] || "";
      return cep ? { cnpj: "", logradouro: "", numero: "", bairro: "", municipio: "", uf: "", cep: this.digits(cep) } : null;
    }
    const trecho = t.slice(i, i + 1400);
    const corte = trecho.search(/servi[cç]o prestado|descri[cç][aã]o do servi|intermedi|discrimina[cç]/i);
    const bloco = corte > 40 ? trecho.slice(0, corte) : trecho.slice(0, 900);
    const cep = (bloco.match(/\b(\d{5})-?(\d{3})\b/) || [])[0] || "";
    const uf = (bloco.match(/\b(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)\b/) || [])[0] || "";
    const rua = bloco.match(/\b((?:RUA|AVENIDA|AV\.?|ALAMEDA|RODOVIA|PRA[CÇ]A|TRAVESSA|ESTRADA|ROD\.)\s+[A-Z0-9À-Ú .ºª'/-]{3,90})/i);
    const logr = rua ? rua[1].replace(/\s+/g, " ").trim() : "";
    const num = logr ? ((bloco.slice(bloco.indexOf(rua[1]) + rua[1].length, bloco.indexOf(rua[1]) + rua[1].length + 12).match(/\b(\d{1,6})\b/) || [])[1] || "") : "";
    if (!cep && !uf && !logr) return null;
    return { cnpj: "", logradouro: logr, numero: num, bairro: "", municipio: "", uf, cep: this.digits(cep) };
  },

  fmtEndereco(e) {
    if (!e) return "";
    const cep = this.digits(e.cep || "");
    const cepFmt = cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : String(e.cep || "");
    return [e.logradouro, e.numero, e.bairro, [e.municipio, e.uf].filter(Boolean).join("/"), cepFmt].filter(Boolean).join(", ");
  },

  tokens(s) {
    const stop = { de: 1, da: 1, do: 1, das: 1, dos: 1, para: 1, com: 1, em: 1, servico: 1, servicos: 1, prestacao: 1 };
    return this.fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !stop[t]);
  },

  parece(a, b) {
    const ta = this.tokens(a);
    const tb = this.tokens(b);
    if (!ta.length || !tb.length) return 0;
    const hit = ta.filter((t) => tb.some((u) => u === t || (t.length > 4 && (u.includes(t) || t.includes(u))))).length;
    return hit / Math.max(ta.length, tb.length);
  },

  /** Cruza os itens da nota com os do pedido e confere CNAE, retenção, alíquota e endereço do tomador. */
  async conferirEnvio(opts) {
    const o = opts || {};
    const r = { carregando: false, nivel: "info", erros: [], avisos: [], oks: [], infos: [], itens: [], prestador: "", atividade: "", endereco: "", enderecoNota: "", enderecoCartao: "", grupos: { emitente: [], tomador: [], servico: [], impostos: [], cnae: [], pedido: [] } };
    const add = (grupo, nivel, texto) => {
      const key = { erro: "erros", aviso: "avisos", ok: "oks", info: "infos" }[nivel];
      r[key].push(texto);
      if (r.grupos[grupo]) r.grupos[grupo].push({ nivel: nivel, texto: texto });
    };
    let xml = o.xml || "";
    let texto = o.texto || "";
    const buf = o.buf;
    if (!xml && buf) {
      const inicio = new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 80))).trim();
      if (/^\uFEFF?</.test(inicio) || /\.xml$/i.test(o.nome || "")) xml = new TextDecoder("utf-8").decode(buf);
    }
    let campos = xml ? this.lerXml(xml) : null;
    if (!campos && buf && /^%PDF/.test(new TextDecoder("latin1").decode(new Uint8Array(buf.slice(0, 8))))) {
      try {
        const itensPdf = await this.itensDoPdf(buf);
        texto = texto || itensPdf.map((i) => i.s).join("\n");
        campos = this.lerPdfItens(itensPdf);
      } catch (e) {}
    }
    const nota = Object.assign({}, o.nota || {}, campos || {});
    r.valorServico = nota.valorServico != null ? nota.valorServico : null;
    r.liquido = nota.liquido != null ? nota.liquido : null;
    r.totalRetencoes = nota.totalRetencoes != null ? nota.totalRetencoes : null;
    const servico = /infNFSe|<DPS|CompNfse|nfs-?e/i.test(xml) || this.ehServico("", texto) || (!/<infNFe[\s>]/i.test(xml) && !!(nota.codigo || nota.descricao || nota.aliquotaIss));
    const mercadoria = /<infNFe[\s>]/i.test(xml);

    const credorDoc = this.digits(o.credorDoc);
    if (o.cadastro) r.cadastro = true;
    const prestDoc = this.digits(nota.cnpjPrestador || (Array.isArray(nota.cnpjs) ? nota.cnpjs[0] : ""));
    if (credorDoc.length >= 11 && prestDoc.length >= 11 && prestDoc !== credorDoc) {
      add("emitente", "erro", `O prestador da nota é ${this.docFmt(prestDoc)}, e o credor do pedido é ${this.docFmt(credorDoc)}${o.credorNome ? " (" + o.credorNome + ")" : ""}.`);
    } else if (credorDoc.length >= 11 && prestDoc.length >= 11) {
      add("emitente", "ok", `CNPJ do prestador confere com o credor do pedido (${this.docFmt(credorDoc)}${o.credorNome ? ", " + o.credorNome : ""}).`);
    } else if (o.cadastro && credorDoc.length >= 11 && !prestDoc) {
      add("emitente", "aviso", "Não li o CNPJ do prestador na nota. Confira o cadastro do credor ao lado do arquivo.");
    }
    if (servico && !mercadoria && credorDoc.length === 14) {
      let empresa = null;
      try { empresa = await this.receita(credorDoc); } catch (e) {
        add("cnae", "aviso", `Não consegui consultar o CNAE do credor na Receita (${(e && e.message) || e}).`);
      }
      if (empresa) {
        r.prestador = `${empresa.razao || ""} · ${this.cnaeFmt(empresa.cnae)} ${empresa.cnaeDesc || ""}`.trim();
        const falso = { impostos: [], avisos: [], erros: [], infos: [], bruto: Number(nota.valorServico != null ? nota.valorServico : nota.valor) || 0, regime: null, atividade: "" };
        this.avaliarAtividade(falso, { empresa }, nota.descricao || nota.codigo ? nota : null);
        r.atividade = falso.atividade || "";
        if (o.cadastro) {
          falso.avisos = falso.avisos.filter((t) => /CNAE|atividade|situa/i.test(t));
          falso.infos = falso.infos.filter((t) => /CNAE|atividade|regime/i.test(t));
        }
        const grupoMsg = (t) => /CNAE|atividade da nota/i.test(t) ? "cnae" : "impostos";
        falso.avisos.forEach((t) => add(grupoMsg(t), "aviso", t));
        falso.infos.forEach((t) => add(grupoMsg(t), "info", t));
        if (r.atividade && !falso.atividadeConflito) add("cnae", "ok", `Atividade da nota (${r.atividade}${falso.servicoLc ? `, item ${falso.servicoLc}` : ""}) cabe no CNAE do credor.`);
        else if (!r.atividade && empresa.cnae) add("cnae", "ok", `CNAE ${this.cnaeFmt(empresa.cnae)} (${empresa.cnaeDesc || "sem descrição"}).`);
      }
      if (!o.cadastro && nota.aliquotaIss != null && nota.aliquotaIss > 0 && (nota.aliquotaIss < 2 - 0.001 || nota.aliquotaIss > 5 + 0.001)) {
        add("impostos", "aviso", `Alíquota de ISS ${this.pct(nota.aliquotaIss)} fora do intervalo legal de 2% a 5%.`);
      } else if (!o.cadastro && nota.aliquotaIss != null && nota.aliquotaIss > 0) {
        add("impostos", "ok", `Alíquota de ISS ${this.pct(nota.aliquotaIss)} dentro de 2% a 5%.`);
      }
      if (!o.cadastro && nota.baseIss && nota.aliquotaIss && nota.valorIss != null && Math.abs(nota.baseIss * nota.aliquotaIss / 100 - nota.valorIss) > this.TOL && !this.issZeradoNoSimples(nota)) {
        add("impostos", "aviso", `ISS da nota não fecha: base ${this.money(nota.baseIss)} × ${this.pct(nota.aliquotaIss)} = ${this.money(nota.baseIss * nota.aliquotaIss / 100)}, e a nota mostra ${this.money(nota.valorIss)}.`);
      } else if (!o.cadastro && this.issZeradoNoSimples(nota) && nota.aliquotaIss > 0) {
        add("impostos", "info", `Optante pelo Simples: a nota mostra ${this.pct(nota.aliquotaIss)} e o ISS apurado zerado. O recolhimento é pelo DAS, não nesta NFS-e.`);
      }
      if (!o.cadastro) {
        const pcc = (nota.csrf || 0) > 0 ? nota.csrf : (nota.pis || 0) + (nota.cofins || 0) + (nota.csll || 0);
        const ret = nota.totalRetencoes != null ? nota.totalRetencoes : Math.round((((nota.issRetido ? nota.valorIss : 0) || 0) + (nota.irrf || 0) + (nota.inss || 0) + pcc) * 100) / 100;
        if (ret > this.TOL) add("impostos", "ok", `Retenções lidas na nota: ${this.money(ret)}.`);
        if (nota.valorServico != null && nota.liquido != null && ret != null && Math.abs(nota.valorServico - ret - nota.liquido) > this.TOL) {
          add("impostos", "aviso", `Serviço ${this.money(nota.valorServico)} − retenções ${this.money(ret)} não fecha com o líquido ${this.money(nota.liquido)}.`);
        }
      }
    } else if (mercadoria && !o.cadastro) {
      add("servico", "info", "Nota de mercadoria: a retenção de serviço e o CNAE do prestador não se aplicam. A conciliação é item a item com o pedido.");
    }
    if (nota.descricao) add("servico", "info", `Descrição: ${String(nota.descricao).replace(/\s+/g, " ").trim().slice(0, 220)}`);
    if (nota.valorServico != null || nota.valor != null) add("servico", "info", `Valor: ${this.money(nota.valorServico != null ? nota.valorServico : nota.valor)}`);

    const empresaCnpj = this.digits(o.empresaCnpj);
    let endNota = xml ? this.enderecoNoXml(xml) : null;
    if (!endNota) endNota = this.enderecoNoTexto(texto);
    const cnpjTomador = (endNota && endNota.cnpj) || this.digits(nota.cnpjTomador);
    if (empresaCnpj.length === 14 && cnpjTomador.length === 14 && cnpjTomador !== empresaCnpj) {
      add("tomador", "erro", `A nota está no CNPJ ${this.docFmt(cnpjTomador)}, mas a empresa do pedido é ${this.docFmt(empresaCnpj)}${o.empresaNome ? " (" + o.empresaNome + ")" : ""}.`);
    } else if (empresaCnpj.length === 14 && cnpjTomador.length === 14) {
      add("tomador", "ok", `Tomador da nota é o CNPJ da empresa do pedido (${this.docFmt(empresaCnpj)}).`);
    }
    if (empresaCnpj.length === 14 && endNota && (endNota.cep || endNota.municipio || endNota.logradouro)) {
      let oficial = null;
      try { oficial = await this.receita(empresaCnpj); } catch (e) {
        add("tomador", "info", "Não consegui conferir o endereço da empresa na Receita.");
      }
      if (oficial) {
        const cepNota = this.digits(endNota.cep);
        const cepOf = this.digits(oficial.cep);
        if (cepNota.length === 8 && cepOf.length === 8 && cepNota !== cepOf) {
          add("tomador", "aviso", `CEP do tomador na nota (${cepNota}) é diferente do CEP do CNPJ da empresa (${cepOf}). Fornecedores costumam errar este endereço.`);
        } else if (cepNota && cepNota === cepOf) add("tomador", "ok", `CEP do tomador confere com o CNPJ da empresa (${cepOf}).`);
        if (endNota.municipio && oficial.municipio && this.fold(endNota.municipio) !== this.fold(oficial.municipio)) {
          add("tomador", "aviso", `Município na nota (${endNota.municipio}) diferente do cadastro do CNPJ (${oficial.municipio}/${oficial.uf || ""}).`);
        }
        if (endNota.uf && oficial.uf && this.fold(endNota.uf) !== this.fold(oficial.uf)) {
          add("tomador", "aviso", `UF na nota (${endNota.uf}) diferente da UF do CNPJ (${oficial.uf}).`);
        }
        if (endNota.logradouro && oficial.logradouro && this.parece(endNota.logradouro, oficial.logradouro) < 0.34) {
          add("tomador", "aviso", `Logradouro na nota (${endNota.logradouro}) não parece o do CNPJ (${oficial.logradouro}${oficial.numero ? ", " + oficial.numero : ""}).`);
        } else if (endNota.logradouro && oficial.logradouro) {
          add("tomador", "ok", "Logradouro do tomador confere com o cadastro do CNPJ.");
        }
        r.enderecoCartao = this.fmtEndereco(oficial);
        r.endereco = r.enderecoCartao;
      }
    }
    r.enderecoNota = this.fmtEndereco(endNota);

    const pedido = (o.itensPedido || []).filter((it) => it && (it.descricao || it.valor));
    if (o.cadastro) {
      const soma = pedido.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
      const vNota = nota.valorServico != null ? nota.valorServico : nota.valor;
      if (vNota != null && soma > 0 && Math.abs(vNota - soma) > Math.max(0.05, soma * 0.01)) {
        add("pedido", "aviso", `Valor da nota (${this.money(vNota)}) diferente do total do pedido (${this.money(soma)}).`);
      } else if (vNota != null && soma > 0) {
        add("pedido", "ok", `Valor da nota confere com o pedido (${this.money(vNota)}).`);
      }
      if (nota.numero) add("servico", "ok", `Número da nota: ${nota.numero}.`);
      if (nota.emissao) add("servico", "info", `Emissão: ${nota.emissao}.`);
      if (nota.serie) add("servico", "info", `Série: ${nota.serie}.`);
    }
    let itensNota = o.cadastro ? [] : (xml ? this.itensDoXml(xml) : []);
    if (!o.cadastro && !itensNota.length && (nota.descricao || nota.valorServico != null || nota.valor != null)) {
      itensNota = [{ descricao: nota.descricao || "Serviço da nota", qtd: 1, valor: nota.valorServico != null ? nota.valorServico : nota.valor, unidade: "" }];
    }
    const usados = new Set();
    itensNota.forEach((n) => {
      let melhor = -1;
      let score = 0;
      pedido.forEach((p, i) => {
        if (usados.has(i)) return;
        const s = this.parece(n.descricao, p.descricao);
        const porValor = n.valor != null && p.valor != null && Math.abs(n.valor - p.valor) <= Math.max(this.TOL, Math.abs(p.valor) * 0.01);
        const s2 = s + (porValor ? 0.35 : 0);
        if (s2 > score) { score = s2; melhor = i; }
      });
      const p = melhor >= 0 && score >= 0.34 ? pedido[melhor] : null;
      if (p) usados.add(melhor);
      const linha = { nota: n.descricao || "Item da nota", pedido: p ? p.descricao : "", ok: !!p, detalhe: "" };
      if (!p) {
        linha.ok = false;
        linha.detalhe = "Sem item correspondente no pedido.";
        add("pedido", "aviso", `Item da nota "${(n.descricao || "").slice(0, 80)}" não encontrou correspondente no pedido. Na reforma tributária a base de IBS/CBS é por item: nota e pedido precisam conciliar.`);
      } else {
        const partes = [];
        if (n.qtd != null && p.qtd && Math.abs(n.qtd - p.qtd) > 0.001) {
          linha.ok = false;
          partes.push(`quantidade ${n.qtd} na nota e ${p.qtd} no pedido`);
        }
        if (n.valor != null && p.valor != null && Math.abs(n.valor - p.valor) > Math.max(0.05, Math.abs(p.valor) * 0.01)) {
          linha.ok = false;
          partes.push(`valor ${this.money(n.valor)} na nota e ${this.money(p.valor)} no pedido`);
        }
        linha.detalhe = partes.length ? partes.join("; ") : "Concilia com o pedido.";
        if (partes.length) add("pedido", "aviso", `Item "${(n.descricao || p.descricao).slice(0, 80)}": ${partes.join("; ")}. A base do item precisa fechar com o pedido por causa da reforma tributária.`);
      }
      r.itens.push(linha);
    });
    if (!o.cadastro && itensNota.length && r.itens.every((l) => l.ok)) add("pedido", "ok", `${r.itens.length} item(ns) da nota conciliado(s) com o pedido.`);
    else if (!o.cadastro && !itensNota.length) add("pedido", "info", "Não li itens discriminados na nota para cruzar com o pedido.");
    if (!o.cadastro) pedido.forEach((p, i) => {
      if (!usados.has(i)) add("pedido", "info", `Item do pedido sem correspondente nesta nota: ${(p.descricao || "item").slice(0, 80)}.`);
    });

    if (r.erros.length) r.nivel = "erro";
    else if (r.avisos.length) r.nivel = "aviso";
    else if (r.oks.length) r.nivel = "ok";
    return r;
  },

  painelEnvio(r) {
    if (!r) return "";
    if (r.carregando) return `<p class="inf-muted">${r.cadastro ? "Conferindo o cadastro da nota, do pedido, do tomador e do prestador…" : "Analisando itens, CNAE, retenções, alíquotas e endereço do tomador…"}</p>`;
    return this.blocosHtml(r, {});
  },

  blocosHtml(r, extra) {
    const x = extra || {};
    const grupos = (r && r.grupos) || {};
    const linha = (it) => {
      const cls = { erro: "is-erro", aviso: "is-aviso", ok: "is-ok", info: "is-info" }[it.nivel] || "is-info";
      const ic = { erro: "✗", aviso: "!", ok: "✓", info: "·" }[it.nivel] || "·";
      return `<li class="${cls}"><span>${ic}</span>${this.esc(it.texto)}</li>`;
    };
    const bloco = (titulo, itens, miolo) => `<section class="env-bloco"><h4>${titulo}</h4>${miolo || ""}${itens && itens.length ? `<ul class="inf-check">${itens.map(linha).join("")}</ul>` : (miolo ? "" : `<p class="inf-muted">Sem apontamentos.</p>`)}</section>`;
    const endNota = (r && r.enderecoNota) || "";
    const endCartao = (r && (r.enderecoCartao || r.endereco)) || "";
    const tomadorEnd = `<p class="inf-muted"><b>Endereço no cartão CNPJ da empresa tomadora:</b> ${this.esc(endCartao || "não consultado")}</p>
      <p class="inf-muted"><b>Endereço na nota fiscal da empresa tomadora:</b> ${this.esc(endNota || "não lido na nota")}</p>`;
    const itens = (r && r.itens || []).map((it) => `<tr><td>${this.esc((it.nota || "").slice(0, 90))}</td><td>${this.esc((it.pedido || "—").slice(0, 90))}</td><td>${it.ok ? "✓" : "!"} ${this.esc(it.detalhe || "")}</td></tr>`).join("");
    const tabela = itens ? `<table class="nfchk-tab"><thead><tr><th>Item da nota</th><th>Item do pedido</th><th>Conciliação</th></tr></thead><tbody>${itens}</tbody></table>` : "";
    const emitenteExtra = `${r && r.prestador ? `<p class="inf-muted"><b>Credor:</b> ${this.esc(r.prestador)}</p>` : ""}${x.emitente || ""}`;
    return `<div class="env-blocos">
      ${bloco("Dados do emitente", grupos.emitente, emitenteExtra)}
      ${bloco("Dados do tomador", grupos.tomador, tomadorEnd)}
      ${bloco("Dados do serviço", grupos.servico, x.servico || "")}
      ${r && r.cadastro ? "" : bloco("Validação de impostos", grupos.impostos, "")}
      ${bloco("Validação de CNAE", grupos.cnae, "")}
      ${bloco("Validação do pedido", [].concat(grupos.pedido || [], x.pedido || []), tabela)}
    </div>`;
  },

  /* ---------- telas ---------- */
  seloHtml(r) {
    if (!r) return "";
    const cls = { ok: "bchk-ok", erro: "bchk-erro", aviso: "bchk-aviso" }[r.nivel] || "bchk-info";
    const txt = r.nivel === "ok" ? "Conferido ✓" : (r.nivel === "erro" ? "Erro" : (r.nivel === "aviso" ? "Atenção" : "Nota não lida"));
    const dica = [].concat(r.erros, r.avisos, r.infos).join("\n") || r.resumo;
    return `<span class="bchk ${cls}" title="${this.esc(dica)}">${this.esc(txt)}</span>`;
  },

  html(r) {
    if (!r) return `<p style="color:#64748b;margin:0;">Conferindo impostos retidos, nota fiscal e CNAE do prestador…</p>`;
    const n = r.nota && !r.nota.semAnexo && !r.nota.ilegivel ? r.nota : null;
    const e = r.empresa;
    const lista = (itens, cor, ic) => itens.map((t) => `<p style="margin:4px 0 0;color:${cor};">${ic} ${this.esc(t)}</p>`).join("");
    const nomes = { ISS: "ISS", IRRF: "IR na fonte", INSS: "INSS", CSRF: "PIS/COFINS/CSLL", Outros: "Outros" };
    const cel = (l, campo) => {
      const v = (l.sienge && l.sienge[campo]) || (l.nota && l.nota[campo]) || null;
      return v ? (campo === "aliquota" ? this.pct(v) : this.money(v)) : "—";
    };
    const rotulo = (l) => {
      if (l.destacado) return `${this.esc(nomes[l.tipo])} <span style="color:#64748b;font-weight:400;">(destacado, não retido)</span>`;
      if (l.detalhe) return `${this.esc(l.tipo)} <span style="color:#64748b;font-weight:400;">(${this.esc(l.detalhe)})</span>`;
      return this.esc(nomes[l.tipo] || l.tipo);
    };
    const marca = (l) => {
      if (!n) return "";
      if (l.ok == null) return `<span style="color:#64748b;" title="Conferido pelo total">=</span>`;
      return `<span style="color:${l.ok ? "#105436" : "#c2410c"};">${l.ok ? "✓" : "!"}</span>`;
    };
    const tabela = r.linhas.length ? `<table class="nfchk-tab"><thead><tr><th>Imposto</th><th>Base</th><th>Alíquota</th><th>No Sienge</th><th>Na nota</th><th></th></tr></thead><tbody>
      ${r.linhas.map((l) => `<tr${l.destacado ? ' style="color:#64748b;"' : ""}><td>${rotulo(l)}</td><td>${cel(l, "base")}</td><td>${cel(l, "aliquota")}</td>
        <td>${l.sienge ? this.money(l.sienge.valor) : "—"}</td><td>${n ? (l.nota ? this.money(l.nota.valor) : "—") : "não lida"}</td>
        <td style="font-weight:800;">${marca(l)}</td></tr>`).join("")}
      </tbody></table>` : "";
    const nenhum = !r.impostos.length ? `<p><strong>Nenhum imposto retido lançado neste título no Sienge.</strong></p>` : "";
    const totais = r.bruto ? `<p><strong>Valor do título:</strong> ${this.money(r.bruto)} · <strong>Impostos retidos no Sienge:</strong> ${this.money(r.retido)} · <strong>Valor líquido a pagar:</strong> ${this.money(r.liquido)}</p>` : "";
    const nota = n ? `<p><strong>Nota${n.numero ? " " + this.esc(n.numero) : ""}</strong> (anexo ${this.esc(n.anexo || "")}):
        ${n.valorServico != null ? `serviço ${this.money(n.valorServico)}` : ""}${n.issRetido != null ? ` · ISS ${n.issRetido ? "retido pelo tomador" : "não retido"}` : ""}${n.aliquotaIss ? ` (${this.pct(n.aliquotaIss)} sobre ${this.money(n.baseIss)})` : ""}${r.retidoNota != null ? ` · retenções ${this.money(r.retidoNota)}` : ""}${n.liquido != null ? ` · líquido ${this.money(n.liquido)}` : ""}</p>
      ${n.codigo || n.descricao ? `<p><strong>Serviço:</strong> ${this.esc([n.codigo, n.descricao].filter(Boolean).join(" · ").slice(0, 220))}${r.servicoLc ? ` · <strong>Item LC 116:</strong> ${this.esc(r.servicoLc)}` : ""}</p>` : ""}` : "";
    const regimeTxt = { sim: "Simples Nacional", mei: "MEI", nao: "fora do Simples (Lucro Presumido ou Real)" }[r.regime] || "não identificado";
    const prest = e ? `<p><strong>Prestador:</strong> ${this.esc(e.razao || "")} · ${this.esc(this.docFmt(r.cnpj))}${e.cidade ? " · " + this.esc(e.cidade) : ""} · <strong>Regime:</strong> ${this.esc(regimeTxt)}</p>
      <p><strong>CNAE principal:</strong> ${this.esc(this.cnaeFmt(e.cnae))} ${this.esc(e.cnaeDesc)}${r.atividade ? ` · <strong>Atividade para retenção:</strong> ${this.esc(r.atividade)}` : ""}</p>
      ${e.secundarios.length ? `<details class="nfchk-sec"><summary>${e.secundarios.length} CNAE(s) secundário(s)</summary>${e.secundarios.map((c) => `<div>${this.esc(this.cnaeFmt(c.codigo))} ${this.esc(c.descricao)}</div>`).join("")}</details>` : ""}`
      : (r.credorDoc && r.credorDoc.length === 11 ? `<p><strong>Prestador:</strong> pessoa física (${this.esc(this.docFmt(r.credorDoc))})</p>` : "");
    const cab = r.nivel === "ok" ? `<p style="margin:6px 0 0;color:#105436;font-weight:700;">✓ ${this.esc(r.resumo)}.</p>` : "";
    return `${nenhum}${totais}${tabela}${nota}${prest}${cab}
      ${lista(r.erros, "#b91c1c", "✗")}
      ${lista(r.avisos, "#c2410c", "!")}
      ${lista(r.infos, "#0f766e", "ℹ")}`;
  }
};
