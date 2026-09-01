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
    firstBusinessDay: null,
    empresa: "",
    rows: [],
    indexers: [],
    ratesByIndexer: {},
    filter: "all"
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
    this.state.inited = true;
    this.render();
  },

  bindUpload() {
    const dz = document.getElementById("repac-dropzone");
    const input = document.getElementById("repac-input-excel");
    if (!dz || !input) return;
    dz.onclick = () => input.click();
    input.onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) this.loadFile(f);
    };
    ["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
      dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    dz.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /\.xlsx?$/i.test(f.name)) this.loadFile(f);
    });
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

  findColMap(matrix) {
    const want = {
      cliente: ["cliente"],
      documento: ["documento"],
      titulo: ["título", "titulo"],
      parcela: ["parcela"],
      vencimento: ["data"],
      indexerId: ["id"],
      baseDate: ["data"],
      valor: ["valor"],
      emAberto: ["em aberto"],
      ultimo: ["último", "ultimo"]
    };
    for (let r = 0; r < Math.min(matrix.length, 40); r++) {
      const row = (matrix[r] || []).map((c) => String(c || "").trim().toLowerCase());
      if (!row.some((c) => c === "cliente" || c === "parcela" || c === "título" || c === "titulo")) continue;
      const map = { headerRow: r };
      row.forEach((c, i) => {
        if (want.cliente.includes(c) && map.cliente == null) map.cliente = i;
        if (want.documento.includes(c) && map.documento == null) map.documento = i;
        if (want.titulo.includes(c) && map.titulo == null) map.titulo = i;
        if (want.parcela.includes(c) && map.parcela == null) map.parcela = i;
        if (want.emAberto.includes(c) && map.emAberto == null) map.emAberto = i;
        if (want.ultimo.includes(c) && map.ultimo == null) map.ultimo = i;
      });
      const dataCols = [];
      row.forEach((c, i) => { if (c === "data") dataCols.push(i); });
      if (dataCols[0] != null && map.parcela != null && dataCols[0] > map.parcela) map.vencimento = dataCols[0];
      else if (dataCols[0] != null) map.refDate = dataCols[0];
      if (dataCols[1] != null) map.vencimento = map.vencimento != null ? map.vencimento : dataCols[1];
      const idIdx = row.findIndex((c, i) => c === "id" && (map.parcela == null || i > map.parcela));
      if (idIdx >= 0) map.indexerId = idIdx;
      if (idIdx >= 0) {
        const afterId = dataCols.find((i) => i > idIdx);
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

      rows.push({
        empresa, cc, cliente, documento, titulo,
        parcela: Math.round(parcela),
        vencimento: this.parseDate(row[col.vencimento]),
        indexerId,
        excelBase: this.parseDate(row[col.baseDate]),
        excelValor: valor,
        emAberto: this.parseBRNumber(row[col.emAberto])
      });
    });

    this.state.empresa = empresa;
    this.state.period = period;
    const start = period && period.start ? period.start : null;
    const [yy, mm] = start ? start.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
    this.state.adjustDate = start || `${yy}-${String(mm).padStart(2, "0")}-01`;
    this.state.firstBusinessDay = this.firstBusinessDay(yy, mm);
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
    for (let i = 0; i < titles.length; i++) {
      if (this.state.stop) break;
      const titulo = titles[i];
      const el = document.getElementById("repac-progress");
      if (el) el.textContent = `Conferindo valores no Sienge ${i + 1}/${titles.length} (título ${titulo})…`;
      try {
        const insts = await this.fetchInstallments(titulo);
        this.state.rows = this.state.rows.map((row) => {
          if (String(row.titulo) !== String(titulo)) return row;
          const hit = (insts || []).find((x) => Number(x.installmentNumber || x.number) === Number(row.parcela));
          const cur = hit
            ? Number(
              hit.value != null ? hit.value
                : (hit.installmentValue != null ? hit.installmentValue
                  : (hit.currentValue != null ? hit.currentValue : hit.originalValue))
            )
          const projetado = cur != null && row.factor ? cur * row.factor : null;
          const valorOk = projetado != null && row.excelValor != null
            ? Math.abs(projetado - row.excelValor) <= Math.max(0.05, Math.abs(row.excelValor) * 0.002)
            : null;
          return { ...row, siengeValor: cur, crmProjetado: projetado, valorOk };
        });
      } catch (e) {
        console.warn("[Repactuação] título", titulo, e);
      }
      if ((i + 1) % 8 === 0) this.renderTableOnly();
    }
    this.state.loading = false;
    this.render();
  },

  async fetchInstallments(titulo) {
    const id = String(titulo || "").replace(/^B-/, "");
    if (!id || typeof window.siengeFetchWithRetry !== "function") return [];
    const res = await siengeFetchWithRetry(`/accounts-receivable/receivable-bills/${encodeURIComponent(id)}/installments`);
    return (res && (res.results || res.data)) || [];
  },

  setFilter(f) {
    this.state.filter = f;
    this.render();
  },

  parar() {
    this.state.stop = true;
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

  tableHtml() {
    const rows = this.filteredRows();
    if (!this.state.rows.length) {
      return `<p style="color:#64748b;padding:24px;text-align:center;">Envie a planilha <strong>Títulos para Repactuação</strong> para conferir data base (-1 / -2) e o valor projetado.</p>`;
    }
    const body = rows.slice(0, 800).map((r) => {
      const baseClass = r.baseOk === false ? "color:#b91c1c;font-weight:700;" : (r.baseOk ? "color:#15803d;" : "");
      const valClass = r.valorOk === false ? "color:#b91c1c;font-weight:700;" : (r.valorOk ? "color:#15803d;" : "");
      const st = r.baseOk === false || r.valorOk === false
        ? `<span class="est-fin-chip est-fin-Inadimplente">Divergente</span>`
        : (r.valorOk && r.baseOk
          ? `<span class="est-fin-chip est-fin-Adimplente">Bateu</span>`
          : `<span class="est-fin-chip est-fin-apurar">Conferindo</span>`);
      return `<tr>
        <td>${this.esc(r.titulo)}</td>
        <td>${this.esc(r.cliente)}</td>
        <td>${this.esc(r.documento)}</td>
        <td>${this.esc(r.cc)}</td>
        <td>${this.esc(r.parcela)}</td>
        <td>${this.esc(this.fmtDate(r.vencimento))}</td>
        <td>${this.esc(r.indexerId)} — ${this.esc(r.indexerName)}</td>
        <td>${r.retro == null ? "—" : this.esc(r.retro)}</td>
        <td style="${baseClass}">${this.esc(this.fmtDate(r.excelBase))}</td>
        <td style="${baseClass}">${this.esc(this.fmtDate(r.expectedBase))}</td>
        <td>${this.esc(this.pct(r.accPct))}</td>
        <td style="text-align:right;">${this.esc(this.money(r.siengeValor))}</td>
        <td style="text-align:right;${valClass}">${this.esc(this.money(r.crmProjetado))}</td>
        <td style="text-align:right;${valClass}">${this.esc(this.money(r.excelValor))}</td>
        <td>${st}</td>
      </tr>`;
    }).join("");
    return `
      <div class="table-container crm-scroll-table" style="max-height:62vh;">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Título</th><th>Cliente</th><th>Documento</th><th>Centro</th>
              <th>Parcela</th><th>Vencimento</th><th>Indexador</th><th>Retro</th>
              <th>Data base (Excel)</th><th>Data base (CRM)</th><th>Acum. 12m</th>
              <th>Valor atual Sienge</th><th>Projetado CRM</th><th>Valor Excel</th><th>Status</th>
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
    root.innerHTML = `
      <div class="est-stock-page">
        <div class="search-filter-panel" style="margin-bottom:16px;">
          <h2 style="display:flex;align-items:center;gap:8px;margin:0 0 8px;">
            <i data-lucide="refresh-cw" style="width:24px;color:var(--color-primary);"></i>
            Repactuação
          </h2>
          <p style="font-size:0.9rem;color:var(--color-text-muted);margin:0 0 16px;">
            Upload da planilha <strong>Títulos para Repactuação</strong>. O reajuste é no
            <strong>1º dia útil do mês</strong>
            ${this.state.firstBusinessDay ? `(${this.fmtDate(this.state.firstBusinessDay)})` : ""}.
            A data base do indexador segue o cadastro do Sienge (<strong>-1</strong> ou <strong>-2</strong> meses),
            igual à aba Repactuações da ficha: acumulado de 12 meses até essa data base.
          </p>
          <div id="repac-dropzone" class="dropzone" style="border:2px dashed var(--color-primary);padding:28px;text-align:center;border-radius:8px;cursor:pointer;background:#f8fafc;">
            <i data-lucide="file-spreadsheet" style="width:40px;height:40px;color:var(--color-primary);margin-bottom:8px;"></i>
            <p style="margin:0;color:#334155;">Clique ou arraste o Excel (.xlsx)</p>
            ${this.state.fileName ? `<p style="margin:8px 0 0;font-size:0.85rem;color:#15803d;">${this.esc(this.state.fileName)}</p>` : ""}
            <input type="file" id="repac-input-excel" accept=".xlsx,.xls" style="display:none;">
          </div>
          <p id="repac-progress" style="font-size:0.82rem;color:#64748b;margin:10px 0 0;">${this.state.loading ? "Processando…" : (n ? `${n} parcelas · ${titles} títulos` : "")}</p>
          ${this.state.loading ? `<button type="button" class="btn btn-cancel" style="margin-top:8px;" onclick="RepactuacaoLoteApp.parar()">Parar</button>` : ""}
        </div>
        ${n ? `
        <div class="est-stock-kpis" style="margin-bottom:12px;">
          <div class="est-fin-card"><label>Parcelas</label><strong>${n}</strong></div>
          <div class="est-fin-card is-ok"><label>Bateram</label><strong>${ok}</strong></div>
          <div class="est-fin-card is-warn"><label>Data base divergente</label><strong>${baseFail}</strong></div>
          <div class="est-fin-card is-warn"><label>Valor divergente</label><strong>${valFail}</strong></div>
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
