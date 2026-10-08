/**
 * Compras · Dashboard.
 * Conta o título pela data em que entrou no Sienge (registeredDate).
 * O tempo para cadastrar é a diferença, em dias, até a data de emissão (issueDate).
 */
const ComprasDashboardApp = {
  META_SCALE: 10,
  MONTHS: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
  state: {
    inited: false,
    loading: false,
    loaded: false,
    error: "",
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
      .cdash-kpis { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; }
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
      @media (max-width: 980px) { .cdash-grid { grid-template-columns: 1fr; } }
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

  collect(payload, bag) {
    const bills = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      bag.push({
        id: String(bill.billId),
        doc: String(bill.documentIdentificationId || "").trim().toUpperCase() || "—",
        issue: this.isoDate(bill.issueDate),
        registered: this.isoDate(bill.registeredDate),
        depts: this.deptOf(bill)
      });
    });
  },

  dedupe(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const prev = map.get(row.id);
      if (!prev) {
        map.set(row.id, {
          id: row.id,
          doc: row.doc,
          issue: row.issue,
          registered: row.registered,
          depts: row.depts.slice()
        });
        return;
      }
      if (!prev.issue && row.issue) prev.issue = row.issue;
      if (!prev.registered && row.registered) prev.registered = row.registered;
      if (row.registered && prev.registered && row.registered < prev.registered) prev.registered = row.registered;
      row.depts.forEach((d) => {
        const key = d.id + "|" + this.fold(d.name);
        if (!prev.depts.some((x) => (x.id + "|" + this.fold(x.name)) === key)) prev.depts.push(d);
      });
    });
    return [...map.values()].map((row) => {
      row.days = this.dayDiff(row.issue, row.registered);
      return row;
    });
  },

  async load() {
    if (this.state.loading) return;
    this.state.loading = true;
    this.state.error = "";
    this.render();
    const win = this.windows();
    const fetchStart = this.addDays(win.histStart, -400);
    const bag = [];
    try {
      if (typeof window.siengeFetchWithRetry !== "function") throw new Error("API Sienge indisponível.");
      let cursor = fetchStart;
      while (cursor <= win.today) {
        const sliceEnd = this.addDays(cursor, 119);
        const end = sliceEnd > win.today ? win.today : sliceEnd;
        const endpoint = "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(cursor)
          + "&endDate=" + encodeURIComponent(end)
          + "&selectionType=I&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
        const payload = await window.siengeFetchWithRetry(endpoint, 2);
        this.collect(payload, bag);
        cursor = this.addDays(end, 1);
      }
      this.state.titles = this.dedupe(bag);
      this.state.updatedAt = new Date();
      this.state.loaded = true;
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
    return row.depts.some((d) => d.id === key || this.fold(d.name) === key);
  },

  scoped() {
    const win = this.windows();
    return (this.state.titles || []).filter((row) =>
      row.registered && row.registered >= win.histStart && row.registered <= win.today
      && this.titleVisible(row) && this.titleInDept(row)
    );
  },

  avgOf(rows) {
    const days = rows.map((r) => r.days).filter((d) => d != null && Number.isFinite(d));
    if (!days.length) return null;
    return days.reduce((a, b) => a + b, 0) / days.length;
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

  months() {
    const win = this.windows();
    const out = [];
    for (let i = 0; i < 13; i++) {
      const iso = this.shiftMonth(win.histStart, i);
      const month = Number(iso.slice(5, 7)) - 1;
      out.push({
        key: iso.slice(0, 7),
        label: this.MONTHS[month],
        year: iso.slice(0, 4),
        showYear: i === 0 || month === 0
      });
    }
    return out;
  },

  barsHtml(rows) {
    const months = this.months();
    const counts = months.map((m) => rows.filter((r) => String(r.registered).slice(0, 7) === m.key).length);
    const max = Math.max(1, ...counts);
    return '<div class="cdash-bars">' + months.map((m, i) => {
      const h = Math.round((counts[i] / max) * 112);
      return '<div class="cdash-bar"><b>' + this.fmtInt(counts[i]) + '</b><div class="col" style="height:' + h + 'px"></div><small>' + m.label + '</small><em>' + (m.showYear ? m.year : "") + '</em></div>';
    }).join("") + "</div>";
  },

  areaHtml(rows) {
    const months = this.months();
    const avgs = months.map((m) => this.avgOf(rows.filter((r) => String(r.registered).slice(0, 7) === m.key)));
    const nums = avgs.filter((n) => n != null);
    const min = nums.length ? Math.min(...nums) : 0;
    const max = nums.length ? Math.max(...nums) : 1;
    const pad = Math.max(0.4, (max - min) * 0.2);
    const lo = Math.max(0, min - pad);
    const hi = max + pad;
    const w = 640;
    const h = 168;
    const left = 28;
    const right = 12;
    const top = 18;
    const bottom = 36;
    const iw = w - left - right;
    const ih = h - top - bottom;
    const x = (i) => left + (months.length === 1 ? iw / 2 : (iw * i) / (months.length - 1));
    const y = (v) => top + ih - ((v - lo) / (hi - lo || 1)) * ih;
    const pts = avgs.map((v, i) => (v == null ? null : [x(i), y(v)]));
    let d = "";
    pts.forEach((p) => {
      if (!p) return;
      d += (d ? " L " : "M ") + p[0].toFixed(1) + " " + p[1].toFixed(1);
    });
    const first = pts.find(Boolean);
    const last = [...pts].reverse().find(Boolean);
    const area = first && last
      ? d + " L " + last[0].toFixed(1) + " " + (top + ih) + " L " + first[0].toFixed(1) + " " + (top + ih) + " Z"
      : "";
    const labels = pts.map((p, i) => {
      if (!p) return "";
      return '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] - 7).toFixed(1) + '" text-anchor="middle" font-size="10" fill="#334155">' + this.fmtDays(avgs[i]) + '</text>';
    }).join("");
    const axis = months.map((m, i) => {
      return '<text x="' + x(i).toFixed(1) + '" y="' + (h - 16) + '" text-anchor="middle" font-size="10" fill="#64748b">' + m.label + '</text>'
        + (m.showYear ? '<text x="' + x(i).toFixed(1) + '" y="' + (h - 4) + '" text-anchor="middle" font-size="10" fill="#94a3b8">' + m.year + '</text>' : "");
    }).join("");
    return '<svg class="cdash-area" viewBox="0 0 ' + w + " " + h + '" role="img">'
      + (area ? '<path d="' + area + '" fill="#d1d5db" stroke="#6b7280" stroke-width="1.5"></path>' : "")
      + labels + axis + "</svg>";
  },

  gaugeHtml(avg) {
    const scale = this.META_SCALE;
    const value = avg == null ? 0 : Math.max(0, avg);
    const span = Math.min(180, (Math.min(value, scale) / scale) * 180);
    const cx = 160;
    const cy = 150;
    const r = 108;
    const xy = (deg) => {
      const rad = Math.PI - (deg * Math.PI / 180);
      return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
    };
    const arc = (to) => {
      const a = xy(0);
      const b = xy(to);
      const large = to > 180 ? 1 : 0;
      return "M " + a[0].toFixed(1) + " " + a[1].toFixed(1) + " A " + r + " " + r + " 0 " + large + " 1 " + b[0].toFixed(1) + " " + b[1].toFixed(1);
    };
    const year = this.isoToday().slice(0, 4);
    return '<div class="cdash-gauge-wrap"><h3>Meta Corporativa para ' + year + '</h3><p>Meta Corporativa (em dias)</p>'
      + '<svg class="cdash-gauge" viewBox="0 0 320 210" role="img">'
      + '<path d="' + arc(180) + '" fill="none" stroke="#e5e7eb" stroke-width="34" stroke-linecap="butt"></path>'
      + (span > 0.5 ? '<path d="' + arc(span) + '" fill="none" stroke="#ef4444" stroke-width="34" stroke-linecap="butt"></path>' : "")
      + '<text x="18" y="176" font-size="12" fill="#94a3b8">0,00</text>'
      + '<text x="286" y="176" font-size="12" fill="#94a3b8">' + scale + '</text>'
      + '<text class="cdash-gauge-num" x="160" y="132" text-anchor="middle">' + this.fmtDays(avg) + '</text>'
      + '<text class="cdash-gauge-sub" x="160" y="154" text-anchor="middle">Resultado do Departamento</text>'
      + "</svg></div>";
  },

  tableHtml(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = row.doc || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    const lines = [...map.entries()].map(([doc, list]) => ({
      doc,
      count: list.length,
      avg: this.avgOf(list)
    })).sort((a, b) => {
      const av = a.avg == null ? -1 : a.avg;
      const bv = b.avg == null ? -1 : b.avg;
      if (bv !== av) return bv - av;
      return b.count - a.count;
    });
    const max = Math.max(1, ...lines.map((l) => (l.avg == null ? 0 : l.avg)), this.avgOf(rows) || 0);
    const time = (avg) => {
      const w = avg == null ? 0 : Math.max(2, Math.round((avg / max) * 140));
      return '<div class="cdash-time"><i style="width:' + w + 'px"></i><span>' + this.fmtDays(avg) + "</span></div>";
    };
    const body = lines.map((l) =>
      "<tr><td>" + this.esc(l.doc) + '</td><td class="num">' + this.fmtInt(l.count) + '</td><td class="num">' + time(l.avg) + "</td></tr>"
    ).join("");
    const total = '<tr class="total"><td>Total</td><td class="num">' + this.fmtInt(rows.length) + '</td><td class="num">' + time(this.avgOf(rows)) + "</td></tr>";
    return '<div class="cdash-table-wrap"><table class="cdash-table"><thead><tr>'
      + "<th>Código documento</th><th class=\"num\">Total Títulos Lançados</th><th class=\"num\">Tempo para Cadastrar (média dias)</th>"
      + "</tr></thead><tbody>" + body + total + "</tbody></table></div>";
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
    const recent = hist.filter((r) => r.registered >= win.avgStart && r.registered <= win.today);
    const avg = this.avgOf(recent);
    let body;
    const access = this.access();
    if (this.state.loading) {
      body = '<div class="cdash-msg">Carregando títulos lançados…</div>';
    } else if (this.state.error) {
      body = '<div class="cdash-msg">' + this.esc(this.state.error) + '<div style="margin-top:12px;"><button type="button" class="cdash-btn" id="cdash-retry">Atualizar</button></div></div>';
    } else if (Array.isArray(access) && !access.length) {
      body = '<div class="cdash-msg">Seu usuário não tem departamento cadastrado.</div>';
    } else if (!hist.length) {
      body = '<div class="cdash-msg">Nenhum título lançado de ' + this.fmtBr(win.histStart) + " até " + this.fmtBr(win.today) + ".</div>";
    } else {
      body = '<div class="cdash-grid"><div>'
        + '<div class="cdash-kpis"><div class="cdash-kpi"><span>Total Títulos Lançados</span><strong>' + this.fmtInt(recent.length) + '</strong></div>'
        + '<div class="cdash-kpi"><span>Tempo para Cadastrar (média dias)</span><strong>' + this.fmtDays(avg) + "</strong></div></div>"
        + '<p class="cdash-cap">Média de ' + this.fmtBr(win.avgStart) + " a " + this.fmtBr(win.today) + ". Dias entre a emissão do documento e a inclusão no Sienge.</p>"
        + '<div class="cdash-block"><h3>Histórico Títulos Lançados</h3>' + this.barsHtml(hist) + "</div>"
        + '<div class="cdash-block"><h3>Tempo para Cadastrar (média dias)</h3>' + this.areaHtml(hist) + "</div>"
        + "</div><div>" + this.gaugeHtml(avg) + this.tableHtml(recent) + "</div></div>";
    }
    root.innerHTML = '<div class="cdash">'
      + '<div class="cdash-top"><div><label>Departamento</label>' + select + '</div>'
      + '<div><label>Data Atualização</label><div class="cdash-stamp">' + this.esc(this.stamp(this.state.updatedAt)) + "</div></div>"
      + '<button type="button" class="cdash-btn" id="cdash-refresh">Atualizar</button></div>'
      + '<h2 class="cdash-title"><span class="cdash-dots"><i style="background:#105436"></i><i style="background:#f37021"></i><i style="background:#86efac"></i><i style="background:#f59e0b"></i></span>Dashboard</h2>'
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
