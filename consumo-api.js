/**
 * Segurança · Consumo de API Sienge
 * Só leitura agregada (REST x Bulk, usuário x sistema). Sem payload, sem senha.
 */
const ConsumoApiApp = {
  days: [],
  loading: false,
  error: "",
  selected: "",

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  today() {
    if (window.ApiUsage && typeof ApiUsage.todayIso === "function") return ApiUsage.todayIso();
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  },

  fmt(n) {
    return (Number(n) || 0).toLocaleString("pt-BR");
  },

  async load() {
    this.loading = true;
    this.error = "";
    this.render();
    try {
      if (window.ApiUsage && typeof ApiUsage.flush === "function") {
        await ApiUsage.flush();
      }
      this.days = window.ApiUsage && typeof ApiUsage.loadDays === "function"
        ? await ApiUsage.loadDays(7)
        : [];
      if (!this.selected) this.selected = this.today();
    } catch (e) {
      this.error = "Não foi possível ler o consumo no Firebase.";
      this.days = [];
    }
    this.loading = false;
    this.render();
  },

  dayOf(iso) {
    return (this.days || []).find((d) => d.date === iso) || {
      date: iso, rest: 0, bulk: 0, actors: { user: 0, system: 0 }, apis: {}, users: {}
    };
  },

  ensureCss() {
    if (document.getElementById("capi-css")) return;
    const s = document.createElement("style");
    s.id = "capi-css";
    s.textContent = `
      .capi-page { padding: 18px 20px 32px; }
      .capi-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
      .capi-head h2 { margin: 0 0 6px; display: flex; align-items: center; gap: 8px; font-size: 1.2rem; font-weight: 800; color: #0f172a; }
      .capi-head p { margin: 0; max-width: 640px; font-size: 0.84rem; line-height: 1.45; color: #64748b; }
      .capi-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
      .capi-kpi { padding: 14px 16px 12px; border-top: 3px solid #105436; }
      .capi-kpi-bulk { border-top-color: #0f766e; }
      .capi-kpi-total { border-top-color: #0f172a; }
      .capi-kpi span { display: block; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; }
      .capi-kpi strong { display: block; margin-top: 4px; font-size: 1.7rem; font-weight: 800; line-height: 1.1; color: #105436; font-variant-numeric: tabular-nums; }
      .capi-kpi-bulk strong { color: #0f766e; }
      .capi-kpi-total strong { color: #0f172a; }
      .capi-grid { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 12px; align-items: start; }
      .capi-card { padding: 0; overflow: hidden; }
      .capi-card-h { padding: 12px 14px; font-weight: 800; color: #105436; border-bottom: 1px solid #e2e8f0; }
      .capi-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .capi-table th { padding: 8px 12px; text-align: left; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #64748b; background: #f8fafc; }
      .capi-table td { padding: 9px 12px; border-top: 1px solid #f1f5f9; vertical-align: middle; }
      .capi-num { text-align: right; font-variant-numeric: tabular-nums; }
      .capi-day { cursor: pointer; }
      .capi-day:hover td { background: #f8fafc; }
      .capi-day.is-on td { background: #ecfdf5; }
      .capi-day.is-on td:first-child { font-weight: 800; color: #105436; box-shadow: inset 3px 0 0 #105436; }
      .capi-path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.75rem; color: #0f172a; word-break: break-all; }
      .capi-sub { margin-top: 3px; font-family: inherit; font-size: 0.72rem; font-weight: 600; color: #64748b; }
      .capi-badge { display: inline-block; margin: 0 4px 0 0; padding: 1px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.02em; }
      .capi-badge-rest { background: #ecfdf5; color: #105436; }
      .capi-badge-bulk { background: #f0fdfa; color: #0f766e; }
      .capi-badge-user { background: #f1f5f9; color: #334155; }
      .capi-badge-sys { background: #fff7ed; color: #9a3412; }
      .capi-pill { display: inline-block; margin: 2px 4px 2px 0; padding: 1px 8px; border-radius: 999px; background: #f1f5f9; color: #334155; font-size: 0.72rem; white-space: nowrap; }
      .capi-split td { padding: 8px 12px; background: #f0fdf4; color: #105436; font-weight: 800; border-top: 1px solid #d1fae5; letter-spacing: 0.02em; }
      .capi-who td:first-child { padding-left: 22px; font-weight: 700; color: #0f172a; }
      .capi-total { font-weight: 800; }
      .capi-empty { padding: 16px; color: #94a3b8; text-align: center; }
      .capi-note { margin: 8px 0 0; font-size: 0.75rem; color: #94a3b8; }
      @media (max-width: 900px) {
        .capi-kpis, .capi-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(s);
  },

  render() {
    const root = document.getElementById("consumo-api-root");
    if (!root) return;
    this.ensureCss();
    const today = this.today();
    const cur = this.dayOf(this.selected || today);
    const rest = Number(cur.rest || 0);
    const bulk = Number(cur.bulk || 0);
    const total = rest + bulk;
    const apis = Object.keys(cur.apis || {}).map((k) => {
      const row = cur.apis[k] || {};
      return {
        key: k,
        rest: Number(row.rest || 0),
        bulk: Number(row.bulk || 0),
        user: Number(row.user || 0),
        system: Number(row.system || 0),
        total: Number(row.rest || 0) + Number(row.bulk || 0),
        telas: Object.keys(row.telas || {}).map((t) => ({ t, n: Number(row.telas[t]) || 0 })).sort((x, y) => y.n - x.n),
        quem: row.quem || null
      };
    }).sort((a, b) => b.total - a.total);
    const nomeTela = (id) => {
      const li = document.querySelector(`[data-tab="${String(id).replace(/"/g, "")}"]`);
      const txt = li ? String(li.textContent || "").replace(/\s+/g, " ").trim() : "";
      return txt || id;
    };
    const telasHtml = (a) => (a.telas.length
      ? a.telas.slice(0, 4).map((x) => `<span class="capi-pill" title="${this.esc(x.t)}">${this.esc(nomeTela(x.t))} <b>${this.fmt(x.n)}</b></span>`).join("")
        + (a.telas.length > 4 ? `<span class="capi-sub">+${a.telas.length - 4}</span>` : "")
      : `<span class="capi-sub">—</span>`);
    const users = Object.keys(cur.users || {}).map((k) => {
      const row = cur.users[k] || {};
      return {
        key: k,
        label: row.label || (k === "_sistema" ? "Sistema (automático)" : k),
        rest: Number(row.rest || 0),
        bulk: Number(row.bulk || 0),
        total: Number(row.rest || 0) + Number(row.bulk || 0),
        kind: row.kind || (k === "_sistema" ? "system" : "user")
      };
    }).sort((a, b) => b.total - a.total);

    const tipoBadge = (restN, bulkN) => {
      const bits = [];
      if (restN > 0) bits.push(`<span class="capi-badge capi-badge-rest">REST</span>`);
      if (bulkN > 0) bits.push(`<span class="capi-badge capi-badge-bulk">Bulk</span>`);
      return bits.join("") || `<span class="capi-badge capi-badge-user">—</span>`;
    };
    const quemDe = (a) => {
      const named = Object.keys(a.quem || {}).map((k) => {
        const q = a.quem[k] || {};
        const r = Number(q.rest || 0);
        const b = Number(q.bulk || 0);
        return {
          label: q.label || (k === "_sistema" ? "Sistema (automático)" : k),
          kind: q.kind || (k === "_sistema" ? "system" : "user"),
          rest: r,
          bulk: b,
          total: r + b,
          split: true
        };
      }).filter((q) => q.total > 0).sort((x, y) => y.total - x.total);
      if (named.length) return named;
      const rows = [];
      if (a.user > 0) rows.push({ label: "Usuários", kind: "user", rest: 0, bulk: 0, total: a.user, split: false });
      if (a.system > 0) rows.push({ label: "Sistema", kind: "system", rest: 0, bulk: 0, total: a.system, split: false });
      return rows;
    };
    const dia = this.esc((this.selected || today).split("-").reverse().join("/"));

    const weekRows = (this.days || []).map((d) => {
      const t = Number(d.rest || 0) + Number(d.bulk || 0);
      const sel = d.date === (this.selected || today);
      return `<tr class="capi-day${sel ? " is-on" : ""}" onclick="ConsumoApiApp.selected=${JSON.stringify(d.date)};ConsumoApiApp.render()">
        <td>${this.esc(d.date.split("-").reverse().join("/"))}</td>
        <td class="capi-num">${this.fmt(d.rest)}</td>
        <td class="capi-num">${this.fmt(d.bulk)}</td>
        <td class="capi-num capi-total">${this.fmt(t)}</td>
      </tr>`;
    }).join("");

    const apiRows = apis.map((a) => {
      const quemTxt = quemDe(a).map((q) => q.label + " " + this.fmt(q.total)).join(" · ");
      return `<tr class="capi-api">
        <td>
          <div class="capi-path">${this.esc(a.key.replace(/__/g, "/"))}</div>
          ${quemTxt ? `<div class="capi-sub">Quem chamou · ${this.esc(quemTxt)}</div>` : ""}
        </td>
        <td>${tipoBadge(a.rest, a.bulk)}</td>
        <td>${telasHtml(a)}</td>
        <td class="capi-num">${this.fmt(a.rest)}</td>
        <td class="capi-num">${this.fmt(a.bulk)}</td>
        <td class="capi-num capi-total">${this.fmt(a.total)}</td>
      </tr>`;
    }).join("");

    const semApi = `<tr><td class="capi-empty" colspan="6">${total ? "Detalhamento antigo sem caminho da API. Novas chamadas passam a aparecer aqui." : "Nenhuma chamada neste dia."}</td></tr>`;
    const quemDia = users.length ? `<tr class="capi-split"><td colspan="6">Quem chamou</td></tr>` + users.map((u) => `<tr class="capi-who">
      <td>${this.esc(u.label)}</td>
      <td><span class="capi-badge ${u.kind === "system" ? "capi-badge-sys" : "capi-badge-user"}">${u.kind === "system" ? "Sistema" : "Usuário"}</span></td>
      <td></td>
      <td class="capi-num">${this.fmt(u.rest)}</td>
      <td class="capi-num">${this.fmt(u.bulk)}</td>
      <td class="capi-num capi-total">${this.fmt(u.total)}</td>
    </tr>`).join("") : "";

    root.innerHTML = `
      <div class="capi-page">
        <div class="capi-head">
          <div>
            <h2>
              <i data-lucide="activity" style="width:22px;color:#105436;"></i>
              Consumo de API Sienge
            </h2>
            <p>Contagem do caminho da API, se foi REST ou Bulk, e quem chamou. Sem senha e sem corpo de request.</p>
          </div>
          <button type="button" class="btn btn-primary" onclick="ConsumoApiApp.load()" ${this.loading ? "disabled" : ""}>
            <i data-lucide="refresh-cw" style="width:16px;"></i> Atualizar
          </button>
        </div>

        ${this.error ? `<div class="crm-card" style="padding:12px 14px;margin-bottom:12px;color:#991b1b;background:#fef2f2;">${this.esc(this.error)}</div>` : ""}
        ${this.loading ? `<div class="crm-card" style="padding:12px 14px;margin-bottom:12px;color:#64748b;">Carregando consumo…</div>` : ""}

        <div class="capi-kpis">
          <div class="crm-card capi-kpi"><span>REST no dia</span><strong>${this.fmt(rest)}</strong></div>
          <div class="crm-card capi-kpi capi-kpi-bulk"><span>Bulk no dia</span><strong>${this.fmt(bulk)}</strong></div>
          <div class="crm-card capi-kpi capi-kpi-total"><span>Total</span><strong>${this.fmt(total)}</strong></div>
        </div>

        <div class="capi-grid">
          <div class="crm-card capi-card">
            <div class="capi-card-h">Últimos 7 dias</div>
            <table class="capi-table">
              <thead><tr>
                <th>Dia</th>
                <th class="capi-num">REST</th>
                <th class="capi-num">Bulk</th>
                <th class="capi-num">Total</th>
              </tr></thead>
              <tbody>${weekRows || `<tr><td class="capi-empty" colspan="4">Ainda sem consumo neste navegador. Use o CRM e atualize.</td></tr>`}</tbody>
            </table>
          </div>

          <div class="crm-card capi-card">
            <div class="capi-card-h">APIs chamadas · ${dia}</div>
            <table class="capi-table">
              <thead><tr>
                <th>API</th>
                <th>Tipo</th>
                <th>Telas que chamaram</th>
                <th class="capi-num">REST</th>
                <th class="capi-num">Bulk</th>
                <th class="capi-num">Total</th>
              </tr></thead>
              <tbody>${apiRows || semApi}${quemDia}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
  },

  init() {
    if (!this.selected) this.selected = this.today();
    this.render();
    this.load();
  }
};

window.ConsumoApiApp = ConsumoApiApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "consumo-api") ConsumoApiApp.init();
});
