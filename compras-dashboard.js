/**
 * Compras · Dashboard.
 * Conta o documento pela data em que entrou no Sienge (registeredDate).
 * O prazo de pagamento é o vencimento menos a emissão, ponderado pelo valor.
 */
const ComprasDashboardApp = {
  state: {
    inited: false,
    loading: false,
    loaded: false,
    error: "",
    etapa: "",
    pct: 8,
    titles: [],
    deptKey: "",
    updatedAt: null
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  },

  isoToday() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  isoDate(v) {
    const s = String(v == null ? "" : v).trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  },

  shiftMonth(iso, delta) {
    const y = Number(String(iso).slice(0, 4));
    const m = Number(String(iso).slice(5, 7)) - 1;
    const d = new Date(y, m + delta, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01";
  },

  addDays(iso, days) {
    const s = this.isoDate(iso);
    const d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  dayDiff(issue, registered) {
    const a = this.isoDate(issue);
    const b = this.isoDate(registered);
    if (!a || !b) return null;
    const da = Date.parse(a + "T12:00:00");
    const db = Date.parse(b + "T12:00:00");
    if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
    return Math.round((db - da) / 86400000);
  },

  fmtInt(n) {
    return Number(n || 0).toLocaleString("pt-BR");
  },

  fmtDays(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  },

  stamp(d) {
    if (!d) return "—";
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear()
      + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  },

  fmtBr(iso) {
    const s = this.isoDate(iso);
    if (!s) return "—";
    return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
  },

  windows() {
    const today = this.isoToday();
    const histStart = this.shiftMonth(today, -12);
    const avgStart = this.shiftMonth(today, -3);
    return { today, histStart, avgStart };
  },

  access() {
    const app = window.ComprasPrevisoesApp;
    if (!app || typeof app.accessibleDepartments !== "function") return null;
    return app.accessibleDepartments();
  },

  injectCss() {
    if (document.getElementById("cdash-style")) return;
    const style = document.createElement("style");
    style.id = "cdash-style";
    style.textContent = `
      .cdash { color: #334155; }
      .cdash-top { display: flex; justify-content: flex-end; gap: 18px; align-items: flex-end; margin-bottom: 8px; flex-wrap: wrap; }
      .cdash-top label { display: block; font-size: 0.72rem; color: #64748b; margin-bottom: 4px; }
      .cdash-top select, .cdash-stamp { height: 34px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; padding: 0 10px; font-size: 0.85rem; color: #334155; }
      .cdash-stamp { display: flex; align-items: center; min-width: 150px; }
      .cdash-title { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: 1.35rem; font-weight: 600; color: #475569; }
      .cdash-dots { display: flex; gap: 4px; }
      .cdash-dots i { width: 14px; height: 14px; border-radius: 50%; display: block; }
      .cdash-grid { display: grid; grid-template-columns: minmax(280px, 0.9fr) minmax(360px, 1.3fr); gap: 22px; align-items: start; }
      .cdash-kpis { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; }
      .cdash-kpis + .cdash-kpis { border-bottom: 0; margin-top: 4px; }
      .cdash-load { padding: 36px 0; }
      .cdash-kpi { text-align: center; padding: 8px 8px 14px; }
      .cdash-kpi + .cdash-kpi { border-left: 1px solid #e2e8f0; }
      .cdash-kpi span { display: block; font-size: 0.78rem; color: #64748b; }
      .cdash-kpi strong { display: block; font-size: 2.4rem; font-weight: 650; color: #334155; line-height: 1.15; margin-top: 6px; }
      .cdash-cap { text-align: center; font-size: 0.75rem; color: #64748b; margin: 8px 0 16px; }
      .cdash-block h3 { text-align: center; font-size: 0.95rem; font-weight: 600; color: #64748b; margin: 8px 0 10px; }
      .cdash-bars { display: flex; align-items: flex-end; gap: 6px; height: 168px; }
      .cdash-bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 0; height: 100%; }
      .cdash-bar b { font-size: 0.68rem; color: #475569; font-weight: 650; }
      .cdash-bar .col { width: 70%; background: #6b7280; border-radius: 1px 1px 0 0; margin-top: 3px; }
      .cdash-bar small, .cdash-bar em { font-size: 0.68rem; color: #64748b; font-style: normal; line-height: 1.15; }
      .cdash-bar em { min-height: 0.8rem; }
      .cdash-area { width: 100%; height: 180px; display: block; }
      .cdash-gauge-wrap { text-align: center; }
      .cdash-gauge-wrap h3 { margin: 0; font-size: 0.95rem; color: #64748b; font-weight: 600; }
      .cdash-gauge-wrap p { margin: 2px 0 0; font-size: 0.78rem; color: #94a3b8; }
      .cdash-gauge { width: min(100%, 340px); height: auto; }
      .cdash-gauge-num { font-size: 2rem; font-weight: 650; fill: #334155; }
      .cdash-gauge-sub { font-size: 0.72rem; fill: #94a3b8; }
      .cdash-table-wrap { max-height: 420px; overflow: auto; border-top: 1px solid #e2e8f0; }
      .cdash-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .cdash-table th { text-align: left; font-weight: 600; color: #64748b; padding: 8px 6px; position: sticky; top: 0; background: #fff; }
      .cdash-table th.num, .cdash-table td.num { text-align: right; }
      .cdash-table td { padding: 5px 6px; border-top: 1px solid #f1f5f9; }
      .cdash-table tr.total td { font-weight: 750; border-top: 1px solid #cbd5e1; }
      .cdash-time { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
      .cdash-time i { display: block; height: 14px; background: #f43f5e; border-radius: 2px; min-width: 2px; }
      .cdash-msg { padding: 28px 8px; text-align: center; color: #64748b; }
      .cdash-btn { height: 34px; border: 1px solid #105436; background: #105436; color: #fff; border-radius: 6px; font-weight: 700; padding: 0 12px; cursor: pointer; }
      @media (max-width: 980px) { .cdash-grid, .cdash-kpis { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  },

  deptOf(bill) {
    const list = Array.isArray(bill && bill.departamentsCosts) ? bill.departamentsCosts : [];
    return list.map((dep) => {
      const id = dep && (dep.id != null ? dep.id : (dep.departmentId != null ? dep.departmentId : dep.departamentId));
      return {
        id: id != null ? String(id) : "",
        name: String((dep && dep.name) || "").trim()
      };
    }).filter((d) => d.id || d.name);
  },

  tipoNota(code, name) {
    const c = this.fold(code).replace(/[^A-Z0-9]/g, "");
    const n = this.fold(name);
    if (c.indexOf("NFSE") === 0 || c === "NFS" || c.indexOf("NFS") === 0 || n.indexOf("SERVIC") >= 0) return "NFS";
    if (c.indexOf("NFE") === 0 || (n.indexOf("ELETRON") >= 0 && n.indexOf("SERVIC") < 0)) return "NFE";
    return "";
  },

  collect(payload, bag) {
    const bills = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const doc = String(bill.documentIdentificationId || "").trim().toUpperCase();
      const nome = String(bill.documentIdentificationName || "").trim();
      const amount = Number(bill.originalAmount != null ? bill.originalAmount : (bill.balanceAmount != null ? bill.balanceAmount : bill.amount));
      bag.push({
        id: String(bill.billId),
        parcela: bill.installmentId != null ? String(bill.installmentId) : "",
        doc: doc || "—",
        tipo: this.tipoNota(doc, nome),
        issue: this.isoDate(bill.issueDate),
        registered: this.isoDate(bill.registeredDate),
        due: this.isoDate(bill.dueDate),
        amount: Number.isFinite(amount) ? amount : 0,
        depts: this.deptOf(bill)
      });
    });
  },

  dedupe(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = row.id + "|" + row.parcela + "|" + row.due;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          id: row.id,
          parcela: row.parcela,
          doc: row.doc,
          tipo: row.tipo,
          issue: row.issue,
          registered: row.registered,
          due: row.due,
          amount: row.amount,
          depts: row.depts.slice()
        });
        return;
      }
      if (!prev.issue && row.issue) prev.issue = row.issue;
      if (!prev.registered && row.registered) prev.registered = row.registered;
      if (row.registered && prev.registered && row.registered < prev.registered) prev.registered = row.registered;
      if (!prev.due && row.due) prev.due = row.due;
      if (!prev.tipo && row.tipo) prev.tipo = row.tipo;
      if (!(prev.amount > 0) && row.amount > 0) prev.amount = row.amount;
      row.depts.forEach((d) => {
        const mark = d.id + "|" + this.fold(d.name);
        if (!prev.depts.some((x) => (x.id + "|" + this.fold(x.name)) === mark)) prev.depts.push(d);
      });
    });
    return [...map.values()].map((row) => {
      row.prazo = this.dayDiff(row.issue, row.due);
      return row;
    });
  },

  payloadRows(payload) {
    return (payload && payload.data) || (Array.isArray(payload) ? payload : []);
  },

  async fetchOutcome(start, end, depth) {
    const endpoint = "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=I&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
    try {
      return await window.siengeFetchWithRetry(endpoint, 1);
    } catch (err) {
      const st = Number(err && err.status);
      const pesado = st === 500 || st === 502 || st === 503 || st === 504 || st === 507;
      const a = new Date(String(start).slice(0, 10) + "T12:00:00");
      const b = new Date(String(end).slice(0, 10) + "T12:00:00");
      const dias = Math.round((b - a) / 86400000);
      if (!pesado || depth > 10 || !(dias >= 14)) {
        if (st === 502) throw new Error("O Sienge não respondeu ao contas a pagar (502). Atualize de novo.");
        throw err;
      }
      const meio = new Date(a.getTime() + Math.floor((b - a) / 2));
      const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const esqFim = iso(meio);
      const dir = new Date(meio.getTime());
      dir.setDate(dir.getDate() + 1);
      const dirIni = iso(dir);
      if (esqFim <= start || dirIni > end) throw err;
      const left = await this.fetchOutcome(start, esqFim, depth + 1);
      const right = await this.fetchOutcome(dirIni, end, depth + 1);
      return { data: this.payloadRows(left).concat(this.payloadRows(right)) };
    }
  },

  async load() {
    if (this.state.loading) return;
    this.state.loading = true;
    this.state.error = "";
    this.state.etapa = "Buscando os títulos a pagar…";
    this.state.pct = 12;
    this.render();
    const win = this.windows();
    const fetchStart = this.addDays(win.histStart, -400);
    const bag = [];
    try {
      if (typeof window.siengeFetchWithRetry !== "function") throw new Error("API Sienge indisponível.");
      const ini = new Date(fetchStart + "T12:00:00");
      const fim = new Date(win.today + "T12:00:00");
      const total = Math.max(1, Math.round((fim - ini) / 86400000));
      let cursor = fetchStart;
      while (cursor <= win.today) {
        const sliceEnd = this.addDays(cursor, 89);
        const end = sliceEnd > win.today ? win.today : sliceEnd;
        const feito = new Date(cursor + "T12:00:00");
        this.state.etapa = "Buscando os títulos a pagar…";
        this.state.pct = Math.max(12, Math.min(92, Math.round(((feito - ini) / 86400000) / total * 100)));
        this.render();
        const payload = await this.fetchOutcome(cursor, end, 0);
        this.collect(payload, bag);
        cursor = this.addDays(end, 1);
      }
      this.state.titles = this.dedupe(bag);
      this.state.updatedAt = new Date();
      this.state.loaded = true;
      this.state.pct = 100;
    } catch (e) {
      this.state.error = (e && e.message) ? e.message : "Falha ao buscar os títulos no Sienge.";
      this.state.titles = [];
    }
    this.state.loading = false;
    this.render();
  },

  titleVisible(row) {
    const access = this.access();
    if (!access) return true;
    const allowed = new Set(access.map((a) => String(a.id)));
    return row.depts.some((d) => allowed.has(d.id) || allowed.has(this.fold(d.name)));
  },

  titleInDept(row) {
    const key = String(this.state.deptKey || "");
    if (!key) return true;
    const folded = this.fold(key);
    return row.depts.some((d) => d.id === key || this.fold(d.id) === folded || this.fold(d.name) === folded);
  },

  scoped() {
    const win = this.windows();
    return (this.state.titles || []).filter((row) =>
      row.registered && row.registered >= win.histStart && row.registered <= win.today
      && this.titleVisible(row) && this.titleInDept(row)
    );
  },

  deptOptions() {
    const access = this.access();
    if (Array.isArray(access)) {
      return access.map((a) => ({ id: String(a.id), label: a.label || a.name || a.id }));
    }
    const map = new Map();
    (this.state.titles || []).forEach((row) => {
      row.depts.forEach((d) => {
        const id = d.id || this.fold(d.name);
        if (!id || map.has(id)) return;
        map.set(id, d.name || d.id);
      });
    });
    return [...map.entries()]
      .map(([id, label]) => ({ id, label: String(label).toUpperCase() }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  },

  pmp(rows) {
    const porDoc = new Map();
    (rows || []).forEach((row) => {
      if (row.prazo == null || !Number.isFinite(row.prazo)) return;
      if (!porDoc.has(row.id)) porDoc.set(row.id, { dias: [], amount: 0 });
      const item = porDoc.get(row.id);
      item.dias.push(row.prazo);
      if (row.amount > item.amount) item.amount = row.amount;
    });
    let peso = 0;
    let soma = 0;
    const soltos = [];
    porDoc.forEach((item) => {
      const medio = item.dias.reduce((a, b) => a + b, 0) / item.dias.length;
      if (item.amount > 0.009) {
        peso += item.amount;
        soma += item.amount * medio;
      } else soltos.push(medio);
    });
    if (peso > 0.009) return soma / peso;
    if (!soltos.length) return null;
    return soltos.reduce((a, b) => a + b, 0) / soltos.length;
  },

  documentos(rows) {
    return new Set((rows || []).map((r) => r.id)).size;
  },

  doTipo(rows, tipo) {
    return (rows || []).filter((r) => r.tipo === tipo);
  },

  deptRows(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
      const depts = row.depts.length ? row.depts : [{ id: "", name: "Sem departamento" }];
      depts.forEach((d) => {
        const id = d.id || this.fold(d.name) || "sem";
        if (!map.has(id)) map.set(id, { nome: (d.name || d.id || "Sem departamento").toUpperCase(), rows: [] });
        map.get(id).rows.push(row);
      });
    });
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },

  tabelaHtml(rows) {
    const linhas = this.deptRows(rows);
    const cel = (lista, tipo) => {
      const parte = this.doTipo(lista, tipo);
      return '<td class="num">' + this.fmtInt(this.documentos(parte)) + '</td><td class="num">' + this.fmtDays(this.pmp(parte)) + "</td>";
    };
    const corpo = linhas.map((l) =>
      "<tr><td>" + this.esc(l.nome) + "</td>" + cel(l.rows, "NFE") + cel(l.rows, "NFS") + "</tr>"
    ).join("");
    const total = '<tr class="total"><td>Total</td>' + cel(rows, "NFE") + cel(rows, "NFS") + "</tr>";
    return '<div class="cdash-table-wrap"><table class="cdash-table"><thead><tr>'
      + '<th>Departamento</th><th class="num">NFe</th><th class="num">PMP NFe</th><th class="num">NFS</th><th class="num">PMP NFS</th>'
      + "</tr></thead><tbody>" + corpo + total + "</tbody></table></div>";
  },

  render() {
    const root = document.getElementById("compras-dashboard-root");
    if (!root) return;
    this.injectCss();
    const win = this.windows();
    const options = this.deptOptions();
    const locked = Array.isArray(this.access()) && options.length <= 1;
    if (locked && options[0]) this.state.deptKey = options[0].id;
    const known = new Set(options.map((o) => o.id));
    if (this.state.deptKey && !known.has(this.state.deptKey)) this.state.deptKey = "";
    const select = '<select id="cdash-dept"' + (locked ? " disabled" : "") + ">"
      + (locked ? "" : '<option value="">Todos</option>')
      + options.map((o) => '<option value="' + this.esc(o.id) + '"' + (o.id === this.state.deptKey ? " selected" : "") + ">" + this.esc(o.label) + "</option>").join("")
      + "</select>";
    const hist = this.scoped();
    const nfe = this.doTipo(hist, "NFE");
    const nfs = this.doTipo(hist, "NFS");
    let body;
    const access = this.access();
    if (this.state.loading) {
      const pct = Math.max(8, Math.min(96, Number(this.state.pct) || 12));
      body = '<div class="ml-load cdash-load"><div class="loading-spinner" aria-hidden="true"></div>'
        + '<div class="loading-status-text">' + this.esc(this.state.etapa || "Buscando os títulos a pagar…") + "</div>"
        + '<div class="ml-load-track"><div class="loading-progress-bar" style="width:' + pct + '%"></div></div></div>';
    } else if (this.state.error) {
      body = '<div class="cdash-msg">' + this.esc(this.state.error) + '<div style="margin-top:12px;"><button type="button" class="cdash-btn" id="cdash-retry">Atualizar</button></div></div>';
    } else if (Array.isArray(access) && !access.length) {
      body = '<div class="cdash-msg">Seu usuário não tem departamento cadastrado.</div>';
    } else if (!hist.length) {
      body = '<div class="cdash-msg">Nenhum documento inserido de ' + this.fmtBr(win.histStart) + " até " + this.fmtBr(win.today) + ".</div>";
    } else {
      body = '<div class="cdash-kpis">'
        + '<div class="cdash-kpi"><span>Documentos inseridos</span><strong>' + this.fmtInt(this.documentos(hist)) + "</strong></div>"
        + '<div class="cdash-kpi"><span>NFe</span><strong>' + this.fmtInt(this.documentos(nfe)) + "</strong></div>"
        + '<div class="cdash-kpi"><span>NFS</span><strong>' + this.fmtInt(this.documentos(nfs)) + "</strong></div></div>"
        + '<div class="cdash-kpis">'
        + '<div class="cdash-kpi"><span>Prazo médio NFe (dias)</span><strong>' + this.fmtDays(this.pmp(nfe)) + "</strong></div>"
        + '<div class="cdash-kpi"><span>Prazo médio NFS (dias)</span><strong>' + this.fmtDays(this.pmp(nfs)) + "</strong></div>"
        + "<div class=\"cdash-kpi\"><span>Período</span><strong style=\"font-size:1.05rem;margin-top:14px\">" + this.fmtBr(win.histStart) + " a " + this.fmtBr(win.today) + "</strong></div></div>"
        + '<p class="cdash-cap">Inclusão no Sienge neste período. O prazo é o vencimento menos a emissão, ponderado pelo valor da parcela. Um documento em mais de um departamento entra em cada linha. O total é a quantidade única.</p>'
        + this.tabelaHtml(hist);
    }
    root.innerHTML = '<div class="cdash">'
      + '<div class="cdash-top"><div><label>Departamento</label>' + select + '</div>'
      + '<div><label>Data Atualização</label><div class="cdash-stamp">' + this.esc(this.stamp(this.state.updatedAt)) + "</div></div>"
      + '<button type="button" class="cdash-btn" id="cdash-refresh">Atualizar</button></div>'
      + body + "</div>";
    const dept = document.getElementById("cdash-dept");
    if (dept) dept.addEventListener("change", () => {
      this.state.deptKey = dept.value;
      this.render();
    });
    const refresh = document.getElementById("cdash-refresh");
    if (refresh) refresh.addEventListener("click", () => this.load());
    const retry = document.getElementById("cdash-retry");
    if (retry) retry.addEventListener("click", () => this.load());
  },

  init() {
    this.state.inited = true;
    this.render();
    if (!this.state.loaded && !this.state.loading) this.load();
  }
};

window.ComprasDashboardApp = ComprasDashboardApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "compras-dashboard" && window.ComprasDashboardApp) {
    ComprasDashboardApp.init();
  }
});
