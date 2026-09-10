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
  companyPickerOpen: false,
  exportScope: "current", // current | all
  cloudSyncing: false,

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
    // Prefer YYYY_MM / YYYY-MM no final do nome (padrão Ellenceo: ... 2025_11.pdf)
    let ym = s.match(/(?:^|[^\d])(\d{4})[_-](\d{2})(?:[^\d]|$)/);
    if (ym) return `${ym[1]}-${ym[2]}`;
    ym = s.match(/(\d{4})[_-](\d{2})/);
    if (ym) return `${ym[1]}-${ym[2]}`;
    return "";
  },

  /** Período impresso no cabeçalho: "DESPESAS PAGAS 01/11/2025 30/11/2025" ou "01/11/2025 até 30/11/2025" */
  periodFromPdfHeader(text) {
    const s = String(text || "");
    let m = s.match(/DESPESAS\s+PAGAS\s+(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2})\/(\d{2})\/(\d{2,4})/i);
    if (!m) m = s.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s*(?:a|até|ate)\s*(\d{2})\/(\d{2})\/(\d{2,4})/i);
    if (!m) return "";
    const end = this.normalizeBrDate(`${m[4]}/${m[5]}/${m[6]}`);
    const parts = end.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return parts ? `${parts[3]}-${parts[2]}` : "";
  },

  extractSaldoTotal(text) {
    const s = String(text || "");
    const m = s.match(/Saldo\s*Total\s*(?:R\$|RS)?\s*([\d.]+,\d{2})/i);
    if (!m) return null;
    const v = this.parseMoney(m[1]);
    return v > 0 ? v : null;
  },

  /** Ellenceo usa dd/mm/aaaa ou dd/mm/aa (ex.: 01/12/25). */
  normalizeBrDate(d) {
    const m = String(d || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
    if (!m) return String(d || "").trim();
    let y = m[3];
    if (y.length === 2) y = `${Number(y) >= 70 ? "19" : "20"}${y}`;
    return `${m[1]}/${m[2]}/${y}`;
  },

  brDateToIso(d) {
    const n = this.normalizeBrDate(d);
    const m = n.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
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

  periodKeyOfFile(f) {
    if (!f) return "";
    return String(f.closing || this.periodFromFileName(f.name) || "").trim();
  },

  removeFilesForPeriod(closing, keepName) {
    const key = String(closing || "");
    if (!key) return;
    this.files = this.files.filter((f) => {
      const pk = this.periodKeyOfFile(f);
      if (pk !== key) return true;
      if (keepName && f.name === keepName) return true;
      if (f.objectUrl) {
        try { URL.revokeObjectURL(f.objectUrl); } catch (e) { /* ignore */ }
      }
      return false;
    });
  },

  fbReady() {
    return !!(window.firebaseDb && window.firebaseStorage && window.firebaseCollections);
  },

  cloudDocId(companyId, closing) {
    return `${String(companyId || "").trim()}_${String(closing || "").trim()}`.replace(/[^\w.-]+/g, "_");
  },

  async uploadPdfToFirebase(file, companyId, closing) {
    if (!this.fbReady()) return { url: "", path: "" };
    const { ref, uploadBytes, getDownloadURL } = window.firebaseCollections;
    const safe = String(file.name || "arquivo.pdf").replace(/[^\w.\-()+ ]+/g, "_");
    const path = `participacoes/${companyId}/${closing || "sem-periodo"}/${safe}`;
    const storageRef = ref(window.firebaseStorage, path);
    await uploadBytes(storageRef, file, { contentType: file.type || "application/pdf" });
    const url = await getDownloadURL(storageRef);
    return { url, path };
  },

  async savePeriodToFirebase(rec, companyId) {
    if (!this.fbReady() || !rec || !companyId) return false;
    const closing = this.periodKeyOfFile(rec);
    if (!closing) return false;
    const { doc, setDoc, serverTimestamp } = window.firebaseCollections;
    const userName = (window.AppState && AppState.currentUser && AppState.currentUser.name) || "";
    const payload = {
      companyId: String(companyId),
      closing,
      fileName: rec.name || "",
      saldoTotal: rec.saldoTotal != null ? Number(rec.saldoTotal) : null,
      expenses: Array.isArray(rec.expenses) ? rec.expenses : [],
      pdfUrl: rec.pdfUrl || "",
      pdfPath: rec.pdfPath || "",
      cacheVer: 9,
      updatedAt: Date.now(),
      updatedBy: userName,
      updatedAtServer: typeof serverTimestamp === "function" ? serverTimestamp() : null
    };
    await setDoc(doc(window.firebaseDb, "participacoes_periods", this.cloudDocId(companyId, closing)), payload, { merge: true });
    return true;
  },

  async loadPeriodsFromFirebase(companyId) {
    if (!this.fbReady() || !companyId) return [];
    const { collection, query, where, getDocs } = window.firebaseCollections;
    const q = query(collection(window.firebaseDb, "participacoes_periods"), where("companyId", "==", String(companyId)));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      if (!data.closing && !data.fileName) return;
      out.push({
        name: data.fileName || `${data.closing}.pdf`,
        closing: data.closing || this.periodFromFileName(data.fileName),
        year: data.closing ? Number(String(data.closing).slice(0, 4)) : null,
        month: data.closing ? Number(String(data.closing).slice(5, 7)) : null,
        expenses: Array.isArray(data.expenses) ? data.expenses : [],
        saldoTotal: data.saldoTotal != null ? Number(data.saldoTotal) : null,
        pdfUrl: data.pdfUrl || "",
        pdfPath: data.pdfPath || "",
        cacheVer: 9,
        fromCloud: true,
        objectUrl: ""
      });
    });
    return out;
  },

  async mergeCloudPeriods(companyId) {
    try {
      const cloud = await this.loadPeriodsFromFirebase(companyId);
      cloud.forEach((c) => {
        const pk = this.periodKeyOfFile(c);
        const existing = this.files.find((f) => this.periodKeyOfFile(f) === pk || f.name === c.name);
        if (existing) {
          if ((!existing.expenses || !existing.expenses.length) && c.expenses && c.expenses.length) {
            existing.expenses = c.expenses;
            existing.saldoTotal = c.saldoTotal;
            existing.cacheVer = 9;
          }
          if (c.pdfUrl) existing.pdfUrl = c.pdfUrl;
          if (c.pdfPath) existing.pdfPath = c.pdfPath;
          existing.fromCloud = true;
        } else {
          this.files.push(c);
        }
        if (c.expenses && c.expenses.length) this.persistCache(c);
      });
      this.files.sort((a, b) => String(b.closing || "").localeCompare(String(a.closing || "")) || b.name.localeCompare(a.name));
    } catch (e) {
      console.warn("[Participacoes] Firebase períodos:", e);
    }
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
    if (local && local.pdfUrl) return local.pdfUrl;
    const byPeriod = this.files.find((f) => this.periodKeyOfFile(f) === this.periodFromFileName(name) && f.pdfUrl);
    if (byPeriod && byPeriod.pdfUrl) return byPeriod.pdfUrl;
    return this.apiUrl("/api/participacoes/file?companyId=" + encodeURIComponent(this.companyId) + "&file=" + encodeURIComponent(name));
  },

  parseMoney(s) {
    const t = String(s || "").trim();
    if (!t) return 0;
    const n = t.replace(/\./g, "").replace(",", ".");
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  },

  /** Extrai o valor da coluna Débitos (aceita R$ / nº doc). Evita preço unitário no texto (ex.: "X R$ 150,00)"). */
  takeMoneyFromText(text) {
    let rest = String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u2000-\u200B\uFEFF]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!rest) return { valor: 0, rest: "", doc: "" };

    // 1) Padrão Ellenceo no fim: "… 302   1.020,00" / "… TARIFA   87,35"
    let mDoc = rest.match(/((?:TARIFA)|(?:\d{1,8}))\s+([\d.]+,\d{2})\s*$/i);
    if (mDoc) {
      const valor = this.parseMoney(mDoc[2]);
      if (valor > 0) {
        const before = rest.slice(0, mDoc.index).trim();
        return { valor, rest: before, doc: String(mDoc[1]).trim() };
      }
    }

    // 2) "R$ 1.234,56" no fim (coluna Débitos)
    let m = rest.match(/(?:R\$|RS)\s*([\d.]+,\d{2})\s*$/i);
    if (!m) m = rest.match(/([\d.]+,\d{2})\s*(?:R\$|RS)?\s*$/i);
    if (!m) {
      // Último valor que NÃO seja preço unitário no detalhe ("X R$ 150,00)" / "meses … R$ 150,00)")
      const all = [...rest.matchAll(/(?:R\$|RS)?\s*([\d.]+,\d{2})/gi)];
      for (let i = all.length - 1; i >= 0; i--) {
        const hit = all[i];
        const start = hit.index || 0;
        const prev = rest.slice(Math.max(0, start - 12), start).toUpperCase();
        if (/\bX\s*$/.test(prev) || /\(\s*$/.test(prev) || /MESES?\s*$/.test(prev)) continue;
        m = hit;
        break;
      }
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

  /** Linha já completa no layout Ellenceo (nº doc + débito no fim). */
  isCompleteExpenseBuf(buf) {
    return /(?:TARIFA|\d{1,8})\s+[\d.]+,\d{2}\s*$/i.test(String(buf || "").trim());
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
    const leadDetail = text.match(/^(.+?)\s+(PROTOCOL?O\s+.+|PROTOCOLO\s+.+|SOLICITAÇÃO\s+.+|SOLICITACAO\s+.+|PAGAMENTO\s+.+|COMPRA\s+.+|LOCAÇÃO\s+.+|PAGAMENTOS\s+.+)$/i);
    if (leadDetail && leadDetail[1].length >= 3) return { credor: leadDetail[1].trim(), detalhe: leadDetail[2].trim() };
    // Nome pessoa + detalhe sem REF: primeiras 2–5 palavras maiúsculas
    const person = text.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç' .-]{2,60}?)\s+(REF\.?\s+.+|SOLICITAÇÃO.+|SOLICITACAO.+|PROTOCOLO.+|PROTOCOL?O.+|COMPRA.+|PAGAMENTO.+|LOCAÇÃO.+)$/i);
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
    // Cabeçalhos / linhas típicas do EXTRATO (não são DESPESAS PAGAS)
    if (/\bextrato\b|\bconcilia|\bmovimenta[cç][aã]o\s*banc/i.test(s)) return true;
    if (/^saldo\s+(anterior|atual|dispon|aplic)/i.test(s)) return true;
    if (/^(apl\.?\s*aplic|aplic\.?\s*aut|int\.?\s*aplic)/i.test(s)) return true;
    return false;
  },

  /** Credores/histórico típicos de extrato bancário — NÃO entram na matriz Ellenceo. */
  isBankStatementNoise(name, detalhe) {
    const blob = `${name || ""} ${detalhe || ""}`
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!blob) return true;
    // Tarifas do quadro DESPESAS PAGAS (TAR TED SISPAG, TAR PIX…) — não são extrato
    if (/^TAR(?:IFA)?\b/.test(blob) || /\bTAR\s+(?:TED|PIX|DOC|MANUT|SISPAG)\b/.test(blob)) return false;
    if (/\bSALDO\s+(APLIC|ANTERIOR|ATUAL|DISPON)/.test(blob)) return true;
    if (/\bAPL(\.|ICACAO|IC)?\s*(AUT|APLIC)/.test(blob)) return true;
    if (/\bINT\s*APLIC/.test(blob)) return true;
    if (/\bHIGHGRADE\b/.test(blob)) return true;
    if (/\bSISPAG\b/.test(blob) && !/\b(LTDA|EIRELI|S\.?\s?A\.?|TAR)\b/.test(blob) && !/\bREF\.?\b/.test(blob)) return true;
    if (/\bRECEBIMENTOS\s+RESERV/.test(blob)) return true;
    if (/^(TED|PIX|DOC)\b/.test(blob) && blob.length < 48 && !/\bREF\.?\b/.test(blob) && !/\bTAR\b/.test(blob)) return true;
    if (/\bEXTRATO\b|\bCONCILIACAO\b/.test(blob)) return true;
    return false;
  },

  isNoiseCredor(name) {
    const s = String(name || "").trim();
    if (!s || s === "(sem credor)") return true;
    if (this.isBankStatementNoise(s, "")) return true;
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

  /**
   * Recorta SOMENTE o(s) quadro(s) "DESPESAS PAGAS" do PDF Ellenceo.
   * Ignora extrato da conta, aplicações, saldos e demais seções.
   */
  extractDespesasPagasText(rawText) {
    const raw = String(rawText || "").replace(/\r/g, "");
    if (!raw.trim()) return "";
    const re = /DESPESAS\s+PAGAS/gi;
    const starts = [];
    let m;
    while ((m = re.exec(raw)) !== null) starts.push(m.index);
    if (!starts.length) return "";

    const endRe = /Saldo\s*Total\b|\bEXTRATO\s*(BANC|\bDA\s*CONTA)?\b|\bMOVIMENTA[CÇ][AÃ]O\s*BANC|\bCONCILIA[CÇ][AÃ]O\b|\bRECEITAS\s+(RECEBIDAS|PAGAS)?\b|\bRECEBIMENTOS\b|\bSALDO\s+ANTERIOR\b/i;
    const parts = [];
    starts.forEach((start, idx) => {
      const hardEnd = starts[idx + 1] != null ? starts[idx + 1] : raw.length;
      let part = raw.slice(start, hardEnd);
      // Preferir corte no "Saldo Total" do próprio quadro de despesas
      const saldoIdx = part.search(/\n[ \t]*Saldo\s*Total\b/i);
      if (saldoIdx > 60) {
        part = part.slice(0, saldoIdx);
      } else {
        const endIdx = part.search(endRe);
        // "DESPESAS PAGAS" no início: não cortar no próprio título; achar após ~40 chars
        if (endIdx > 40) part = part.slice(0, endIdx);
      }
      // Remove qualquer trecho residual de extrato que tenha vazado
      part = part.split(/\n/).filter((line) => {
        const t = String(line || "").trim();
        if (!t) return false;
        if (/\bEXTRATO\b|\bCONCILIA/i.test(t)) return false;
        if (/^SALDO\s+(ANTERIOR|APLIC|ATUAL)/i.test(t) && !/REF\./i.test(t)) return false;
        return true;
      }).join("\n");
      if (part.trim().length > 40) parts.push(part);
    });
    return parts.join("\n");
  },

  /**
   * Mês da matriz = período do PDF de fechamento (nome do arquivo),
   * nunca o mês “solto” de uma data no detalhe (ex.: 31/10/2025 no texto da solicitação).
   */
  expensePeriodKey(r) {
    const fromName = this.periodFromFileName(r && r.sourceFile);
    if (fromName && /^\d{4}-\d{2}$/.test(fromName)) return fromName;
    const hit = (this.files || []).find((f) => f && f.name && r && r.sourceFile && f.name === r.sourceFile);
    if (hit && hit.closing && /^\d{4}-\d{2}$/.test(String(hit.closing))) return String(hit.closing);
    const stored = r && r.periodo;
    if (stored && /^\d{4}-\d{2}$/.test(String(stored))) return String(stored);
    const iso = String((r && r.iso) || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(0, 7);
    const d = this.normalizeBrDate((r && r.date) || "");
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
    if (this.isBankStatementNoise(credor, detalhe)) {
      return Object.assign({}, row, { credor, detalhe, doc, valor: 0, categoria: "", categoriaId: "" });
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
   * Layout Ellenceo DESPESAS PAGAS (não extrato):
   * Data | Razão Social (credor) | Detalhamento | Nº Documento | Débitos (valor)
   * Linhas do detalhe podem quebrar; montamos o bloco até achar o valor.
   * Aceita data dd/mm/aaaa ou dd/mm/aa (comum a partir de dez/2025).
   */
  parseExpenseLines(text, meta) {
    const chunk = this.extractDespesasPagasText(text);
    if (!chunk) {
      console.warn("[Participacoes] PDF sem quadro DESPESAS PAGAS — extrato/outras seções ignorados.", meta && meta.name);
      return [];
    }

    const lines = chunk.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
    const rows = [];
    const periodo = (meta && meta.closing) || this.periodFromFileName(meta && meta.name) || this.periodFromPdfHeader(text) || "";
    const sourceFile = (meta && meta.name) || "";

    let cur = null;
    let pendingPrefix = "";
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
      if (cur.extraDetalhe) {
        detalhe = (String(cur.extraDetalhe) + (detalhe ? " " + detalhe : "")).replace(/\s+/g, " ").trim();
      }
      if (this.isNoiseCredor(credor) || this.isBankStatementNoise(credor, detalhe)) {
        if (detalhe && !this.isNoiseCredor(detalhe) && !this.isBankStatementNoise(detalhe, "")) {
          credor = this.normalizeCredorName(detalhe);
          detalhe = "";
        } else {
          cur = null;
          return;
        }
      }
      if (this.isBankStatementNoise(credor, detalhe)) {
        cur = null;
        return;
      }
      const date = this.normalizeBrDate(cur.date);
      const iso = this.brDateToIso(date);
      rows.push(this.repairExpenseRow({
        date,
        iso,
        credor,
        detalhe,
        doc: taken.doc || "",
        valor: taken.valor,
        categoria: "",
        categoriaId: "",
        periodo: periodo || (iso ? iso.slice(0, 7) : ""),
        sourceFile
      }));
      cur = null;
    };

    lines.forEach((line) => {
      if (this.isExpenseNoiseLine(line)) return;
      if (/saldo\s*total/i.test(line)) {
        flush();
        pendingPrefix = "";
        return;
      }
      // Nova linha de lançamento: data no início (aaaa ou aa)
      const m = line.match(/^(\d{2}\/\d{2}\/\d{2,4})\b\s*(.*)$/);
      if (m) {
        flush();
        const rest = String(m[2] || "").trim();
        // Sobras de intervalo no detalhe: "a 31/10/2025)", "até 20/11/2025", só ")"
        if (!rest || /^[).,;:\-–—]*$/.test(rest)) {
          cur = null;
          pendingPrefix = "";
          return;
        }
        if (/^(at[eé]\b)/i.test(rest) || (/^(a|à)\s+\d{2}\/\d{2}\/\d{2,4}/i.test(rest) && !/([\d.]+,\d{2})/.test(rest))) {
          cur = null;
          pendingPrefix = "";
          return;
        }
        // Cabeçalho de período: "01/11/2025 até 30/11/2025" / segunda data sem valor
        if (/^\d{2}\/\d{2}\/\d{2,4}/.test(rest) && !/([\d.]+,\d{2})/.test(rest) && rest.length < 40) {
          cur = null;
          pendingPrefix = "";
          return;
        }
        // Linha tipicamente de extrato (aplicação / saldo) — descartar
        if (this.isBankStatementNoise(rest, "")) {
          cur = null;
          pendingPrefix = "";
          return;
        }
        const extra = pendingPrefix;
        pendingPrefix = "";
        cur = { date: this.normalizeBrDate(m[1]), buf: rest, extraDetalhe: extra };
        return;
      }
      // Continuação do detalhe / valor / nº doc
      if (cur) {
        // Buffer já tem doc+débito: pedaço "REF. …" solto é da próxima linha (PDF fora de ordem)
        if (this.isCompleteExpenseBuf(cur.buf) && /^(REF\.?|SOLICITA)/i.test(line)) {
          flush();
          pendingPrefix = line;
          return;
        }
        cur.buf = (cur.buf ? cur.buf + " " : "") + line;
        return;
      }
      if (/^(REF\.?|SOLICITA)/i.test(line)) {
        pendingPrefix = pendingPrefix ? (pendingPrefix + " " + line) : line;
      }
    });
    flush();
    return rows.filter((r) => Number(r.valor) > 0 && !this.isNoiseCredor(r.credor) && !this.isBankStatementNoise(r.credor, r.detalhe));
  },

  expenseDedupeKey(r) {
    const iso = String((r && r.iso) || this.brDateToIso(r && r.date) || "");
    const credor = this.credorGroupKey((r && r.credor) || "");
    const doc = String((r && (r.doc || r.documento)) || "").trim().toUpperCase();
    const valor = (Number(r && r.valor) || 0).toFixed(2);
    return `${iso}|${credor}|${doc}|${valor}`;
  },

  dedupeExpenseRows(rows) {
    const seen = new Set();
    const out = [];
    (rows || []).forEach((r) => {
      const k = this.expenseDedupeKey(r);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(r);
    });
    return out;
  },

  async extractPdfText(url) {
    const pdfjs = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
    if (!pdfjs) throw new Error("PDF.js não carregado. Atualize a página.");
    const pdf = await pdfjs.getDocument({ url, withCredentials: false }).promise;
    const pages = [];
    const yTol = 2.5;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = (content.items || []).map((it) => ({
        y: Number((it.transform && it.transform[5]) || 0),
        x: Number((it.transform && it.transform[4]) || 0),
        str: String(it.str || "")
      })).filter((t) => t.str);
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const bands = [];
      items.forEach((it) => {
        const last = bands[bands.length - 1];
        if (!last || Math.abs(last.y - it.y) > yTol) {
          bands.push({ y: it.y, cells: [it] });
        } else {
          last.cells.push(it);
          last.y = (last.y * (last.cells.length - 1) + it.y) / last.cells.length;
        }
      });
      pages.push(bands.map((band) => {
        const cells = band.cells.sort((a, b) => a.x - b.x);
        let line = "";
        let prevX = null;
        cells.forEach((t) => {
          const s = String(t.str || "");
          if (!s) return;
          if (prevX == null) {
            line = s;
          } else {
            const gap = t.x - prevX;
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
    const noisy = repaired.filter((r) => this.isNoiseCredor(r.credor) || this.isBankStatementNoise(r.credor, r.detalhe)).length;
    if (repaired.length >= 8 && noisy / repaired.length > 0.2) return true;
    // Muitos "credores" de extrato = cache antigo lendo conta, não DESPESAS PAGAS
    const bankish = repaired.filter((r) => this.isBankStatementNoise(r.credor, r.detalhe)).length;
    if (repaired.length >= 5 && bankish / repaired.length > 0.12) return true;
    // Cache antigo sem dd/mm/aa
    const shortOrBadDate = repaired.filter((r) => {
      const d = String(r.date || "");
      return /^\d{2}\/\d{2}\/\d{2}$/.test(d) || !/^\d{2}\/\d{2}\/\d{4}$/.test(this.normalizeBrDate(d));
    }).length;
    if (repaired.length >= 3 && shortOrBadDate / repaired.length > 0.3) return true;
    return false;
  },

  expensesMismatchSaldo(fileRec) {
    const saldo = Number(fileRec && fileRec.saldoTotal) || 0;
    if (!(saldo > 0)) return false;
    const sum = (fileRec.expenses || []).reduce((s, r) => s + (Number(r.valor) || 0), 0);
    return Math.abs(sum - saldo) > Math.max(1, saldo * 0.008);
  },

  async ensureFileParsed(fileRec, force) {
    if (!fileRec) return;
    const needs = force
      || !Array.isArray(fileRec.expenses)
      || this.expensesMostlyBroken(fileRec.expenses)
      || this.expensesMismatchSaldo(fileRec)
      || fileRec.cacheVer !== 9;
    if (!needs && Array.isArray(fileRec.expenses) && fileRec.expenses.length) {
      fileRec.expenses = this.dedupeExpenseRows(
        fileRec.expenses.map((r) => this.repairExpenseRow(r)).filter((r) => Number(r.valor) > 0 && !this.isNoiseCredor(r.credor) && !this.isBankStatementNoise(r.credor, r.detalhe))
      );
      if (!this.expensesMostlyBroken(fileRec.expenses) && !this.expensesMismatchSaldo(fileRec)) return;
    }
    const url = this.fileLink(fileRec.name);
    const text = await this.extractPdfText(url);
    const headerPeriod = this.periodFromPdfHeader(text);
    const fromName = this.periodFromFileName(fileRec.name);
    fileRec.closing = fromName || headerPeriod || fileRec.closing || "";
    fileRec.saldoTotal = this.extractSaldoTotal(text);
    fileRec.expenses = this.parseExpenseLines(text, fileRec);
    fileRec.cacheVer = 9;
    this.persistCache(fileRec);
  },

  persistCache(fileRec) {
    try {
      const key = "crm_participacoes_cache_v9";
      const all = JSON.parse(localStorage.getItem(key) || "{}");
      all[this.companyId + "|" + fileRec.name] = {
        at: Date.now(),
        cacheVer: 9,
        closing: fileRec.closing,
        saldoTotal: fileRec.saldoTotal || null,
        expenses: fileRec.expenses
      };
      localStorage.setItem(key, JSON.stringify(all));
    } catch (e) {}
  },

  restoreCacheForCompany() {
    try {
      const keys = ["crm_participacoes_cache_v9", "crm_participacoes_cache_v8", "crm_participacoes_cache_v7", "crm_participacoes_cache_v6", "crm_participacoes_cache_v5", "crm_participacoes_cache_v4", "crm_participacoes_cache_v3", "crm_participacoes_cache_v2"];
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
        // Só aceita cache v9 íntegro — versões antigas forçam reparse (dd/mm/aa + Saldo Total)
        if (hit.cacheVer !== 9 || this.expensesMostlyBroken(hit.expenses)) return;
        const repaired = this.dedupeExpenseRows(
          hit.expenses.map((r) => this.repairExpenseRow(r)).filter((r) => Number(r.valor) > 0 && !this.isNoiseCredor(r.credor) && !this.isBankStatementNoise(r.credor, r.detalhe))
        );
        if (this.expensesMostlyBroken(repaired)) return;
        const closing = hit.closing || this.periodFromFileName(name);
        const probe = { expenses: repaired, saldoTotal: hit.saldoTotal, closing };
        if (this.expensesMismatchSaldo(probe)) return;
        let rec = this.files.find((f) => f.name === name);
        if (!rec) {
          rec = {
            name,
            closing,
            saldoTotal: hit.saldoTotal || null,
            expenses: repaired,
            cacheVer: 9,
            fromCache: true
          };
          this.files.push(rec);
        } else if (!rec.expenses || this.expensesMostlyBroken(rec.expenses) || rec.cacheVer !== 9) {
          rec.expenses = repaired;
          rec.saldoTotal = hit.saldoTotal || rec.saldoTotal;
          rec.cacheVer = 9;
          if (!rec.closing) rec.closing = closing;
        } else {
          rec.expenses = this.dedupeExpenseRows(
            (rec.expenses || []).map((r) => this.repairExpenseRow(r)).filter((r) => Number(r.valor) > 0 && !this.isNoiseCredor(r.credor))
          );
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
        if (!(Number(fixed.valor) > 0) || this.isNoiseCredor(fixed.credor) || this.isBankStatementNoise(fixed.credor, fixed.detalhe)) return;
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
      })).filter((r) => Number(r.valor) > 0 && !this.isNoiseCredor(r.credor) && !this.isBankStatementNoise(r.credor, r.detalhe)) : [];
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

  /** Matriz: linhas = credor (agrupado), colunas = mês com DESPESAS PAGAS (só meses com valor). */
  matrixData() {
    const rows = this.filtered();
    const monthSet = new Set();
    const byKey = {};
    rows.forEach((r) => {
      const periodo = this.expensePeriodKey(r);
      if (!periodo || periodo === "sem-periodo" || !/^\d{4}-\d{2}$/.test(periodo)) return;
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
    // Remove colunas zeradas (arquivos sem DESPESAS PAGAS / não parseados)
    const monthsWithValue = months.filter((m) => (colTotals[m] || 0) > 0.004);
    const grand = creditors.reduce((s, c) => s + c.total, 0);
    const saldoChecks = [];
    (this.files || []).forEach((f) => {
      const p = f.closing || this.periodFromFileName(f.name);
      if (!p || !monthsWithValue.includes(p)) return;
      const saldo = Number(f.saldoTotal) || 0;
      if (!(saldo > 0)) return;
      const got = colTotals[p] || 0;
      if (Math.abs(got - saldo) > Math.max(1, saldo * 0.008)) {
        saldoChecks.push({ periodo: p, saldo, got });
      }
    });
    return { months: monthsWithValue, creditors, colTotals, grand, saldoChecks };
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
    const warn = (mx.saldoChecks || []).map((c) =>
      `${this.periodLabel(c.periodo, c.periodo)}: lido ${this.fmt(c.got)} × Saldo Total PDF ${this.fmt(c.saldo)}`
    ).join(" · ");
    return `
      <div class="crm-card" style="padding:0;margin-bottom:12px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;">
          <div>
            <strong style="color:#14532d;">Matriz por credor × mês</strong>
            <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Clique em um valor para ver o detalhamento dos lançamentos. Somente meses com DESPESAS PAGAS.</div>
            ${warn ? `<div style="font-size:0.75rem;color:#9a3412;margin-top:4px;">Conferência Saldo Total: ${this.esc(warn)}</div>` : ""}
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
        await this.ensureFileParsed(f, f.cacheVer !== 9);
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
    this.companyPickerOpen = false;
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
    await this.mergeCloudPeriods(this.companyId);
    await this.loadFilesFromServer();
    this.loading = false;
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
      this.hint = "Upload no servidor local indisponível — salvando no Firebase / navegador.";
    }

    try {
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i];
        this.uploadProgress = `Lendo ${i + 1}/${picked.length}: ${file.name}`;
        this.render();
        const objectUrl = URL.createObjectURL(file);
        let closing = this.periodFromFileName(file.name);
        const text = await this.extractPdfText(objectUrl);
        if (!closing) closing = this.periodFromPdfHeader(text);
        const ym = closing ? closing.split("-") : [];
        const expenses = this.parseExpenseLines(text, { name: file.name, closing });

        // Reenvio do mesmo período: sobrescreve
        if (closing) this.removeFilesForPeriod(closing, file.name);

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
        rec.saldoTotal = this.extractSaldoTotal(text);
        rec.cacheVer = 9;
        rec.fromUpload = true;

        this.cloudSyncing = true;
        this.uploadProgress = `Salvando ${i + 1}/${picked.length} no Firebase...`;
        this.render();
        try {
          const up = await this.uploadPdfToFirebase(file, this.companyId, closing || "sem-periodo");
          rec.pdfUrl = up.url || "";
          rec.pdfPath = up.path || "";
          await this.savePeriodToFirebase(rec, this.companyId);
        } catch (cloudErr) {
          console.warn("[Participacoes] Falha ao salvar no Firebase:", cloudErr);
          this.hint = "Dados lidos neste navegador; falhou o envio ao Firebase: " + (cloudErr && cloudErr.message ? cloudErr.message : cloudErr);
        }
        this.cloudSyncing = false;
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

  async ensureExcelJS() {
    if (window.ExcelJS) return window.ExcelJS;
    if (window.InvestimentoApp && typeof InvestimentoApp.ensureExcelJS === "function") {
      return InvestimentoApp.ensureExcelJS();
    }
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Falha ao carregar ExcelJS"));
      document.head.appendChild(s);
    });
    return window.ExcelJS;
  },

  excelSheetName(companyId, used) {
    const usual = String(this.companyLabel(companyId) || "").replace(/[:\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim();
    let base = `${companyId}-${usual || "EMPRESA"}`;
    if (base.length > 31) base = base.slice(0, 31);
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suf = `-${n++}`;
      name = (base.slice(0, Math.max(1, 31 - suf.length)) + suf).slice(0, 31);
    }
    used.add(name.toLowerCase());
    return name;
  },

  monthShort(closing) {
    const [y, m] = String(closing || "").split("-");
    if (!y || !m) return closing || "";
    const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `${names[Number(m) - 1]}/${y}`;
  },

  fillParticipacoesSheet(ws, opts) {
    const Inv = window.InvestimentoApp;
    const paint = Inv && typeof Inv.excelPaint === "function"
      ? (cell, o) => Inv.excelPaint(cell, o)
      : (cell, o) => {
          if (o.font) cell.font = Object.assign({ name: "Calibri", size: 9 }, o.font);
          if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
          if (o.align) cell.alignment = o.align;
          if (o.numFmt) cell.numFmt = o.numFmt;
          if (o.border) {
            const s = { style: "thin", color: { argb: "FFE2E8F0" } };
            cell.border = { top: s, bottom: s, left: s, right: s };
          }
        };
    const moneyFmt = "#,##0.00";
    const months = opts.months || [];
    const creditors = opts.creditors || [];
    const companyLabel = opts.companyLabel || "";
    const subtitle = opts.subtitle || "";

    ws.properties.showGridLines = false;
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", activeCell: "B5", showGridLines: false }];
    ws.columns = [{ width: 42 }, ...months.map(() => ({ width: 14 })), { width: 14 }];

    ws.mergeCells(1, 1, 2, 1);
    ws.getRow(1).height = 22;
    ws.getRow(2).height = 18;
    const title = ws.getCell("A1");
    title.value = {
      richText: [
        { font: { name: "Calibri", size: 13, bold: true, color: { argb: "FF0F172A" } }, text: "Prestação de Contas — DESPESAS PAGAS\n" },
        { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: `${companyLabel}${subtitle ? " · " + subtitle : ""}` }
      ]
    };
    paint(title, { fill: "FFFFFFFF", align: { vertical: "middle", horizontal: "left", wrapText: true } });

    const head = ws.getRow(4);
    head.height = 20;
    const heads = ["Credor", ...months.map((m) => this.monthShort(m)), "Total"];
    heads.forEach((h, i) => {
      const cell = head.getCell(i + 1);
      cell.value = h;
      paint(cell, {
        fill: "FF105436",
        font: { bold: true, size: 9, color: { argb: "FFFFFFFF" } },
        align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
        border: true
      });
    });

    let rIdx = 5;
    creditors.forEach((c) => {
      const row = ws.getRow(rIdx++);
      row.getCell(1).value = c.label || c.key;
      paint(row.getCell(1), { border: true, align: { horizontal: "left" } });
      months.forEach((m, i) => {
        const cell = row.getCell(i + 2);
        const v = (c.cells[m] && c.cells[m].total) || 0;
        cell.value = v || null;
        paint(cell, { border: true, align: { horizontal: "right" }, numFmt: moneyFmt });
      });
      const tot = row.getCell(months.length + 2);
      tot.value = c.total || 0;
      paint(tot, {
        border: true,
        align: { horizontal: "right" },
        numFmt: moneyFmt,
        font: { bold: true }
      });
    });

    const totRow = ws.getRow(rIdx);
    totRow.getCell(1).value = "Total";
    paint(totRow.getCell(1), { fill: "FFF1F5F9", font: { bold: true }, border: true });
    months.forEach((m, i) => {
      const sum = creditors.reduce((s, c) => s + ((c.cells[m] && c.cells[m].total) || 0), 0);
      const cell = totRow.getCell(i + 2);
      cell.value = sum;
      paint(cell, { fill: "FFF1F5F9", font: { bold: true }, border: true, align: { horizontal: "right" }, numFmt: moneyFmt });
    });
    const grand = creditors.reduce((s, c) => s + (c.total || 0), 0);
    const gCell = totRow.getCell(months.length + 2);
    gCell.value = grand;
    paint(gCell, { fill: "FFF1F5F9", font: { bold: true }, border: true, align: { horizontal: "right" }, numFmt: moneyFmt });

    // Aba de lançamentos no mesmo sheet abaixo? Better separate sheet - caller adds detail sheet
    return { grand };
  },

  fillLancamentosSheet(ws, rows, companyLabel) {
    const Inv = window.InvestimentoApp;
    const paint = Inv && typeof Inv.excelPaint === "function"
      ? (cell, o) => Inv.excelPaint(cell, o)
      : (cell, o) => {
          if (o.font) cell.font = Object.assign({ name: "Calibri", size: 9 }, o.font);
          if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
          if (o.align) cell.alignment = o.align;
          if (o.numFmt) cell.numFmt = o.numFmt;
          if (o.border) {
            const s = { style: "thin", color: { argb: "FFE2E8F0" } };
            cell.border = { top: s, bottom: s, left: s, right: s };
          }
        };
    ws.properties.showGridLines = false;
    ws.columns = [
      { width: 12 }, { width: 14 }, { width: 36 }, { width: 48 }, { width: 22 }, { width: 14 }, { width: 10 }
    ];
    ws.getCell("A1").value = `Lançamentos — ${companyLabel}`;
    paint(ws.getCell("A1"), { font: { bold: true, size: 12 }, fill: "FFFFFFFF" });
    ws.mergeCells("A1:G1");
    const heads = ["Data", "Período", "Credor", "Detalhe", "Categoria", "Valor", "Doc"];
    const head = ws.getRow(3);
    heads.forEach((h, i) => {
      const cell = head.getCell(i + 1);
      cell.value = h;
      paint(cell, {
        fill: "FF105436",
        font: { bold: true, size: 9, color: { argb: "FFFFFFFF" } },
        border: true
      });
    });
    (rows || []).forEach((r, idx) => {
      const row = ws.getRow(4 + idx);
      row.getCell(1).value = r.date || "";
      row.getCell(2).value = this.periodLabel(r.periodo, r.periodo || "");
      row.getCell(3).value = r.credor || "";
      row.getCell(4).value = r.detalhe || "";
      row.getCell(5).value = r.categoria || "";
      row.getCell(6).value = Number(r.valor) || 0;
      row.getCell(7).value = r.doc || "";
      for (let c = 1; c <= 7; c++) {
        paint(row.getCell(c), {
          border: true,
          align: { horizontal: c === 6 ? "right" : "left", wrapText: c === 4 },
          numFmt: c === 6 ? "#,##0.00" : undefined
        });
      }
    });
  },

  async exportExcel() {
    const scope = this.exportScope || "current";
    let companyIds = [];
    if (scope === "all") {
      const fromCrm = this.crmCompanies().map((c) => String(c.id));
      const withData = new Set();
      try {
        const raw = localStorage.getItem("crm_participacoes_cache_v9") || "{}";
        const all = JSON.parse(raw);
        Object.keys(all || {}).forEach((k) => {
          const cid = String(k).split("|")[0];
          if (cid) withData.add(cid);
        });
      } catch (e) { /* ignore */ }
      if (this.companyId) withData.add(String(this.companyId));
      companyIds = fromCrm.filter((id) => withData.has(id));
      if (!companyIds.length && this.companyId) companyIds = [String(this.companyId)];
    } else {
      if (!this.companyId) {
        alert("Selecione uma empresa para exportar.");
        return;
      }
      companyIds = [String(this.companyId)];
    }

    let ExcelJS;
    try {
      ExcelJS = await this.ensureExcelJS();
    } catch (e) {
      alert("Não foi possível carregar a biblioteca de Excel. Recarregue a página.");
      return;
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    wb.created = new Date();
    const usedNames = new Set();
    const currentId = String(this.companyId || "");
    const currentFiles = this.files.slice();
    const currentFileName = this.fileName;

    for (const cid of companyIds) {
      if (String(cid) !== currentId) {
        // carrega cache local da outra empresa sem trocar a UI inteira
        const snapFiles = [];
        try {
          const all = JSON.parse(localStorage.getItem("crm_participacoes_cache_v9") || "{}") || {};
          Object.keys(all).forEach((k) => {
            if (!k.startsWith(cid + "|")) return;
            const hit = all[k];
            if (!hit || !hit.expenses) return;
            snapFiles.push({
              name: k.slice(cid.length + 1),
              closing: hit.closing || this.periodFromFileName(k.slice(cid.length + 1)),
              expenses: hit.expenses,
              saldoTotal: hit.saldoTotal,
              cacheVer: 9
            });
          });
        } catch (e) { /* ignore */ }
        if (!snapFiles.length) continue;
        this.files = snapFiles;
        this.fileName = "";
      }

      const mx = this.matrixData();
      if (!mx.creditors.length && !this.filtered().length) {
        if (String(cid) !== currentId) {
          this.files = currentFiles;
          this.fileName = currentFileName;
        }
        continue;
      }
      const label = this.companyLabel(cid) || cid;
      const sheetName = this.excelSheetName(cid, usedNames);
      const ws = wb.addWorksheet(sheetName, { properties: { showGridLines: false } });
      this.fillParticipacoesSheet(ws, {
        months: mx.months,
        creditors: mx.creditors,
        companyLabel: `${cid} — ${label}`,
        subtitle: this.fileName ? this.periodLabel(this.periodKeyOfFile(this.files.find((f) => f.name === this.fileName)), this.fileName) : "Todos os períodos"
      });

      const detailName = this.excelSheetName(cid + "-lanc", usedNames);
      const ws2 = wb.addWorksheet(detailName.slice(0, 31), { properties: { showGridLines: false } });
      this.fillLancamentosSheet(ws2, this.filtered(), `${cid} — ${label}`);

      if (String(cid) !== currentId) {
        this.files = currentFiles;
        this.fileName = currentFileName;
      }
    }

    this.files = currentFiles;
    this.fileName = currentFileName;

    if (!wb.worksheets.length) {
      alert("Não há despesas para exportar nesse escopo.");
      return;
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `prestacao_contas_ellenceo_${stamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  },

  render() {
    const root = document.getElementById("participacoes-root");
    if (!root) return;
    this.refreshCompanyList();
    const crm = this.crmCompany(this.companyId);
    const groups = this.grouped();
    const rows = this.filtered();
    const total = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const selectedFile = this.files.find((f) => f.name === this.fileName);
    const periodTitle = this.fileName
      ? this.periodLabel(selectedFile && selectedFile.closing, this.fileName)
      : (this.files.length ? "Todos os períodos" : "—");
    const coList = this.filteredCompanies();
    const uploadDisabled = !this.companyId;
    const companyTitle = (crm && crm.name) || this.companyLabel(this.companyId) || "Selecione a empresa";
    const companyUsual = this.companyLabel(this.companyId);

    const segBtn = (id, label, icon) => {
      const on = this.groupBy === id;
      return `<button type="button" onclick="ParticipacoesApp.groupBy='${id}';ParticipacoesApp.detail=null;ParticipacoesApp.render()"
        style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid ${on ? "#105436" : "#e2e8f0"};background:${on ? "#105436" : "#fff"};color:${on ? "#fff" : "#334155"};font-size:0.78rem;font-weight:700;cursor:pointer;">
        ${icon ? `<i data-lucide="${icon}" style="width:13px;height:13px;"></i>` : ""}${label}
      </button>`;
    };

    root.innerHTML = `
      <div style="padding:14px 18px 28px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-size:1.2rem;font-weight:800;color:#0f172a;">Prestação de Contas Ellenceo</div>
            <div style="font-size:0.8rem;color:#64748b;margin-top:3px;">DESPESAS PAGAS por empresa e período · PDF salvo no Firebase para consulta</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <select class="form-control" style="width:auto;min-width:160px;font-size:0.8rem;font-weight:600;"
              onchange="ParticipacoesApp.exportScope=this.value">
              <option value="current" ${this.exportScope === "current" ? "selected" : ""}>Excel: empresa atual</option>
              <option value="all" ${this.exportScope === "all" ? "selected" : ""}>Excel: todas (1 aba cada)</option>
            </select>
            <button type="button" class="btn btn-outline" onclick="ParticipacoesApp.exportExcel()" ${!this.companyId && this.exportScope === "current" ? "disabled" : ""}
              style="display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="file-spreadsheet" style="width:15px;"></i> Exportar Excel
            </button>
            <label class="btn btn-secondary" style="cursor:${uploadDisabled ? "not-allowed" : "pointer"};opacity:${uploadDisabled ? 0.55 : 1};display:inline-flex;align-items:center;gap:6px;margin:0;">
              <i data-lucide="upload" style="width:15px;"></i> Enviar PDFs
              <input type="file" accept="application/pdf,.pdf" multiple ${uploadDisabled ? "disabled" : ""} style="display:none" onchange="ParticipacoesApp.onUpload(this)">
            </label>
          </div>
        </div>

        <div class="crm-card" style="padding:12px 14px;margin-bottom:12px;position:relative;">
          <div style="display:grid;grid-template-columns:minmax(280px,1.2fr) minmax(220px,1fr);gap:12px;align-items:end;">
            <div>
              <div style="font-size:0.72rem;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Empresa</div>
              <div style="display:flex;gap:8px;align-items:center;">
                <button type="button" class="form-control" onclick="ParticipacoesApp.companyPickerOpen=!ParticipacoesApp.companyPickerOpen;ParticipacoesApp.render()"
                  style="text-align:left;font-weight:700;color:#105436;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${this.companyId ? `${this.esc(String(this.companyId))} — ${this.esc(companyUsual || companyTitle)}` : "Buscar e selecionar empresa..."}
                  </span>
                  <i data-lucide="chevron-down" style="width:16px;flex-shrink:0;"></i>
                </button>
              </div>
              ${this.companyPickerOpen ? `
                <div style="position:absolute;left:14px;right:14px;top:78px;z-index:40;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 12px 30px rgba(15,23,42,0.12);padding:10px;max-width:520px;">
                  <input class="form-control" placeholder="Buscar ID ou nome..." value="${this.esc(this.companyQ)}"
                    oninput="ParticipacoesApp.companyQ=this.value;ParticipacoesApp.render()"
                    style="margin-bottom:8px;font-size:0.82rem;" autofocus>
                  <div style="max-height:260px;overflow:auto;">
                    ${coList.length ? coList.map((c) => {
                      const active = String(c.id) === String(this.companyId);
                      const label = this.companyLabel(c.id) || c.name || "";
                      return `<button type="button" onclick="ParticipacoesApp.onCompany('${String(c.id).replace(/'/g, "\\'")}')"
                        style="display:block;width:100%;text-align:left;padding:8px 10px;border:none;border-radius:8px;background:${active ? "#ecfdf5" : "transparent"};cursor:pointer;margin-bottom:2px;">
                        <div style="font-weight:800;color:#105436;font-size:0.82rem;">${c.id} — ${this.esc(label)}</div>
                        ${label !== c.name && c.name ? `<div style="font-size:0.7rem;color:#94a3b8;">${this.esc(c.name)}</div>` : ""}
                      </button>`;
                    }).join("") : `<div style="padding:10px;color:#64748b;font-size:0.82rem;">Nenhuma empresa encontrada.</div>`}
                  </div>
                </div>` : ""}
            </div>
            <div>
              <div style="font-size:0.72rem;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Buscar nas despesas</div>
              <input class="form-control" placeholder="Credor, detalhe, categoria, data..." value="${this.esc(this.q)}"
                oninput="ParticipacoesApp.q=this.value;ParticipacoesApp.render()" style="font-size:0.82rem;">
            </div>
          </div>
        </div>

        ${this.error ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:0.85rem;">${this.esc(this.error)}</div>` : ""}
        ${this.hint && !this.error ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:0.82rem;">${this.esc(this.hint)}</div>` : ""}
        ${this.uploadProgress ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#ecfdf5;color:#065f46;font-size:0.85rem;">${this.esc(this.uploadProgress)}</div>` : ""}

        ${this.companyId ? `
          <div class="crm-card" style="padding:12px 14px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px;">
              <div>
                <div style="font-weight:800;color:#0f172a;font-size:1.05rem;">${this.esc(companyTitle)}</div>
                <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">
                  Ellenceo · <strong style="text-transform:capitalize;">${this.esc(periodTitle)}</strong>
                  · ${rows.length} despesa(s) · ${this.fmt(total)}
                </div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${this.fileName ? `<a class="btn btn-outline btn-sm" href="${this.fileLink(this.fileName)}" target="_blank" rel="noopener"
                  style="display:inline-flex;align-items:center;gap:5px;"><i data-lucide="file-text" style="width:14px;"></i> Abrir PDF</a>` : ""}
                ${!this.fileName && this.files.some((f) => f.pdfUrl) ? `<span style="font-size:0.75rem;color:#64748b;align-self:center;">PDFs no Firebase · selecione um período</span>` : ""}
              </div>
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
              <button type="button" onclick="ParticipacoesApp.onFileAll()"
                style="padding:6px 11px;border-radius:999px;border:1px solid ${!this.fileName && this.files.length ? "#105436" : "#e2e8f0"};background:${!this.fileName && this.files.length ? "#ecfdf5" : "#fff"};color:${!this.fileName && this.files.length ? "#105436" : "#475569"};font-size:0.75rem;font-weight:700;cursor:pointer;">
                Todos (${this.files.length})
              </button>
              ${this.files.map((f) => {
                const active = f.name === this.fileName;
                const lab = this.periodLabel(f.closing, f.name);
                const cloud = f.pdfUrl ? " · nuvem" : "";
                return `<button type="button" onclick="ParticipacoesApp.onFile(${JSON.stringify(f.name)})"
                  style="padding:6px 11px;border-radius:999px;border:1px solid ${active ? "#1d4ed8" : "#e2e8f0"};background:${active ? "#eff6ff" : "#fff"};color:${active ? "#1d4ed8" : "#475569"};font-size:0.75rem;font-weight:700;cursor:pointer;text-transform:capitalize;"
                  title="${this.esc(f.name)}${cloud}">
                  ${this.esc(lab)}
                </button>`;
              }).join("")}
              ${!this.files.length ? `<span style="font-size:0.8rem;color:#64748b;align-self:center;">Nenhum PDF ainda — use Enviar PDFs.</span>` : ""}
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              ${segBtn("matriz", "Matriz", "table")}
              ${segBtn("periodo", "Por período", "calendar")}
              ${segBtn("credor", "Por credor", "building-2")}
              ${segBtn("categoria", "Por categoria", "tags")}
              ${segBtn("data", "Por data", "clock")}
            </div>
          </div>
        ` : `<div class="crm-card" style="padding:22px;color:#64748b;">Selecione a empresa no topo para ver a matriz e enviar PDFs.</div>`}

        ${this.parsing || this.loading ? `<div class="crm-card" style="padding:20px;text-align:center;color:#64748b;">${this.esc(this.uploadProgress || "Processando...")}</div>` : ""}
        ${!this.parsing && !this.loading && this.companyId && this.groupBy === "matriz" ? this.matrixHtml() : ""}
        ${!this.parsing && !this.loading && this.companyId && this.groupBy !== "matriz" ? groups.map((g) => `
          <div class="crm-card" style="padding:0;margin-bottom:10px;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <strong style="text-transform:capitalize;">${this.esc(g.key)}</strong>
              <span style="font-weight:800;color:#105436;">${this.fmt(g.total)} · ${g.rows.length}</span>
            </div>
            <div style="overflow:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:0.8rem;min-width:720px;">
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
                  ${g.rows.map((r) => `<tr style="border-bottom:1px solid #f1f5f9;">
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
          </div>
        `).join("") : ""}
        ${!this.parsing && !this.loading && this.companyId && this.files.length && !(this.groupBy === "matriz" ? this.matrixData().creditors.length : groups.length) ? `<div class="crm-card" style="padding:18px;color:#64748b;">Nenhuma linha do quadro <strong>DESPESAS PAGAS</strong> identificada neste filtro.</div>` : ""}
        ${this.detailModalHtml()}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
};

window.ParticipacoesApp = ParticipacoesApp;
