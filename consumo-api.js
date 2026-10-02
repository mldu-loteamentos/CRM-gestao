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

  render() {
    const root = document.getElementById("consumo-api-root");
    if (!root) return;
    const today = this.today();
    const cur = this.dayOf(this.selected || today);
    const rest = Number(cur.rest || 0);
    const bulk = Number(cur.bulk || 0);
    const total = rest + bulk;
    const userN = Number((cur.actors && cur.actors.user) || 0);
    const sysN = Number((cur.actors && cur.actors.system) || 0);
    const apis = Object.keys(cur.apis || {}).map((k) => {
      const row = cur.apis[k] || {};
      return {
        key: k,
        rest: Number(row.rest || 0),
        bulk: Number(row.bulk || 0),
        user: Number(row.user || 0),
        system: Number(row.system || 0),
        total: Number(row.rest || 0) + Number(row.bulk || 0)
      };
    }).sort((a, b) => b.total - a.total);
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

    const weekRows = (this.days || []).map((d) => {
      const t = Number(d.rest || 0) + Number(d.bulk || 0);
      const sel = d.date === (this.selected || today);
      return `<tr onclick="ConsumoApiApp.selected=${JSON.stringify(d.date)};ConsumoApiApp.render()" style="cursor:pointer;background:${sel ? "#ecfdf5" : "transparent"};">
        <td style="padding:8px 12px;font-weight:${sel ? 800 : 600};color:#105436;">${this.esc(d.date.split("-").reverse().join("/"))}</td>
        <td style="padding:8px 12px;text-align:right;">${this.fmt(d.rest)}</td>
        <td style="padding:8px 12px;text-align:right;">${this.fmt(d.bulk)}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:800;">${this.fmt(t)}</td>
      </tr>`;
    }).join("");

    root.innerHTML = `
      <div style="padding:16px 18px 28px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
          <div>
            <h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px;font-size:1.15rem;font-weight:800;color:#0f172a;">
              <i data-lucide="activity" style="width:22px;color:var(--color-primary);"></i>
              Consumo de API Sienge
            </h2>
            <p style="margin:0;font-size:0.82rem;color:#64748b;max-width:720px;">
              Contagem segura: só caminho da API, tipo REST ou Bulk, e se foi você ou o sistema sozinho
              (fila, pagamentos dos últimos 30 dias, cache). Sem senha e sem corpo de request.
            </p>
          </div>
          <button type="button" class="btn btn-primary" onclick="ConsumoApiApp.load()" ${this.loading ? "disabled" : ""}>
            <i data-lucide="refresh-cw" style="width:16px;"></i> Atualizar
          </button>
        </div>

        ${this.error ? `<div class="crm-card" style="padding:12px 14px;margin-bottom:12px;color:#991b1b;background:#fef2f2;">${this.esc(this.error)}</div>` : ""}
        ${this.loading ? `<div class="crm-card" style="padding:12px 14px;margin-bottom:12px;color:#64748b;">Carregando consumo…</div>` : ""}

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px;">
          <div class="crm-card" style="padding:14px 16px;">
            <div style="font-size:0.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">REST no dia</div>
            <div style="font-size:1.6rem;font-weight:800;color:#105436;">${this.fmt(rest)}</div>
          </div>
          <div class="crm-card" style="padding:14px 16px;">
            <div style="font-size:0.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">Bulk no dia</div>
            <div style="font-size:1.6rem;font-weight:800;color:#0f766e;">${this.fmt(bulk)}</div>
          </div>
          <div class="crm-card" style="padding:14px 16px;">
            <div style="font-size:0.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">Total</div>
            <div style="font-size:1.6rem;font-weight:800;color:#0f172a;">${this.fmt(total)}</div>
          </div>
          <div class="crm-card" style="padding:14px 16px;">
            <div style="font-size:0.72rem;color:#64748b;font-weight:700;text-transform:uppercase;">Quem chamou</div>
            <div style="font-size:0.95rem;font-weight:800;color:#0f172a;margin-top:6px;">Usuários ${this.fmt(userN)}</div>
            <div style="font-size:0.95rem;font-weight:800;color:#64748b;">Sistema ${this.fmt(sysN)}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:minmax(260px,320px) 1fr;gap:12px;align-items:start;">
          <div class="crm-card" style="padding:0;overflow:hidden;">
            <div style="padding:10px 14px;font-weight:800;color:#105436;border-bottom:1px solid #e2e8f0;">Últimos 7 dias</div>
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="background:#f8fafc;color:#64748b;">
                <th style="padding:8px 12px;text-align:left;">Dia</th>
                <th style="padding:8px 12px;text-align:right;">REST</th>
                <th style="padding:8px 12px;text-align:right;">Bulk</th>
                <th style="padding:8px 12px;text-align:right;">Total</th>
              </tr></thead>
              <tbody>${weekRows || `<tr><td colspan="4" style="padding:16px;color:#94a3b8;text-align:center;">Ainda sem consumo neste navegador. Use o CRM e atualize.</td></tr>`}</tbody>
            </table>
          </div>

          <div>
            <div class="crm-card" style="padding:0;overflow:hidden;margin-bottom:12px;">
              <div style="padding:10px 14px;font-weight:800;color:#105436;border-bottom:1px solid #e2e8f0;">APIs mais consumidas · ${this.esc((this.selected || today).split("-").reverse().join("/"))}</div>
              <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                <thead><tr style="background:#f8fafc;color:#64748b;">
                  <th style="padding:8px 12px;text-align:left;">API</th>
                  <th style="padding:8px 12px;text-align:left;">Tipo</th>
                  <th style="padding:8px 12px;text-align:right;">REST</th>
                  <th style="padding:8px 12px;text-align:right;">Bulk</th>
                  <th style="padding:8px 12px;text-align:right;">Usuário</th>
                  <th style="padding:8px 12px;text-align:right;">Sistema</th>
                </tr></thead>
                <tbody>${apis.length ? apis.slice(0, 20).map((a) => `<tr>
                  <td style="padding:8px 12px;font-family:ui-monospace,monospace;font-size:0.75rem;">${this.esc(a.key.replace(/__/g, "/"))}</td>
                  <td style="padding:8px 12px;">${a.bulk >= a.rest ? "Bulk" : "REST"}</td>
                  <td style="padding:8px 12px;text-align:right;">${this.fmt(a.rest)}</td>
                  <td style="padding:8px 12px;text-align:right;">${this.fmt(a.bulk)}</td>
                  <td style="padding:8px 12px;text-align:right;">${this.fmt(a.user)}</td>
                  <td style="padding:8px 12px;text-align:right;">${this.fmt(a.system)}</td>
                </tr>`).join("") : `<tr><td colspan="6" style="padding:16px;color:#94a3b8;text-align:center;">${total ? "Detalhamento antigo sem caminho da API. Novas chamadas passam a aparecer aqui." : "Nenhuma chamada neste dia."}</td></tr>`}</tbody>
              </table>
            </div>

            <div class="crm-card" style="padding:0;overflow:hidden;">
              <div style="padding:10px 14px;font-weight:800;color:#105436;border-bottom:1px solid #e2e8f0;">Por quem</div>
              <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                <thead><tr style="background:#f8fafc;color:#64748b;">
                  <th style="padding:8px 12px;text-align:left;">Origem</th>
                  <th style="padding:8px 12px;text-align:left;">Tipo</th>
                  <th style="padding:8px 12px;text-align:right;">REST</th>
                  <th style="padding:8px 12px;text-align:right;">Bulk</th>
                  <th style="padding:8px 12px;text-align:right;">Total</th>
                </tr></thead>
                <tbody>${users.length ? users.map((u) => `<tr>
                  <td style="padding:8px 12px;font-weight:700;">${this.esc(u.label)}</td>
                  <td style="padding:8px 12px;">${u.kind === "system" ? "Sistema sozinho" : "Usuário"}</td>
                  <td style="padding:8px 12px;text-align:right;">${this.fmt(u.rest)}</td>
                  <td style="padding:8px 12px;text-align:right;">${this.fmt(u.bulk)}</td>
                  <td style="padding:8px 12px;text-align:right;font-weight:800;">${this.fmt(u.total)}</td>
                </tr>`).join("") : `<tr><td colspan="5" style="padding:16px;color:#94a3b8;text-align:center;">Sem origem neste dia.</td></tr>`}</tbody>
              </table>
            </div>
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
