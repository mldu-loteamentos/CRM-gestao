const RepactuacaoLoteApp = {
  BCB_MAP: {
    IPCA: 433,
    IGPM: 189,
    "IGP-M": 189,
    "IPC-DI": 191,
    IPCDI: 191,
    INCC: 7456,
    "INCC-M": 7456,
    "INCC-DI": 192
  },

  state: {
    inited: false,
    fileName: "",
    loading: false,
    stop: false,
    period: null,
    adjustDate: null,
    adjustMonth: "", // YYYY-MM escolhido pelo operador
    firstBusinessDay: null,
    empresa: "",
    rows: [],
    indexers: [],
    ratesByIndexer: {},
    filter: "all",
    previewLoading: false,
    previewRows: [],
    previewError: ""
  },

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  money(v) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  pct(v) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + "%";
  },

  fmtDate(iso) {
    if (!iso) return "—";
    const p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return String(iso);
    return `${p[2]}/${p[1]}/${p[0]}`;
  },

  /** YYYY-MM → MM/YYYY */
  fmtYm(ym) {
    const s = String(ym || "").slice(0, 7);
    const p = s.split("-");
    if (p.length !== 2) return s || "—";
    return `${p[1]}/${p[0]}`;
  },

  parseBRNumber(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const s = String(v).trim();
    if (!s || s === "-") return null;
    if (s.includes(",") && s.includes(".")) return parseFloat(s.replace(/\./g, "").replace(",", "."));
    if (s.includes(",")) return parseFloat(s.replace(",", "."));
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  },

  parseDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date && !isNaN(v.getTime())) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, "0");
      const d = String(v.getDate()).padStart(2, "0");
      if (y < 1950) return this.excelSerialToIso(v);
      return `${y}-${m}-${d}`;
    }
    if (typeof v === "number" && v > 20000 && v < 80000) return this.excelSerialToIso(v);
    const s = String(v).trim();
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
  },

  excelSerialToIso(n) {
    const serial = n instanceof Date ? null : Number(n);
    const utc = serial != null
      ? new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
      : n;
    return utc.toISOString().slice(0, 10);
  },

  holidaySet(year) {
    const pad = (n) => String(n).padStart(2, "0");
    const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
    const set = new Set([
      ymd(year, 1, 1), ymd(year, 4, 21), ymd(year, 5, 1), ymd(year, 9, 7),
      ymd(year, 10, 12), ymd(year, 11, 2), ymd(year, 11, 15), ymd(year, 11, 20), ymd(year, 12, 25)
    ]);
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    const add = (delta) => {
      const dt = new Date(Date.UTC(year, month - 1, day + delta));
      return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    };
    set.add(add(-48));
    set.add(add(-47));
    set.add(add(-2));
    set.add(add(60));
    return set;
  },

  firstBusinessDay(year, month1) {
    const holidays = this.holidaySet(year);
    for (let d = 1; d <= 10; d++) {
      const dt = new Date(Date.UTC(year, month1 - 1, d));
      const wd = dt.getUTCDay();
      const iso = dt.toISOString().slice(0, 10);
      if (wd !== 0 && wd !== 6 && !holidays.has(iso)) return iso;
    }
    return `${year}-${String(month1).padStart(2, "0")}-01`;
  },

  addMonths(year, month0, delta) {
    let m = month0 + Number(delta || 0);
    let y = year;
    while (m < 0) { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }
    return { year: y, month: m };
  },

  expectedBaseIso(adjustIso, retro) {
    const [y, mo] = String(adjustIso).split("-").map(Number);
    const t = this.addMonths(y, mo - 1, Number(retro || 0));
    return `${t.year}-${String(t.month + 1).padStart(2, "0")}-01`;
  },

  sameMonth(a, b) {
    return a && b && String(a).slice(0, 7) === String(b).slice(0, 7);
  },

  accumulated12(rates, baseIso) {
    const [y, m] = String(baseIso).split("-").map(Number);
    let acc = 1;
    const missing = [];
    const months = [];
    for (let i = 0; i < 12; i++) {
      let mm = m - i;
      let yy = y;
      while (mm <= 0) { mm += 12; yy -= 1; }
      const k = `${yy}-${String(mm).padStart(2, "0")}`;
      const rate = rates[k];
      months.push({ k, rate });
      if (rate == null) missing.push(k);
      else acc *= (1 + Number(rate) / 100);
    }
    return { factor: acc, pct: (acc - 1) * 100, missing, months: months.reverse() };
  },

  init() {
    try {
      this.state.inited = true;
      if (!this.state.adjustMonth) {
        const d = new Date();
        // Próximo mês civil como default (ciclo típico de repactuação)
        const nm = this.addMonths(d.getFullYear(), d.getMonth(), 1);
        this.state.adjustMonth = `${nm.year}-${String(nm.month + 1).padStart(2, "0")}`;
        this.applyAdjustMonthToState(this.state.adjustMonth);
      }
      this.render();
      this.loadIndexerPreview();
    } catch (e) {
      console.error("[Repactuação lote] init", e);
      const root = document.getElementById("repactuacao-lote-root");
      if (root) root.innerHTML = `<p style="padding:24px;color:#b91c1c;">Não foi possível montar a tela de Repactuação. Recarregue a página.</p>`;
    }
  },

  applyAdjustMonthToState(ym) {
    const m = String(ym || "").trim();
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    const [yy, mm] = m.split("-").map(Number);
    this.state.adjustMonth = m;
    this.state.adjustDate = `${m}-01`;
    this.state.firstBusinessDay = this.firstBusinessDay(yy, mm);
    this.state.period = {
      start: this.state.adjustDate,
      end: this.state.firstBusinessDay,
      label: `${String(mm).padStart(2, "0")}/${yy}`
    };
  },

  setAdjustMonth(ym) {
    this.applyAdjustMonthToState(ym);
    if (this.state.rows.length) {
      this.applyIndexerLogic();
      this.conferirSienge();
    }
    this.render();
    this.loadIndexerPreview();
  },

  monthLabel(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "—";
    const [y, m] = ym.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, 1));
    const name = dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    return name.charAt(0).toUpperCase() + name.slice(1);
  },

  isPreviewIndexer(idx) {
    if (!idx || !idx.name) return false;
    const n = String(idx.name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    if (n === "REAL" || n === "0" || n.startsWith("0 -") || /NAO UTILIZAR|NÃO UTILIZAR/.test(n)) return false;
    return !!this.bcbCodeForName(idx.name);
  },

  async loadIndexerPreview() {
    const ym = this.state.adjustMonth;
    if (!ym) return;
    const gen = (this.state._previewGen = (this.state._previewGen || 0) + 1);
    this.state.previewLoading = true;
    this.state.previewError = "";
    this.renderPreviewOnly();
    try {
      await this.ensureIndexers();
      if (gen !== this.state._previewGen) return;
      const adjustIso = `${ym}-01`;
      const list = (this.state.indexers || []).filter((i) => this.isPreviewIndexer(i));
      // Preferir ativos do cadastro de Indexadores, se houver
      let activeNames = null;
      try {
        const saved = localStorage.getItem("crm_indexadores_ativos");
        if (saved) activeNames = new Set(JSON.parse(saved).map((x) => String(x)));
      } catch (e) {}
      const pool = activeNames && activeNames.size
        ? list.filter((i) => activeNames.has(i.name))
        : list;
      const use = (pool.length ? pool : list).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));

      const rows = [];
      for (const idx of use) {
        if (gen !== this.state._previewGen) return;
        const retro = idx.revenueRetroactivity != null ? Number(idx.revenueRetroactivity) : 0;
        const expectedBase = this.expectedBaseIso(adjustIso, retro);
        const rates = await this.ratesForIndexer(idx);
        const acc = this.accumulated12(rates, expectedBase);
        const lastAvail = Object.keys(rates).sort().reverse()[0] || null;
        rows.push({
          id: idx.id,
          name: idx.name,
          retro,
          expectedBase,
          accPct: acc.missing.length === 12 ? null : acc.pct,
          missing: acc.missing,
          complete: acc.missing.length === 0,
          partial: acc.missing.length > 0 && acc.missing.length < 12,
          lastAvail,
          months: acc.months
        });
      }
      if (gen !== this.state._previewGen) return;
      this.state.previewRows = rows;
      this.state.previewLoading = false;
      this.renderPreviewOnly();
    } catch (e) {
      console.error("[Repactuação] prévia indexadores", e);
      if (gen !== this.state._previewGen) return;
      this.state.previewLoading = false;
      this.state.previewError = e.message || String(e);
      this.renderPreviewOnly();
    }
  },

  renderPreviewOnly() {
    const el = document.getElementById("repac-indexer-preview");
    if (!el) {
      // Painel ainda não montado — próximo render() cobre
      return;
    }
    el.outerHTML = this.previewHtml();
    if (window.lucide) window.lucide.createIcons();
  },

  previewHtml() {
    const ym = this.state.adjustMonth;
    const fbd = this.state.firstBusinessDay;
    const loading = this.state.previewLoading;
    const err = this.state.previewError;
    const rows = this.state.previewRows || [];
    let body = "";
    if (loading) {
      body = `<p style="margin:0;color:#64748b;font-size:0.85rem;">Consultando BCB e cadastro Sienge dos indexadores…</p>`;
    } else if (err) {
      body = `<p style="margin:0;color:#b91c1c;font-size:0.85rem;">Falha na prévia: ${this.esc(err)}</p>`;
    } else if (!rows.length) {
      body = `<p style="margin:0;color:#64748b;font-size:0.85rem;">Nenhum indexador de correção encontrado no Sienge.</p>`;
    } else {
      body = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
          ${rows.map((r) => {
            const missingLabel = (r.missing || []).map((k) => this.fmtYm(k)).join(", ");
            const used = 12 - (r.missing || []).length;
            let tone = "#64748b";
            let toneBg = "#f8fafc";
            let toneBorder = "#e2e8f0";
            let statusTitle = "Sem dados";
            let statusSub = "Nenhuma série BCB no período";
            let pctHtml = `<span style="font-size:1.35rem;font-weight:800;color:#94a3b8;letter-spacing:-0.02em;">—</span>`;
            if (r.complete) {
              tone = "#15803d";
              toneBg = "#f0fdf4";
              toneBorder = "#bbf7d0";
              statusTitle = "Completo";
              statusSub = "12/12 meses BCB";
              pctHtml = `<span style="font-size:1.45rem;font-weight:800;color:${tone};letter-spacing:-0.02em;">${this.esc(this.pct(r.accPct))}</span>`;
            } else if (r.partial) {
              tone = "#c2410c";
              toneBg = "#fff7ed";
              toneBorder = "#fed7aa";
              statusTitle = `Parcial · faltam ${r.missing.length}`;
              statusSub = missingLabel
                ? `Valor com ${used}/12 · falta ${missingLabel}`
                : `Valor com ${used}/12 meses`;
              pctHtml = `
                <div style="display:flex;flex-direction:column;gap:2px;">
                  <span style="font-size:1.45rem;font-weight:800;color:${tone};letter-spacing:-0.02em;">${this.esc(this.pct(r.accPct))}</span>
                  <span style="font-size:0.72rem;font-weight:700;color:${tone};text-transform:uppercase;letter-spacing:0.04em;">parcial</span>
                </div>`;
            }
            return `
              <div style="border:1px solid ${toneBorder};background:${toneBg};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                  <div>
                    <div style="font-size:1rem;font-weight:800;color:#14532d;">${this.esc(r.name)}</div>
                    <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">ID ${this.esc(r.id)} · retro ${r.retro}</div>
                  </div>
                  <span style="font-size:0.7rem;font-weight:700;color:${tone};background:#fff;border:1px solid ${toneBorder};border-radius:6px;padding:3px 8px;white-space:nowrap;">
                    ${this.esc(statusTitle)}
                  </span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;">
                  <div>
                    <div style="font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">% acum. 12 meses</div>
                    ${pctHtml}
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Mês base BCB</div>
                    <div style="font-size:0.95rem;font-weight:700;color:#334155;">${this.esc(this.fmtYm(String(r.expectedBase || "").slice(0, 7)))}</div>
                  </div>
                </div>
                <div style="font-size:0.78rem;color:${tone};font-weight:600;line-height:1.35;">
                  ${this.esc(statusSub)}
                </div>
              </div>`;
          }).join("")}
        </div>
      `;
    }
    return `
      <div id="repac-indexer-preview" class="search-filter-panel" style="margin-bottom:16px;border:1px solid #d1fae5;background:linear-gradient(180deg,#f0fdf4 0%,#fff 42%);">
        <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;margin-bottom:16px;">
          <div class="form-group" style="margin:0;min-width:200px;">
            <label for="repac-adjust-month" style="font-size:0.75rem;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.03em;">Mês da repactuação</label>
            <input type="month" id="repac-adjust-month" class="form-control" value="${this.esc(ym || "")}"
              onchange="RepactuacaoLoteApp.setAdjustMonth(this.value)"
              style="max-width:200px;font-weight:600;">
          </div>
          <div style="flex:1;min-width:180px;">
            <div style="font-size:0.95rem;font-weight:800;color:#14532d;">${this.esc(this.monthLabel(ym))}</div>
            <div style="font-size:0.78rem;color:#64748b;">
              1º dia útil <strong style="color:#334155;">${this.esc(this.fmtDate(fbd))}</strong>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" style="padding:8px 12px;"
            onclick="RepactuacaoLoteApp.loadIndexerPreview()" ${loading ? "disabled" : ""}>
            <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Atualizar prévia
          </button>
        </div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <h3 style="margin:0;font-size:0.85rem;color:#166534;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;">
            Prévia dos indexadores
          </h3>
          <span style="font-size:0.72rem;color:#94a3b8;">Data base = mês + retro Sienge · % BCB 12m</span>
        </div>
        ${body}
      </div>
    `;
  },

  bindUpload() {
    const dz = document.getElementById("repac-dropzone");
    const input = document.getElementById("repac-input-excel");
    if (!input) return;
    if (dz) {
      dz.onclick = () => input.click();
      ["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
        dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
      });
      dz.addEventListener("drop", (e) => {
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f && /\.xlsx?$/i.test(f.name)) this.loadFile(f);
      });
    }
    input.onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) this.loadFile(f);
    };
  },

  async loadFile(file) {
    this.state.fileName = file.name;
    this.state.loading = true;
    this.state.stop = false;
    this.render();
    try {
      const buf = await file.arrayBuffer();
      if (typeof XLSX === "undefined") throw new Error("Biblioteca Excel indisponível.");
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
      this.parseMatrix(matrix);
      await this.ensureIndexers();
      this.applyIndexerLogic();
      this.render();
      this.conferirSienge();
    } catch (e) {
      console.error("[Repactuação lote]", e);
      alert("Erro ao ler a planilha: " + (e.message || e));
      this.state.loading = false;
      this.render();
    }
  },

  normHeader(c) {
    return String(c || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  },

  findColMap(matrix) {
    for (let r = 0; r < Math.min(matrix.length, 40); r++) {
      const row = (matrix[r] || []).map((c) => this.normHeader(c));
      if (!row.some((c) => c === "cliente" || c === "parcela" || c === "titulo")) continue;
      const map = { headerRow: r };
      row.forEach((c, i) => {
        if ((c === "cliente" || c.startsWith("cliente")) && map.cliente == null) map.cliente = i;
        if (c === "documento" && map.documento == null) map.documento = i;
        if ((c === "titulo" || c === "titulo a receber" || c === "nr titulo") && map.titulo == null) map.titulo = i;
        if (c === "parcela" && map.parcela == null) map.parcela = i;
        if ((c === "em aberto" || c.includes("em aberto")) && map.emAberto == null) map.emAberto = i;
        if ((c === "ultimo" || c.includes("ultimo")) && map.ultimo == null) map.ultimo = i;
        if ((c === "vencimento" || c === "dt vencimento" || c === "data vencimento") && map.vencimento == null) map.vencimento = i;
        if ((c.includes("data base") || c === "dt base" || c === "base") && map.baseDate == null) map.baseDate = i;
        if ((c === "indexador" || c === "id indexador" || c === "id do indexador") && map.indexerId == null) map.indexerId = i;
        if ((c === "centro" || c.includes("centro de custo")) && map.cc == null) map.cc = i;
      });
      const dataCols = [];
      row.forEach((c, i) => { if (c === "data") dataCols.push(i); });
      if (map.vencimento == null) {
        if (dataCols[0] != null && map.parcela != null && dataCols[0] > map.parcela) map.vencimento = dataCols[0];
        else if (dataCols[0] != null) map.refDate = dataCols[0];
        if (dataCols[1] != null) map.vencimento = map.vencimento != null ? map.vencimento : dataCols[1];
      }
      if (map.indexerId == null) {
        const idIdx = row.findIndex((c, i) => c === "id" && (map.parcela == null || i > map.parcela));
        if (idIdx >= 0) map.indexerId = idIdx;
      }
      if (map.baseDate == null && map.indexerId != null) {
        const afterId = dataCols.find((i) => i > map.indexerId);
        if (afterId != null) map.baseDate = afterId;
      }
      const valorIdx = row.lastIndexOf("valor");
      if (valorIdx >= 0) map.valor = valorIdx;
      if (map.parcela != null && map.valor != null) return map;
    }
    return {
      headerRow: -1,
      cliente: 2, documento: 3, titulo: 6, ultimo: 7, emAberto: 9,
      parcela: 13, vencimento: 15, indexerId: 18, baseDate: 19, valor: 23
    };
  },

  parseMatrix(matrix) {
    const col = this.findColMap(matrix);
    let empresa = "";
    let cc = "";
    let period = null;
    let cliente = "";
    let documento = "";
    let titulo = "";
    const rows = [];

    const blob = (row) => (row || []).map((c) => String(c || "")).join(" ");

    matrix.forEach((row, idx) => {
      if (!row || idx === col.headerRow) return;
      const text = blob(row);
      const emp = text.match(/Empresa:\s*(.+?)(?:Centro|$)/i);
      if (emp) empresa = emp[1].trim();
      const ccM = text.match(/Centro de custo:\s*(.+?)(?:Per[ií]odo|$)/i);
      if (ccM) cc = ccM[1].trim();
      const per = text.match(/(\d{2}\/\d{2}\/\d{4})\s*A\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (per) {
        period = { start: this.parseDate(per[1]), end: this.parseDate(per[2]) };
      }
      if (/total do centro|em aberto at[eé]/i.test(text) && !this.parseBRNumber(row[col.parcela])) return;

      const parcela = this.parseBRNumber(row[col.parcela]);
      const indexerId = row[col.indexerId] != null && String(row[col.indexerId]).trim() !== ""
        ? String(row[col.indexerId]).trim().replace(/\.0$/, "")
        : "";
      const valor = this.parseBRNumber(row[col.valor]);
      const nome = String(row[col.cliente] || "").trim();
      const doc = String(row[col.documento] || "").trim();
      const rawTit = row[col.titulo];
      const nTit = this.parseBRNumber(rawTit);
      const titNum = nTit != null ? String(Math.round(nTit)) : String(rawTit || "").trim();

      if (nome && !/empresa:|centro de custo|títulos para/i.test(nome)) cliente = nome;
      if (doc) documento = doc;
      if (titNum) titulo = titNum.replace(/\.0$/, "");

      const isInstallment = parcela != null && parcela > 0 && Number.isInteger(parcela) && valor != null && indexerId;
      if (!isInstallment) return;

      const rowCc = col.cc != null ? String(row[col.cc] || "").trim() : "";
      rows.push({
        empresa,
        cc: rowCc || cc,
        cliente, documento, titulo,
        parcela: Math.round(parcela),
        vencimento: this.parseDate(row[col.vencimento]),
        indexerId,
        excelBase: this.parseDate(row[col.baseDate]),
        excelValor: valor,
        emAberto: this.parseBRNumber(row[col.emAberto])
      });
    });

    this.state.empresa = empresa;
    // Preferir mês escolhido pelo operador; planilha só sugere se ainda não houver escolha
    if (this.state.adjustMonth && /^\d{4}-\d{2}$/.test(this.state.adjustMonth)) {
      this.applyAdjustMonthToState(this.state.adjustMonth);
    } else if (period && period.start) {
      const [yy, mm] = period.start.split("-").map(Number);
      this.state.adjustMonth = `${yy}-${String(mm).padStart(2, "0")}`;
      this.applyAdjustMonthToState(this.state.adjustMonth);
    } else {
      const d = new Date();
      const nm = this.addMonths(d.getFullYear(), d.getMonth(), 1);
      this.state.adjustMonth = `${nm.year}-${String(nm.month + 1).padStart(2, "0")}`;
      this.applyAdjustMonthToState(this.state.adjustMonth);
    }
    this.state.period = this.state.period || period;
    this.state.rows = rows;
  },

  async ensureIndexers() {
    if (this.state.indexers.length) return;
    const fn = window.siengeFetchWithRetry;
    let list = [];
    if (typeof fn === "function") {
      const res = await fn("/indexers?limit=200");
      list = (res && res.results) || [];
    } else if (window.IndexadoresState && IndexadoresState.allSiengeIndexers && IndexadoresState.allSiengeIndexers.length) {
      list = IndexadoresState.allSiengeIndexers;
    }
    this.state.indexers = list;
    if (window.IndexadoresState) IndexadoresState.allSiengeIndexers = list;
  },

  indexerById(id) {
    return (this.state.indexers || []).find((i) => String(i.id) === String(id)) || null;
  },

  bcbCodeForName(name) {
    const u = String(name || "").toUpperCase();
    for (const key of Object.keys(this.BCB_MAP)) {
      if (u === key || u.includes(key)) return this.BCB_MAP[key];
    }
    return null;
  },

  async ratesForIndexer(idx) {
    const name = idx && idx.name;
    if (!name) return {};
    if (this.state.ratesByIndexer[name]) return this.state.ratesByIndexer[name];
    if (window.IndexadoresState && IndexadoresState.bcbData && IndexadoresState.bcbData[name]) {
      const mapped = {};
      IndexadoresState.bcbData[name].forEach((d) => {
        const parts = String(d.data || "").split("/");
        if (parts.length === 3) mapped[`${parts[2]}-${parts[1]}`] = parseFloat(d.valor);
      });
      this.state.ratesByIndexer[name] = mapped;
      return mapped;
    }
    const code = this.bcbCodeForName(name);
    if (!code) return {};
    const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json`);
    if (!res.ok) return {};
    const data = await res.json();
    const mapped = {};
    (data || []).forEach((d) => {
      const parts = String(d.data || "").split("/");
      if (parts.length === 3) mapped[`${parts[2]}-${parts[1]}`] = parseFloat(d.valor);
    });
    this.state.ratesByIndexer[name] = mapped;
    if (window.IndexadoresState) {
      if (!IndexadoresState.bcbData) IndexadoresState.bcbData = {};
      IndexadoresState.bcbData[name] = data;
    }
    return mapped;
  },

  applyIndexerLogic() {
    const adjust = this.state.adjustDate;
    this.state.rows = this.state.rows.map((row) => {
      const idx = this.indexerById(row.indexerId);
      const retro = idx && idx.revenueRetroactivity != null ? Number(idx.revenueRetroactivity) : null;
      const expectedBase = retro != null && adjust ? this.expectedBaseIso(adjust, retro) : null;
      const baseOk = expectedBase && row.excelBase ? this.sameMonth(expectedBase, row.excelBase) : null;
      return {
        ...row,
        indexerName: idx ? idx.name : "—",
        retro,
        expectedBase,
        baseOk,
        accPct: null,
        factor: null,
        siengeValor: null,
        crmProjetado: null,
        valorOk: null,
        accMissing: []
      };
    });
  },

  pickSiengeInstallmentValue(inst) {
    if (!inst) return null;
    const candidates = [
      inst.currentBalance,
      inst.currentValue,
      inst.balanceDue,
      inst.installmentValue,
      inst.originalValue,
      inst.principalValue,
      inst.value,
      inst.correctedValue
    ];
    for (const c of candidates) {
      if (c == null || c === "") continue;
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
    return null;
  },

  findInstallmentForParcela(insts, parcela) {
    const want = Number(parcela);
    if (!Number.isFinite(want)) return null;
    const list = Array.isArray(insts) ? insts : [];
    return list.find((x) => Number(x.installmentNumber ?? x.number) === want)
      || list.find((x) => Number(x.installmentId) === want && (x.installmentNumber == null && x.number == null))
      || null;
  },

  applyTitleInstallments(titulo, insts) {
    this.state.rows = this.state.rows.map((row) => {
      if (String(row.titulo) !== String(titulo)) return row;
      const hit = this.findInstallmentForParcela(insts, row.parcela);
      const cur = this.pickSiengeInstallmentValue(hit);
      const projetado = cur != null && Number.isFinite(cur) && row.factor ? cur * row.factor : null;
      const valorOk = projetado != null && row.excelValor != null
        ? Math.abs(projetado - row.excelValor) <= Math.max(0.05, Math.abs(row.excelValor) * 0.002)
        : null;
      return {
        ...row,
        siengeValor: cur,
        crmProjetado: projetado,
        valorOk,
        vencimento: row.vencimento || (hit && hit.dueDate ? String(hit.dueDate).slice(0, 10) : row.vencimento)
      };
    });
  },

  async conferirSienge() {
    const uniqueIdx = [...new Set(this.state.rows.map((r) => r.indexerId).filter(Boolean))];
    for (const id of uniqueIdx) {
      const idx = this.indexerById(id);
      if (!idx || String(idx.name || "").toUpperCase() === "REAL") continue;
      const rates = await this.ratesForIndexer(idx);
      this.state.rows = this.state.rows.map((row) => {
        if (String(row.indexerId) !== String(id) || !row.expectedBase) return row;
        const acc = this.accumulated12(rates, row.expectedBase);
        return { ...row, accPct: acc.pct, factor: acc.factor, accMissing: acc.missing };
      });
    }
    this.state.loading = false;
    this.render();

    const titles = [...new Set(this.state.rows.map((r) => r.titulo).filter(Boolean))];
    this.state.loading = true;
    this.render();

    const concurrency = 6;
    let done = 0;
    for (let i = 0; i < titles.length; i += concurrency) {
      if (this.state.stop) break;
      const chunk = titles.slice(i, i + concurrency);
      await Promise.all(chunk.map(async (titulo) => {
        if (this.state.stop) return;
        try {
          const insts = await this.fetchInstallments(titulo);
          this.applyTitleInstallments(titulo, insts);
        } catch (e) {
          console.warn("[Repactuação] título", titulo, e);
        } finally {
          done += 1;
          const el = document.getElementById("repac-progress");
          if (el) el.textContent = `Conferindo valores no Sienge ${done}/${titles.length}…`;
        }
      }));
      this.renderTableOnly();
      this.renderKpisOnly();
    }
    this.state.loading = false;
    this.render();
  },

  async fetchInstallments(titulo) {
    const id = String(titulo || "").replace(/^B-/i, "").trim();
    if (!id) return [];

    let list = [];
    try {
      if (window.SiengeApiService && typeof SiengeApiService.getBillInstallments === "function") {
        list = await SiengeApiService.getBillInstallments(id) || [];
      } else if (typeof window.siengeFetchWithRetry === "function") {
        const res = await siengeFetchWithRetry(`/accounts-receivable/receivable-bills/${encodeURIComponent(id)}/installments`);
        list = (res && (res.results || res.data || res.installments)) || (Array.isArray(res) ? res : []);
      }
    } catch (e) {
      console.warn("[Repactuação] installments", id, e);
      list = [];
    }
    if (!Array.isArray(list)) list = [];

    // Fallback: extrato do cliente (mesma fonte da aba Repactuações)
    const hasBalance = list.some((inst) => this.pickSiengeInstallmentValue(inst) != null);
    if ((!list.length || !hasBalance) && typeof window.siengeFetchWithRetry === "function") {
      try {
        const end = this.state.adjustDate || (typeof window.localDateStr === "function" ? window.localDateStr() : new Date().toISOString().slice(0, 10));
        const start = "2000-01-01";
        const q = `/bulk-data/v1/customer-extract-history?startDueDate=${start}&endDueDate=${end}&billReceivableId=${encodeURIComponent(id)}&documentsId=CT&includeRemadeInstallments=true&includeCanceledInstallments=false&includeRevokedInstallments=false&includeRenegotiatedDischarge=false`;
        const json = await siengeFetchWithRetry(q);
        const items = (json && (json.data || json.results || json.items)) || (Array.isArray(json) ? json : []);
        const fromExtract = [];
        (items || []).forEach((item) => {
          (item.installments || []).forEach((inst) => {
            fromExtract.push(inst);
          });
        });
        if (fromExtract.length) list = fromExtract;
      } catch (e2) {
        console.warn("[Repactuação] extract-history", id, e2);
      }
    }
    return list;
  },

  clearFile() {
    if (this.state.loading) {
      this.state.stop = true;
    }
    this.state.fileName = "";
    this.state.rows = [];
    this.state.loading = false;
    this.state.stop = false;
    this.state.filter = "all";
    this.state.empresa = "";
    // Mantém o mês escolhido pelo operador e a prévia dos indexadores
    this.render();
  },

  setFilter(f) {
    this.state.filter = f;
    this.render();
  },

  parar() {
    this.state.stop = true;
  },

  renderKpisOnly() {
    const box = document.getElementById("repac-kpis");
    if (!box || !this.state.rows.length) return;
    const n = this.state.rows.length;
    const baseFail = this.state.rows.filter((r) => r.baseOk === false).length;
    const valFail = this.state.rows.filter((r) => r.valorOk === false).length;
    const ok = this.state.rows.filter((r) => r.baseOk === true && r.valorOk === true).length;
    const missingSienge = this.state.rows.filter((r) => r.siengeValor == null).length;
    box.innerHTML = `
      <div class="est-fin-card"><label>Parcelas</label><strong>${n}</strong></div>
      <div class="est-fin-card is-ok"><label>Bateram</label><strong>${ok}</strong></div>
      <div class="est-fin-card is-warn"><label>Data base divergente</label><strong>${baseFail}</strong></div>
      <div class="est-fin-card is-warn"><label>Valor divergente</label><strong>${valFail}</strong></div>
      <div class="est-fin-card${missingSienge ? " is-warn" : ""}"><label>Sem valor Sienge</label><strong>${missingSienge}</strong></div>
    `;
  },

  filteredRows() {
    const f = this.state.filter;
    if (f === "base") return this.state.rows.filter((r) => r.baseOk === false);
    if (f === "valor") return this.state.rows.filter((r) => r.valorOk === false);
    if (f === "ok") return this.state.rows.filter((r) => r.baseOk !== false && r.valorOk !== false);
    return this.state.rows;
  },

  renderTableOnly() {
    const wrap = document.getElementById("repac-table-wrap");
    if (wrap) wrap.innerHTML = this.tableHtml();
  },

  uploadZoneHtml() {
    const hasFile = !!this.state.fileName;
    if (hasFile) {
      return `
        <div class="repac-file-chip" style="display:inline-flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px;max-width:100%;">
          <i data-lucide="paperclip" style="width:18px;height:18px;color:var(--color-primary);flex-shrink:0;"></i>
          <div style="min-width:0;flex:1;">
            <div style="font-size:0.72rem;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.02em;">Anexo</div>
            <div style="font-size:0.85rem;color:#14532d;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${this.esc(this.state.fileName)}">${this.esc(this.state.fileName)}</div>
          </div>
          <button type="button" class="btn btn-cancel" style="padding:6px 10px;font-size:0.78rem;flex-shrink:0;" onclick="event.stopPropagation(); RepactuacaoLoteApp.clearFile()" title="Remover planilha">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Remover
          </button>
          <input type="file" id="repac-input-excel" accept=".xlsx,.xls" style="display:none;">
        </div>
      `;
    }
    return `
      <div id="repac-dropzone" class="dropzone" style="border:2px dashed #94a3b8;padding:14px 16px;text-align:left;border-radius:8px;cursor:pointer;background:#f8fafc;display:flex;align-items:center;gap:12px;max-width:420px;">
        <i data-lucide="file-spreadsheet" style="width:28px;height:28px;color:var(--color-primary);flex-shrink:0;"></i>
        <div>
          <p style="margin:0;color:#334155;font-size:0.9rem;font-weight:600;">Clique ou arraste o Excel (.xlsx)</p>
          <p style="margin:2px 0 0;font-size:0.75rem;color:#64748b;">Planilha Títulos para Repactuação</p>
        </div>
        <input type="file" id="repac-input-excel" accept=".xlsx,.xls" style="display:none;">
      </div>
    `;
  },

  tableHtml() {
    const rows = this.filteredRows();
    if (!this.state.rows.length) {
      return `<p style="color:#64748b;padding:24px;text-align:center;">Com o mês escolhido acima, envie a planilha <strong>Títulos para Repactuação</strong> para conferir data base e valor projetado por parcela.</p>`;
    }
    const body = rows.slice(0, 800).map((r) => {
      const baseClass = r.baseOk === false ? "color:#b91c1c;font-weight:700;" : (r.baseOk ? "color:#15803d;" : "");
      const valClass = r.valorOk === false ? "color:#b91c1c;font-weight:700;" : (r.valorOk ? "color:#15803d;" : "");
      let st;
      if (r.baseOk === false || r.valorOk === false) {
        st = `<span class="est-fin-chip est-fin-Inadimplente">Divergente</span>`;
      } else if (r.valorOk && r.baseOk) {
        st = `<span class="est-fin-chip est-fin-Adimplente">Bateu</span>`;
      } else if (r.siengeValor == null && !this.state.loading) {
        st = `<span class="est-fin-chip est-fin-Inadimplente">Sem Sienge</span>`;
      } else {
        st = `<span class="est-fin-chip est-fin-apurar">${this.state.loading ? "Conferindo" : "Pendente"}</span>`;
      }
      return `<tr>
        <td style="text-align:center;">${this.esc(r.titulo)}</td>
        <td style="text-align:center;">${this.esc(r.cliente)}</td>
        <td style="text-align:center;">${this.esc(r.documento)}</td>
        <td style="text-align:center;">${this.esc(r.cc || "—")}</td>
        <td style="text-align:center;">${this.esc(r.parcela)}</td>
        <td style="text-align:center;">${this.esc(this.fmtDate(r.vencimento))}</td>
        <td style="text-align:center;">${this.esc(r.indexerId)} — ${this.esc(r.indexerName)}</td>
        <td style="text-align:center;">${r.retro == null ? "—" : this.esc(r.retro)}</td>
        <td style="text-align:center;${baseClass}">${this.esc(this.fmtDate(r.excelBase))}</td>
        <td style="text-align:center;${baseClass}">${this.esc(this.fmtDate(r.expectedBase))}</td>
        <td style="text-align:center;">${this.esc(this.pct(r.accPct))}</td>
        <td style="text-align:center;">${this.esc(this.money(r.siengeValor))}</td>
        <td style="text-align:center;${valClass}">${this.esc(this.money(r.crmProjetado))}</td>
        <td style="text-align:center;${valClass}">${this.esc(this.money(r.excelValor))}</td>
        <td style="text-align:center;">${st}</td>
      </tr>`;
    }).join("");
    return `
      <div class="table-container crm-scroll-table" style="max-height:62vh;">
        <table class="custom-table">
          <thead>
            <tr>
              <th style="text-align:center;">Título</th>
              <th style="text-align:center;">Cliente</th>
              <th style="text-align:center;">Documento</th>
              <th style="text-align:center;">Centro</th>
              <th style="text-align:center;">Parcela</th>
              <th style="text-align:center;">Vencimento</th>
              <th style="text-align:center;">Indexador</th>
              <th style="text-align:center;">Retro</th>
              <th style="text-align:center;">Data base (Excel)</th>
              <th style="text-align:center;">Data base (CRM)</th>
              <th style="text-align:center;">Acum. 12m</th>
              <th style="text-align:center;">Valor atual Sienge</th>
              <th style="text-align:center;">Projetado CRM</th>
              <th style="text-align:center;">Valor Excel</th>
              <th style="text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>${body || `<tr><td colspan="15" style="text-align:center;padding:20px;color:#64748b;">Nenhuma linha neste filtro.</td></tr>`}</tbody>
        </table>
      </div>
      ${rows.length > 800 ? `<p style="font-size:0.8rem;color:#64748b;">Exibindo 800 de ${rows.length} parcelas.</p>` : ""}
    `;
  },

  render() {
    const root = document.getElementById("repactuacao-lote-root");
    if (!root) return;
    const n = this.state.rows.length;
    const titles = new Set(this.state.rows.map((r) => r.titulo)).size;
    const baseFail = this.state.rows.filter((r) => r.baseOk === false).length;
    const valFail = this.state.rows.filter((r) => r.valorOk === false).length;
    const ok = this.state.rows.filter((r) => r.baseOk === true && r.valorOk === true).length;
    const missingSienge = this.state.rows.filter((r) => r.siengeValor == null).length;
    root.innerHTML = `
      <div class="est-stock-page">
        ${this.previewHtml()}
        <div class="search-filter-panel" style="margin-bottom:16px;">
          <h3 style="margin:0 0 10px;font-size:0.9rem;color:#334155;">Planilha de títulos</h3>
          ${this.uploadZoneHtml()}
          <p id="repac-progress" style="font-size:0.82rem;color:#64748b;margin:10px 0 0;">${this.state.loading ? "Processando…" : (n ? `${n} parcelas · ${titles} títulos` : "")}</p>
          ${this.state.loading ? `<button type="button" class="btn btn-cancel" style="margin-top:8px;" onclick="RepactuacaoLoteApp.parar()">Parar</button>` : ""}
        </div>
        ${n ? `
        <div id="repac-kpis" class="est-stock-kpis" style="margin-bottom:12px;">
          <div class="est-fin-card"><label>Parcelas</label><strong>${n}</strong></div>
          <div class="est-fin-card is-ok"><label>Bateram</label><strong>${ok}</strong></div>
          <div class="est-fin-card is-warn"><label>Data base divergente</label><strong>${baseFail}</strong></div>
          <div class="est-fin-card is-warn"><label>Valor divergente</label><strong>${valFail}</strong></div>
          <div class="est-fin-card${missingSienge ? " is-warn" : ""}"><label>Sem valor Sienge</label><strong>${missingSienge}</strong></div>
        </div>
        <div class="est-stock-pills" style="margin-bottom:12px;">
          <button type="button" class="est-pill${this.state.filter === "all" ? " is-active" : ""}" onclick="RepactuacaoLoteApp.setFilter('all')">Todas</button>
          <button type="button" class="est-pill${this.state.filter === "ok" ? " is-active" : ""}" onclick="RepactuacaoLoteApp.setFilter('ok')">Bateram</button>
          <button type="button" class="est-pill${this.state.filter === "base" ? " is-active" : ""}" onclick="RepactuacaoLoteApp.setFilter('base')">Data base</button>
          <button type="button" class="est-pill${this.state.filter === "valor" ? " is-active" : ""}" onclick="RepactuacaoLoteApp.setFilter('valor')">Valor</button>
        </div>` : ""}
        <div id="repac-table-wrap">${this.tableHtml()}</div>
      </div>
    `;
    this.bindUpload();
    if (window.lucide) window.lucide.createIcons();
  }
};

window.RepactuacaoLoteApp = RepactuacaoLoteApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "repactuacao-lote") RepactuacaoLoteApp.init();
});
