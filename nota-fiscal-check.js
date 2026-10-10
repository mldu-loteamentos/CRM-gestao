/* Conferência fiscal do título a pagar: impostos retidos lançados no Sienge × nota fiscal anexada × atividade (CNAE) do prestador.
   Impostos: GET /bills/{id}/taxes. Nota: anexo PDF (DANFSe e layouts municipais com texto) ou XML, lido no navegador.
   CNAE e Simples Nacional: cadastro público do CNPJ (BrasilAPI). As regras de retenção por atividade só geram "atenção". */
window.NotaFiscalCheck = {
  CACHE_KEY: "crm_nf_check_v1",
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
    { id: "limpeza", nome: "limpeza, conservação e saneamento", cnae: /^(812|8130|3701|3702|3811|3812|3821|3822|3900)/, desc: /limpeza|conserva[cç][aã]o|desentup|hidrojat|dedetiz|desratiz|jardinag|ro[cç]ada|zeladori|varri[cç]|coleta de (lixo|res[ií]duo)/, inss: true, irrf: 1, csrf: true, anexoIV: true },
    { id: "vigilancia", nome: "vigilância e segurança", cnae: /^801/, desc: /vigil[aâ]ncia|seguran[cç]a patrimonial|portaria|monitoramento/, inss: true, irrf: 1, csrf: true, anexoIV: true },
    { id: "maodeobra", nome: "locação de mão de obra", cnae: /^78/, desc: /m[aã]o de obra|terceiriza/, inss: true, irrf: 1, csrf: true, anexoIV: false },
    { id: "profissional", nome: "serviço profissional (RIR, art. 714)", cnae: /^(62|69|702|711|712|7319|741|742|749|862|863|864)/, desc: /consultori|engenhari|arquitet|advoc|jur[ií]dic|contab|auditori|projeto|topograf|avalia[cç][aã]o|per[ií]cia|assessori/, inss: false, irrf: 1.5, csrf: true, anexoIV: false },
    { id: "manutencao", nome: "manutenção e reparação", cnae: /^(33|952)/, desc: /manuten[cç][aã]o|repara[cç][aã]o|conserto/, inss: false, irrf: 0, csrf: true, anexoIV: false }
  ],

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

  ehServico(docId, docNome) {
    return /^(nfs|nfse|nfts|nfsa|rpa|nfps)/i.test(String(docId || "").trim()) || /servi[cç]o/i.test(String(docNome || ""));
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
    const res = await window.siengeFetchWithRetry(`/bills/${encodeURIComponent(billId)}/taxes?limit=100`, 1);
    const lista = Array.isArray(res) ? res : ((res && (res.results || res.data)) || []);
    const pick = (o, ks) => { for (const k of ks) if (o[k] != null && o[k] !== "") return o[k]; return null; };
    return lista.filter((t) => t && typeof t === "object").map((t) => {
      const nome = String(pick(t, ["taxName", "name", "description", "taxDescription", "taxAcronym", "acronym", "taxTypeName"]) || "").trim();
      let tipo = this.tipo(nome);
      if (!tipo && pick(t, ["ibgeCityId", "cityId", "ibgeCode"])) tipo = "ISS";
      const id = pick(t, ["taxId", "id", "taxTypeId"]);
      return {
        id: id != null ? String(id) : "",
        nome: nome || (id != null ? `Imposto ${id}` : "Imposto"),
        tipo,
        base: this.num(pick(t, ["taxableBaseAmount", "taxBase", "baseAmount", "calculationBase", "taxableBase", "baseValue"])),
        aliquota: this.num(pick(t, ["rate", "taxRate", "aliquot", "aliquota", "percentage"])),
        valor: this.num(pick(t, ["amount", "value", "taxAmount", "retainedAmount", "taxValue", "retainedValue"])) || 0
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
    if (cache[cnpj] && Date.now() - cache[cnpj].em < this.CNPJ_TTL) return Promise.resolve(cache[cnpj].d);
    if (this._cnpjVoo[cnpj]) return this._cnpjVoo[cnpj];
    this._cnpjVoo[cnpj] = (async () => {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) throw new Error(res.status === 404 ? "CNPJ não encontrado no cadastro da Receita" : `consulta do CNPJ falhou (${res.status})`);
      const j = await res.json();
      const d = {
        razao: j.razao_social || "",
        cnae: j.cnae_fiscal != null ? String(j.cnae_fiscal) : "",
        cnaeDesc: j.cnae_fiscal_descricao || "",
        secundarios: (Array.isArray(j.cnaes_secundarios) ? j.cnaes_secundarios : [])
          .filter((c) => c && Number(c.codigo)).map((c) => ({ codigo: String(c.codigo), descricao: c.descricao || "" })),
        simples: j.opcao_pelo_simples === true ? true : (j.opcao_pelo_simples === false ? false : null),
        mei: j.opcao_pelo_mei === true,
        situacao: j.descricao_situacao_cadastral || "",
        cidade: [j.municipio, j.uf].filter(Boolean).join("/")
      };
      const c = this.lerCache(this.CNPJ_KEY);
      c[cnpj] = { em: Date.now(), d };
      this.gravarCache(this.CNPJ_KEY, c, 400);
      return d;
    })().finally(() => { delete this._cnpjVoo[cnpj]; });
    return this._cnpjVoo[cnpj];
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
      const m = texto.match(new RegExp(`(?:${src})\\s*[:\\-–]?\\s*((?:R\\$\\s*)?-?\\d[\\d.,]*\\s*%?|retido[^\\n]{0,30}|n[aã]o retido|sim|n[aã]o)`, "i"));
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
      return v == null ? null : (this.num(v) == null ? 0 : this.num(v));
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
      codigo: campo([/^c[oó]digo de tributa[cç][aã]o nacional$/i, /^item da lista/i, /^c[oó]digo do servi[cç]o$/i], true),
      descricao: campo([/^descri[cç][aã]o do servi[cç]o$/i, /^discrimina[cç][aã]o do(s)? servi[cç]o(s)?$/i], true),
      numero: campo([/^n[uú]mero da nfs-?e$/i, /^n[uú]mero da nota$/i], true)
    };
    n.issRetido = retIss == null ? null : (/n[aã]o/i.test(retIss) ? false : /retid|sim|tomador|intermedi/i.test(retIss));
    n.simplesTexto = simples || "";
    n.simples = this.lerSimples(simples);
    n.cnpjs = [...new Set((texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || []).map((c) => this.digits(c)))];
    return n;
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

  atividadeDe(texto, cnaes) {
    const f = this.fold(texto);
    const pelaNota = f ? this.ATIVIDADES.find((a) => a.desc.test(f)) : null;
    const pelosCnaes = (cnaes || []).map((c) => this.ATIVIDADES.find((a) => a.cnae.test(this.digits(c)))).filter(Boolean);
    return { pelaNota, pelosCnaes, atividade: pelaNota || pelosCnaes[0] || null };
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
        r.erros.push(`${x.nome} no Sienge: base ${this.money(x.base)} × ${this.pct(x.aliquota)} = ${this.money(x.base * x.aliquota / 100)}, mas o valor lançado é ${this.money(x.valor)}.`);
      }
    });

    const n = d.nota && !d.nota.semAnexo && !d.nota.ilegivel ? d.nota : null;
    if (d.nota && d.nota.semAnexo) r.infos.push("O título não tem nota fiscal anexada para conferir a retenção.");
    else if (d.nota && d.nota.ilegivel) r.infos.push(`Não consegui ler o texto da nota "${d.nota.anexo || "anexo"}" (pode ser imagem escaneada): confira a retenção na nota.`);

    if (n) {
      const issNota = n.issRetido ? (n.valorIss || 0) : 0;
      const pcc = n.csrf != null && n.csrf > 0 ? n.csrf : (n.pis || 0) + (n.cofins || 0) + (n.csll || 0);
      const somaNota = Math.round((issNota + (n.irrf || 0) + (n.inss || 0) + pcc) * 100) / 100;
      const retNota = n.totalRetencoes != null ? n.totalRetencoes : somaNota;
      r.retidoNota = retNota;

      if (n.baseIss && n.aliquotaIss && n.valorIss != null && Math.abs(n.baseIss * n.aliquotaIss / 100 - n.valorIss) > T) {
        r.erros.push(`Na nota, o ISS não fecha: base ${this.money(n.baseIss)} × ${this.pct(n.aliquotaIss)} = ${this.money(n.baseIss * n.aliquotaIss / 100)}, mas a nota mostra ${this.money(n.valorIss)}.`);
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
      ["ISS", "IRRF", "INSS", "CSRF"].forEach((t) => {
        const s = doSienge[t];
        const nt = naNota[t];
        if (!s && !nt) return;
        const linha = { tipo: t, sienge: s ? { base: s.base, aliquota: s.n === 1 || t === "CSRF" ? s.aliquota : null, valor: s.valor } : null, nota: nt, ok: true };
        if (s && nt) {
          if (this.difere(s.valor, nt.valor)) { linha.ok = false; r.erros.push(`${t}: lançado ${this.money(s.valor)} no Sienge, a nota retém ${this.money(nt.valor)}.`); }
          if (t === "ISS" && this.difere(s.base, nt.base)) { linha.ok = false; r.erros.push(`ISS: base ${this.money(s.base)} no Sienge, a nota usa ${this.money(nt.base)}.`); }
          if (t === "ISS" && s.n === 1 && nt.aliquota != null && s.aliquota && Math.abs(s.aliquota - nt.aliquota) > 0.005) {
            linha.ok = false;
            r.erros.push(`ISS: alíquota ${this.pct(s.aliquota)} no Sienge, a nota usa ${this.pct(nt.aliquota)}.`);
          }
        } else if (nt && d.impostos && r.retido > T) {
          linha.ok = false;
          r.erros.push(`A nota retém ${t} (${this.money(nt.valor)}), mas esse imposto não está lançado no título.`);
        } else if (s && !nt && retNota > T) {
          linha.ok = false;
          r.erros.push(`${t} de ${this.money(s.valor)} lançado no Sienge, mas a nota não retém esse imposto.`);
        }
        r.linhas.push(linha);
      });
      if (doSienge["?"]) r.linhas.push({ tipo: "Outros", sienge: { valor: doSienge["?"].valor, base: null, aliquota: null }, nota: null, ok: true });

      if (n.valorServico != null && r.bruto && this.difere(n.valorServico, r.bruto)) {
        r.avisos.push(`Valor do serviço na nota (${this.money(n.valorServico)}) diferente do valor do título (${this.money(r.bruto)}).`);
      }
      if (n.liquido != null && r.liquido != null && this.difere(n.liquido, r.liquido) && !this.difere(n.valorServico, r.bruto)) {
        r.erros.push(`Valor líquido da nota ${this.money(n.liquido)} diferente do líquido do título (${this.money(r.bruto)} − ${this.money(r.retido)} = ${this.money(r.liquido)}).`);
      }
      if (d.credorDoc && d.credorDoc.length === 14 && n.cnpjs && n.cnpjs.length && !n.cnpjs.includes(d.credorDoc)) {
        r.erros.push(`A nota anexada não traz o CNPJ do credor (${this.docFmt(d.credorDoc)}): pode ser nota de outro fornecedor.`);
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
    const cnaes = e ? [e.cnae].concat(e.secundarios.map((c) => c.codigo)).filter(Boolean) : [];
    const textoNota = n ? `${n.descricao || ""} ${n.codigo || ""}` : "";
    const at = this.atividadeDe(textoNota, cnaes);
    r.atividade = at.atividade ? at.atividade.nome : "";
    if (e && e.situacao && !/ativa/i.test(e.situacao)) r.avisos.push(`CNPJ do prestador com situação "${e.situacao}" na Receita.`);
    if (at.pelaNota && cnaes.length && !at.pelosCnaes.includes(at.pelaNota)) {
      r.avisos.push(`O serviço da nota parece ser de ${at.pelaNota.nome}, mas nenhum CNAE do prestador é dessa atividade. Confira se ele pode emitir esse serviço.`);
    }
    const regime = (n && n.simples) || (e ? (e.mei ? "mei" : (e.simples === true ? "sim" : (e.simples === false ? "nao" : null))) : null);
    r.regime = regime;
    if (n && n.simples && e && ((n.simples === "nao") !== (e.simples === false && !e.mei))) {
      r.infos.push(`Regime na nota (${n.simplesTexto}) diferente do cadastro público do CNPJ (${e.mei ? "MEI" : (e.simples ? "Simples Nacional" : "fora do Simples")}). Vale o que está na nota.`);
    }
    const a = at.atividade;
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
        r.avisos.push(`Atividade de ${a.nome} (anexo IV do Simples): se for cessão de mão de obra ou empreitada, há retenção de 11% de INSS (${this.money(base * 0.11)}). Confirme com o fiscal.`);
      }
      return;
    }
    if (!a || regime !== "nao") return;
    if (a.csrf && !tem("CSRF") && base * 0.0465 > 10) r.avisos.push(`Atividade de ${a.nome}: costuma ter retenção de PIS/COFINS/CSLL de 4,65% (${this.money(base * 0.0465)}).`);
    if (a.irrf && !tem("IRRF") && base * a.irrf / 100 > 10) r.avisos.push(`Atividade de ${a.nome}: costuma ter IR na fonte de ${this.pct(a.irrf)} (${this.money(base * a.irrf / 100)}).`);
    if (a.inss && !tem("INSS")) r.avisos.push(`Atividade de ${a.nome}: com cessão de mão de obra ou empreitada, há retenção de 11% de INSS (${this.money(base * 0.11)}).`);
  },

  /* ---------- telas ---------- */
  seloHtml(r) {
    if (!r) return "";
    const cls = { ok: "bchk-ok", erro: "bchk-erro", aviso: "bchk-aviso" }[r.nivel] || "bchk-info";
    const txt = r.nivel === "ok" ? "Impostos ✓" : (r.nivel === "erro" ? "Impostos: erro" : (r.nivel === "aviso" ? "Impostos: atenção" : (r.retido > this.TOL ? "Retido " + this.money(r.retido) : "Impostos ?")));
    const dica = [].concat(r.erros, r.avisos, r.infos).join("\n") || r.resumo;
    return ` <span class="bchk ${cls}" title="${this.esc(dica)}">${this.esc(txt)}</span>`;
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
    const tabela = r.linhas.length ? `<table class="nfchk-tab"><thead><tr><th>Imposto retido</th><th>Base</th><th>Alíquota</th><th>No Sienge</th><th>Na nota</th><th></th></tr></thead><tbody>
      ${r.linhas.map((l) => `<tr><td>${this.esc(nomes[l.tipo] || l.tipo)}</td><td>${cel(l, "base")}</td><td>${cel(l, "aliquota")}</td>
        <td>${l.sienge ? this.money(l.sienge.valor) : "—"}</td><td>${n ? (l.nota ? this.money(l.nota.valor) : "—") : "não lida"}</td>
        <td style="color:${l.ok ? "#105436" : "#b91c1c"};font-weight:800;">${n ? (l.ok ? "✓" : "✗") : ""}</td></tr>`).join("")}
      </tbody></table>` : "";
    const totais = r.bruto ? `<p><strong>Valor do título:</strong> ${this.money(r.bruto)} · <strong>Impostos retidos no Sienge:</strong> ${this.money(r.retido)} · <strong>Valor líquido a pagar:</strong> ${this.money(r.liquido)}</p>` : "";
    const nota = n ? `<p><strong>Nota${n.numero ? " " + this.esc(n.numero) : ""}</strong> (anexo ${this.esc(n.anexo || "")}):
        ${n.valorServico != null ? `serviço ${this.money(n.valorServico)}` : ""}${n.issRetido != null ? ` · ISS ${n.issRetido ? "retido pelo tomador" : "não retido"}` : ""}${n.aliquotaIss ? ` (${this.pct(n.aliquotaIss)} sobre ${this.money(n.baseIss)})` : ""}${r.retidoNota != null ? ` · retenções ${this.money(r.retidoNota)}` : ""}${n.liquido != null ? ` · líquido ${this.money(n.liquido)}` : ""}</p>
      ${n.codigo || n.descricao ? `<p><strong>Serviço:</strong> ${this.esc([n.codigo, n.descricao].filter(Boolean).join(" · ").slice(0, 220))}</p>` : ""}` : "";
    const regimeTxt = { sim: "Simples Nacional", mei: "MEI", nao: "fora do Simples (Lucro Presumido ou Real)" }[r.regime] || "não identificado";
    const prest = e ? `<p><strong>Prestador:</strong> ${this.esc(e.razao || "")} · ${this.esc(this.docFmt(r.cnpj))}${e.cidade ? " · " + this.esc(e.cidade) : ""} · <strong>Regime:</strong> ${this.esc(regimeTxt)}</p>
      <p><strong>CNAE principal:</strong> ${this.esc(this.cnaeFmt(e.cnae))} ${this.esc(e.cnaeDesc)}${r.atividade ? ` · <strong>Atividade para retenção:</strong> ${this.esc(r.atividade)}` : ""}</p>
      ${e.secundarios.length ? `<details class="nfchk-sec"><summary>${e.secundarios.length} CNAE(s) secundário(s)</summary>${e.secundarios.map((c) => `<div>${this.esc(this.cnaeFmt(c.codigo))} ${this.esc(c.descricao)}</div>`).join("")}</details>` : ""}`
      : (r.credorDoc && r.credorDoc.length === 11 ? `<p><strong>Prestador:</strong> pessoa física (${this.esc(this.docFmt(r.credorDoc))})</p>` : "");
    const cab = r.nivel === "ok" ? `<p style="margin:6px 0 0;color:#105436;font-weight:700;">✓ ${this.esc(r.resumo)}.</p>` : "";
    return `${totais}${tabela}${nota}${prest}${cab}
      ${lista(r.erros, "#b91c1c", "✗")}
      ${lista(r.avisos, "#c2410c", "!")}
      ${lista(r.infos, "#0f766e", "ℹ")}`;
  }
};
