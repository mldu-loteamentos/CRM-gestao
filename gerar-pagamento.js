/* Financeiro · Contas a pagar · Gerar Pagamento
   Agrupa títulos a pagar (sem previsões) em lotes.
   Título com centro de custo de parceiro sai pela conta de parceria do CC. */
const GerarPagamentoApp = {
  state: {
    loading: false,
    error: "",
    companies: [],
    costCenters: [],
    customFields: {},
    started: false
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  customOf(id) {
    const map = this.state.customFields || {};
    return map[id] || map[String(id)] || {};
  },

  isParceiro(cc) {
    if (window.CentrosCustoApp && typeof CentrosCustoApp.isParceiro === "function") {
      return CentrosCustoApp.isParceiro(cc);
    }
    return /parceir/i.test(String((cc && cc.name) || ""));
  },

  companyIdOf(cc) {
    return cc && (cc.idCompany != null ? cc.idCompany : cc.companyId);
  },

  companyName(id) {
    const hit = this.state.companies.find((c) => String(c.id) === String(id));
    return hit ? hit.name : "";
  },

  contaLabel(c) {
    if (window.CentrosCustoApp && typeof CentrosCustoApp.contaLabel === "function") {
      return CentrosCustoApp.contaLabel(c);
    }
    if (!c) return "";
    return [c.banco ? "Banco " + c.banco : "", c.agencia ? "Ag. " + c.agencia : "", c.numero ? "C/C " + c.numero : "", c.nome || ""]
      .filter(Boolean).join(" · ");
  },

  /* Título com CC de parceiro paga na conta de parceria cadastrada no centro de custo. */
  resolverContaPagamento(input) {
    const ccId = input && (input.costCenterId != null ? input.costCenterId : input.ccId);
    const cc = this.state.costCenters.find((c) => String(c.id) === String(ccId))
      || (input && input.costCenter) || null;
    if (!cc) {
      return { origem: "padrao", parceiro: false, conta: null, ok: true, motivo: "" };
    }
    const custom = this.customOf(cc.id);
    const parceiro = this.isParceiro(cc);
    if (!parceiro) {
      return { origem: "padrao", parceiro: false, cc: cc, conta: null, ok: true, motivo: "" };
    }
    const conta = custom.conta_parceria || null;
    if (!conta || !(conta.id || conta.numero)) {
      return {
        origem: "parceria",
        parceiro: true,
        cc: cc,
        conta: null,
        ok: false,
        motivo: "Centro de custo de parceiro sem conta de parceria cadastrada."
      };
    }
    return { origem: "parceria", parceiro: true, cc: cc, conta: conta, ok: true, motivo: "" };
  },

  parceiros() {
    return this.state.costCenters
      .filter((cc) => this.isParceiro(cc))
      .slice()
      .sort((a, b) => {
        const ea = Number(this.companyIdOf(a) || 0) - Number(this.companyIdOf(b) || 0);
        if (ea) return ea;
        return Number(a.id) - Number(b.id);
      });
  },

  init() {
    if (this.state.started && this.state.costCenters.length) {
      this.render();
      return;
    }
    this.load();
  },

  async load() {
    this.state.loading = true;
    this.state.error = "";
    this.render();
    try {
      const [ccs, companies] = await Promise.all([
        SiengeApiService.getCostCenters ? SiengeApiService.getCostCenters() : Promise.resolve([]),
        SiengeApiService.getCompanies ? SiengeApiService.getCompanies() : Promise.resolve([])
      ]);
      this.state.costCenters = Array.isArray(ccs) ? ccs : ((ccs && ccs.results) || []);
      this.state.companies = Array.isArray(companies) ? companies : ((companies && companies.results) || []);
      let custom = {};
      try {
        const raw = localStorage.getItem("crm_centros_custo_custom") || "{}";
        custom = (typeof window.parseCentrosCustoCustomMap === "function")
          ? window.parseCentrosCustoCustomMap(raw)
          : (JSON.parse(raw) || {});
      } catch (e) {
        custom = {};
      }
      if (window.CentrosCustoState && CentrosCustoState.customFields && Object.keys(CentrosCustoState.customFields).length) {
        custom = Object.assign({}, custom, CentrosCustoState.customFields);
      }
      this.state.customFields = custom;
      this.state.started = true;
    } catch (e) {
      console.error("[Gerar Pagamento]", e);
      this.state.error = (e && e.message) ? e.message : "Não consegui carregar os centros de custo.";
    }
    this.state.loading = false;
    this.render();
  },

  abrirCentrosCusto() {
    if (window.CentrosCustoState) CentrosCustoState.somenteParceiros = true;
    if (typeof switchTab === "function") switchTab("centros-custo", "Gestão de Centros de Custo");
  },

  rowsHtml() {
    const list = this.parceiros();
    if (!list.length) {
      return `<tr><td colspan="5" style="text-align:center;padding:28px;color:#64748b;">
        Nenhum centro de custo com “parceiro” no nome. Na empresa 1 esses CCs precisam da conta de parceria.
      </td></tr>`;
    }
    return list.map((cc) => {
      const empId = this.companyIdOf(cc);
      const conta = this.customOf(cc.id).conta_parceria;
      const status = conta
        ? `<span style="color:#105436;font-weight:700;">${this.esc(this.contaLabel(conta))}</span>`
        : `<span style="color:#b91c1c;font-weight:700;">Sem conta — cadastre em Centros de Custo</span>`;
      return `<tr>
        <td>${this.esc(empId || "-")}</td>
        <td><strong>${this.esc(cc.id)}</strong></td>
        <td>${this.esc(cc.name || "")}</td>
        <td>${this.esc(this.companyName(empId) || "")}</td>
        <td>${status}</td>
      </tr>`;
    }).join("");
  },

  render() {
    const root = document.getElementById("gerar-pagamento-root");
    if (!root) return;
    const list = this.parceiros();
    const semConta = list.filter((cc) => !this.customOf(cc.id).conta_parceria).length;
    const body = this.state.loading
      ? `<div style="text-align:center;padding:40px;color:#64748b;">
          <div class="spinner" style="margin:0 auto 12px;"></div>
          <p>Carregando centros de custo de parceiro…</p>
        </div>`
      : (this.state.error
        ? `<div class="crm-card" style="padding:20px;color:#b91c1c;">${this.esc(this.state.error)}</div>`
        : `
        <div class="crm-card" style="padding:18px 20px;margin-bottom:16px;">
          <h3 style="margin:0 0 8px;color:var(--color-primary);font-size:1rem;">Conta de parceria</h3>
          <p style="margin:0;color:#475569;font-size:0.85rem;line-height:1.5;">
            Na empresa 1 existem centros de custo com <strong>parceiro</strong> no nome.
            Quando o título a pagar tiver um desses centros de custo, o pagamento sai pela
            <strong>conta de parceria</strong> cadastrada no próprio centro de custo — não pela conta padrão da empresa.
          </p>
          <p style="margin:10px 0 0;color:#64748b;font-size:0.8rem;">
            ${list.length} centro(s) de parceiro ·
            ${semConta ? `<span style="color:#b91c1c;font-weight:700;">${semConta} sem conta cadastrada</span>` : `<span style="color:#105436;font-weight:700;">todos com conta</span>`}
          </p>
        </div>
        <div class="crm-card" style="overflow:hidden;padding:0;">
          <style>
            #gerar-pagamento-root .gp-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
            #gerar-pagamento-root .gp-table thead th { position:sticky; top:0; background:#1b8253; color:#fff; padding:12px; text-align:left; font-weight:600; z-index:2; white-space:nowrap; }
            #gerar-pagamento-root .gp-table tbody tr { border-bottom:1px solid #e0e5e0; }
            #gerar-pagamento-root .gp-table tbody tr:nth-child(even) { background:#f4f6f4; }
            #gerar-pagamento-root .gp-table td { padding:10px 12px; vertical-align:middle; }
          </style>
          <div style="max-height:52vh;overflow:auto;">
            <table class="gp-table">
              <thead>
                <tr>
                  <th style="width:90px;">Empresa</th>
                  <th style="width:80px;">ID CC</th>
                  <th>Centro de custo</th>
                  <th style="min-width:180px;">Nome da empresa</th>
                  <th style="min-width:220px;">Conta de parceria</th>
                </tr>
              </thead>
              <tbody>${this.rowsHtml()}</tbody>
            </table>
          </div>
        </div>
        <div class="crm-card" style="padding:16px 20px;margin-top:16px;background:#fffbeb;border:1px solid #fde68a;">
          <p style="margin:0;color:#92400e;font-size:0.82rem;line-height:1.5;">
            Em seguida vamos buscar os títulos a pagar que <strong>não sejam previsões</strong> e agrupá-los em lotes.
            Título de parceiro já entra no lote da conta de parceria.
          </p>
        </div>`);

    root.innerHTML = `
      <div style="display:flex;flex-direction:column;min-height:calc(100vh - 85px);font-family:inherit;">
        <div style="background:#105436;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:12px 12px 0 0;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="wallet" style="width:18px;height:18px;color:#fff;"></i>
            </div>
            <div>
              <h2 style="margin:0;color:#fff;font-size:1.15rem;font-weight:600;">Gerar Pagamento</h2>
              <p style="margin:2px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Lotes de títulos a pagar · sem previsões · conta de parceria no centro de custo</p>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" onclick="GerarPagamentoApp.abrirCentrosCusto()" style="height:36px;">
              Cadastrar conta de parceria
            </button>
            <button type="button" class="btn" onclick="GerarPagamentoApp.load()" style="height:36px;background:#fff;color:#105436;border:none;font-weight:700;">
              <i data-lucide="refresh-cw" style="width:14px;"></i> Atualizar
            </button>
          </div>
        </div>
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:16px 18px;">
          ${body}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
};

window.GerarPagamentoApp = GerarPagamentoApp;
window.contaPagamentoDoCentroCusto = function (input) {
  return GerarPagamentoApp.resolverContaPagamento(input);
};

document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "gerar-pagamento") GerarPagamentoApp.init();
});
