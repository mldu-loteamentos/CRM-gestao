const ParticipacoesApp = {
  companies: [],
  files: [],
  expenses: [],
  companyId: "",
  fileName: "",
  groupBy: "credor",
  q: "",
  loading: false,
  error: "",
  pdfUrl: "",
  parsing: false,

  CATEGORIES: [
    { id: "relacionada", name: "Parte relacionada / sócio", test: /ellenco|moura leite|mutuo|mútuo|devolução de mutuo|socio|sócio/i },
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

  crmCompany(id) {
    const list = (window.AppState && AppState.companies) || (window.EmpresasState && EmpresasState.companies) || [];
    return list.find((c) => String(c.id) === String(id)) || null;
  },

  categoryOf(row) {
    const blob = `${row.credor || ""} ${row.detalhe || ""}`;
    return this.CATEGORIES.find((c) => c.test.test(blob)) || this.CATEGORIES[this.CATEGORIES.length - 1];
  },

  init() {
    this.render();
    this.loadCompanies();
  },

  async loadCompanies() {
    this.loading = true;
    this.error = "";
    this.render();
    try {
      const res = await fetch(this.apiUrl("/api/participacoes/companies"));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao listar pastas");
      this.companies = data.companies || [];
      if (!this.companyId && this.companies.length) this.companyId = this.companies[0].companyId;
      if (this.companyId) await this.loadFiles();
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.loading = false;
    this.render();
  },

  async loadFiles() {
    if (!this.companyId) return;
    this.loading = true;
    this.render();
    try {
      const res = await fetch(this.apiUrl("/api/participacoes/files?companyId=" + encodeURIComponent(this.companyId)));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao listar PDFs");
      this.files = data.files || [];
      if (this.fileName && !this.files.some((f) => f.name === this.fileName)) this.fileName = "";
      if (!this.fileName && this.files.length) this.fileName = this.files[0].name;
      if (this.fileName) await this.parseCurrentFile();
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.loading = false;
    this.render();
  },

  fileLink(name) {
    return this.apiUrl("/api/participacoes/file?companyId=" + encodeURIComponent(this.companyId) + "&file=" + encodeURIComponent(name));
  },

  parseMoney(s) {
    const t = String(s || "").trim();
    if (!t) return 0;
    const n = t.replace(/\./g, "").replace(",", ".");
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  },

  parseExpenseLines(text) {
    const raw = String(text || "").replace(/\r/g, "");
    let chunk = raw;
    const start = raw.search(/DESPESAS\s+PAGAS/i);
    if (start >= 0) chunk = raw.slice(start);
    const cut = chunk.search(/\n[=\-]{8,}[\s\S]{0,80}(RECEITAS|RECEBIMENTOS|SALDO|EXTRATO BANC)/i);
    if (cut > 80) chunk = chunk.slice(0, cut);
    const lines = chunk.split("\n").map((l) => l.replace(/\s+$/g, ""));
    const rows = [];
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
        categoriaId: cat.id
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

  async parseCurrentFile() {
    if (!this.companyId || !this.fileName) {
      this.expenses = [];
      this.pdfUrl = "";
      return;
    }
    this.parsing = true;
    this.pdfUrl = this.fileLink(this.fileName);
    this.render();
    try {
      const text = await this.extractPdfText(this.pdfUrl);
      this.expenses = this.parseExpenseLines(text);
      this.persistCache();
    } catch (e) {
      this.error = "Não foi possível ler o PDF: " + (e.message || e);
      this.expenses = [];
    }
    this.parsing = false;
    this.render();
  },

  persistCache() {
    try {
      const key = "crm_participacoes_cache_v1";
      const all = JSON.parse(localStorage.getItem(key) || "{}");
      all[this.companyId + "|" + this.fileName] = {
        at: Date.now(),
        expenses: this.expenses
      };
      localStorage.setItem(key, JSON.stringify(all));
    } catch (e) {}
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
    const byDetail = {};
    rows.forEach((r) => {
      const d = String(r.detalhe || "").toUpperCase().replace(/\s+/g, " ").trim();
      if (d.length < 8) return;
      byDetail[d] = (byDetail[d] || 0) + 1;
    });
    Object.keys(byDetail).forEach((d) => {
      if (byDetail[d] >= 3) out.push({ level: "warn", text: `Mesmo detalhe ${byDetail[d]} vezes neste fechamento: ${d}` });
    });
    return out;
  },

  filtered() {
    const q = String(this.q || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return (this.expenses || []).filter((r) => {
      if (!q) return true;
      const blob = `${r.credor} ${r.detalhe} ${r.categoria} ${r.date}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return blob.includes(q);
    });
  },

  grouped() {
    const rows = this.filtered();
    const keyFn = {
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

  async onCompany(id) {
    this.companyId = id;
    this.fileName = "";
    this.expenses = [];
    await this.loadFiles();
  },

  async onFile(name) {
    this.fileName = name;
    await this.parseCurrentFile();
  },

  async onUpload(input) {
    const file = input && input.files && input.files[0];
    if (!file || !this.companyId) return;
    const fd = new FormData();
    fd.append("companyId", this.companyId);
    fd.append("file", file, file.name);
    this.loading = true;
    this.error = "";
    this.render();
    try {
      const res = await fetch(this.apiUrl("/api/participacoes/upload"), { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no upload");
      this.fileName = data.name || file.name;
      await this.loadFiles();
    } catch (e) {
      this.error = e.message || String(e);
      this.loading = false;
      this.render();
    }
    if (input) input.value = "";
  },

  render() {
    const root = document.getElementById("participacoes-root");
    if (!root) return;
    const crm = this.crmCompany(this.companyId);
    const folder = this.companies.find((c) => String(c.companyId) === String(this.companyId));
    const groups = this.grouped();
    const alerts = this.alerts();
    const total = this.filtered().reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const monthLabel = (() => {
      const f = this.files.find((f) => f.name === this.fileName);
      if (!f || !f.year) return "";
      return new Date(f.year, f.month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    })();

    root.innerHTML = `
      <div style="padding:16px 18px 28px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;">
          <div>
            <div style="font-size:1.15rem;font-weight:800;color:#0f172a;">Participações — Prestação de contas (Ellenco)</div>
            <div style="font-size:0.82rem;color:#64748b;margin-top:4px;">PDFs da pasta do projeto, pasta da empresa = ID do CRM. Análise das despesas pagas para achar cobrança a mais e desvios.</div>
          </div>
          <label class="btn btn-secondary" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
            <i data-lucide="upload" style="width:16px;"></i> Enviar PDF
            <input type="file" accept="application/pdf,.pdf" style="display:none" onchange="ParticipacoesApp.onUpload(this)">
          </label>
        </div>
        ${this.error ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:0.85rem;">${this.esc(this.error)}</div>` : ""}
        <div style="display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:start;">
          <div class="crm-card" style="padding:12px;">
            <div style="font-size:0.72rem;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Empresas na pasta</div>
            ${this.companies.length ? this.companies.map((c) => {
              const info = this.crmCompany(c.companyId);
              const usual = info && (info.nomeUsual || (window.EmpresasState && EmpresasState.customFields[c.companyId] && EmpresasState.customFields[c.companyId].nome_usual));
              const active = String(c.companyId) === String(this.companyId);
              return `<button onclick="ParticipacoesApp.onCompany('${c.companyId}')" style="display:block;width:100%;text-align:left;padding:8px 10px;margin-bottom:6px;border-radius:8px;border:1px solid ${active ? "#105436" : "#e2e8f0"};background:${active ? "#ecfdf5" : "#fff"};cursor:pointer;">
                <div style="font-weight:800;color:#105436;">${c.companyId} — ${this.esc(c.label)}</div>
                <div style="font-size:0.72rem;color:#64748b;">${this.esc((info && info.name) || usual || "ID do cadastro de empresas")}</div>
              </button>`;
            }).join("") : `<div style="font-size:0.82rem;color:#64748b;">Nenhuma pasta no formato <strong>ID - NOME</strong>.</div>`}
            <div style="font-size:0.72rem;font-weight:800;color:#64748b;text-transform:uppercase;margin:14px 0 8px;">Fechamentos</div>
            ${this.files.length ? this.files.map((f) => {
              const active = f.name === this.fileName;
              const lab = f.closing ? f.closing.replace("-", "/") : f.name;
              return `<button onclick="ParticipacoesApp.onFile(${JSON.stringify(f.name)})" style="display:block;width:100%;text-align:left;padding:7px 10px;margin-bottom:4px;border-radius:8px;border:1px solid ${active ? "#1d4ed8" : "#e2e8f0"};background:${active ? "#eff6ff" : "#fff"};cursor:pointer;font-size:0.8rem;">
                <div style="font-weight:700;">${this.esc(lab)}</div>
                <div style="font-size:0.68rem;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(f.name)}</div>
              </button>`;
            }).join("") : `<div style="font-size:0.82rem;color:#64748b;">Nenhum PDF nesta pasta.</div>`}
          </div>
          <div>
            <div class="crm-card" style="padding:14px;margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
                <div>
                  <div style="font-weight:800;color:#0f172a;">${this.esc((crm && crm.name) || (folder && folder.label) || "Selecione a empresa")}</div>
                  <div style="font-size:0.8rem;color:#64748b;">Administrador: Ellenco · Fechamento: <strong>${this.esc(monthLabel || "—")}</strong> · ${this.filtered().length} despesa(s) · ${this.fmt(total)}</div>
                </div>
                ${this.pdfUrl ? `<a class="btn btn-outline" href="${this.pdfUrl}" target="_blank" rel="noopener">Abrir PDF</a>` : ""}
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center;">
                <input class="form-control" placeholder="Filtrar credor, detalhe, categoria..." value="${this.esc(this.q)}" oninput="ParticipacoesApp.q=this.value;ParticipacoesApp.render()" style="max-width:280px;">
                ${["credor", "categoria", "data"].map((g) => `<button class="btn ${this.groupBy === g ? "btn-primary" : "btn-outline"}" onclick="ParticipacoesApp.groupBy='${g}';ParticipacoesApp.render()">${g === "credor" ? "Por credor" : g === "categoria" ? "Por categoria" : "Por data"}</button>`).join("")}
              </div>
            </div>
            ${this.parsing || this.loading ? `<div class="crm-card" style="padding:20px;text-align:center;color:#64748b;">Lendo PDF / pasta...</div>` : ""}
            ${!this.parsing && alerts.length ? `
              <div class="crm-card" style="padding:12px;margin-bottom:12px;border-left:4px solid #ea580c;">
                <div style="font-weight:800;color:#9a3412;margin-bottom:8px;">Pontos de atenção (${alerts.length})</div>
                ${alerts.slice(0, 12).map((a) => `<div style="font-size:0.8rem;margin-bottom:6px;color:${a.level === "danger" ? "#991b1b" : "#9a3412"};">• ${this.esc(a.text)}</div>`).join("")}
              </div>` : ""}
            ${groups.map((g) => `
              <div class="crm-card" style="padding:0;margin-bottom:10px;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                  <strong>${this.esc(g.key)}</strong>
                  <span style="font-weight:800;color:#105436;">${this.fmt(g.total)} · ${g.rows.length}</span>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                  <thead>
                    <tr style="background:#105436;color:#fff;">
                      <th style="text-align:left;padding:6px 10px;">Data</th>
                      <th style="text-align:left;padding:6px 10px;">Credor</th>
                      <th style="text-align:left;padding:6px 10px;">Detalhe</th>
                      <th style="text-align:left;padding:6px 10px;">Categoria</th>
                      <th style="text-align:right;padding:6px 10px;">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${g.rows.map((r) => `<tr style="border-bottom:1px solid #f1f5f9;${r.categoriaId === "relacionada" ? "background:#fff7ed;" : ""}">
                      <td style="padding:6px 10px;white-space:nowrap;">${this.esc(r.date)}</td>
                      <td style="padding:6px 10px;">${this.esc(r.credor)}</td>
                      <td style="padding:6px 10px;">${this.esc(r.detalhe || "—")}</td>
                      <td style="padding:6px 10px;">${this.esc(r.categoria)}</td>
                      <td style="padding:6px 10px;text-align:right;font-weight:700;">${r.valor ? this.fmt(r.valor) : "—"}</td>
                    </tr>`).join("")}
                  </tbody>
                </table>
              </div>
            `).join("")}
            ${!this.parsing && this.fileName && !groups.length ? `<div class="crm-card" style="padding:18px;color:#64748b;">Nenhuma linha de despesa paga identificada neste PDF. Confira se a página “DESPESAS PAGAS” está em texto (não só imagem).</div>` : ""}
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
};

window.ParticipacoesApp = ParticipacoesApp;
