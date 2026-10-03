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
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  fmtDate(raw) {
    const s = String(raw || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
    return s || "—";
  },

  sitClass(p) {
    if (p && p.pago) return "ccom-sit-pago";
    const t = String((p && p.situacao) || "").toUpperCase();
    if (t.indexOf("PROGRAM") >= 0) return "ccom-sit-prog";
    return "";
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

  comissaoTip(r) {
    const dets = r.beneficiariosDetalhe && r.beneficiariosDetalhe.length
      ? r.beneficiariosDetalhe
      : String(r.beneficiarios || "").split(",").map((n) => n.trim()).filter(Boolean).map((nome) => ({ nome, valor: null }));
    if (!dets.length) return "";
    const lines = dets.map((d) => {
      const val = d.valor == null ? "" : this.money(d.valor);
      return `<div class="ccom-tip-row"><span>${this.esc(d.nome)}</span><strong>${this.esc(val)}</strong></div>`;
    }).join("");
    return `<div class="ccom-tip-box">${lines}</div>`;
  },

  rowHtml(r) {
    const tip = this.comissaoTip(r);
    return `<tr>
      <td class="ccom-td-id">${this.esc(r.contrato || "—")}</td>
      <td>${this.esc(r.empreendimento || "—")}</td>
      <td>${this.esc(r.unidade || "—")}</td>
      <td>${this.esc(r.pagador || "—")}</td>
      <td class="ccom-num ccom-tip">${this.esc(this.money(r.comissaoTotal || r.valor || 0))}${tip}</td>
      <td class="ccom-num">${this.esc(this.money(r.aReceber))}</td>
      <td class="ccom-num">${this.esc(this.money(r.recebido))}</td>
    </tr>`;
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
      <div class="ccom-page">
        <div class="search-filter-panel tvig-params ccom-params">
          <h3 class="tvig-section-title">Parâmetros da consulta</h3>
          <div class="ccom-filters">
            <div class="tvig-filter-slot tvig-comp-slot">
              <label class="tvig-comp-label" for="ccom-comp">Mês de referência</label>
              <input type="month" id="ccom-comp" class="tvig-comp-input" value="${this.esc(s.competencia)}"
                onchange="ControleComissaoApp.onField('competencia', this.value)">
            </div>
            <div class="tvig-filter-actions">
              <button type="button" class="btn btn-primary ccom-consult" ${s.loading ? "disabled" : ""} onclick="ControleComissaoApp.consultar()">
                <i data-lucide="search" style="width:14px;"></i> ${s.loading ? "Consultando…" : "Consultar"}
              </button>
            </div>
          </div>
        </div>
        ${s.error ? `<div class="tvig-empty">${this.esc(s.error)}</div>` : ""}
        ${s.aviso && !s.error ? `<div class="ccom-aviso">${this.esc(s.aviso)}</div>` : ""}
        ${s.loading ? `<div class="tvig-empty">Buscando comissões no CV CRM…</div>` : ""}
        ${!s.loading && !s.error && rows.length ? `
          <div class="ccom-kpis">
            <div class="ccom-kpi"><span>Contratos</span><strong>${s.totais.contratos || 0}</strong></div>
            <div class="ccom-kpi"><span>Moura Leite a receber</span><strong>${this.esc(this.money(s.totais.aReceber))}</strong></div>
            <div class="ccom-kpi"><span>Moura Leite recebido</span><strong>${this.esc(this.money(s.totais.recebido))}</strong></div>
          </div>
          <h3 class="tvig-section-title">Comissão por contrato</h3>
          <div class="crm-card ccom-card">
            <div class="crm-scroll-table ccom-table-wrap">
              <table class="custom-table ccom-table">
                <thead>
                  <tr>
                    <th>Contrato / Reserva</th>
                    <th>Empreendimento</th>
                    <th>Unidade</th>
                    <th>Pagador</th>
                    <th class="ccom-num">Comissão</th>
                    <th class="ccom-num">Moura Leite a receber</th>
                    <th class="ccom-num">Moura Leite recebido</th>
                  </tr>
                </thead>
                <tbody>${rows.map((r) => this.rowHtml(r)).join("")}</tbody>
              </table>
            </div>
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
