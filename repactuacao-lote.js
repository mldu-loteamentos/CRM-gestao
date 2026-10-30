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
    salvo: null,
    salvando: false,
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
    abertos: {},
    progresso: 0,
    bills: {},
    filtroEmp: [],
    filtroObra: [],
    filtroIdx: [],
    empOpen: false,
    obraOpen: false,
    idxOpen: false,
    empQuery: "",
    obraQuery: "",
    idxQuery: "",
    previewLoading: false,
    previewProgress: 0,
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

  /** Data base da parcela: mês da repactuação + retro, um ano antes. Nov/2026 e IPCA -2 → 01/09/2025. */
  dataBaseEsperadaIso(adjustIso, retro) {
    return this.expectedBaseIso(adjustIso, Number(retro) - 12);
  },

  ehReal(idx, indexerId) {
    const nome = String((idx && idx.name) || "").trim().toUpperCase();
    const id = String(indexerId != null ? indexerId : (idx && idx.id != null ? idx.id : ""));
    return nome === "REAL" || id === "0";
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
      this.state.previewLoading = true;
      this.state.previewProgress = 8;
      this.render();
      this.loadIndexerPreview();
      this.carregarSalva();
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
    this.state.previewProgress = 12;
    this.state.previewError = "";
    this.renderPreviewOnly();
    try {
      await this.ensureIndexers();
      if (gen !== this.state._previewGen) return;
      this.state.previewProgress = 28;
      this.renderPreviewOnly();
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
      for (let i = 0; i < use.length; i++) {
        const idx = use[i];
        if (gen !== this.state._previewGen) return;
        this.state.previewProgress = Math.round(28 + ((i + 1) / use.length) * 68);
        this.renderPreviewOnly();
        const retro = idx.revenueRetroactivity != null ? Number(idx.revenueRetroactivity) : 0;
        const expectedBase = this.expectedBaseIso(adjustIso, retro);
        let rates = {};
        try {
          rates = await this.ratesForIndexer(idx);
        } catch (e) {
          console.warn("[Repactuação] série BCB", idx && idx.name, e);
        }
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
    this.bindUpload();
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
      const pct = Math.max(8, Math.min(100, Number(this.state.previewProgress) || 8));
      body = `<div class="repac-preview-load"><div class="ml-load">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-status-text">Consultando os indexadores…</div>
        <div class="ml-load-track"><div class="loading-progress-bar" style="width:${pct}%"></div></div>
      </div></div>`;
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
          <div class="repac-topo-acoes">
            ${this.uploadZoneHtml()}
            <button type="button" class="btn btn-secondary" style="padding:8px 12px;"
              onclick="RepactuacaoLoteApp.loadIndexerPreview()" ${loading ? "disabled" : ""}>
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Atualizar prévia
            </button>
          </div>
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

  async loadFile(file, opts) {
    const jaSalva = !!(opts && opts.jaSalva);
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
      if (!jaSalva) this.salvarPlanilha(file, buf);
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
    this.state.bills = {};
    this.state.filtroEmp = [];
    this.state.filtroObra = [];
    this.state.filtroIdx = [];
  },

  async ensureIndexers() {
    if (this.state.indexers.length) return;
    let list = [];
    try {
      const fn = window.siengeFetchWithRetry;
      if (typeof fn === "function") {
        const res = await fn("/indexers?limit=200");
        list = (res && res.results) || [];
      }
    } catch (e) {
      console.warn("[Repactuação] cadastro Sienge de indexadores", e);
    }
    if (!list.length && window.IndexadoresState && IndexadoresState.allSiengeIndexers && IndexadoresState.allSiengeIndexers.length) {
      list = IndexadoresState.allSiengeIndexers;
    }
    this.state.indexers = list;
    if (window.IndexadoresState && list.length) IndexadoresState.allSiengeIndexers = list;
    if (!list.length) {
      throw new Error("Não foi possível carregar os indexadores do Sienge. Atualize a prévia.");
    }
  },

  indexerById(id) {
    return (this.state.indexers || []).find((i) => String(i.id) === String(id)) || null;
  },

  bcbCodeForName(name) {
    const u = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const keys = Object.keys(this.BCB_MAP).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (u === key || u.includes(key)) return this.BCB_MAP[key];
    }
    return null;
  },

  mapBcbRates(data) {
    const mapped = {};
    (data || []).forEach((d) => {
      const parts = String(d.data || "").split("/");
      if (parts.length === 3) mapped[`${parts[2]}-${parts[1]}`] = parseFloat(String(d.valor).replace(",", "."));
    });
    return mapped;
  },

  async fetchBcbSeries(code) {
    const dataInicial = "01/01/2018";
    const q = `code=${encodeURIComponent(code)}&dataInicial=${encodeURIComponent(dataInicial)}`;
    const urls = [
      `/api/bcb-sgs?${q}`,
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${encodeURIComponent(dataInicial)}`
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        if (Array.isArray(json) && json.length) return json;
      } catch (e) {
        console.warn("[Repactuação] BCB", code, url, e);
      }
    }
    return [];
  },

  async ratesForIndexer(idx) {
    const name = idx && idx.name;
    if (!name) return {};
    if (this.state.ratesByIndexer[name]) return this.state.ratesByIndexer[name];
    if (window.IndexadoresState && IndexadoresState.bcbData && IndexadoresState.bcbData[name]) {
      const mapped = this.mapBcbRates(IndexadoresState.bcbData[name]);
      this.state.ratesByIndexer[name] = mapped;
      return mapped;
    }
    const code = this.bcbCodeForName(name);
    if (!code) return {};
    const data = await this.fetchBcbSeries(code);
    const mapped = this.mapBcbRates(data);
    this.state.ratesByIndexer[name] = mapped;
    if (window.IndexadoresState) {
      if (!IndexadoresState.bcbData) IndexadoresState.bcbData = {};
      if (data.length) IndexadoresState.bcbData[name] = data;
    }
    return mapped;
  },

  applyIndexerLogic() {
    const adjust = this.state.adjustDate;
    this.state.rows = this.state.rows.map((row) => {
      const idx = this.indexerById(row.indexerId);
      const retro = idx && idx.revenueRetroactivity != null ? Number(idx.revenueRetroactivity) : null;
      const real = this.ehReal(idx, row.indexerId);
      const expectedBase = retro != null && adjust ? this.expectedBaseIso(adjust, retro) : null;
      const dataBaseEsperada = !real && retro != null && adjust ? this.dataBaseEsperadaIso(adjust, retro) : null;
      const baseOk = dataBaseEsperada && row.excelBase ? this.sameMonth(dataBaseEsperada, row.excelBase) : null;
      return {
        ...row,
        indexerName: idx ? idx.name : (real ? "REAL" : "—"),
        retro,
        expectedBase,
        dataBaseEsperada,
        siengeBase: null,
        baseOk,
        accPct: null,
        factor: null,
        siengeValor: null,
        crmProjetado: null,
        valorOk: null,
        siengeConsultado: false,
        siengeAchou: false,
        accMissing: []
      };
    });
  },

  pickSiengeBaseDate(inst) {
    if (!inst) return null;
    const v = inst.baseDate || inst.installmentBaseDate || inst.correctionBaseDate || inst.baseDateOfInstallment;
    if (v == null || v === "") return null;
    const iso = String(v).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    return this.parseDate(v);
  },

  pickSiengeInstallmentValue(inst) {
    if (!inst) return null;
    const candidates = [
      inst.currentBalance,
      inst.balanceDue,
      inst.correctedValue,
      inst.correctedAmount,
      inst.currentValue,
      inst.balance,
      inst.installmentValue,
      inst.originalValue,
      inst.originalAmount,
      inst.principalValue,
      inst.value
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
      const siengeBase = this.pickSiengeBaseDate(hit);
      const lancada = siengeBase || row.excelBase;
      const baseOk = row.dataBaseEsperada && lancada ? this.sameMonth(row.dataBaseEsperada, lancada) : row.baseOk;
      const projetado = cur != null && Number.isFinite(cur) && row.factor ? cur * row.factor : null;
      const valorOk = projetado != null && row.excelValor != null
        ? Math.abs(projetado - row.excelValor) <= Math.max(0.05, Math.abs(row.excelValor) * 0.002)
        : null;
      return {
        ...row,
        siengeBase,
        baseOk,
        siengeValor: cur,
        crmProjetado: projetado,
        valorOk,
        siengeConsultado: true,
        siengeAchou: !!hit,
        vencimento: row.vencimento || (hit && (hit.dueDate || hit.due) ? String(hit.dueDate || hit.due).slice(0, 10) : row.vencimento)
      };
    });
  },

  async conferirSienge() {
    this.state.loading = true;
    this.state.progresso = 8;
    this.render();

    const uniqueIdx = [...new Set(this.state.rows.map((r) => r.indexerId).filter(Boolean))];
    for (const id of uniqueIdx) {
      const idx = this.indexerById(id);
      if (!idx || String(idx.name || "").toUpperCase() === "REAL") continue;
      let rates = {};
      try {
        rates = await this.ratesForIndexer(idx);
      } catch (e) {
        console.warn("[Repactuação] série BCB planilha", idx && idx.name, e);
      }
      this.state.rows = this.state.rows.map((row) => {
        if (String(row.indexerId) !== String(id) || !row.expectedBase) return row;
        const acc = this.accumulated12(rates, row.expectedBase);
        return { ...row, accPct: acc.pct, factor: acc.factor, accMissing: acc.missing };
      });
    }

    const titles = [...new Set(this.state.rows.map((r) => r.titulo).filter(Boolean))];
    const concurrency = 6;
    let done = 0;
    const total = titles.length || 1;
    for (let i = 0; i < titles.length; i += concurrency) {
      if (this.state.stop) break;
      const chunk = titles.slice(i, i + concurrency);
      await Promise.all(chunk.map(async (titulo) => {
        if (this.state.stop) return;
        const billP = this.fetchBill(titulo);
        let insts = [];
        try {
          insts = await this.fetchInstallments(titulo);
          this.applyTitleInstallments(titulo, insts);
        } catch (e) {
          console.warn("[Repactuação] título", titulo, e);
        }
        try {
          const bill = await billP;
          const info = await this.completarCadastro(this.lerCadastro(bill, insts));
          this.applyCadastro(titulo, info);
        } catch (e) {
          console.warn("[Repactuação] cadastro", titulo, e);
        } finally {
          done += 1;
          this.state.progresso = Math.max(8, Math.round((done / total) * 100));
          this.atualizarCarga();
        }
      }));
    }
    this.state.loading = false;
    this.state.progresso = 100;
    this.render();
  },

  async fetchBill(titulo) {
    const id = String(titulo || "").replace(/^B-/i, "").trim();
    if (!id) return null;
    if (Object.prototype.hasOwnProperty.call(this.state.bills, id)) return this.state.bills[id];
    const fetchFn = window.siengeFetchWithRetry;
    if (typeof fetchFn !== "function") {
      this.state.bills[id] = null;
      return null;
    }
    try {
      const bill = await fetchFn("/accounts-receivable/receivable-bills/" + encodeURIComponent(id), 1);
      this.state.bills[id] = bill && typeof bill === "object" ? bill : null;
    } catch (e) {
      this.state.bills[id] = null;
    }
    return this.state.bills[id];
  },

  centrosCatalogo() {
    const listas = [];
    if (window.CentrosCustoState && Array.isArray(CentrosCustoState.costCenters)) listas.push(CentrosCustoState.costCenters);
    const st = window.AppState || {};
    if (Array.isArray(st.cachedCostCenters)) listas.push(st.cachedCostCenters);
    if (Array.isArray(st.costCenters)) listas.push(st.costCenters);
    try {
      const raw = JSON.parse(localStorage.getItem("crm_cost_centers_data") || "[]");
      if (Array.isArray(raw)) listas.push(raw);
    } catch (e) {}
    return listas;
  },

  centroPorId(id) {
    const chave = String(id || "").replace(/\D/g, "");
    if (!chave) return null;
    const listas = this.centrosCatalogo();
    for (let i = 0; i < listas.length; i++) {
      const hit = listas[i].find((c) => c && String(c.id).replace(/\D/g, "") === chave);
      if (hit) return hit;
    }
    return null;
  },

  nomeEmpresa(id) {
    const n = String(id || "").replace(/\D/g, "");
    if (!n) return "";
    if (typeof window.getCompanyName === "function") {
      const curto = window.getCompanyName(n, true);
      if (curto && !/^EMPRESA #/i.test(curto)) return curto;
    }
    const st = window.AppState || {};
    const custom = st.companiesCustom && (st.companiesCustom[n] || st.companiesCustom[String(Number(n))]);
    if (custom && custom.nome_usual && String(custom.nome_usual).trim()) return String(custom.nome_usual).trim().toUpperCase();
    try {
      const raw = JSON.parse(localStorage.getItem("crm_companies_custom") || "{}");
      const c = raw[n] || raw[String(Number(n))];
      if (c && c.nome_usual && String(c.nome_usual).trim()) return String(c.nome_usual).trim().toUpperCase();
    } catch (e) {}
    return "";
  },

  lerCadastro(bill, insts) {
    const b = bill || {};
    const inst = (insts && insts[0]) || {};
    const ccBruto = b.costCenterId || b.enterpriseId || b.enterpriseCode
      || (b.costCenter && (b.costCenter.id || b.costCenter))
      || inst.costCenterId || inst.enterpriseId || "";
    const ccId = String(ccBruto).replace(/\D/g, "");
    const cc = this.centroPorId(ccId);
    const companyId = String(b.companyId || inst.companyId || (cc && (cc.idCompany || cc.companyId)) || "").replace(/\D/g, "");
    const empreendimento = String((cc && cc.name) || b.enterpriseName || b.costCenterName || b.buildingName || (b.enterprise && b.enterprise.name) || "").trim();
    return {
      companyId: companyId,
      empresa: this.nomeEmpresa(companyId),
      ccId: ccId,
      obraId: ccId || empreendimento,
      empreendimento: empreendimento
    };
  },

  async completarCadastro(info) {
    const dado = info || {};
    if (dado.empreendimento || !dado.ccId) {
      if (!dado.empresa && dado.companyId) dado.empresa = this.nomeEmpresa(dado.companyId);
      return dado;
    }
    const api = window.SiengeApiService;
    if (!api || typeof api.getCostCenter !== "function") return dado;
    try {
      const cc = await api.getCostCenter(dado.ccId);
      if (cc && cc.name) dado.empreendimento = String(cc.name).trim();
      if (!dado.companyId) dado.companyId = String((cc && (cc.idCompany || cc.companyId)) || "").replace(/\D/g, "");
      if (!dado.obraId) dado.obraId = dado.ccId || dado.empreendimento;
      if (dado.companyId) dado.empresa = this.nomeEmpresa(dado.companyId);
    } catch (e) {}
    return dado;
  },

  applyCadastro(titulo, info) {
    const dado = info || {};
    this.state.rows = this.state.rows.map((row) => {
      if (String(row.titulo) !== String(titulo)) return row;
      return {
        ...row,
        companyId: dado.companyId || row.companyId || "",
        empresa: dado.empresa || row.empresa || "",
        ccId: dado.ccId || row.ccId || "",
        obraId: dado.obraId || dado.ccId || row.obraId || "",
        empreendimento: dado.empreendimento || row.empreendimento || row.cc || ""
      };
    });
  },

  atualizarCarga() {
    const bar = document.querySelector("#repac-load .loading-progress-bar");
    if (bar) bar.style.width = Math.max(8, this.state.progresso || 8) + "%";
  },

  async fetchInstallments(titulo) {
    const id = String(titulo || "").replace(/^B-/i, "").trim();
    if (!id) return [];
    const fetchFn = window.siengeFetchWithRetry;
    let list = [];
    let houveResposta = false;
    if (typeof fetchFn === "function") {
      const limit = 200;
      for (let offset = 0; offset < 5000; offset += limit) {
        let res;
        try {
          res = await fetchFn(`/accounts-receivable/receivable-bills/${encodeURIComponent(id)}/installments?limit=${limit}&offset=${offset}`);
          houveResposta = true;
        } catch (e) {
          console.warn("[Repactuação] installments", id, offset, e);
          break;
        }
        const rows = (res && (res.results || res.data || res.installments)) || (Array.isArray(res) ? res : []);
        if (!rows.length) break;
        list = list.concat(rows);
        const total = res && res.resultSetMetadata && Number(res.resultSetMetadata.count);
        if (rows.length < limit) break;
        if (Number.isFinite(total) && list.length >= total) break;
      }
    } else if (window.SiengeApiService && typeof SiengeApiService.getBillInstallments === "function") {
      const inst = await SiengeApiService.getBillInstallments(id);
      list = (inst && inst.results) || inst || [];
      houveResposta = true;
    }
    if (!Array.isArray(list)) list = [];

    const wanted = this.state.rows
      .filter((r) => String(r.titulo) === String(titulo))
      .map((r) => Number(r.parcela));
    const falta = wanted.filter((p) => !this.findInstallmentForParcela(list, p));
    if (falta.length && typeof fetchFn === "function") {
      try {
        const q = `/bulk-data/v1/customer-extract-history?startDueDate=2000-01-01&endDueDate=2099-12-31&billReceivableId=${encodeURIComponent(id)}&documentsId=CT&includeRemadeInstallments=true&includeCanceledInstallments=false&includeRevokedInstallments=false&includeRenegotiatedDischarge=false`;
        const json = await fetchFn(q);
        const items = (json && (json.data || json.results || json.items)) || (Array.isArray(json) ? json : []);
        (items || []).forEach((item) => {
          (item.installments || []).forEach((inst) => {
            const n = Number(inst.installmentNumber != null ? inst.installmentNumber : inst.number);
            if (!this.findInstallmentForParcela(list, n)) list.push(inst);
          });
        });
      } catch (e2) {
        console.warn("[Repactuação] extract-history", id, e2);
      }
    }
    if (!list.length && !houveResposta) throw new Error("Sienge não respondeu às parcelas do título " + id);
    return list;
  },

  clearFile() {
    if (this.state.loading) {
      this.state.stop = true;
    }
    this.state.fileName = "";
    this.state.rows = [];
    this.state.bills = {};
    this.state.loading = false;
    this.state.stop = false;
    this.state.filter = "all";
    this.state.abertos = {};
    this.state.empresa = "";
    this.state.filtroEmp = [];
    this.state.filtroObra = [];
    this.state.filtroIdx = [];
    this.state.progresso = 0;
    this.render();
  },

  async carregarSalva() {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || typeof fc.getDoc !== "function") return;
    try {
      const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", "repactuacao_planilha"));
      if (!snap || typeof snap.exists !== "function" || !snap.exists()) return;
      const d = snap.data() || {};
      if (!d.url || !d.name) return;
      this.state.salvo = {
        name: String(d.name),
        url: String(d.url),
        path: String(d.path || ""),
        savedAt: String(d.savedAt || ""),
        parcelas: Number(d.parcelas) || 0,
        titulos: Number(d.titulos) || 0
      };
      if (!this.state.fileName) this.render();
    } catch (e) {
      console.warn("[Repactuação] planilha salva", e);
    }
  },

  async salvarPlanilha(file, buf) {
    const fc = window.firebaseCollections;
    if (!window.firebaseStorage || !window.firebaseDb || !fc || !fc.ref || !fc.uploadBytes || !fc.getDownloadURL || !fc.setDoc) return;
    this.state.salvando = true;
    try {
      const path = "repactuacao/planilha-titulos.xlsx";
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      await fc.uploadBytes(fc.ref(window.firebaseStorage, path), blob, { contentType: blob.type });
      const url = await fc.getDownloadURL(fc.ref(window.firebaseStorage, path));
      const salvo = {
        name: file.name,
        url,
        path,
        savedAt: new Date().toISOString(),
        parcelas: this.state.rows.length,
        titulos: new Set(this.state.rows.map((r) => r.titulo)).size,
        adjustMonth: this.state.adjustMonth || ""
      };
      await fc.setDoc(fc.doc(window.firebaseDb, "config", "repactuacao_planilha"), salvo);
      this.state.salvo = salvo;
    } catch (e) {
      console.warn("[Repactuação] salvar planilha", e);
    }
    this.state.salvando = false;
    const meta = document.querySelector("#repactuacao-lote-root .repac-arquivo-meta");
    if (meta) meta.textContent = this.state.salvo ? "salva" : "";
  },

  async abrirSalva() {
    const s = this.state.salvo;
    if (!s || !s.url || this.state.loading) return;
    try {
      const res = await fetch(s.url);
      if (!res.ok) throw new Error("Não consegui baixar a planilha salva.");
      const buf = await res.arrayBuffer();
      const file = new File([buf], s.name || "planilha.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      await this.loadFile(file, { jaSalva: true });
    } catch (e) {
      console.warn("[Repactuação] abrir planilha salva", e);
      alert((e && e.message) || "Não consegui abrir a planilha salva.");
    }
  },

  setFilter(f) {
    const atual = this.state.filter;
    this.state.filter = atual === f ? "all" : f;
    const box = document.querySelector("#repac-table-wrap .cc-scroll");
    const top = box ? box.scrollTop : 0;
    this.renderTableOnly();
    this.renderKpisOnly();
    const next = document.querySelector("#repac-table-wrap .cc-scroll");
    if (next) next.scrollTop = top;
  },

  parar() {
    this.state.stop = true;
  },

  contagens() {
    const grupos = this.gruposDimensao();
    let conferidos = 0;
    let divergentes = 0;
    grupos.forEach((g) => {
      const s = this.statusGrupo(g.parcelas);
      if (s === "conferido") conferidos += 1;
      else if (s === "divergente" || s === "database") divergentes += 1;
    });
    return { titles: grupos.length, conferidos: conferidos, divergentes: divergentes, n: this.state.rows.length };
  },

  kpisHtml(c) {
    const on = (f) => this.state.filter === f ? " is-on" : "";
    return `
      <button type="button" class="est-fin-card is-ok repac-kpi${on("ok")}" onclick="RepactuacaoLoteApp.setFilter('ok')">
        <label>Títulos conferidos</label><strong>${c.conferidos}</strong>
      </button>
      <button type="button" class="est-fin-card is-warn repac-kpi${on("valor")}" onclick="RepactuacaoLoteApp.setFilter('valor')">
        <label>Títulos divergentes</label><strong>${c.divergentes}</strong>
      </button>
    `;
  },

  renderKpisOnly() {
    const box = document.getElementById("repac-kpis");
    if (!box || !this.state.rows.length) return;
    box.innerHTML = this.kpisHtml(this.contagens());
  },

  chaveGrupo(r) {
    return [r.titulo, r.documento, r.cliente, r.cc].map((v) => String(v || "")).join("|");
  },

  /** conferido = valor projetado no Integra bateu com o Excel, parcela a parcela. */
  statusDe(r) {
    if (r.baseOk === false) return "database";
    if (r.valorOk === false) return "divergente";
    if (r.valorOk === true) return "conferido";
    if (r.siengeConsultado && !r.siengeAchou) return "sem";
    if (this.state.loading) return "conferindo";
    return "pendente";
  },

  statusGrupo(parcelas) {
    const lista = parcelas || [];
    if (lista.some((r) => this.statusDe(r) === "database")) return "database";
    if (lista.some((r) => this.statusDe(r) === "divergente")) return "divergente";
    if (lista.length && lista.every((r) => this.statusDe(r) === "conferido")) return "conferido";
    if (lista.some((r) => this.statusDe(r) === "sem")) return "sem";
    if (lista.some((r) => this.statusDe(r) === "conferindo") || this.state.loading) return "conferindo";
    return "pendente";
  },

  statusChip(kind) {
    if (kind === "conferido") return `<span class="est-fin-chip est-fin-Adimplente">Valor conferido ✓</span>`;
    if (kind === "database") return `<span class="est-fin-chip est-fin-Inadimplente">Data base</span>`;
    if (kind === "divergente") return `<span class="est-fin-chip est-fin-Inadimplente">Divergente</span>`;
    if (kind === "sem") return `<span class="est-fin-chip est-fin-Inadimplente">Sem Sienge</span>`;
    if (kind === "conferindo") return `<span class="est-fin-chip est-fin-apurar">Conferindo</span>`;
    return `<span class="est-fin-chip est-fin-apurar">Pendente</span>`;
  },

  gruposMontados() {
    const ordem = [];
    const map = {};
    this.state.rows.forEach((r) => {
      const k = this.chaveGrupo(r);
      if (!map[k]) {
        map[k] = {
          key: k,
          titulo: r.titulo,
          cliente: r.cliente,
          empresa: r.empresa,
          companyId: r.companyId || "",
          documento: r.documento,
          cc: r.cc,
          ccId: r.ccId || "",
          obraId: r.obraId || r.ccId || r.empreendimento || r.cc || "",
          empreendimento: r.empreendimento || r.cc || "",
          indexerId: r.indexerId,
          indexerName: r.indexerName,
          retro: r.retro,
          expectedBase: r.expectedBase,
          accPct: r.accPct,
          baseOk: r.baseOk,
          parcelas: []
        };
        ordem.push(k);
      }
      const g = map[k];
      g.parcelas.push(r);
      if (!g.companyId && r.companyId) g.companyId = r.companyId;
      if ((!g.empresa || g.empresa === "—") && r.empresa) g.empresa = r.empresa;
      if (!g.empreendimento && (r.empreendimento || r.cc)) g.empreendimento = r.empreendimento || r.cc;
      if (!g.obraId && (r.obraId || r.ccId || g.empreendimento)) g.obraId = r.obraId || r.ccId || g.empreendimento;
      if (!g.ccId && r.ccId) g.ccId = r.ccId;
      if (r.baseOk === false) g.baseOk = false;
      else if (g.baseOk == null && r.baseOk === true) g.baseOk = true;
      if (g.accPct == null && r.accPct != null) g.accPct = r.accPct;
      if (!g.expectedBase && r.expectedBase) g.expectedBase = r.expectedBase;
    });
    return ordem.map((k) => map[k]);
  },

  gruposDimensao() {
    let grupos = this.gruposMontados();
    const emp = this.state.filtroEmp || [];
    const obra = this.state.filtroObra || [];
    const idx = this.state.filtroIdx || [];
    if (emp.length) grupos = grupos.filter((g) => emp.includes(String(g.companyId || "")));
    if (obra.length) grupos = grupos.filter((g) => obra.includes(String(g.obraId || "")));
    if (idx.length) grupos = grupos.filter((g) => (g.parcelas || []).some((r) => idx.includes(String(r.indexerId || ""))));
    return grupos;
  },

  gruposTabela() {
    let grupos = this.gruposDimensao();
    const f = this.state.filter;
    if (f === "ok") grupos = grupos.filter((g) => this.statusGrupo(g.parcelas) === "conferido");
    else if (f === "valor") grupos = grupos.filter((g) => {
      const s = this.statusGrupo(g.parcelas);
      return s === "divergente" || s === "database";
    });
    else if (f === "base") grupos = grupos.filter((g) => g.parcelas.some((r) => r.baseOk === false));
    return grupos;
  },

  toggleTitulo(key) {
    const box = document.querySelector("#repac-table-wrap .cc-scroll");
    const top = box ? box.scrollTop : 0;
    const pageY = window.scrollY || window.pageYOffset || 0;
    const k = decodeURIComponent(String(key || ""));
    this.state.abertos[k] = !this.state.abertos[k];
    this.renderTableOnly();
    const next = document.querySelector("#repac-table-wrap .cc-scroll");
    if (next) next.scrollTop = top;
    if ((window.scrollY || window.pageYOffset || 0) !== pageY) window.scrollTo(0, pageY);
  },

  rotuloIdx(r) {
    const id = r.indexerId == null || r.indexerId === "" ? "—" : String(r.indexerId);
    const nome = r.indexerName && r.indexerName !== "—" ? String(r.indexerName) : "";
    return nome ? `${id} — ${nome}` : id;
  },

  indexadoresDo(g) {
    const map = new Map();
    (g.parcelas || []).forEach((r) => {
      const id = String(r.indexerId ?? "");
      if (!map.has(id)) map.set(id, r);
    });
    return [...map.values()];
  },

  textoIndexador(g) {
    const idxs = this.indexadoresDo(g);
    const rotulos = idxs.map((r) => this.rotuloIdx(r));
    const texto = rotulos.join(" · ") || "—";
    const title = rotulos.length > 1 ? `Mais de um indexador: ${rotulos.join(", ")}` : texto;
    return { texto, title };
  },

  textoRetro(g) {
    const vals = [...new Set(this.indexadoresDo(g).map((r) => (r.retro == null ? null : String(r.retro))).filter((v) => v != null))];
    return vals.length ? vals.join(" · ") : "—";
  },

  textoAcum(g) {
    const corrigem = this.indexadoresDo(g).filter((r) => r.dataBaseEsperada && r.accPct != null);
    if (corrigem.length === 1) return this.pct(corrigem[0].accPct);
    if (this.indexadoresDo(g).length === 1) return this.pct(g.accPct);
    return "—";
  },

  textoDataBase(g) {
    const rows = (g.parcelas || []).filter((r) => r.dataBaseEsperada);
    if (!rows.length) return { texto: "—", title: "", ruim: false, ok: false };
    const ruins = rows.filter((r) => r.baseOk === false);
    const alvo = ruins.length ? ruins : rows;
    const esperados = [...new Set(alvo.map((r) => this.fmtDate(r.dataBaseEsperada)))];
    const lancados = [...new Set(alvo.map((r) => this.fmtDate(r.siengeBase || r.excelBase)).filter((v) => v && v !== "—"))];
    if (ruins.length) {
      const texto = lancados.length ? `${lancados.join(" · ")} · esperado ${esperados.join(" · ")}` : esperados.join(" · ");
      const title = `Data base esperada ${esperados.join(", ")}` + (lancados.length ? `. Lançada ${lancados.join(", ")}` : "");
      return { texto, title, ruim: true, ok: false };
    }
    const ok = rows.every((r) => r.baseOk === true);
    return { texto: esperados.join(" · "), title: esperados.join(" · "), ruim: false, ok };
  },

  textoDataBaseParcela(r) {
    if (!r.dataBaseEsperada) return { texto: "—", title: "", ruim: false };
    const esperado = this.fmtDate(r.dataBaseEsperada);
    const lancada = this.fmtDate(r.siengeBase || r.excelBase);
    if (r.baseOk === false) {
      const texto = lancada && lancada !== "—" ? `${lancada} · esperado ${esperado}` : esperado;
      return { texto, title: `Data base esperada ${esperado}` + (lancada && lancada !== "—" ? `. Lançada ${lancada}` : ""), ruim: true };
    }
    return { texto: esperado, title: esperado, ruim: false };
  },

  parcelasHtml(g) {
    const linhas = g.parcelas.map((r) => {
      const valClass = r.valorOk === false ? "color:#b91c1c;font-weight:700;" : (r.valorOk ? "color:#15803d;font-weight:700;" : "");
      const base = this.textoDataBaseParcela(r);
      const baseStyle = base.ruim ? "color:#b91c1c;font-weight:700;" : "";
      return `<tr>
        <td>${this.esc(r.parcela)}</td>
        <td>${this.esc(this.fmtDate(r.vencimento))}</td>
        <td>${this.esc(this.rotuloIdx(r))}</td>
        <td style="${baseStyle}" title="${this.esc(base.title)}">${this.esc(base.texto)}</td>
        <td>${this.esc(this.money(r.siengeValor))}</td>
        <td style="${valClass}">${this.esc(this.money(r.crmProjetado))}</td>
        <td style="${valClass}">${this.esc(this.money(r.excelValor))}</td>
        <td>${this.statusChip(this.statusDe(r))}</td>
      </tr>`;
    }).join("");
    return `<tr class="repac-det">
      <td colspan="12">
        <table class="repac-parcelas">
          <thead><tr>
            <th>Parcela</th><th>Vencimento</th><th>Indexador</th><th>Data base</th><th>Valor atual Sienge</th><th>Projetado CRM</th><th>Valor Excel</th><th>Status</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </td>
    </tr>`;
  },

  renderTableOnly() {
    const wrap = document.getElementById("repac-table-wrap");
    if (wrap) wrap.innerHTML = this.tableHtml();
    if (window.lucide) window.lucide.createIcons();
  },

  uploadZoneHtml() {
    const salvo = this.state.salvo;
    const quando = salvo && salvo.savedAt ? this.fmtDate(String(salvo.savedAt).slice(0, 10)) : "";
    const input = `<input type="file" id="repac-input-excel" accept=".xlsx,.xls" style="display:none;">`;
    const nome = this.state.fileName || (salvo && salvo.name) || "";
    const meta = this.state.fileName
      ? (this.state.salvando ? "salvando…" : (salvo && salvo.name === this.state.fileName ? "salva" : ""))
      : (salvo && salvo.url ? ("salva" + (quando ? " em " + quando : "")) : "");
    return `
      <div class="repac-arquivo${this.state.fileName || (salvo && salvo.url) ? "" : " is-empty"}" ${this.state.fileName || (salvo && salvo.url) ? "" : "id=\"repac-dropzone\""}>
        <i data-lucide="file-spreadsheet"></i>
        <span class="repac-arquivo-nome" title="${this.esc(nome)}">${this.esc(nome || "Enviar planilha .xlsx")}</span>
        ${meta ? `<span class="repac-arquivo-meta">${meta}</span>` : ""}
        ${this.state.fileName ? `<button type="button" class="repac-arquivo-btn" onclick="document.getElementById('repac-input-excel').click()">Trocar</button>
          <button type="button" class="repac-arquivo-btn" onclick="RepactuacaoLoteApp.clearFile()">Remover</button>` : ""}
        ${!this.state.fileName && salvo && salvo.url ? `<button type="button" class="repac-arquivo-btn" onclick="RepactuacaoLoteApp.abrirSalva()">Abrir</button>
          <button type="button" class="repac-arquivo-btn" onclick="document.getElementById('repac-input-excel').click()">Enviar outra</button>` : ""}
        ${input}
      </div>`;
  },

  itensEmpresa() {
    const map = new Map();
    this.gruposMontados().forEach((g) => {
      const id = String(g.companyId || "");
      if (!id || map.has(id)) return;
      const nome = String(g.empresa || this.nomeEmpresa(id) || "").trim().toUpperCase();
      map.set(id, { id: id, label: nome ? (id + " - " + nome) : id });
    });
    return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));
  },

  itensObra() {
    const map = new Map();
    this.gruposMontados().forEach((g) => {
      const id = String(g.obraId || "");
      const nome = String(g.empreendimento || "").trim();
      if (!id && !nome) return;
      const chave = id || nome;
      if (map.has(chave)) return;
      map.set(chave, { id: chave, label: nome ? nome.toUpperCase() : chave });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  },

  itensIndexador() {
    const map = new Map();
    this.state.rows.forEach((r) => {
      const id = String(r.indexerId || "");
      if (!id || map.has(id)) return;
      const nome = String(r.indexerName || "").trim();
      map.set(id, { id: id, label: nome && nome !== "—" ? (id + " - " + nome.toUpperCase()) : id });
    });
    return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));
  },

  filtrosHtml() {
    if (!this.state.rows.length || !window.MlEmpresaFilter) return "";
    const obraNouns = { singular: "empreendimento", plural: "empreendimentos", none: "Nenhum empreendimento", noMatch: "Nenhum empreendimento com esse nome." };
    const idxNouns = { singular: "indexador", plural: "indexadores", none: "Nenhum indexador", noMatch: "Nenhum indexador com esse nome." };
    return `
      <div class="cc-toolbar repac-filtros">
        <div class="cc-filters">
          ${MlEmpresaFilter.html({ id: "repac-emp", label: "Empresas", items: this.itensEmpresa(), selectedIds: this.state.filtroEmp, open: this.state.empOpen, query: this.state.empQuery, emptyMeansAll: true })}
          ${MlEmpresaFilter.html({ id: "repac-obra", label: "Empreendimentos", items: this.itensObra(), selectedIds: this.state.filtroObra, open: this.state.obraOpen, query: this.state.obraQuery, emptyMeansAll: true, nouns: obraNouns })}
          ${MlEmpresaFilter.html({ id: "repac-idx", label: "Indexadores", items: this.itensIndexador(), selectedIds: this.state.filtroIdx, open: this.state.idxOpen, query: this.state.idxQuery, emptyMeansAll: true, nouns: idxNouns })}
        </div>
      </div>`;
  },

  pintarFiltros() {
    const el = document.getElementById("repac-filtros");
    if (!el) return;
    el.innerHTML = this.filtrosHtml();
    this.bindFiltros();
  },

  bindFiltros() {
    if (!window.MlEmpresaFilter) return;
    const app = this;
    const par = (id, openKey, queryKey, campo, itensFn, outros) => {
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          app.state[openKey] = !app.state[openKey];
          if (app.state[openKey]) outros.forEach((k) => { app.state[k] = false; });
          app.pintarFiltros();
        },
        close() {
          app.state[openKey] = false;
          app.pintarFiltros();
        },
        setQuery(q) {
          app.state[queryKey] = q || "";
          app.atualizarListaFiltro(id);
        },
        toggleId(itemId, on) { app.alternarFiltro(campo, itemId, on, itensFn.call(app)); },
        selectAll() {
          app.state[campo] = itensFn.call(app).map((x) => x.id);
          app.depoisFiltro();
        },
        selectNone() {
          app.state[campo] = [];
          app.depoisFiltro();
        }
      });
    };
    par("repac-emp", "empOpen", "empQuery", "filtroEmp", this.itensEmpresa, ["obraOpen", "idxOpen"]);
    par("repac-obra", "obraOpen", "obraQuery", "filtroObra", this.itensObra, ["empOpen", "idxOpen"]);
    par("repac-idx", "idxOpen", "idxQuery", "filtroIdx", this.itensIndexador, ["empOpen", "obraOpen"]);
  },

  atualizarListaFiltro(id) {
    const box = document.getElementById(id + "-list");
    if (!box || !window.MlEmpresaFilter) return;
    const mapa = {
      "repac-emp": [this.itensEmpresa(), this.state.filtroEmp, this.state.empQuery, null],
      "repac-obra": [this.itensObra(), this.state.filtroObra, this.state.obraQuery, { singular: "empreendimento", plural: "empreendimentos", none: "Nenhum empreendimento", noMatch: "Nenhum empreendimento com esse nome." }],
      "repac-idx": [this.itensIndexador(), this.state.filtroIdx, this.state.idxQuery, { singular: "indexador", plural: "indexadores", none: "Nenhum indexador", noMatch: "Nenhum indexador com esse nome." }]
    };
    const cfg = mapa[id];
    if (!cfg) return;
    box.innerHTML = MlEmpresaFilter.listHtml({ id: id, items: cfg[0], selectedIds: cfg[1], query: cfg[2], nouns: cfg[3] });
  },

  alternarFiltro(campo, id, on, itens) {
    const sid = String(id);
    let sel = (this.state[campo] || []).map(String);
    if (on) { if (!sel.includes(sid)) sel.push(sid); }
    else sel = sel.filter((x) => x !== sid);
    const todos = (itens || []).map((x) => String(x.id));
    if (sel.length && sel.length === todos.length) sel = [];
    this.state[campo] = sel;
    this.depoisFiltro();
  },

  depoisFiltro() {
    const box = document.querySelector("#repac-table-wrap .cc-scroll");
    const top = box ? box.scrollTop : 0;
    this.pintarFiltros();
    this.renderTableOnly();
    this.renderKpisOnly();
    const next = document.querySelector("#repac-table-wrap .cc-scroll");
    if (next) next.scrollTop = top;
  },

  cargaHtml() {
    if (!this.state.loading) return "";
    const w = Math.max(8, this.state.progresso || 8);
    return `<div class="ml-load" id="repac-load">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-status-text">Conferindo os títulos…</div>
      <div class="ml-load-track"><div class="loading-progress-bar" style="width:${w}%"></div></div>
    </div>`;
  },

  tableHtml() {
    if (!this.state.rows.length) {
      return `<p style="color:#64748b;padding:24px;text-align:center;">Com o mês escolhido acima, envie a planilha <strong>Títulos para Repactuação</strong> para conferir o valor projetado de cada parcela.</p>`;
    }
    const grupos = this.gruposTabela();
    const visiveis = grupos.slice(0, 800);
    const body = visiveis.map((g) => {
      const aberto = !!this.state.abertos[g.key];
      const nums = g.parcelas.map((r) => r.parcela).filter((n) => n != null).sort((a, b) => a - b);
      const faixa = nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : (nums.length ? String(nums[0]) : "—");
      const conferidas = g.parcelas.filter((r) => r.valorOk === true).length;
      const parcTxt = `${g.parcelas.length} · ${faixa}${conferidas ? ` · ${conferidas} conferida${conferidas === 1 ? "" : "s"}` : ""}`;
      const idx = this.textoIndexador(g);
      const base = this.textoDataBase(g);
      const baseClass = base.ruim ? "color:#b91c1c;font-weight:700;" : (base.ok ? "color:#15803d;" : "");
      return `<tr class="repac-tit${aberto ? " is-open" : ""}" onclick="RepactuacaoLoteApp.toggleTitulo('${encodeURIComponent(g.key)}')">
        <td class="repac-seta-cel"><i data-lucide="chevron-right" class="repac-seta"></i></td>
        <td>${this.esc(g.titulo)}</td>
        <td title="${this.esc(g.cliente)}">${this.esc(g.cliente)}</td>
        <td class="repac-nome" title="${this.esc(g.empresa || "")}">${this.esc(g.empresa || "—")}</td>
        <td title="${this.esc(g.documento || "")}">${this.esc(g.documento || "—")}</td>
        <td class="repac-nome" title="${this.esc(g.empreendimento || "")}">${this.esc(g.empreendimento || "—")}</td>
        <td title="${this.esc(idx.title)}">${this.esc(idx.texto)}</td>
        <td>${this.esc(this.textoRetro(g))}</td>
        <td style="${baseClass}" title="${this.esc(base.title)}">${this.esc(base.texto)}</td>
        <td>${this.esc(this.textoAcum(g))}</td>
        <td class="repac-parc" title="${this.esc(parcTxt)}">${this.esc(parcTxt)}</td>
        <td class="repac-status">${this.statusChip(this.statusGrupo(g.parcelas))}</td>
      </tr>${aberto ? this.parcelasHtml(g) : ""}`;
    }).join("");
    return `
      <div class="cc-scroll">
        <table class="cc-table repac-titulos">
          <colgroup>
            <col class="repac-c-seta">
            <col class="repac-c-tit">
            <col class="repac-c-cli">
            <col class="repac-c-emp">
            <col class="repac-c-doc">
            <col class="repac-c-obra">
            <col class="repac-c-idx">
            <col class="repac-c-retro">
            <col class="repac-c-base">
            <col class="repac-c-acum">
            <col class="repac-c-parc">
            <col class="repac-c-st">
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>Título</th>
              <th>Cliente</th>
              <th>Empresa</th>
              <th>Documento</th>
              <th>Empreendimento</th>
              <th>Indexador</th>
              <th>Retro</th>
              <th>Data base</th>
              <th>Acum. 12m</th>
              <th>Parcelas</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${body || `<tr><td colspan="12" style="text-align:center;padding:20px;color:#64748b;">Nenhum título neste filtro.</td></tr>`}</tbody>
        </table>
      </div>
      ${grupos.length > 800 ? `<p style="font-size:0.8rem;color:#64748b;">Exibindo 800 de ${grupos.length} títulos.</p>` : ""}
    `;
  },

  render() {
    const root = document.getElementById("repactuacao-lote-root");
    if (!root) return;
    const c = this.contagens();
    const n = c.n;
    const conferindo = !!this.state.loading;
    root.innerHTML = `
      <div class="cc-page repac-page">
        ${this.previewHtml()}
        ${conferindo ? `<div class="repac-carga-tela">${this.cargaHtml()}</div>` : `
        <div id="repac-filtros">${n ? this.filtrosHtml() : ""}</div>
        ${n ? `<div id="repac-kpis" class="repac-kpis">${this.kpisHtml(c)}</div>` : ""}
        <div id="repac-table-wrap">${this.tableHtml()}</div>`}
      </div>
    `;
    this.bindUpload();
    this.bindFiltros();
    if (window.lucide) window.lucide.createIcons();
  }
};

window.RepactuacaoLoteApp = RepactuacaoLoteApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "repactuacao-lote") RepactuacaoLoteApp.init();
});
