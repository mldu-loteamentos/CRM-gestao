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
    started: false,
    startDate: "",
    endDate: "",
    tipoData: "D",
    consultando: false,
    consultado: false,
    erroTitulos: "",
    progresso: "",
    titulos: [],
    previsoesIgnoradas: 0,
    filtro: "todos",
    gen: 0
  },

  FILTROS: [
    { id: "todos", label: "Todos" },
    { id: "ok", label: "Pago na conta de parceria" },
    { id: "outra", label: "Pago em outra conta" },
    { id: "aberto", label: "Em aberto" }
  ],

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 && p[0] ? p[2] + "/" + p[1] + "/" + p[0] : "—";
  },

  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  numConta(v) {
    return String(v == null ? "" : v).replace(/\D/g, "").replace(/^0+/, "");
  },

  customOf(id) {
    const map = this.state.customFields || {};
    return map[id] || map[String(id)] || {};
  },

  contaParceriaDe(cc) {
    const c = cc ? this.customOf(cc.id).conta_parceria : null;
    return c && (c.id || c.numero) ? c : null;
  },

  isParceiro(cc) {
    if (window.CentrosCustoApp && typeof CentrosCustoApp.isParceiro === "function" && CentrosCustoApp.isParceiro(cc)) return true;
    if (/parce(ir|ri)/i.test(String((cc && cc.name) || ""))) return true;
    return !!this.contaParceriaDe(cc);
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
    const parceiro = this.isParceiro(cc);
    if (!parceiro) {
      return { origem: "padrao", parceiro: false, cc: cc, conta: null, ok: true, motivo: "" };
    }
    const conta = this.contaParceriaDe(cc);
    if (!conta) {
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
    if (!this.state.startDate || !this.state.endDate) {
      const d = new Date();
      this.state.startDate = this.iso(new Date(d.getFullYear(), d.getMonth(), 1));
      this.state.endDate = this.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    }
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

  onField(key, value) {
    this.state[key] = value;
  },

  setFiltro(id) {
    this.state.filtro = this.state.filtro === id && id !== "todos" ? "todos" : id;
    this.paintTitulos();
  },

  pintarProgresso() {
    const el = document.getElementById("gp-progresso");
    if (el) el.textContent = this.state.progresso || "";
  },

  /* Lê no Sienge os títulos a pagar dos CCs de parceiro no período e confere a conta usada no pagamento. */
  async consultarTitulos() {
    const s = this.state;
    if (!s.startDate || !s.endDate) {
      alert("Informe o período.");
      return;
    }
    if (s.startDate > s.endDate) {
      alert("A data inicial não pode ser maior que a final.");
      return;
    }
    const base = window.ComprasControleApp || window.ComprasPrevisoesApp;
    if (!base || typeof base.outcomeRange !== "function") {
      alert("O módulo de contas a pagar não está disponível.");
      return;
    }
    const parceiros = this.parceiros();
    if (!parceiros.length) {
      alert("Nenhum centro de custo de parceiro encontrado. Cadastre a conta de parceria em Centros de Custo.");
      return;
    }
    const gen = (s.gen += 1);
    s.consultando = true;
    s.consultado = true;
    s.erroTitulos = "";
    s.progresso = "Buscando títulos a pagar no Sienge…";
    s.titulos = [];
    s.previsoesIgnoradas = 0;
    this.render();

    const tipo = s.tipoData === "P" ? "P" : "D";
    const api = Object.create(base);
    api.outcomeEndpoint = (start, end, companyId) => "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=" + tipo + "&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false&withBankMovements=true"
      + (companyId ? "&companyId=" + encodeURIComponent(companyId) : "");
    api.noteProgress = (text) => {
      if (gen !== s.gen) return;
      s.progresso = text;
      this.pintarProgresso();
    };

    try {
      const empresas = [...new Set(parceiros.map((cc) => String(this.companyIdOf(cc) || "")).filter(Boolean))];
      const alvos = empresas.length ? empresas : [""];
      const faixas = typeof siengeSplitDateRange === "function"
        ? siengeSplitDateRange(s.startDate, s.endDate)
        : [{ start: s.startDate, end: s.endDate }];
      const bills = [];
      let passo = 0;
      const total = faixas.length * alvos.length;
      for (const faixa of faixas) {
        for (const emp of alvos) {
          if (gen !== s.gen) return;
          passo += 1;
          s.progresso = "Buscando títulos a pagar no Sienge · " + passo + " de " + total;
          this.pintarProgresso();
          const parte = await api.outcomeRange(faixa.start, faixa.end, emp);
          if (Array.isArray(parte)) bills.push.apply(bills, parte);
        }
      }
      if (gen !== s.gen) return;
      this.montarTitulos(base, bills, parceiros);
    } catch (e) {
      if (gen !== s.gen) return;
      console.error("[Gerar Pagamento] títulos", e);
      s.erroTitulos = (e && e.message) ? e.message : "Falha ao buscar os títulos a pagar no Sienge.";
    }
    s.consultando = false;
    s.progresso = "";
    this.render();
  },

  montarTitulos(app, bills, parceiros) {
    const ccMap = {};
    parceiros.forEach((cc) => { ccMap[String(cc.id)] = cc; });
    const vistos = {};
    const linhas = [];
    let previsoes = 0;
    const lista = (x) => (Array.isArray(x) ? x : (x ? [x] : []));
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const docId = app.docCode(bill.documentIdentificationId);
      const docNome = bill.documentIdentificationName || "";
      const cats = lista(bill.paymentsCategories).filter((c) => c && c.costCenterId != null && ccMap[String(c.costCenterId)]);
      if (!cats.length) return;
      const titulo = String(bill.billId);
      const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
      if (app.ehPrevisao(docId, docNome, bill)) {
        if (!vistos["prev|" + titulo + "|" + parcela]) previsoes += 1;
        vistos["prev|" + titulo + "|" + parcela] = true;
        return;
      }
      const movs = [];
      let pago = false;
      lista(bill.payments).forEach((pay) => {
        const bms = lista(pay && pay.bankMovements);
        if (!bms.length) {
          if (app.isPago(bill, pay, null, docId, docNome)) pago = true;
          return;
        }
        bms.forEach((bm) => {
          if (!bm || app.SKIP_OPS[bm.operationName || ""]) return;
          if (app.isSubstituicao(bill, pay, bm, docId, docNome)) return;
          if (app.isPago(bill, pay, bm, docId, docNome)) pago = true;
          const conta = String(bm.accountNumber || "").trim();
          if (conta) movs.push({ conta, data: app.paymentDateOf(bill, pay, bm) });
        });
      });
      const saldo = app.billBalance(bill);
      cats.forEach((cat) => {
        const cc = ccMap[String(cat.costCenterId)];
        const chave = titulo + "|" + parcela + "|" + cc.id;
        if (vistos[chave]) return;
        vistos[chave] = true;
        const esperada = this.contaParceriaDe(cc);
        const alvo = esperada ? this.numConta(esperada.numero || esperada.id) : "";
        const contas = [...new Set(movs.map((m) => m.conta))];
        let status;
        if (!contas.length) status = pago ? "pago-sem-conta" : "aberto";
        else if (!alvo) status = "sem-conta";
        else status = contas.every((c) => this.numConta(c) === alvo) ? "ok" : "outra";
        const rateio = cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) : 100;
        const datas = movs.map((m) => m.data).filter(Boolean).sort();
        linhas.push({
          titulo,
          parcela,
          credor: String(bill.creditorName || "").trim(),
          documento: [docId, bill.documentNumber].filter(Boolean).join(" "),
          vencimento: String(bill.dueDate || "").slice(0, 10),
          pagamento: datas.length ? datas[datas.length - 1] : "",
          valor: (Number(bill.originalAmount) || 0) * ((Number.isFinite(rateio) ? rateio : 100) / 100),
          saldo: saldo,
          ccId: String(cc.id),
          ccNome: cc.name || "",
          esperada,
          contas,
          status
        });
      });
    });
    linhas.sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || "") || Number(a.titulo) - Number(b.titulo) || Number(a.parcela) - Number(b.parcela));
    this.state.titulos = linhas;
    this.state.previsoesIgnoradas = previsoes;
  },

  grupoStatus(r) {
    if (r.status === "ok") return "ok";
    if (r.status === "outra" || r.status === "sem-conta") return "outra";
    return "aberto";
  },

  statusHtml(r) {
    const conta = r.esperada ? (r.esperada.numero || r.esperada.id) : "";
    const outras = r.contas.filter((c) => this.numConta(c) !== this.numConta(conta));
    if (r.status === "ok") return `<span class="gp-pill gp-ok">Pago na conta de parceria</span>`;
    if (r.status === "outra") return `<span class="gp-pill gp-bad">Pago em outra conta</span><small>Saiu pela C/C ${this.esc(outras.join(", "))} · esperado C/C ${this.esc(conta)}</small>`;
    if (r.status === "sem-conta") return `<span class="gp-pill gp-bad">CC sem conta de parceria</span><small>Pago pela C/C ${this.esc(r.contas.join(", "))}</small>`;
    if (r.status === "pago-sem-conta") return `<span class="gp-pill gp-wait">Pago</span><small>O Sienge não informou a conta da baixa</small>`;
    return `<span class="gp-pill gp-wait">Em aberto</span><small>Deve sair pela C/C ${this.esc(conta || "—")}</small>`;
  },

  titulosHtml() {
    const s = this.state;
    if (s.consultando) {
      return `<div style="text-align:center;padding:30px;color:#64748b;">
        <div class="spinner" style="margin:0 auto 12px;"></div>
        <p id="gp-progresso" style="margin:0;">${this.esc(s.progresso)}</p>
      </div>`;
    }
    if (s.erroTitulos) return `<div style="padding:18px 20px;color:#b91c1c;">${this.esc(s.erroTitulos)}</div>`;
    if (!s.consultado) {
      return `<div style="padding:22px 20px;color:#64748b;font-size:0.85rem;">Escolha o período e clique em <strong>Buscar títulos</strong> para conferir em qual conta os títulos dos centros de custo de parceiro foram pagos.</div>`;
    }
    const todos = s.titulos;
    const cont = { todos: todos.length, ok: 0, outra: 0, aberto: 0 };
    todos.forEach((r) => { cont[this.grupoStatus(r)] += 1; });
    const visiveis = s.filtro === "todos" ? todos : todos.filter((r) => this.grupoStatus(r) === s.filtro);
    const filtros = this.FILTROS.map((f) => `<button type="button" class="gp-filtro${s.filtro === f.id ? " is-active" : ""}${f.id === "outra" ? " is-bad" : ""}" onclick="GerarPagamentoApp.setFiltro('${f.id}')">${this.esc(f.label)} <b>${cont[f.id]}</b></button>`).join("");
    const linhas = visiveis.length
      ? visiveis.map((r) => `<tr class="${r.status === "outra" || r.status === "sem-conta" ? "gp-row-bad" : ""}">
          <td>${this.dataBr(r.vencimento)}</td>
          <td>${r.pagamento ? this.dataBr(r.pagamento) : "—"}</td>
          <td><strong>${this.esc(r.titulo)}</strong>${r.parcela ? `<span class="gp-muted"> / ${this.esc(r.parcela)}</span>` : ""}</td>
          <td title="${this.esc(r.credor)}">${this.esc(r.credor)}</td>
          <td>${this.esc(r.documento || "—")}</td>
          <td title="${this.esc(r.ccNome)}"><strong>${this.esc(r.ccId)}</strong> <span class="gp-muted">${this.esc(r.ccNome)}</span></td>
          <td style="text-align:right;">${this.money(r.valor)}</td>
          <td class="gp-status">${this.statusHtml(r)}</td>
        </tr>`).join("")
      : `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">Nenhum título ${s.filtro === "todos" ? "dos centros de custo de parceiro" : "neste filtro"} no período.</td></tr>`;
    return `
      <div class="gp-filtros">${filtros}</div>
      ${s.previsoesIgnoradas ? `<p class="gp-nota">${s.previsoesIgnoradas} previsão(ões) ignorada(s) — só entram títulos que não são previsão.</p>` : ""}
      <div style="max-height:56vh;overflow:auto;">
        <table class="gp-table gp-titulos">
          <colgroup><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:17%"><col style="width:10%"><col style="width:18%"><col style="width:10%"><col style="width:20%"></colgroup>
          <thead><tr>
            <th>Vencimento</th><th>Pagamento</th><th>Título</th><th>Credor</th><th>Documento</th><th>Centro de custo</th><th style="text-align:right;">Valor</th><th>Conta</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  },

  paintTitulos() {
    const box = document.getElementById("gp-titulos-box");
    if (box) box.innerHTML = this.titulosHtml();
  },

  rowsHtml() {
    const list = this.parceiros();
    if (!list.length) {
      return `<tr><td colspan="5" style="text-align:center;padding:28px;color:#64748b;">
        Nenhum centro de custo de parceiro. Cadastre a conta de parceria em Centros de Custo.
      </td></tr>`;
    }
    return list.map((cc) => {
      const empId = this.companyIdOf(cc);
      const conta = this.contaParceriaDe(cc);
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
    const s = this.state;
    const list = this.parceiros();
    const semConta = list.filter((cc) => !this.contaParceriaDe(cc)).length;
    const busy = s.consultando;
    const body = s.loading
      ? `<div style="text-align:center;padding:40px;color:#64748b;">
          <div class="spinner" style="margin:0 auto 12px;"></div>
          <p>Carregando centros de custo de parceiro…</p>
        </div>`
      : (s.error
        ? `<div class="crm-card" style="padding:20px;color:#b91c1c;">${this.esc(s.error)}</div>`
        : `
        <style>
          #gerar-pagamento-root .gp-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
          #gerar-pagamento-root .gp-table thead th { position:sticky; top:0; background:#1b8253; color:#fff; padding:12px; text-align:left; font-weight:600; z-index:2; white-space:nowrap; }
          #gerar-pagamento-root .gp-table tbody tr { border-bottom:1px solid #e0e5e0; }
          #gerar-pagamento-root .gp-table tbody tr:nth-child(even) { background:#f4f6f4; }
          #gerar-pagamento-root .gp-table td { padding:10px 12px; vertical-align:middle; }
          #gerar-pagamento-root .gp-titulos { table-layout:fixed; min-width:1100px; font-size:0.82rem; }
          #gerar-pagamento-root .gp-titulos td { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          #gerar-pagamento-root .gp-titulos td.gp-status { white-space:normal; }
          #gerar-pagamento-root .gp-titulos tbody tr.gp-row-bad { background:#fef2f2; }
          #gerar-pagamento-root .gp-muted { color:#64748b; font-weight:400; }
          #gerar-pagamento-root .gp-pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700; }
          #gerar-pagamento-root .gp-ok { background:#dcfce7; color:#105436; }
          #gerar-pagamento-root .gp-bad { background:#fee2e2; color:#b91c1c; }
          #gerar-pagamento-root .gp-wait { background:#e2e8f0; color:#334155; }
          #gerar-pagamento-root .gp-status small { display:block; margin-top:3px; color:#64748b; font-size:0.72rem; line-height:1.3; }
          #gerar-pagamento-root .gp-busca { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; padding:16px 20px; border-bottom:1px solid #e2e8f0; }
          #gerar-pagamento-root .gp-busca .form-group { margin:0; display:flex; flex-direction:column; gap:4px; }
          #gerar-pagamento-root .gp-busca label { font-size:0.75rem; font-weight:700; color:#475569; }
          #gerar-pagamento-root .gp-busca .form-control { height:38px; min-width:150px; }
          #gerar-pagamento-root .gp-filtros { display:flex; gap:8px; flex-wrap:wrap; padding:14px 20px 4px; }
          #gerar-pagamento-root .gp-filtro { height:32px; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:0.8rem; font-weight:600; cursor:pointer; }
          #gerar-pagamento-root .gp-filtro b { margin-left:4px; }
          #gerar-pagamento-root .gp-filtro.is-active { background:#105436; border-color:#105436; color:#fff; }
          #gerar-pagamento-root .gp-filtro.is-bad.is-active { background:#b91c1c; border-color:#b91c1c; }
          #gerar-pagamento-root .gp-nota { margin:6px 20px 10px; color:#64748b; font-size:0.78rem; }
        </style>
        <div class="crm-card" style="padding:18px 20px;margin-bottom:16px;">
          <h3 style="margin:0 0 8px;color:var(--color-primary);font-size:1rem;">Conta de parceria</h3>
          <p style="margin:0;color:#475569;font-size:0.85rem;line-height:1.5;">
            Centros de custo com <strong>parceiro/parceria</strong> no nome ou com conta de parceria cadastrada.
            Quando o título a pagar tiver um desses centros de custo, o pagamento sai pela
            <strong>conta de parceria</strong> cadastrada no próprio centro de custo — não pela conta padrão da empresa.
          </p>
          <p style="margin:10px 0 0;color:#64748b;font-size:0.8rem;">
            ${list.length} centro(s) de parceiro ·
            ${semConta ? `<span style="color:#b91c1c;font-weight:700;">${semConta} sem conta cadastrada</span>` : `<span style="color:#105436;font-weight:700;">todos com conta</span>`}
          </p>
        </div>
        <div class="crm-card" style="overflow:hidden;padding:0;">
          <div style="max-height:40vh;overflow:auto;">
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
        <div class="crm-card" style="overflow:hidden;padding:0;margin-top:16px;">
          <div class="gp-busca">
            <div style="flex:1 1 220px;">
              <h3 style="margin:0 0 4px;color:var(--color-primary);font-size:1rem;">Títulos a pagar dos centros de custo de parceiro</h3>
              <p style="margin:0;color:#64748b;font-size:0.78rem;">Confere se o pagamento saiu pela conta de parceria cadastrada. Previsões ficam de fora.</p>
            </div>
            <div class="form-group">
              <label>Data de</label>
              <select class="form-control" ${busy ? "disabled" : ""} onchange="GerarPagamentoApp.onField('tipoData', this.value)">
                <option value="D" ${s.tipoData !== "P" ? "selected" : ""}>Vencimento</option>
                <option value="P" ${s.tipoData === "P" ? "selected" : ""}>Pagamento</option>
              </select>
            </div>
            <div class="form-group">
              <label>De</label>
              <input type="date" class="form-control" value="${this.esc(s.startDate)}" ${busy ? "disabled" : ""}
                onchange="GerarPagamentoApp.onField('startDate', this.value)">
            </div>
            <div class="form-group">
              <label>Até</label>
              <input type="date" class="form-control" value="${this.esc(s.endDate)}" ${busy ? "disabled" : ""}
                onchange="GerarPagamentoApp.onField('endDate', this.value)">
            </div>
            <button type="button" class="btn btn-primary" ${busy ? "disabled" : ""} onclick="GerarPagamentoApp.consultarTitulos()"
              style="height:38px;width:150px;justify-content:center;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="search" style="width:14px;"></i> Buscar títulos
            </button>
          </div>
          <div id="gp-titulos-box">${this.titulosHtml()}</div>
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
