const ParticipacoesApp = {
  companies: [],
  folderCompanies: [],
  files: [],
  companyId: "",
  companyQ: "",
  fileName: "",
  groupBy: "matriz",
  q: "",
  loading: false,
  error: "",
  hint: "",
  parsing: false,
  uploadProgress: "",
  detail: null, // { credor, periodo } | null

  CATEGORIES: [
    { id: "relacionada", name: "Parte relacionada / sócio", test: /ellenco|ellenceo|moura leite|mutuo|mútuo|devolução de mutuo|socio|sócio/i },
    { id: "prefeitura", name: "Taxas e prefeitura", test: /prefeitura|certidao|certidão|fiscaliza|desmembr|itbi|alvara|alvará|taxa/i },
    { id: "bancario", name: "Bancário / IOF", test: /\biof\b|bancari|tarifa|resgate|ted|pix/i },
    { id: "ti", name: "TI / certificado", test: /certificado digital|mega online|dominio|domínio|software|licen[cç]a/i },
    { id: "utilidade", name: "Utilidades", test: /energia|cpfl|sabesp|agua|água|telefone|internet|copel/i },
    { id: "juridico", name: "Jurídico / cartório", test: /cartorio|cartório|advogad|honor|registro|tabeli/i },
    { id: "obra", name: "Obra / engenharia", test: /engenh|obra|topograf|terraplen|material de constru/i },
    { id: "outras", name: "Outras", test: /.*/ }
  ],

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fmt(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  apiUrl(p) {
    const host = window.location.hostname;
    const isLocal = !host || host === "localhost" || host === "127.0.0.1";
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const origin = isLocal ? `http://localhost:${port}` : "";
    return origin + p;
  },

  crmCompanies() {
    const list = (window.AppState && AppState.companies)
      || (window.EmpresasState && EmpresasState.companies)
      || [];
    return (list || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
  },

  crmCompany(id) {
    return this.crmCompanies().find((c) => String(c.id) === String(id)) || null;
  },

  companyLabel(id) {
    const c = this.crmCompany(id);
    if (!c) {
      const f = this.folderCompanies.find((x) => String(x.companyId) === String(id));
      return f ? f.label : "";
    }
    const usual = c.nomeUsual
      || (window.EmpresasState && EmpresasState.customFields && EmpresasState.customFields[c.id] && EmpresasState.customFields[c.id].nome_usual)
      || "";
    return usual || c.name || "";
  },

  filteredCompanies() {
    const q = String(this.companyQ || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return this.crmCompanies().filter((c) => {
      if (!q) return true;
      const usual = (window.EmpresasState && EmpresasState.customFields && EmpresasState.customFields[c.id] && EmpresasState.customFields[c.id].nome_usual) || "";
      const blob = `${c.id} ${c.name || ""} ${usual}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return blob.includes(q);
    });
  },

  categoryOf(row) {
    const blob = `${row.credor || ""} ${row.detalhe || ""}`;
    return this.CATEGORIES.find((c) => c.test.test(blob)) || this.CATEGORIES[this.CATEGORIES.length - 1];
  },

  periodFromFileName(name) {
    const s = String(name || "");
    // Prefer YYYY_MM / YYYY-MM (padrão dos PDFs de prestação)
    let ym = s.match(/(?:^|[^\d])(\d{4})[_-](\d{2})(?:[^\d]|$)/);
    if (ym) return `${ym[1]}-${ym[2]}`;
    ym = s.match(/(\d{4})[_-](\d{2})/);
    if (ym) return `${ym[1]}-${ym[2]}`;
    return "";
  },

  periodLabel(closing, fallback) {
    if (!closing) return fallback || "Sem período";
    const [y, m] = String(closing).split("-");
    if (!y || !m) return closing;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  },

  /** Remove ruído de pontuação/data do nome do credor para agrupar variações mínimas. */
  normalizeCredorName(name) {
    let s = String(name || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s*(?:R\$|RS)\s*$/i, "")
      .replace(/\s+([\d.]+,\d{2})\s*$/g, "")
      .replace(/\s*[-–—.:;,/|]+\s*$/g, "")
      .trim();
    // Tarifas bancárias: "TAR MANUT CONTA 03/26" ≈ "TAR MANUT CONTA 11/25"
    s = s.replace(/\s+\d{1,2}\/\d{2}(?:\d{2})?\b/g, "");
    s = s.replace(/\s+\d{4}[_/-]\d{2}\b/g, "");
    s = s.replace(/\s*[-–—.:;,/|]+\s*$/g, "").replace(/\s+/g, " ").trim();
    return s || "(sem credor)";
  },

  /** Chave estável para matriz (ignora hífen final, maiúsculas, datas residuais). */
  credorGroupKey(name) {
    return this.normalizeCredorName(name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9./\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  },

  /** Rótulo canônico: preferir a forma mais limpa / mais frequente. */
  pickCredorLabel(candidates) {
    const list = (candidates || []).map((s) => this.normalizeCredorName(s)).filter(Boolean);
    if (!list.length) return "(sem credor)";
    const counts = {};
    list.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
    return list.slice().sort((a, b) => {
      const d = (counts[b] || 0) - (counts[a] || 0);
      if (d) return d;
      return a.length - b.length || a.localeCompare(b, "pt-BR");
    })[0];
  },

  init() {
    this.refreshCompanyList();
    this.render();
    this.loadFolderMeta();
  },

  refreshCompanyList() {
    this.companies = this.crmCompanies().map((c) => ({
      companyId: String(c.id),
      label: this.companyLabel(c.id) || c.name || String(c.id)
    }));
  },

  async fetchJson(path) {
    const res = await fetch(this.apiUrl(path));
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      throw new Error("API indisponível para pastas locais. Você ainda pode selecionar a empresa e enviar PDFs por aqui.");
    }
    if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
    return data;
  },

  async loadFolderMeta() {
    try {
      const data = await this.fetchJson("/api/participacoes/companies");
      this.folderCompanies = data.companies || [];
      if (data.missingRoot) {
        this.hint = "Pasta local opcional. Selecione a empresa no cadastro e envie os PDFs pela tela.";
      }
    } catch (e) {
      this.hint = e.message || String(e);
      this.folderCompanies = [];
    }
    this.render();
  },

  async loadFilesFromServer() {
    if (!this.companyId) return;
    try {
      const data = await this.fetchJson("/api/participacoes/files?companyId=" + encodeURIComponent(this.companyId));
      const remote = data.files || [];
      remote.forEach((f) => {
        const existing = this.files.find((x) => x.name === f.name);
        if (existing) {
          existing.size = f.size;
          existing.mtime = f.mtime;
          existing.closing = f.closing || existing.closing;
          existing.year = f.year;
          existing.month = f.month;
          existing.fromServer = true;
        } else {
          this.files.push({
            name: f.name,
            size: f.size,
            mtime: f.mtime,
            year: f.year,
            month: f.month,
            closing: f.closing || this.periodFromFileName(f.name),
            expenses: null,
            fromServer: true,
            objectUrl: ""
          });
        }
      });
      this.files.sort((a, b) => String(b.closing || "").localeCompare(String(a.closing || "")) || b.name.localeCompare(a.name));
    } catch (e) {
      /* upload local continua válido */
    }
  },

  fileLink(name) {
    const local = this.files.find((f) => f.name === name);
    if (local && local.objectUrl) return local.objectUrl;
    return this.apiUrl("/api/participacoes/file?companyId=" + encodeURIComponent(this.companyId) + "&file=" + encodeURIComponent(name));
  },

  parseMoney(s) {
    const t = String(s || "").trim();
    if (!t) return 0;
    const n = t.replace(/\./g, "").replace(",", ".");
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  },

  /** Extrai o último valor monetário (aceita R$ antes/depois e nº doc residual). */
  takeMoneyFromText(text) {
    let rest = String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u2000-\u200B\uFEFF]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!rest) return { valor: 0, rest: "", doc: "" };

    // Preferir "R$ 1.234,56" no fim (coluna Débitos do Ellenceo)
    let m = rest.match(/(?:R\$|RS)\s*([\d.]+,\d{2})\s*$/i);
    if (!m) m = rest.match(/([\d.]+,\d{2})\s*(?:R\$|RS)?\s*$/i);
    if (!m) {
      const all = [...rest.matchAll(/(?:R\$|RS)?\s*([\d.]+,\d{2})/gi)];
      if (all.length) m = all[all.length - 1];
    }
    if (!m) return { valor: 0, rest, doc: "" };

    const valor = this.parseMoney(m[1]);
    if (!(valor > 0)) return { valor: 0, rest, doc: "" };

    const idx = typeof m.index === "number" ? m.index : rest.lastIndexOf(m[1]);
    let before = idx >= 0 ? rest.slice(0, idx).trim() : rest;
    let after = idx >= 0 ? rest.slice(idx + String(m[0]).length).trim() : "";
    after = after.replace(/^(?:R\$|RS)\s*/i, "").trim();
    // Nº documento logo antes do valor: "… 41 R$ 650,42" ou "… TARIFA R$ 20,50"
    let doc = "";
    const docTail = before.match(/^(.*?)(?:\s+|$)((?:TARIFA)|(?:[A-Z]?\d{1,8}))\s*$/i);
    if (docTail && docTail[2] && String(docTail[1] || "").trim().length >= 2) {
      doc = String(docTail[2]).trim();
      before = String(docTail[1] || "").trim();
    }
    if (!doc && after) {
      const am = after.match(/^(?:TARIFA|[A-Z]?\d{1,8})\b/i);
      if (am) doc = am[0];
      after = after.replace(/^(?:TARIFA|[A-Z]?\d{1,8})\s*/i, "").trim();
    }
    before = before.replace(/\s+(?:TARIFA|[A-Z]?\d{1,8})$/i, (hit) => {
      if (!doc) doc = hit.trim();
      return "";
    }).trim();
    rest = (before + (after ? " " + after : "")).replace(/\s+/g, " ").trim();
    return { valor, rest, doc };
  },

  /** Separa razão social do detalhe (REF., observação, nº doc residual). */
  splitCredorDetalhe(rest) {
    let text = String(rest || "").trim();
    if (!text) return { credor: "(sem credor)", detalhe: "" };
    text = text.replace(/\s+(?:TARIFA|[A-Z]?\d{1,8})$/i, "").trim();

    // Tarifas sem razão social: "TAR TED SISPAG" / "TAR PIX …"
    if (/^TAR(?:IFA)?\b/i.test(text) || /\bTAR\s+(?:TED|PIX|DOC|MANUT|SISPAG)\b/i.test(text)) {
      return { credor: "(tarifa bancária)", detalhe: text };
    }

    const gap = text.match(/^(.{3,120}?)\s{2,}(.+)$/);
    if (gap) return { credor: gap[1].trim(), detalhe: gap[2].trim() };
    const parts = text.split(/\s{2,}/);
    if (parts.length >= 2) {
      return { credor: parts[0].trim(), detalhe: parts.slice(1).join(" ").trim() };
    }
    const corp = text.match(/^(.+?\b(?:LTDA|S\.?\s?A\.?|EIRELI|ME|EPP|SS|LTDA\.)\b\.?)\s+(.+)$/i);
    if (corp) return { credor: corp[1].replace(/\s+/g, " ").trim(), detalhe: corp[2].trim() };
    const ref = text.match(/^(.+?)\s+(REF\.?\s*.+)$/i);
    if (ref && ref[1].length >= 3) return { credor: ref[1].trim(), detalhe: ref[2].trim() };
    // Nome pessoa + detalhe sem REF: primeiras 2–5 palavras maiúsculas
    const person = text.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç' .-]{2,60}?)\s+(REF\.?\s+.+|SOLICITAÇÃO.+|COMPRA.+|PAGAMENTO.+|LOCAÇÃO.+)$/i);
    if (person) return { credor: person[1].replace(/\s+/g, " ").trim(), detalhe: person[2].trim() };
    return { credor: text, detalhe: "" };
  },

  isExpenseNoiseLine(line) {
    const s = String(line || "").trim();
    if (!s) return true;
    if (/^DESPESAS\s+PAGAS$/i.test(s)) return true;
    if (/^={3,}$|^-{3,}$|^\.{3,}$/.test(s)) return true;
    if (/raz[aã]o\s*social|detalhamento|n[ºo°]\s*documento|d[eé]bitos|^data\b/i.test(s) && !/REF\./i.test(s)) return true;
    if (/saldo\s*total|relat[oó]rio para simples|folha\s+\d|ag\.?\s*\/?\s*conta|hor[aá]rio\s*:/i.test(s)) return true;
    if (/empreendedora|loteadora|participa[cç][aã]o|ellenc/i.test(s) && !/REF\./i.test(s) && !/([\d.]+,\d{2})/.test(s)) return true;
    if (/^\d{1,2}:\d{2}(:\d{2})?\b/.test(s)) return true;
    if (/^(at[eé]|periodo|per[ií]odo)\b/i.test(s)) return true;
    return false;
  },

  isNoiseCredor(name) {
    const s = String(name || "").trim();
    if (!s || s === "(sem credor)") return true;
    if (/^\d{1,2}:\d{2}/.test(s)) return true;
    if (/^(at[eé]\s*\/?\s*\d{2,4}|hor[aá]rio)/i.test(s)) return true;
    if (/^folha\s+\d/i.test(s)) return true;
    if (/relat[oó]rio para simples/i.test(s)) return true;
    if (/^ag\.?\s*\/?\s*conta/i.test(s)) return true;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return true;
    if (/^[aàá]\s*\/\s*\d{4}\b/i.test(s)) return true; // lixo de quebra "A/2026 - PARA A EXECUÇÃO…"
    if (s.length < 3) return true;
    return false;
  },

  /** Mês da matriz: 1 PDF de fechamento = 1 coluna (prioridade ao período do arquivo). */
  expensePeriodKey(r) {
    const fromFile = (r && r.periodo) || this.periodFromFileName(r && r.sourceFile);
    if (fromFile && /^\d{4}-\d{2}$/.test(String(fromFile))) return String(fromFile);
    const iso = String((r && r.iso) || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(0, 7);
    const d = String((r && r.date) || "");
    const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}`;
    return "sem-periodo";
  },

  /** Corrige linhas antigas do cache em que o valor ficou colado no nome. */
  repairExpenseRow(row) {
    if (!row || typeof row !== "object") return row;
    let credor = String(row.credor || "");
    let detalhe = String(row.detalhe || "");
    let valor = Number(row.valor) || 0;
    let doc = String(row.doc || row.documento || "");
    const blob = `${credor} ${detalhe}`.trim();

    if (valor < 0.005) {
      const fromBlob = this.takeMoneyFromText(blob);
      if (fromBlob.valor > 0) {
        valor = fromBlob.valor;
        if (fromBlob.doc) doc = fromBlob.doc;
        const split = this.splitCredorDetalhe(fromBlob.rest);
        credor = split.credor;
        detalhe = split.detalhe || detalhe;
      }
    } else {
      const cleaned = this.takeMoneyFromText(credor);
      if (cleaned.rest) credor = cleaned.rest;
      if (cleaned.doc && !doc) doc = cleaned.doc;
      const cleanedDet = this.takeMoneyFromText(detalhe);
      if (cleanedDet.rest !== detalhe) detalhe = cleanedDet.rest;
      if (cleanedDet.doc && !doc) doc = cleanedDet.doc;
    }

    if (!detalhe && credor) {
      const split = this.splitCredorDetalhe(credor);
      credor = split.credor;
      detalhe = split.detalhe;
    }

    credor = this.normalizeCredorName(credor);
    if (this.isNoiseCredor(credor) && detalhe) {
      const split = this.splitCredorDetalhe(detalhe);
      if (!this.isNoiseCredor(split.credor)) {
        credor = this.normalizeCredorName(split.credor);
        detalhe = split.detalhe || detalhe;
      }
    }
    const cat = this.categoryOf({ credor, detalhe });
    return Object.assign({}, row, {
      credor,
      detalhe,
      doc,
      valor,
      categoria: cat.name,
      categoriaId: cat.id
    });
  },

  /**
   * Layout Ellenceo DESPESAS PAGAS:
   * Data | Razão Social (credor) | Detalhamento | Nº Documento | Débitos (valor)
   * Linhas do detalhe podem quebrar; montamos o bloco até achar o valor.
   */
  parseExpenseLines(text, meta) {
    const raw = String(text || "").replace(/\r/g, "");
    let chunk = raw;
    const start = raw.search(/DESPESAS\s+PAGAS/i);
    if (start >= 0) chunk = raw.slice(start);
    // Corta no rodapé / próxima seção (não cortar no "Saldo Total" se ainda houver lançamentos — só após)
    const cut = chunk.search(/\n[=\-]{8,}[\s\S]{0,120}(RECEITAS|RECEBIMENTOS|EXTRATO BANC)/i);
    if (cut > 80) chunk = chunk.slice(0, cut);

    const lines = chunk.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
    const rows = [];
    const periodo = (meta && meta.closing) || "";
    const sourceFile = (meta && meta.name) || "";

    let cur = null;
    const flush = () => {
      if (!cur) return;
      const taken = this.takeMoneyFromText(cur.buf);
      // Só aceita lançamento com valor (evita rodapé "28/02/2026 13:26:11" virar credor)
      if (!(taken.valor > 0)) {
        cur = null;
        return;
      }
      const split = this.splitCredorDetalhe(taken.rest);
      let credor = this.normalizeCredorName(split.credor);
      let detalhe = split.detalhe;
      if (this.isNoiseCredor(credor)) {
        if (detalhe && !this.isNoiseCredor(detalhe)) {
          credor = this.normalizeCredorName(detalhe);
          detalhe = "";
        } else {
          cur = null;
          return;
        }
      }
      const iso = cur.date.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1");
      rows.push(this.repairExpenseRow({
        date: cur.date,
        iso,
        credor,
        detalhe,
        doc: taken.doc || "",
        valor: taken.valor,
        categoria: "",
        categoriaId: "",
        periodo: periodo || iso.slice(0, 7),
        sourceFile
      }));
      cur = null;
    };

    lines.forEach((line) => {
      if (this.isExpenseNoiseLine(line)) return;
      if (/saldo\s*total/i.test(line)) {
        flush();
        return;
      }
      // Nova linha de lançamento: data no início
      const m = line.match(/^(\d{2}\/\d{2}\/\d{4})\b\s*(.*)$/);
      if (m) {
        flush();
        const rest = String(m[2] || "").trim();
        // Cabeçalho de período: "01/11/2025 até 30/11/2025"
        if (/^(at[eé]\b)/i.test(rest) || (/^\d{2}\/\d{2}\/\d{4}/.test(rest) && !/([\d.]+,\d{2})/.test(rest) && rest.length < 40)) {
          cur = null;
          return;
        }
        cur = { date: m[1], buf: rest };
        return;
      }
      // Continuação do detalhe / valor / nº doc
      if (cur) {
        cur.buf = (cur.buf ? cur.buf + " " : "") + line;
      }
    });
    flush();
    return rows;
  },

  async extractPdfText(url) {
    const pdfjs = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
    if (!pdfjs) throw new Error("PDF.js não carregado. Atualize a página.");
    const pdf = await pdfjs.getDocument({ url, withCredentials: false }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const byY = {};
      content.items.forEach((it) => {
        const y = Math.round((it.transform && it.transform[5]) || 0);
        const x = Number((it.transform && it.transform[4]) || 0);
        if (!byY[y]) byY[y] = [];
        byY[y].push({ x, str: String(it.str || "") });
      });
      const ys = Object.keys(byY).map(Number).sort((a, b) => b - a);
      pages.push(ys.map((y) => {
        const cells = byY[y].sort((a, b) => a.x - b.x);
        let line = "";
        let prevX = null;
        cells.forEach((t) => {
          const s = String(t.str || "");
          if (!s) return;
          if (prevX == null) {
            line = s;
          } else {
            const gap = t.x - prevX;
            // Lacuna grande ≈ coluna da tabela Ellenceo (credor | detalhe | doc | valor)
            line += gap > 18 ? "  " : (gap > 2 ? " " : "");
            line += s;
          }
          prevX = t.x + (s.length * 4);
        });
        return line.replace(/[ \t]+$/g, "").trim();
      }).filter(Boolean).join("\n"));
    }
    return pages.join("\n");
  },

  expensesMostlyBroken(expenses) {
    const list = Array.isArray(expenses) ? expenses : [];
    if (!list.length) return true;
    const repaired = list.map((r) => this.repairExpenseRow(r));
    const withVal = repaired.filter((r) => Number(r.valor) > 0).length;
    if (withVal / repaired.length < 0.45) return true;
    const noisy = repaired.filter((r) => this.isNoiseCredor(r.credor)).length;
    if (repaired.length >= 8 && noisy / repaired.length > 0.25) return true;
    return false;
  },

  async ensureFileParsed(fileRec, force) {
    if (!fileRec) return;
    if (!force && Array.isArray(fileRec.expenses) && fileRec.expenses.length && !this.expensesMostlyBroken(fileRec.expenses)) {
      fileRec.expenses = fileRec.expenses.map((r) => this.repairExpenseRow(r)).filter((r) => Number(r.valor) > 0 && !this.isNoiseCredor(r.credor));
      if (!this.expensesMostlyBroken(fileRec.expenses)) return;
    }
    const url = this.fileLink(fileRec.name);
    const text = await this.extractPdfText(url);
    fileRec.expenses = this.parseExpenseLines(text, fileRec);
    this.persistCache(fileRec);
  },

  persistCache(fileRec) {
    try {
      const key = "crm_participacoes_cache_v6";
      const all = JSON.parse(localStorage.getItem(key) || "{}");
      all[this.companyId + "|" + fileRec.name] = {
        at: Date.now(),
        closing: fileRec.closing,
        expenses: fileRec.expenses
      };
      localStorage.setItem(key, JSON.stringify(all));
    } catch (e) {}
  },

  restoreCacheForCompany() {
    try {
      const keys = ["crm_participacoes_cache_v6", "crm_participacoes_cache_v5", "crm_participacoes_cache_v4", "crm_participacoes_cache_v3", "crm_participacoes_cache_v2"];
      let all = {};
      keys.forEach((key) => {
        try {
          const chunk = JSON.parse(localStorage.getItem(key) || "{}") || {};
          Object.keys(chunk).forEach((k) => {
            if (!all[k]) all[k] = chunk[k];
          });
        } catch (e) {}
      });
      Object.keys(all).forEach((k) => {
        if (!k.startsWith(String(this.companyId) + "|")) return;
        const name = k.slice(String(this.companyId).length + 1);
        const hit = all[k];
        if (!hit || !Array.isArray(hit.expenses)) return;
        // Cache antigo com valores zerados / credores-lixo: não restaura — força reparse do PDF
        if (this.expensesMostlyBroken(hit.expenses)) return;
        const repaired = hit.expenses.map((r) => this.repairExpenseRow(r)).filter((r) => Number(r.valor) > 0 && !this.isNoiseCredor(r.credor));
        if (this.expensesMostlyBroken(repaired)) return;
        let rec = this.files.find((f) => f.name === name);
        if (!rec) {
          rec = {
            name,
            closing: hit.closing || this.periodFromFileName(name),
            expenses: repaired,
            fromCache: true
          };
          this.files.push(rec);
        } else if (!rec.expenses || this.expensesMostlyBroken(rec.expenses)) {
          rec.expenses = repaired;
        } else {
          rec.expenses = (rec.expenses || []).map((r) => this.repairExpenseRow(r)).filter((r) => Number(r.valor) > 0 && !this.isNoiseCredor(r.credor));
        }
      });
    } catch (e) {}
  },

  allExpenses() {
    const list = [];
    this.files.forEach((f) => {
      const filePeriod = f.closing || this.periodFromFileName(f.name);
      (f.expenses || []).forEach((r) => {
        const fixed = this.repairExpenseRow(r);
        if (!(Number(fixed.valor) > 0) || this.isNoiseCredor(fixed.credor)) return;
        list.push(Object.assign({}, fixed, {
          periodo: filePeriod || fixed.periodo || this.periodFromFileName(fixed.sourceFile),
          sourceFile: fixed.sourceFile || f.name
        }));
      });
    });
    return list;
  },

  activeExpenses() {
    if (this.fileName) {
      const f = this.files.find((x) => x.name === this.fileName);
      const filePeriod = f && (f.closing || this.periodFromFileName(f.name));
      return (f && f.expenses) ? f.expenses.map((r) => Object.assign({}, this.repairExpenseRow(r), {
        periodo: filePeriod || r.periodo || "",
        sourceFile: r.sourceFile || (f && f.name) || ""
      })).filter((r) => Number(r.valor) > 0 && !this.isNoiseCredor(r.credor)) : [];
    }
    return this.allExpenses();
  },

  alerts() {
    const rows = this.filtered();
    const out = [];
    rows.filter((r) => r.categoriaId === "relacionada").forEach((r) => {
      out.push({ level: "warn", text: `Parte relacionada: ${r.credor} — ${r.detalhe || "sem detalhe"} (${this.fmt(r.valor)}) em ${r.date}` });
    });
    const seen = {};
    rows.forEach((r) => {
      const k = `${r.iso}|${r.credor}|${r.detalhe}|${r.valor}`;
      seen[k] = (seen[k] || 0) + 1;
    });
    Object.keys(seen).forEach((k) => {
      if (seen[k] > 1) out.push({ level: "danger", text: `Lançamento repetido ${seen[k]}x: ${k.replace(/\|/g, " · ")}` });
    });
    const byCredor = {};
    rows.forEach((r) => {
      const k = this.credorGroupKey(r.credor) || r.credor;
      byCredor[k] = byCredor[k] || [];
      byCredor[k].push(r);
    });
    Object.keys(byCredor).forEach((key) => {
      const list = byCredor[key];
      const credorLabel = this.pickCredorLabel(list.map((r) => r.credor)) || key;
      if (list.length < 3) return;
      const vals = list.map((r) => r.valor).filter((v) => v > 0).sort((a, b) => a - b);
      if (vals.length < 3) return;
      const med = vals[Math.floor(vals.length / 2)];
      list.forEach((r) => {
        if (med > 0 && r.valor > med * 2.5) {
          out.push({ level: "danger", text: `Valor acima do padrão de ${credorLabel}: ${this.fmt(r.valor)} em ${r.date} (mediana ${this.fmt(med)})` });
        }
      });
    });
    return out;
  },

  filtered() {
    const q = String(this.q || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return this.activeExpenses().filter((r) => {
      if (!q) return true;
      const blob = `${r.credor} ${r.detalhe} ${r.categoria} ${r.date} ${r.periodo || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return blob.includes(q);
    });
  },

  grouped() {
    const rows = this.filtered();
    const keyFn = {
      periodo: (r) => this.periodLabel(r.periodo, r.sourceFile || "Sem período"),
      credor: (r) => this.credorGroupKey(r.credor) || r.credor,
      categoria: (r) => r.categoria,
      data: (r) => r.date
    }[this.groupBy] || ((r) => this.credorGroupKey(r.credor) || r.credor);
    const map = {};
    rows.forEach((r) => {
      const k = keyFn(r) || "(em branco)";
      if (!map[k]) map[k] = { key: k, rows: [], total: 0, _labels: [] };
      map[k].rows.push(r);
      map[k].total += Number(r.valor) || 0;
      map[k]._labels.push(r.credor);
    });
    return Object.values(map).map((g) => {
      if (this.groupBy === "credor" || !this.groupBy || this.groupBy === "matriz") {
        g.key = this.pickCredorLabel(g._labels) || g.key;
      }
      delete g._labels;
      return g;
    }).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  },

  /** Matriz: linhas = credor (agrupado), colunas = mês do PDF (YYYY-MM). */
  matrixData() {
    const rows = this.filtered();
    const monthSet = new Set();
    // Sempre inclui os meses dos arquivos carregados (mesmo sem despesa parseada)
    this.files.forEach((f) => {
      const c = f.closing || this.periodFromFileName(f.name);
      if (c && /^\d{4}-\d{2}$/.test(c)) monthSet.add(c);
    });
    const byKey = {};
    rows.forEach((r) => {
      const periodo = this.expensePeriodKey(r);
      const key = this.credorGroupKey(r.credor) || "(sem credor)";
      monthSet.add(periodo);
      if (!byKey[key]) byKey[key] = { key, cells: {}, total: 0, _labels: [] };
      byKey[key]._labels.push(r.credor);
      if (!byKey[key].cells[periodo]) byKey[key].cells[periodo] = { total: 0, rows: [] };
      const cell = byKey[key].cells[periodo];
      cell.total += Number(r.valor) || 0;
      cell.rows.push(r);
      byKey[key].total += Number(r.valor) || 0;
    });
    const months = Array.from(monthSet).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort((a, b) => String(a).localeCompare(String(b)));
    const creditors = Object.values(byKey).map((c) => ({
      credor: this.pickCredorLabel(c._labels) || c.key,
      groupKey: c.key,
      cells: c.cells,
      total: c.total
    })).sort((a, b) => b.total - a.total || a.credor.localeCompare(b.credor, "pt-BR"));
    const colTotals = {};
    months.forEach((m) => {
      colTotals[m] = creditors.reduce((s, c) => s + ((c.cells[m] && c.cells[m].total) || 0), 0);
    });
    const grand = creditors.reduce((s, c) => s + c.total, 0);
    return { months, creditors, colTotals, grand };
  },

  openMatrixDetail(credorEnc, periodo) {
    let credor = credorEnc;
    try { credor = decodeURIComponent(credorEnc); } catch (e) {}
    this.detail = {
      credor: String(credor || ""),
      groupKey: this.credorGroupKey(credor),
      periodo: String(periodo || "")
    };
    this.render();
  },

  closeMatrixDetail() {
    this.detail = null;
    this.render();
  },

  detailRows() {
    if (!this.detail) return [];
    const { credor, periodo, groupKey } = this.detail;
    const key = groupKey || this.credorGroupKey(credor);
    return this.filtered().filter((r) => {
      const p = this.expensePeriodKey(r);
      return this.credorGroupKey(r.credor) === key && String(p) === String(periodo);
    }).sort((a, b) => String(a.iso || a.date).localeCompare(String(b.iso || b.date)));
  },

  matrixHtml() {
    const mx = this.matrixData();
    if (!mx.creditors.length) return "";
    const shortMonth = (ym) => {
      const lab = this.periodLabel(ym, ym);
      const parts = String(lab).split(" ");
      if (parts.length >= 3) return `${parts[0].slice(0, 3)}/${parts[2]}`;
      return lab;
    };
    return `
      <div class="crm-card" style="padding:0;margin-bottom:12px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;">
          <div>
            <strong style="color:#14532d;">Matriz por credor × mês</strong>
            <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Clique em um valor para ver o detalhamento dos lançamentos.</div>
          </div>
          <div style="font-weight:800;color:#105436;">${this.fmt(mx.grand)} · ${mx.creditors.length} credor(es)</div>
        </div>
        <div style="overflow:auto;max-height:min(70vh,720px);">
          <table class="part-matrix-table">
            <thead>
              <tr>
                <th class="part-matrix-sticky">Credor</th>
                ${mx.months.map((m) => `<th title="${this.esc(this.periodLabel(m, m))}">${this.esc(shortMonth(m))}</th>`).join("")}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${mx.creditors.map((c) => {
                const enc = encodeURIComponent(c.credor);
                return `<tr>
                  <td class="part-matrix-sticky part-matrix-credor" title="${this.esc(c.credor)}">${this.esc(c.credor)}</td>
                  ${mx.months.map((m) => {
                    const cell = c.cells[m];
                    if (!cell || !cell.total) {
                      return `<td class="part-matrix-empty">—</td>`;
                    }
                    const n = cell.rows.length;
                    return `<td class="part-matrix-cell">
                      <button type="button" class="part-matrix-btn" onclick="ParticipacoesApp.openMatrixDetail('${enc}','${this.esc(m)}')" title="${n} lançamento(s) — clique para detalhar">
                        <span class="part-matrix-val">${this.fmt(cell.total)}</span>
                        ${n > 1 ? `<span class="part-matrix-n">${n}</span>` : ""}
                      </button>
                    </td>`;
                  }).join("")}
                  <td class="part-matrix-total">${this.fmt(c.total)}</td>
                </tr>`;
              }).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td class="part-matrix-sticky">Total</td>
                ${mx.months.map((m) => `<td class="part-matrix-total">${mx.colTotals[m] ? this.fmt(mx.colTotals[m]) : "—"}</td>`).join("")}
                <td class="part-matrix-total">${this.fmt(mx.grand)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  },

  detailModalHtml() {
    if (!this.detail) return "";
    const rows = this.detailRows();
    const total = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const periodoLab = this.periodLabel(this.detail.periodo, this.detail.periodo);
    return `
      <div id="part-detail-modal" class="part-detail-overlay" onclick="if(event.target===this)ParticipacoesApp.closeMatrixDetail()">
        <div class="part-detail-panel" role="dialog" aria-modal="true">
          <header>
            <div>
              <h3>${this.esc(this.detail.credor)}</h3>
              <div class="part-detail-sub">${this.esc(periodoLab)} · ${rows.length} lançamento(s) · <strong>${this.fmt(total)}</strong></div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="ParticipacoesApp.closeMatrixDetail()" title="Fechar" style="padding:4px 8px;">
              <i data-lucide="x" style="width:16px;height:16px;"></i>
            </button>
          </header>
          <div class="part-detail-body">
            ${rows.length ? `
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Detalhe</th>
                    <th>Categoria</th>
                    <th style="text-align:right;">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map((r) => `<tr style="${r.categoriaId === "relacionada" ? "background:#fff7ed;" : ""}">
                    <td style="white-space:nowrap;">${this.esc(r.date)}</td>
                    <td>${this.esc(r.detalhe || "—")}</td>
                    <td>${this.esc(r.categoria)}</td>
                    <td style="text-align:right;font-weight:700;">${r.valor ? this.fmt(r.valor) : "—"}</td>
                  </tr>`).join("")}
                </tbody>
              </table>
            ` : `<div style="padding:24px;text-align:center;color:#64748b;">Nenhum lançamento neste filtro.</div>`}
          </div>
          <footer>
            <button type="button" class="btn btn-cancel" onclick="ParticipacoesApp.closeMatrixDetail()">Fechar</button>
          </footer>
        </div>
      </div>
    `;
  },

  async parseAllFiles() {
    const fails = [];
    for (const f of this.files) {
      try {
        const force = !f.expenses || this.expensesMostlyBroken(f.expenses);
        await this.ensureFileParsed(f, force);
      } catch (e) {
        fails.push((f && f.name ? f.name : "PDF") + ": " + (e.message || e));
      }
    }
    if (fails.length) {
      this.error = "Falha ao ler " + fails.length + " PDF(s). Os demais períodos foram carregados.\n" + fails.slice(0, 4).join("\n");
    }
  },

  async onCompany(id) {
    this.companyId = String(id || "");
    this.fileName = "";
    this.files.forEach((f) => {
      if (f.objectUrl) {
        try { URL.revokeObjectURL(f.objectUrl); } catch (e) {}
      }
    });
    this.files = [];
    this.error = "";
    this.refreshCompanyList();
    this.restoreCacheForCompany();
    this.loading = true;
    this.render();
    await this.loadFilesFromServer();
    this.loading = false;
    // Mantém "Todos os períodos" para a matriz credor × mês
    this.fileName = "";
    this.parsing = true;
    this.render();
    await this.parseAllFiles();
    this.parsing = false;
    this.render();
  },

  async onFile(name) {
    this.fileName = name;
    const rec = this.files.find((f) => f.name === name);
    if (!rec) return;
    this.parsing = true;
    this.error = "";
    this.render();
    try {
      await this.ensureFileParsed(rec);
    } catch (e) {
      this.error = "Não foi possível ler o PDF: " + (e.message || e);
    }
    this.parsing = false;
    this.render();
  },

  async onFileAll() {
    this.fileName = "";
    this.parsing = true;
    this.error = "";
    this.render();
    await this.parseAllFiles();
    this.parsing = false;
    this.groupBy = "matriz";
    this.render();
  },

  async tryServerUpload(fileList) {
    const fd = new FormData();
    fd.append("companyId", this.companyId);
    fd.append("companyLabel", this.companyLabel(this.companyId) || "");
    fileList.forEach((file) => fd.append("file", file, file.name));
    const res = await fetch(this.apiUrl("/api/participacoes/upload"), { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Falha no upload no servidor");
    return data;
  },

  async onUpload(input) {
    const picked = Array.from((input && input.files) || []).filter((f) => /\.pdf$/i.test(f.name));
    if (!this.companyId) {
      this.error = "Selecione a empresa antes de enviar os PDFs.";
      this.render();
      if (input) input.value = "";
      return;
    }
    if (!picked.length) {
      this.error = "Selecione um ou mais arquivos PDF.";
      this.render();
      if (input) input.value = "";
      return;
    }
    this.loading = true;
    this.parsing = true;
    this.error = "";
    this.uploadProgress = `Enviando e lendo ${picked.length} PDF(s)...`;
    this.render();

    let serverOk = false;
    try {
      await this.tryServerUpload(picked);
      serverOk = true;
    } catch (e) {
      this.hint = "Upload no servidor indisponível nesta sessão — os PDFs serão lidos só neste navegador.";
    }

    try {
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i];
        this.uploadProgress = `Lendo ${i + 1}/${picked.length}: ${file.name}`;
        this.render();
        const objectUrl = URL.createObjectURL(file);
        const closing = this.periodFromFileName(file.name);
        const ym = closing ? closing.split("-") : [];
        const text = await this.extractPdfText(objectUrl);
        const expenses = this.parseExpenseLines(text, { name: file.name, closing });
        let rec = this.files.find((f) => f.name === file.name);
        if (rec && rec.objectUrl && rec.objectUrl !== objectUrl) {
          try { URL.revokeObjectURL(rec.objectUrl); } catch (e) {}
        }
        if (!rec) {
          rec = { name: file.name };
          this.files.push(rec);
        }
        rec.size = file.size;
        rec.closing = closing;
        rec.year = ym[0] ? Number(ym[0]) : null;
        rec.month = ym[1] ? Number(ym[1]) : null;
        rec.objectUrl = objectUrl;
        rec.expenses = expenses;
        rec.fromUpload = true;
        this.persistCache(rec);
      }
      this.files.sort((a, b) => String(b.closing || "").localeCompare(String(a.closing || "")) || b.name.localeCompare(a.name));
      this.fileName = "";
      this.groupBy = "matriz";
      if (serverOk) await this.loadFilesFromServer();
    } catch (e) {
      this.error = e.message || String(e);
    }

    this.loading = false;
    this.parsing = false;
    this.uploadProgress = "";
    if (input) input.value = "";
    this.render();
  },

  render() {
    const root = document.getElementById("participacoes-root");
    if (!root) return;
    this.refreshCompanyList();
    const crm = this.crmCompany(this.companyId);
    const groups = this.grouped();
    const alerts = this.alerts();
    const rows = this.filtered();
    const total = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const selectedFile = this.files.find((f) => f.name === this.fileName);
    const periodTitle = this.fileName
      ? this.periodLabel(selectedFile && selectedFile.closing, this.fileName)
      : (this.files.length ? "Todos os períodos" : "—");
    const coList = this.filteredCompanies();
    const uploadDisabled = !this.companyId;

    root.innerHTML = `
      <div style="padding:16px 18px 28px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-bottom:14px;">
          <div style="max-width:720px;">
            <div style="font-size:1.15rem;font-weight:800;color:#0f172a;">Prestação Contas Ellenceo</div>
            <div style="font-size:0.82rem;color:#64748b;margin-top:4px;">
              1) Escolha a <strong>empresa</strong> no cadastro · 2) Envie <strong>vários PDFs</strong> de uma vez · 3) Agrupe as despesas pagas por <strong>período</strong>.
            </div>
          </div>
          <label class="btn btn-secondary" style="cursor:${uploadDisabled ? "not-allowed" : "pointer"};opacity:${uploadDisabled ? 0.55 : 1};display:inline-flex;align-items:center;gap:6px;">
            <i data-lucide="upload" style="width:16px;"></i> Enviar PDFs
            <input type="file" accept="application/pdf,.pdf" multiple ${uploadDisabled ? "disabled" : ""} style="display:none" onchange="ParticipacoesApp.onUpload(this)">
          </label>
        </div>
        ${this.error ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:0.85rem;">${this.esc(this.error)}</div>` : ""}
        ${this.hint && !this.error ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:0.82rem;">${this.esc(this.hint)}</div>` : ""}
        ${this.uploadProgress ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#ecfdf5;color:#065f46;font-size:0.85rem;">${this.esc(this.uploadProgress)}</div>` : ""}

        <div style="display:grid;grid-template-columns:minmax(260px,300px) 1fr;gap:14px;align-items:start;">
          <div class="crm-card" style="padding:12px;">
            <div style="font-size:0.72rem;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:8px;">1. Empresa</div>
            <input class="form-control" placeholder="Buscar ID ou nome..." value="${this.esc(this.companyQ)}"
              oninput="ParticipacoesApp.companyQ=this.value;ParticipacoesApp.render()"
              style="margin-bottom:8px;font-size:0.82rem;">
            <div style="max-height:280px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;">
              ${coList.length ? coList.map((c) => {
                const active = String(c.id) === String(this.companyId);
                const label = this.companyLabel(c.id) || c.name || "";
                return `<button type="button" onclick="ParticipacoesApp.onCompany('${String(c.id).replace(/'/g, "\\'")}')"
                  style="display:block;width:100%;text-align:left;padding:8px 10px;border:none;border-bottom:1px solid #f1f5f9;background:${active ? "#ecfdf5" : "#fff"};cursor:pointer;">
                  <div style="font-weight:800;color:#105436;font-size:0.82rem;">${c.id} — ${this.esc(label)}</div>
                  ${label !== c.name && c.name ? `<div style="font-size:0.7rem;color:#94a3b8;">${this.esc(c.name)}</div>` : ""}
                </button>`;
              }).join("") : `<div style="padding:12px;font-size:0.82rem;color:#64748b;">Nenhuma empresa no cadastro.</div>`}
            </div>

            <div style="font-size:0.72rem;font-weight:800;color:#64748b;text-transform:uppercase;margin:14px 0 8px;">2. Períodos (PDFs)</div>
            ${!this.companyId ? `<div style="font-size:0.82rem;color:#64748b;">Selecione uma empresa para liberar o envio.</div>` : `
              <button type="button" onclick="ParticipacoesApp.onFileAll()"
                style="display:block;width:100%;text-align:left;padding:7px 10px;margin-bottom:4px;border-radius:8px;border:1px solid ${!this.fileName && this.files.length ? "#105436" : "#e2e8f0"};background:${!this.fileName && this.files.length ? "#ecfdf5" : "#fff"};cursor:pointer;font-size:0.8rem;">
                <div style="font-weight:700;">Todos os períodos</div>
                <div style="font-size:0.68rem;color:#94a3b8;">${this.files.length} arquivo(s)</div>
              </button>
              ${this.files.length ? this.files.map((f) => {
                const active = f.name === this.fileName;
                const lab = this.periodLabel(f.closing, f.name);
                const n = Array.isArray(f.expenses) ? f.expenses.length : "…";
                return `<button type="button" onclick="ParticipacoesApp.onFile(${JSON.stringify(f.name)})"
                  style="display:block;width:100%;text-align:left;padding:7px 10px;margin-bottom:4px;border-radius:8px;border:1px solid ${active ? "#1d4ed8" : "#e2e8f0"};background:${active ? "#eff6ff" : "#fff"};cursor:pointer;font-size:0.8rem;">
                  <div style="font-weight:700;text-transform:capitalize;">${this.esc(lab)}</div>
                  <div style="font-size:0.68rem;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(f.name)} · ${n} desp.</div>
                </button>`;
              }).join("") : `<div style="font-size:0.82rem;color:#64748b;">Nenhum PDF ainda. Use <strong>Enviar PDFs</strong> e selecione vários arquivos.</div>`}
            `}
          </div>

          <div>
            <div class="crm-card" style="padding:14px;margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
                <div>
                  <div style="font-weight:800;color:#0f172a;">${this.esc((crm && crm.name) || this.companyLabel(this.companyId) || "Selecione a empresa")}</div>
                  <div style="font-size:0.8rem;color:#64748b;">Administrador: Ellenceo · Visão: <strong style="text-transform:capitalize;">${this.esc(periodTitle)}</strong> · ${rows.length} despesa(s) · ${this.fmt(total)}</div>
                </div>
                ${this.fileName ? `<a class="btn btn-outline" href="${this.fileLink(this.fileName)}" target="_blank" rel="noopener">Abrir PDF</a>` : ""}
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center;">
                <input class="form-control" placeholder="Filtrar credor, detalhe, categoria..." value="${this.esc(this.q)}" oninput="ParticipacoesApp.q=this.value;ParticipacoesApp.render()" style="max-width:280px;">
                ${[
                  ["matriz", "Matriz"],
                  ["periodo", "Por período"],
                  ["credor", "Por credor"],
                  ["categoria", "Por categoria"],
                  ["data", "Por data"]
                ].map(([g, lab]) => {
                  return `<button type="button" class="btn ${this.groupBy === g ? "btn-primary" : "btn-outline"}" onclick="ParticipacoesApp.groupBy='${g}';ParticipacoesApp.detail=null;ParticipacoesApp.render()">${lab}</button>`;
                }).join("")}
              </div>
            </div>
            ${this.parsing || this.loading ? `<div class="crm-card" style="padding:20px;text-align:center;color:#64748b;">${this.esc(this.uploadProgress || "Processando...")}</div>` : ""}
            ${!this.parsing && !this.loading && alerts.length ? `
              <div class="crm-card" style="padding:12px;margin-bottom:12px;border-left:4px solid #ea580c;">
                <div style="font-weight:800;color:#9a3412;margin-bottom:8px;">Pontos de atenção (${alerts.length})</div>
                ${alerts.slice(0, 12).map((a) => `<div style="font-size:0.8rem;margin-bottom:6px;color:${a.level === "danger" ? "#991b1b" : "#9a3412"};">• ${this.esc(a.text)}</div>`).join("")}
              </div>` : ""}
            ${!this.parsing && !this.loading && this.groupBy === "matriz" ? this.matrixHtml() : ""}
            ${!this.parsing && !this.loading && this.groupBy !== "matriz" ? groups.map((g) => `
              <div class="crm-card" style="padding:0;margin-bottom:10px;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                  <strong style="text-transform:capitalize;">${this.esc(g.key)}</strong>
                  <span style="font-weight:800;color:#105436;">${this.fmt(g.total)} · ${g.rows.length}</span>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                  <thead>
                    <tr style="background:#105436;color:#fff;">
                      <th style="text-align:left;padding:6px 10px;">Data</th>
                      ${this.groupBy === "periodo" ? "" : `<th style="text-align:left;padding:6px 10px;">Período</th>`}
                      <th style="text-align:left;padding:6px 10px;">Credor</th>
                      <th style="text-align:left;padding:6px 10px;">Detalhe</th>
                      <th style="text-align:left;padding:6px 10px;">Categoria</th>
                      <th style="text-align:right;padding:6px 10px;">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${g.rows.map((r) => `<tr style="border-bottom:1px solid #f1f5f9;${r.categoriaId === "relacionada" ? "background:#fff7ed;" : ""}">
                      <td style="padding:6px 10px;white-space:nowrap;">${this.esc(r.date)}</td>
                      ${this.groupBy === "periodo" ? "" : `<td style="padding:6px 10px;text-transform:capitalize;">${this.esc(this.periodLabel(r.periodo, "—"))}</td>`}
                      <td style="padding:6px 10px;">${this.esc(r.credor)}</td>
                      <td style="padding:6px 10px;">${this.esc(r.detalhe || "—")}</td>
                      <td style="padding:6px 10px;">${this.esc(r.categoria)}</td>
                      <td style="padding:6px 10px;text-align:right;font-weight:700;">${r.valor ? this.fmt(r.valor) : "—"}</td>
                    </tr>`).join("")}
                  </tbody>
                </table>
              </div>
            `).join("") : ""}
            ${!this.parsing && !this.loading && this.companyId && this.files.length && !(this.groupBy === "matriz" ? this.matrixData().creditors.length : groups.length) ? `<div class="crm-card" style="padding:18px;color:#64748b;">Nenhuma linha de despesa paga identificada. Confira se a página “DESPESAS PAGAS” está em texto no PDF.</div>` : ""}
            ${!this.parsing && !this.loading && this.companyId && !this.files.length ? `<div class="crm-card" style="padding:18px;color:#64748b;">Empresa selecionada. Envie um ou mais PDFs de fechamento para agrupar as despesas por período.</div>` : ""}
          </div>
        </div>
        ${this.detailModalHtml()}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
};

window.ParticipacoesApp = ParticipacoesApp;
