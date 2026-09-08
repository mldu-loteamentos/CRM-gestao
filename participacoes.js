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
    const ym = String(name || "").match(/(\d{4})[_-](\d{2})/);
    if (ym) return `${ym[1]}-${ym[2]}`;
    return "";
  },

  periodLabel(closing, fallback) {
    if (!closing) return fallback || "Sem período";
    const [y, m] = String(closing).split("-");
    if (!y || !m) return closing;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
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

  parseExpenseLines(text, meta) {
    const raw = String(text || "").replace(/\r/g, "");
    let chunk = raw;
    const start = raw.search(/DESPESAS\s+PAGAS/i);
    if (start >= 0) chunk = raw.slice(start);
    const cut = chunk.search(/\n[=\-]{8,}[\s\S]{0,80}(RECEITAS|RECEBIMENTOS|SALDO|EXTRATO BANC)/i);
    if (cut > 80) chunk = chunk.slice(0, cut);
    const lines = chunk.split("\n").map((l) => l.replace(/\s+$/g, ""));
    const rows = [];
    const periodo = (meta && meta.closing) || "";
    const sourceFile = (meta && meta.name) || "";
    lines.forEach((line) => {
      const m = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
      if (!m) return;
      const date = m[1];
      let rest = m[2].trim();
      let valor = 0;
      const money = rest.match(/([\d.]+,\d{2})\s*$/);
      if (money) {
        valor = this.parseMoney(money[1]);
        rest = rest.slice(0, rest.length - money[1].length).trim();
      }
      let credor = rest;
      let detalhe = "";
      const gap = rest.match(/^(.{3,90}?)\s{2,}(.+)$/);
      if (gap) {
        credor = gap[1].trim();
        detalhe = gap[2].trim();
      } else {
        const parts = rest.split(/\s{2,}/);
        if (parts.length >= 2) {
          credor = parts[0].trim();
          detalhe = parts.slice(1).join(" ").trim();
        }
      }
      if (!credor && detalhe) credor = "(sem credor)";
      const cat = this.categoryOf({ credor, detalhe });
      rows.push({
        date,
        iso: date.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1"),
        credor: credor || "(sem credor)",
        detalhe,
        valor,
        categoria: cat.name,
        categoriaId: cat.id,
        periodo,
        sourceFile
      });
    });
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
        byY[y] = (byY[y] || "") + (it.str || "") + " ";
      });
      const ys = Object.keys(byY).map(Number).sort((a, b) => b - a);
      pages.push(ys.map((y) => byY[y].replace(/\s+/g, " ").trim()).join("\n"));
    }
    return pages.join("\n");
  },

  async ensureFileParsed(fileRec) {
    if (!fileRec) return;
    if (Array.isArray(fileRec.expenses)) return;
    const url = this.fileLink(fileRec.name);
    const text = await this.extractPdfText(url);
    fileRec.expenses = this.parseExpenseLines(text, fileRec);
    this.persistCache(fileRec);
  },

  persistCache(fileRec) {
    try {
      const key = "crm_participacoes_cache_v2";
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
      const key = "crm_participacoes_cache_v2";
      const all = JSON.parse(localStorage.getItem(key) || "{}");
      Object.keys(all).forEach((k) => {
        if (!k.startsWith(String(this.companyId) + "|")) return;
        const name = k.slice(String(this.companyId).length + 1);
        const hit = all[k];
        if (!hit || !Array.isArray(hit.expenses)) return;
        let rec = this.files.find((f) => f.name === name);
        if (!rec) {
          rec = {
            name,
            closing: hit.closing || this.periodFromFileName(name),
            expenses: hit.expenses,
            fromCache: true
          };
          this.files.push(rec);
        } else if (!rec.expenses) {
          rec.expenses = hit.expenses;
        }
      });
    } catch (e) {}
  },

  allExpenses() {
    const list = [];
    this.files.forEach((f) => {
      (f.expenses || []).forEach((r) => {
        list.push(Object.assign({}, r, {
          periodo: r.periodo || f.closing || this.periodFromFileName(f.name),
          sourceFile: r.sourceFile || f.name
        }));
      });
    });
    return list;
  },

  activeExpenses() {
    if (this.fileName) {
      const f = this.files.find((x) => x.name === this.fileName);
      return (f && f.expenses) ? f.expenses.map((r) => Object.assign({}, r, {
        periodo: r.periodo || (f && f.closing) || "",
        sourceFile: r.sourceFile || (f && f.name) || ""
      })) : [];
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
      byCredor[r.credor] = byCredor[r.credor] || [];
      byCredor[r.credor].push(r);
    });
    Object.keys(byCredor).forEach((credor) => {
      const list = byCredor[credor];
      if (list.length < 3) return;
      const vals = list.map((r) => r.valor).filter((v) => v > 0).sort((a, b) => a - b);
      if (vals.length < 3) return;
      const med = vals[Math.floor(vals.length / 2)];
      list.forEach((r) => {
        if (med > 0 && r.valor > med * 2.5) {
          out.push({ level: "danger", text: `Valor acima do padrão de ${credor}: ${this.fmt(r.valor)} em ${r.date} (mediana ${this.fmt(med)})` });
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
      credor: (r) => r.credor,
      categoria: (r) => r.categoria,
      data: (r) => r.date
    }[this.groupBy] || ((r) => r.credor);
    const map = {};
    rows.forEach((r) => {
      const k = keyFn(r) || "(em branco)";
      if (!map[k]) map[k] = { key: k, rows: [], total: 0 };
      map[k].rows.push(r);
      map[k].total += Number(r.valor) || 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  },

  /** Matriz: linhas = credor, colunas = mês (YYYY-MM), células = soma + lançamentos. */
  matrixData() {
    const rows = this.filtered();
    const monthSet = new Set();
    const byCredor = {};
    rows.forEach((r) => {
      const periodo = r.periodo || this.periodFromFileName(r.sourceFile) || "sem-periodo";
      const credor = r.credor || "(sem credor)";
      monthSet.add(periodo);
      if (!byCredor[credor]) byCredor[credor] = { credor, cells: {}, total: 0 };
      if (!byCredor[credor].cells[periodo]) byCredor[credor].cells[periodo] = { total: 0, rows: [] };
      const cell = byCredor[credor].cells[periodo];
      cell.total += Number(r.valor) || 0;
      cell.rows.push(r);
      byCredor[credor].total += Number(r.valor) || 0;
    });
    const months = Array.from(monthSet).sort((a, b) => String(a).localeCompare(String(b)));
    const creditors = Object.values(byCredor).sort((a, b) => b.total - a.total || a.credor.localeCompare(b.credor, "pt-BR"));
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
    this.detail = { credor: String(credor || ""), periodo: String(periodo || "") };
    this.render();
  },

  closeMatrixDetail() {
    this.detail = null;
    this.render();
  },

  detailRows() {
    if (!this.detail) return [];
    const { credor, periodo } = this.detail;
    return this.filtered().filter((r) => {
      const p = r.periodo || this.periodFromFileName(r.sourceFile) || "sem-periodo";
      return String(r.credor || "(sem credor)") === String(credor) && String(p) === String(periodo);
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
    this.render();
  },

  async onFile(name) {
    this.fileName = name;
    const rec = this.files.find((f) => f.name === name);
    if (!rec) return;
    this.parsing = true;
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
    this.render();
    try {
      for (const f of this.files) {
        await this.ensureFileParsed(f);
      }
    } catch (e) {
      this.error = "Não foi possível ler um dos PDFs: " + (e.message || e);
    }
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
