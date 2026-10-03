/**
 * Comercial · Controle de comissão
 * Comissão a receber da Moura Leite por contrato (CV CRM).
 */
const ControleComissaoApp = {
  state: {
    inited: false,
    loading: false,
    consulted: false,
    error: "",
    aviso: "",
    competencia: "",
    de: "",
    ate: "",
    totais: { contratos: 0, parcelas: 0, aReceber: 0, recebido: 0 },
    contratos: [],
    series: []
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(n) {
    const v = Number(n) || 0;
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  defaultCompetencia() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  },

  apiUrl(path) {
    const host = window.location.hostname;
    const isLocal = !host || host === "localhost" || host === "127.0.0.1";
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const origin = isLocal ? ("http://localhost:" + port) : "";
    return origin + path;
  },

  onField(field, val) {
    this.state[field] = val;
  },

  async consultar() {
    const ym = this.state.competencia || this.defaultCompetencia();
    this.state.competencia = ym;
    this.state.loading = true;
    this.state.consulted = true;
    this.state.error = "";
    this.render();
    try {
      const res = await fetch(this.apiUrl("/api/controle-comissao?competencia=" + encodeURIComponent(ym)));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.state.error = data.error || data.mensagem || ("Erro " + res.status + " ao consultar o CV.");
        this.state.contratos = [];
        this.state.totais = { contratos: 0, parcelas: 0, aReceber: 0, recebido: 0 };
      } else {
        this.state.totais = data.totais || { contratos: 0, parcelas: 0, aReceber: 0, recebido: 0 };
        this.state.contratos = data.contratos || [];
        this.state.series = data.seriesComissao || [];
        this.state.de = data.de || "";
        this.state.ate = data.ate || "";
        this.state.aviso = data.aviso || "";
      }
    } catch (e) {
      this.state.error = "Não foi possível consultar o CV CRM. " + (e && e.message ? e.message : "");
      this.state.contratos = [];
    }
    this.state.loading = false;
    this.render();
  },

  render() {
    const root = document.getElementById("controle-comissao-root");
    if (!root) return;
    const s = this.state;
    if (!s.competencia) s.competencia = this.defaultCompetencia();
    const rows = s.contratos || [];
    root.innerHTML = `
      <div class="tvig-page">
        <div class="search-filter-panel tvig-params">
          <h2 class="tvig-page-title">
            <i data-lucide="percent" style="width:22px;height:22px;color:var(--color-primary);"></i>
            Controle de comissão
          </h2>
          <h3 class="tvig-section-title">Parâmetros da consulta</h3>
          <div class="ccom-filters">
            <div class="form-group">
              <label>Competência</label>
              <input type="month" class="form-control" value="${this.esc(s.competencia)}"
                onchange="ControleComissaoApp.onField('competencia', this.value)">
            </div>
            <div class="tvig-filter-actions">
              <button type="button" class="btn btn-primary" ${s.loading ? "disabled" : ""} onclick="ControleComissaoApp.consultar()">
                <i data-lucide="search" style="width:16px;"></i> ${s.loading ? "Consultando…" : "Consultar"}
              </button>
            </div>
          </div>
        </div>
        ${s.error ? `<div class="tvig-empty">${this.esc(s.error)}</div>` : ""}
        ${s.aviso && !s.error ? `<div class="ccom-aviso">${this.esc(s.aviso)}</div>` : ""}
        ${s.loading ? `<div class="tvig-empty">Buscando comissões no CV CRM…</div>` : ""}
        ${!s.loading && !s.error && rows.length ? `
          <div class="ccom-kpis">
            <div class="ccom-kpi">
              <span>Contratos</span>
              <strong>${s.totais.contratos || 0}</strong>
            </div>
            <div class="ccom-kpi">
              <span>A receber</span>
              <strong>${this.esc(this.money(s.totais.aReceber))}</strong>
            </div>
            <div class="ccom-kpi">
              <span>Recebido</span>
              <strong>${this.esc(this.money(s.totais.recebido))}</strong>
            </div>
          </div>
          <h3 class="tvig-section-title">Comissão por contrato</h3>
          <div class="crm-card" style="padding:0;overflow:hidden;">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Contrato / Reserva</th>
                  <th>Empreendimento</th>
                  <th>Pagador</th>
                  <th>Série</th>
                  <th style="text-align:right;">A receber</th>
                  <th style="text-align:right;">Recebido</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r) => `
                  <tr>
                    <td>${this.esc(r.contrato || "—")}</td>
                    <td>${this.esc(r.empreendimento || "—")}</td>
                    <td>${this.esc(r.pagador || "—")}</td>
                    <td>${this.esc((r.series || []).join(", ") || "—")}</td>
                    <td style="text-align:right;font-weight:700;">${this.esc(this.money(r.aReceber))}</td>
                    <td style="text-align:right;">${this.esc(this.money(r.recebido))}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>` : ""}
        ${!s.loading && !s.error && !rows.length ? `<div class="tvig-empty">${s.consulted ? "Nenhuma comissão encontrada nesta competência." : "Use <strong>Consultar</strong> para ver a comissão a receber por contrato."}</div>` : ""}
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  init() {
    const root = document.getElementById("controle-comissao-root");
    if (!root) return;
    if (!this.state.inited) {
      this.state.competencia = this.defaultCompetencia();
      this.state.inited = true;
    }
    this.render();
  }
};

window.ControleComissaoApp = ControleComissaoApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "controle-comissao") ControleComissaoApp.init();
});
