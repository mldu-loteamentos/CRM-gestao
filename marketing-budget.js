/* Marketing · Budget
   Verba = VGV da obra (Sienge) × % de marketing. Consome com os títulos a pagar dos planos financeiros
   de marketing do centro de custo (pagos = realizado, em aberto = comprometido) e mede o custo de
   aquisição por unidade vendida com os contratos de venda do empreendimento. */
const MarketingBudgetApp = {
  CONFIG_COLLECTION: "marketing_budget_config",
  CONFIG_LOCAL: "crm_marketing_budget_config",
  CAT_DOC: "_categorias",
  CAT_PADRAO: /MARKET|PUBLICI|PROPAGAND|M[IÍ]DIA|EVENTO|BRINDE|PATROCIN|STAND|PANFLET|OUTDOOR|ANUNCI|DIVULGA/i,

  state: {
    costCenters: [],
    ccId: "",
    startDate: "",
    endDate: "",
    loading: false,
    progress: "",
    error: "",
    consultado: false,
    obra: null,
    pct: 0,
    catSel: null,
    categorias: {},
    rows: [],
    vendas: [],
    distratos: [],
    eventos: [],
    filtroGasto: "todos",
    gen: 0
  },
  charts: {},

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  moneyShort(v) {
    const n = Number(v) || 0;
    const a = Math.abs(n);
    if (a >= 1e6) return "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi";
    if (a >= 1e3) return "R$ " + (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return this.money(n);
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : "—";
  },

  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  ccLabel(cc) {
    return cc ? `${cc.id} — ${cc.name || cc.nome || ""}` : "";
  },

  ccAtual() {
    return this.state.costCenters.find((c) => String(c.id) === String(this.state.ccId)) || null;
  },

  async init() {
    const s = this.state;
    if (!s.startDate) {
      const d = new Date();
      s.startDate = d.getFullYear() + "-01-01";
      s.endDate = d.getFullYear() + "-12-31";
    }
    if (!s.costCenters.length) {
      try {
        const list = window.SiengeApiService && SiengeApiService.getCostCenters ? await SiengeApiService.getCostCenters() : [];
        s.costCenters = (Array.isArray(list) ? list : []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id), "pt-BR", { numeric: true }));
      } catch (e) {
        s.costCenters = [];
      }
    }
    this.render();
  },

  /* ---------- configuração (% de marketing e planos financeiros) ---------- */
  configLocal() {
    try { return JSON.parse(localStorage.getItem(this.CONFIG_LOCAL) || "{}") || {}; } catch (e) { return {}; }
  },

  salvarConfigLocal(key, value) {
    const all = this.configLocal();
    all[key] = value;
    try { localStorage.setItem(this.CONFIG_LOCAL, JSON.stringify(all)); } catch (e) {}
  },

  async lerConfig(key) {
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.getDoc) {
      try {
        const snap = await fc.getDoc(fc.doc(window.firebaseDb, this.CONFIG_COLLECTION, key));
        if (snap.exists()) {
          const data = snap.data();
          this.salvarConfigLocal(key, data);
          return data;
        }
      } catch (e) {
        console.warn("[Budget] config", key, e);
      }
    }
    return this.configLocal()[key] || null;
  },

  async gravarConfig(key, data) {
    const payload = { ...data, updatedAt: new Date().toISOString(), updatedBy: (window.MarketingApp && MarketingApp.currentUserName()) || "" };
    this.salvarConfigLocal(key, payload);
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc) return false;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, this.CONFIG_COLLECTION, key), payload, { merge: true });
      return true;
    } catch (e) {
      console.warn("[Budget] gravar config", key, e);
      return false;
    }
  },

  async salvarPct() {
    const el = document.getElementById("mkb-pct");
    const raw = String((el && el.value) || "").replace(",", ".");
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      alert("Informe um percentual entre 0 e 100.");
      return;
    }
    this.state.pct = pct;
    const ok = await this.gravarConfig(String(this.state.ccId), { pct });
    this.render();
    if (!ok) alert("O percentual ficou salvo neste computador, mas não consegui gravar no Firebase.");
  },

  async toggleCategoria(id) {
    const s = this.state;
    const sel = new Set(this.categoriasSelecionadas());
    if (sel.has(id)) sel.delete(id);
    else sel.add(id);
    s.catSel = [...sel];
    this.render();
    await this.gravarConfig(this.CAT_DOC, { ids: s.catSel });
  },

  categoriasSelecionadas() {
    const s = this.state;
    if (Array.isArray(s.catSel)) return s.catSel;
    return Object.values(s.categorias).filter((c) => this.CAT_PADRAO.test(c.nome)).map((c) => c.id);
  },

  /* ---------- consulta ---------- */
  onCcInput(raw) {
    const val = String(raw || "").trim();
    const cc = this.state.costCenters.find((c) => String(c.id) === val || this.ccLabel(c) === val || `${c.id} - ${c.name}` === val);
    this.state.ccId = cc ? String(cc.id) : "";
  },

  onField(key, value) {
    this.state[key] = value;
  },

  setProgress(text) {
    this.state.progress = text;
    const el = document.getElementById("mkb-progress");
    if (el) el.textContent = text;
  },

  async consultar() {
    const s = this.state;
    const input = document.getElementById("mkb-cc");
    if (input) this.onCcInput(input.value);
    const cc = this.ccAtual();
    if (!cc) { alert("Escolha o empreendimento (centro de custo)."); return; }
    if (!s.startDate || !s.endDate || s.startDate > s.endDate) { alert("Informe um período válido."); return; }
    const gen = (s.gen += 1);
    s.loading = true;
    s.error = "";
    s.consultado = true;
    s.rows = [];
    s.vendas = [];
    s.distratos = [];
    this.render();
    try {
      this.setProgress("Lendo o cadastro da obra (VGV)…");
      const [obra, cfg, catCfg] = await Promise.all([
        this.lerVgv(cc),
        this.lerConfig(String(cc.id)),
        this.lerConfig(this.CAT_DOC)
      ]);
      if (gen !== s.gen) return;
      s.obra = obra;
      s.pct = cfg && Number.isFinite(Number(cfg.pct)) ? Number(cfg.pct) : 0;
      s.catSel = catCfg && Array.isArray(catCfg.ids) ? catCfg.ids.map(String) : null;
      s.eventos = await this.lerEventos(cc.id);
      this.setProgress("Buscando os títulos a pagar do empreendimento…");
      const bills = await this.buscarTitulos(cc, gen);
      if (gen !== s.gen) return;
      this.montarGastos(bills, cc);
      this.setProgress("Buscando as vendas do empreendimento…");
      await this.buscarVendas(cc, gen);
    } catch (e) {
      if (gen !== s.gen) return;
      console.error("[Budget]", e);
      s.error = (e && e.message) ? e.message : "Falha ao consultar o Sienge.";
    }
    if (gen !== s.gen) return;
    s.loading = false;
    s.progress = "";
    this.render();
  },

  async lerVgv(cc) {
    let obra = null;
    try {
      obra = window.SiengeApiService && SiengeApiService.getEnterpriseVgv ? await SiengeApiService.getEnterpriseVgv(cc.id) : null;
    } catch (e) {
      console.warn("[Budget] obra", cc.id, e);
    }
    if (obra && obra.vgv > 0) return { vgv: obra.vgv, fonte: "obra", nome: obra.nome || "" };
    let custom = {};
    try {
      const raw = localStorage.getItem("crm_centros_custo_custom") || "{}";
      custom = typeof window.parseCentrosCustoCustomMap === "function" ? window.parseCentrosCustoCustomMap(raw) : (JSON.parse(raw) || {});
    } catch (e) {}
    if (window.CentrosCustoState && CentrosCustoState.customFields) custom = Object.assign({}, custom, CentrosCustoState.customFields);
    const manual = parseFloat((custom[cc.id] || custom[String(cc.id)] || {}).valor_vgv) || 0;
    if (manual > 0) return { vgv: manual, fonte: "centro", nome: "" };
    return { vgv: 0, fonte: "sem", nome: (obra && obra.nome) || "" };
  },

  async lerEventos(ccId) {
    let list = (window.MarketingState && MarketingState.budgets) || [];
    if (!list.length && window.firebaseDb && window.firebaseCollections) {
      try {
        const { collection, getDocs } = window.firebaseCollections;
        const snap = await getDocs(collection(window.firebaseDb, "marketing_budgets"));
        list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      } catch (e) {
        list = [];
      }
    }
    return list.filter((b) => String(b.costCenterId) === String(ccId));
  },

  async buscarTitulos(cc, gen) {
    const base = window.ComprasControleApp || window.ComprasPrevisoesApp;
    if (!base || typeof base.outcomeRange !== "function") throw new Error("O módulo de contas a pagar não está disponível.");
    const s = this.state;
    const api = Object.create(base);
    api.outcomeEndpoint = (start, end, companyId) => "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false&withBankMovements=true"
      + "&costCentersId=" + encodeURIComponent(cc.id)
      + (companyId ? "&companyId=" + encodeURIComponent(companyId) : "");
    api.noteProgress = (t) => { if (gen === s.gen) this.setProgress(t); };
    const companyId = String(cc.idCompany != null ? cc.idCompany : (cc.companyId != null ? cc.companyId : ""));
    const faixas = typeof siengeSplitDateRange === "function" ? siengeSplitDateRange(s.startDate, s.endDate) : [{ start: s.startDate, end: s.endDate }];
    const bills = [];
    for (let i = 0; i < faixas.length; i++) {
      if (gen !== s.gen) return [];
      this.setProgress(`Buscando os títulos a pagar do empreendimento · ${i + 1} de ${faixas.length}`);
      const parte = await api.outcomeRange(faixas[i].start, faixas[i].end, companyId);
      if (Array.isArray(parte)) bills.push.apply(bills, parte);
    }
    return bills;
  },

  montarGastos(bills, cc) {
    const app = window.ComprasControleApp || window.ComprasPrevisoesApp;
    const lista = (x) => (Array.isArray(x) ? x : (x ? [x] : []));
    const cats = {};
    const rows = [];
    const vistos = {};
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const docId = app.docCode(bill.documentIdentificationId);
      const docNome = bill.documentIdentificationName || "";
      const minhas = lista(bill.paymentsCategories).filter((c) => c && String(c.costCenterId) === String(cc.id));
      if (!minhas.length) return;
      const pays = lista(bill.payments);
      const movsDe = (p) => {
        const bms = lista(p && p.bankMovements);
        return bms.length ? bms : [null];
      };
      if (pays.some((p) => movsDe(p).some((bm) => app.isSubstituicao(bill, p, bm, docId, docNome)))) return;
      const previsao = app.ehPrevisao(docId, docNome, bill);
      let pago = false;
      let dataPg = "";
      pays.forEach((p) => {
        movsDe(p).forEach((bm) => {
          if (bm && app.SKIP_OPS[bm.operationName || ""]) return;
          if (app.isPago(bill, p, bm, docId, docNome)) {
            pago = true;
            const d = app.paymentDateOf(bill, p, bm);
            if (d && d > dataPg) dataPg = d;
          }
        });
      });
      const original = Number(bill.originalAmount) || 0;
      const saldo = app.billBalance(bill);
      let realizado = 0;
      if (!previsao && pago) realizado = saldo != null && saldo > 0.009 ? Math.max(0, original - saldo) : original;
      const aberto = Math.max(0, original - realizado);
      const titulo = String(bill.billId);
      const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
      const venc = String(bill.dueDate || "").slice(0, 10);
      minhas.forEach((cat) => {
        const catId = String(cat.financialCategoryId != null ? cat.financialCategoryId : (cat.financialCategoryName || "?"));
        const catNome = cat.financialCategoryName || "Sem plano financeiro";
        const rate = cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) / 100 : 1;
        const fat = Number.isFinite(rate) ? rate : 1;
        const push = (status, valor, data) => {
          if (!(valor > 0.009)) return;
          const key = [titulo, parcela, catId, status].join("|");
          if (vistos[key]) return;
          vistos[key] = true;
          rows.push({
            titulo, parcela, catId, catNome, status, data, vencimento: venc, valor,
            credor: String(bill.creditorName || "").trim(),
            documento: [docId, bill.documentNumber].filter(Boolean).join(" ")
          });
          if (!cats[catId]) cats[catId] = { id: catId, nome: catNome, total: 0 };
          cats[catId].total += valor;
        };
        if (previsao) push("previsao", original * fat, venc);
        else {
          push("realizado", realizado * fat, dataPg || venc);
          push("comprometido", aberto * fat, venc);
        }
      });
    });
    rows.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    this.state.rows = rows;
    this.state.categorias = cats;
  },

  async buscarVendas(cc, gen) {
    const s = this.state;
    const todas = async (base) => {
      let out = [];
      let offset = 0;
      for (let guard = 0; guard < 50; guard++) {
        if (gen !== s.gen) return out;
        const res = await siengeFetchWithRetry(`${base}&limit=200&offset=${offset}`).catch(() => ({ results: [] }));
        const rs = (res && res.results) || [];
        out = out.concat(rs);
        if (rs.length < 200) break;
        offset += 200;
      }
      return out;
    };
    const q = `enterpriseId=${encodeURIComponent(cc.id)}`;
    const [emitidos, cancelados, quitados, distratos] = await Promise.all([
      todas(`/sales-contracts?${q}&situation=2&initialIssueDate=${s.startDate}&finalIssueDate=${s.endDate}`),
      todas(`/sales-contracts?${q}&situation=3&initialIssueDate=${s.startDate}&finalIssueDate=${s.endDate}`),
      todas(`/sales-contracts?${q}&situation=4&initialIssueDate=${s.startDate}&finalIssueDate=${s.endDate}`),
      todas(`/sales-contracts?${q}&situation=3&initialCancelDate=${s.startDate}&finalCancelDate=${s.endDate}`)
    ]);
    const doEmp = (c) => !c.enterpriseId || String(c.enterpriseId) === String(cc.id);
    const vistos = new Set();
    const vendas = [];
    emitidos.concat(cancelados, quitados).forEach((c) => {
      const id = String(c && c.id != null ? c.id : "");
      if (!id || vistos.has(id) || !doEmp(c)) return;
      vistos.add(id);
      vendas.push(this.slimVenda(c));
    });
    const dVistos = new Set();
    s.distratos = distratos.filter((c) => {
      const id = String(c && c.id != null ? c.id : "");
      if (!id || dVistos.has(id) || !doEmp(c)) return false;
      dVistos.add(id);
      return true;
    }).map((c) => this.slimVenda(c));
    s.vendas = vendas.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  },

  slimVenda(c) {
    const units = (c.salesContractUnits || c.units || []);
    const cust = (c.salesContractCustomers || []).find((x) => x.main) || (c.salesContractCustomers || [])[0] || {};
    const sit = String(c.situation == null ? "" : c.situation);
    return {
      id: String(c.id),
      numero: c.number || c.contractNumber || String(c.id),
      data: String(c.issueDate || c.contractDate || "").slice(0, 10),
      dataCancel: String(c.cancellationDate || "").slice(0, 10),
      unidades: units.length || 1,
      unidadeNomes: units.map((u) => u.name).filter(Boolean).join(", "),
      cliente: cust.name || "",
      valor: Number(c.totalSellingValue || c.value || 0) || 0,
      situacao: sit === "3" || /cancel/i.test(sit) ? "Cancelado" : (sit === "4" ? "Quitado" : "Emitido")
    };
  },

  /* ---------- números ---------- */
  resumo() {
    const s = this.state;
    const sel = new Set(this.categoriasSelecionadas());
    const rows = s.rows.filter((r) => sel.has(r.catId));
    const soma = (st) => rows.filter((r) => r.status === st).reduce((t, r) => t + r.valor, 0);
    const verba = (Number(s.obra && s.obra.vgv) || 0) * ((Number(s.pct) || 0) / 100);
    const realizado = soma("realizado");
    const comprometido = soma("comprometido");
    const previsto = soma("previsao");
    const brutas = s.vendas.reduce((t, v) => t + v.unidades, 0);
    const distr = s.distratos.reduce((t, v) => t + v.unidades, 0);
    const liquidas = Math.max(0, brutas - distr);
    return {
      rows, verba, realizado, comprometido, previsto,
      saldo: verba - realizado - comprometido,
      consumo: verba > 0 ? ((realizado + comprometido) / verba) * 100 : 0,
      brutas, distr, liquidas,
      vgvVendido: s.vendas.filter((v) => v.situacao !== "Cancelado").reduce((t, v) => t + v.valor, 0),
      cac: liquidas > 0 ? realizado / liquidas : null,
      cacTotal: liquidas > 0 ? (realizado + comprometido) / liquidas : null
    };
  },

  meses() {
    const s = this.state;
    const out = [];
    let d = new Date(s.startDate.slice(0, 7) + "-01T12:00:00");
    const fim = s.endDate.slice(0, 7);
    for (let i = 0; i < 60; i++) {
      const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      out.push(k);
      if (k >= fim) break;
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  },

  setFiltroGasto(id) {
    this.state.filtroGasto = this.state.filtroGasto === id && id !== "todos" ? "todos" : id;
    const box = document.getElementById("mkb-gastos");
    if (box) box.innerHTML = this.gastosHtml(this.resumo());
  },

  /* ---------- render ---------- */
  kpi(label, valor, sub, cor, extra) {
    return `<div class="mkb-kpi" style="border-top-color:${cor};">
      <span>${label}</span><strong>${valor}</strong>${sub ? `<small>${sub}</small>` : ""}${extra || ""}
    </div>`;
  },

  gastosHtml(r) {
    const s = this.state;
    const nomes = { realizado: "Realizado", comprometido: "Comprometido", previsao: "Previsão" };
    const cont = { todos: r.rows.length, realizado: 0, comprometido: 0, previsao: 0 };
    r.rows.forEach((x) => { cont[x.status] += 1; });
    const lista = s.filtroGasto === "todos" ? r.rows : r.rows.filter((x) => x.status === s.filtroGasto);
    const chips = ["todos", "realizado", "comprometido", "previsao"].map((id) => `<button type="button" class="mkb-chip${s.filtroGasto === id ? " is-on" : ""}" onclick="MarketingBudgetApp.setFiltroGasto('${id}')">${id === "todos" ? "Todos" : nomes[id]} <b>${cont[id]}</b></button>`).join("");
    const linhas = lista.length ? lista.map((x) => `<tr>
        <td>${this.dataBr(x.data)}</td>
        <td><span class="mkb-st mkb-st-${x.status}">${nomes[x.status]}</span></td>
        <td><strong>${this.esc(x.titulo)}</strong>${x.parcela ? `<span class="mkb-muted"> / ${this.esc(x.parcela)}</span>` : ""}</td>
        <td title="${this.esc(x.credor)}">${this.esc(x.credor)}</td>
        <td>${this.esc(x.documento || "—")}</td>
        <td title="${this.esc(x.catNome)}">${this.esc(x.catNome)}</td>
        <td style="text-align:right;">${this.money(x.valor)}</td>
      </tr>`).join("")
      : `<tr><td colspan="7" class="mkb-vazio">Nenhum gasto ${s.filtroGasto === "todos" ? "nos planos de marketing selecionados" : "nesta situação"} no período.</td></tr>`;
    return `<div class="mkb-chips">${chips}</div>
      <div class="mkb-tablewrap"><table class="mkb-table">
        <colgroup><col style="width:9%"><col style="width:11%"><col style="width:9%"><col style="width:22%"><col style="width:11%"><col style="width:24%"><col style="width:14%"></colgroup>
        <thead><tr><th>Data</th><th>Situação</th><th>Título</th><th>Credor</th><th>Documento</th><th>Plano financeiro</th><th style="text-align:right;">Valor</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>`;
  },

  vendasHtml() {
    const s = this.state;
    const lista = s.vendas.concat(s.distratos.filter((d) => !s.vendas.some((v) => v.id === d.id)));
    const linhas = lista.length ? lista.map((v) => `<tr>
        <td>${this.dataBr(v.data)}</td>
        <td><strong>${this.esc(v.numero)}</strong></td>
        <td title="${this.esc(v.unidadeNomes)}">${this.esc(v.unidadeNomes || v.unidades + " unid.")}</td>
        <td title="${this.esc(v.cliente)}">${this.esc(v.cliente || "—")}</td>
        <td style="text-align:right;">${this.money(v.valor)}</td>
        <td><span class="mkb-st ${v.situacao === "Cancelado" ? "mkb-st-cancel" : "mkb-st-realizado"}">${v.situacao}${v.situacao === "Cancelado" && v.dataCancel ? " em " + this.dataBr(v.dataCancel) : ""}</span></td>
      </tr>`).join("")
      : `<tr><td colspan="6" class="mkb-vazio">Nenhuma venda deste empreendimento no período.</td></tr>`;
    return `<div class="mkb-tablewrap"><table class="mkb-table">
        <colgroup><col style="width:11%"><col style="width:14%"><col style="width:20%"><col style="width:27%"><col style="width:13%"><col style="width:15%"></colgroup>
        <thead><tr><th>Emissão</th><th>Contrato</th><th>Unidade</th><th>Cliente</th><th style="text-align:right;">Valor</th><th>Situação</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>`;
  },

  categoriasHtml() {
    const s = this.state;
    const sel = new Set(this.categoriasSelecionadas());
    const list = Object.values(s.categorias).sort((a, b) => (sel.has(b.id) - sel.has(a.id)) || b.total - a.total);
    if (!list.length) return `<p class="mkb-muted" style="margin:0;">Nenhum título a pagar deste centro de custo no período.</p>`;
    return `<div class="mkb-cats">${list.map((c) => `<button type="button" class="mkb-cat${sel.has(c.id) ? " is-on" : ""}" onclick="MarketingBudgetApp.toggleCategoria('${this.esc(c.id)}')" title="${sel.has(c.id) ? "Considerado marketing — clique para tirar" : "Clique para considerar marketing"}">
        ${sel.has(c.id) ? '<i data-lucide="check" style="width:12px;height:12px;"></i>' : ""}${this.esc(c.nome)} <b>${this.moneyShort(c.total)}</b></button>`).join("")}</div>`;
  },

  resultadoHtml() {
    const s = this.state;
    const r = this.resumo();
    const obra = s.obra || { vgv: 0, fonte: "sem" };
    const fonte = obra.fonte === "obra" ? "Cadastro da obra no Sienge" : (obra.fonte === "centro" ? "Digitado no centro de custo (a obra não tem VGV)" : "Sem VGV — preencha o Valor geral de vendas na obra no Sienge");
    const consumo = Math.min(r.consumo, 100);
    const corConsumo = r.consumo > 100 ? "#b91c1c" : (r.consumo >= 80 ? "#f37021" : "#105436");
    const ev = s.eventos || [];
    const evOrcado = ev.reduce((t, b) => t + (Number(b.plannedValue) || 0), 0);
    return `
      <div class="mkb-card mkb-config">
        <div class="mkb-cfg-item">
          <span>VGV do empreendimento</span>
          <strong>${obra.vgv > 0 ? this.money(obra.vgv) : "—"}</strong>
          <small>${fonte}</small>
        </div>
        <div class="mkb-cfg-item">
          <span>% do VGV para marketing</span>
          <div class="mkb-pct">
            <input id="mkb-pct" type="text" inputmode="decimal" value="${String(s.pct || 0).replace(".", ",")}">
            <em>%</em>
            <button type="button" class="btn btn-primary" onclick="MarketingBudgetApp.salvarPct()">Salvar</button>
          </div>
          <small>Fica salvo para este empreendimento</small>
        </div>
        <div class="mkb-cfg-item mkb-verba">
          <span>Verba de marketing</span>
          <strong>${this.money(r.verba)}</strong>
          <small>VGV × ${String(s.pct || 0).replace(".", ",")}%</small>
        </div>
      </div>

      <div class="mkb-kpis">
        ${this.kpi("Realizado", this.money(r.realizado), "Títulos pagos no período", "#105436")}
        ${this.kpi("Comprometido", this.money(r.comprometido), "Títulos em aberto", "#f37021")}
        ${this.kpi("Saldo da verba", this.money(r.saldo), r.saldo < 0 ? "Verba estourada" : "Verba − realizado − comprometido", r.saldo < 0 ? "#b91c1c" : "#0ea5e9")}
        ${this.kpi("Consumo da verba", r.verba > 0 ? r.consumo.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—", "Realizado + comprometido", corConsumo,
          `<div class="mkb-bar"><i style="width:${consumo}%;background:${corConsumo};"></i></div>`)}
        ${this.kpi("Unidades vendidas", r.liquidas.toLocaleString("pt-BR"), `${r.brutas} vendidas · ${r.distr} distratadas no período`, "#6366f1")}
        ${this.kpi("Custo por unidade vendida", r.cac != null ? this.money(r.cac) : "—", "Realizado ÷ unidades vendidas", "#105436")}
        ${this.kpi("Custo por unidade (c/ comprometido)", r.cacTotal != null ? this.money(r.cacTotal) : "—", "(Realizado + comprometido) ÷ unidades", "#f37021")}
        ${this.kpi("Vendido no período", this.moneyShort(r.vgvVendido), r.vgvVendido > 0 ? "Marketing = " + ((r.realizado / r.vgvVendido) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "% do vendido" : "Valor dos contratos", "#0f766e")}
      </div>
      ${r.previsto > 0 || ev.length ? `<p class="mkb-nota">${r.previsto > 0 ? `Previsões de marketing no período: <strong>${this.money(r.previsto)}</strong> (não entram no comprometido). ` : ""}${ev.length ? `Eventos cadastrados neste empreendimento: <strong>${ev.length}</strong> · orçado ${this.money(evOrcado)}.` : ""}</p>` : ""}

      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Planos financeiros considerados marketing</h3><small>Clique para incluir ou tirar. Vale para todos os empreendimentos.</small></div>
        ${this.categoriasHtml()}
      </div>

      <div class="mkb-charts">
        <div class="mkb-card mkb-chart-wide"><div class="mkb-card-h"><h3>Verba × gastos por mês</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-mes"></canvas></div></div>
        <div class="mkb-card"><div class="mkb-card-h"><h3>Gastos por plano financeiro</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-cat"></canvas></div></div>
        <div class="mkb-card mkb-chart-full"><div class="mkb-card-h"><h3>Vendas e custo por unidade vendida</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-vendas"></canvas></div></div>
      </div>

      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Detalhamento dos gastos</h3><small>Realizado = pago · Comprometido = título em aberto · Previsão = documento de previsão</small></div>
        <div id="mkb-gastos">${this.gastosHtml(r)}</div>
      </div>

      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Vendas do empreendimento no período</h3><small>Contratos de venda do Sienge emitidos no período e distratos do período</small></div>
        ${this.vendasHtml()}
      </div>`;
  },

  render() {
    const root = document.getElementById("marketing-budget-root");
    if (!root) return;
    const s = this.state;
    const cc = this.ccAtual();
    const opts = s.costCenters.map((c) => `<option value="${this.esc(this.ccLabel(c))}"></option>`).join("");
    const corpo = s.loading
      ? `<div class="mkb-card" style="text-align:center;padding:40px;color:#64748b;"><div class="spinner" style="margin:0 auto 12px;"></div><p id="mkb-progress" style="margin:0;">${this.esc(s.progress)}</p></div>`
      : (s.error ? `<div class="mkb-card" style="color:#b91c1c;">${this.esc(s.error)}</div>`
        : (s.consultado ? this.resultadoHtml()
          : `<div class="mkb-card mkb-vazio">Escolha o empreendimento e o período e clique em <strong>Consultar</strong>. A verba vem do VGV da obra no Sienge × o percentual de marketing.</div>`));
    this.destruirGraficos();
    root.innerHTML = `
      <style>
        #marketing-budget-root .mkb-wrap { padding:8px 4px 24px; }
        #marketing-budget-root .mkb-head { background:#105436; padding:16px 20px; border-radius:12px 12px 0 0; display:flex; align-items:center; gap:12px; color:#fff; }
        #marketing-budget-root .mkb-head-ic { width:36px; height:36px; background:rgba(255,255,255,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; }
        #marketing-budget-root .mkb-body { background:#f8fafc; border:1px solid #e2e8f0; border-top:none; padding:16px; border-radius:0 0 12px 12px; display:flex; flex-direction:column; gap:14px; }
        #marketing-budget-root .mkb-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; }
        #marketing-budget-root .mkb-card-h { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
        #marketing-budget-root .mkb-card-h h3 { margin:0; font-size:0.95rem; color:#105436; }
        #marketing-budget-root .mkb-card-h small, #marketing-budget-root .mkb-muted { color:#64748b; font-size:0.75rem; font-weight:400; }
        #marketing-budget-root .mkb-filtros { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
        #marketing-budget-root .mkb-filtros label { display:block; font-size:0.72rem; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:4px; }
        #marketing-budget-root .mkb-filtros input { height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font:inherit; font-size:0.85rem; box-sizing:border-box; background:#fff; }
        #marketing-budget-root .mkb-filtros .mkb-f-cc { flex:1 1 360px; }
        #marketing-budget-root .mkb-filtros .mkb-f-cc input { width:100%; }
        #marketing-budget-root .mkb-config { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:16px; }
        #marketing-budget-root .mkb-cfg-item span { display:block; font-size:0.72rem; font-weight:700; color:#64748b; text-transform:uppercase; }
        #marketing-budget-root .mkb-cfg-item strong { display:block; font-size:1.35rem; color:#0f172a; margin-top:4px; }
        #marketing-budget-root .mkb-cfg-item small { display:block; color:#64748b; font-size:0.72rem; margin-top:4px; }
        #marketing-budget-root .mkb-verba strong { color:#105436; }
        #marketing-budget-root .mkb-pct { display:flex; align-items:center; gap:6px; margin-top:4px; }
        #marketing-budget-root .mkb-pct input { width:90px; height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:1rem; font-weight:700; text-align:right; }
        #marketing-budget-root .mkb-pct em { font-style:normal; font-weight:700; color:#475569; }
        #marketing-budget-root .mkb-pct .btn { height:38px; }
        #marketing-budget-root .mkb-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
        #marketing-budget-root .mkb-kpi { background:#fff; border:1px solid #e2e8f0; border-top:4px solid #105436; border-radius:10px; padding:12px 14px; min-width:0; }
        #marketing-budget-root .mkb-kpi span { display:block; font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.3px; }
        #marketing-budget-root .mkb-kpi strong { display:block; font-size:1.2rem; color:#0f172a; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #marketing-budget-root .mkb-kpi small { display:block; font-size:0.72rem; color:#64748b; margin-top:2px; }
        #marketing-budget-root .mkb-bar { height:6px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:8px; }
        #marketing-budget-root .mkb-bar i { display:block; height:100%; }
        #marketing-budget-root .mkb-nota { margin:0; font-size:0.8rem; color:#475569; }
        #marketing-budget-root .mkb-cats { display:flex; flex-wrap:wrap; gap:6px; max-height:132px; overflow:auto; }
        #marketing-budget-root .mkb-cat { display:inline-flex; align-items:center; gap:4px; height:30px; padding:0 10px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:0.76rem; cursor:pointer; }
        #marketing-budget-root .mkb-cat b { color:#64748b; font-weight:600; }
        #marketing-budget-root .mkb-cat.is-on { background:#105436; border-color:#105436; color:#fff; }
        #marketing-budget-root .mkb-cat.is-on b { color:#d1fae5; }
        #marketing-budget-root .mkb-charts { display:grid; grid-template-columns:2fr 1fr; gap:14px; }
        #marketing-budget-root .mkb-canvas { position:relative; height:260px; }
        #marketing-budget-root .mkb-chart-full { grid-column:1 / -1; }
        #marketing-budget-root .mkb-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
        #marketing-budget-root .mkb-chip { height:32px; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:0.8rem; font-weight:600; cursor:pointer; }
        #marketing-budget-root .mkb-chip.is-on { background:#105436; border-color:#105436; color:#fff; }
        #marketing-budget-root .mkb-tablewrap { max-height:52vh; overflow:auto; }
        #marketing-budget-root .mkb-table { width:100%; min-width:900px; border-collapse:collapse; table-layout:fixed; font-size:0.82rem; }
        #marketing-budget-root .mkb-table thead th { position:sticky; top:0; background:#1b8253; color:#fff; padding:10px; text-align:left; font-weight:600; z-index:1; }
        #marketing-budget-root .mkb-table td { padding:9px 10px; border-bottom:1px solid #e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #marketing-budget-root .mkb-table tbody tr:nth-child(even) { background:#f8faf9; }
        #marketing-budget-root .mkb-st { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700; }
        #marketing-budget-root .mkb-st-realizado { background:#dcfce7; color:#105436; }
        #marketing-budget-root .mkb-st-comprometido { background:#ffedd5; color:#c2410c; }
        #marketing-budget-root .mkb-st-previsao { background:#e2e8f0; color:#334155; }
        #marketing-budget-root .mkb-st-cancel { background:#fee2e2; color:#b91c1c; }
        #marketing-budget-root .mkb-vazio { text-align:center; color:#64748b; padding:24px; }
        @media (max-width: 1100px) {
          #marketing-budget-root .mkb-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
          #marketing-budget-root .mkb-charts, #marketing-budget-root .mkb-config { grid-template-columns:1fr; }
        }
      </style>
      <div class="mkb-wrap">
        <div class="mkb-head">
          <div class="mkb-head-ic"><i data-lucide="wallet" style="width:18px;height:18px;color:#fff;"></i></div>
          <div>
            <div style="font-weight:800;font-size:1.05rem;">Budget de marketing</div>
            <div style="font-size:0.8rem;opacity:0.85;">Verba pelo VGV da obra · gastos realizados e comprometidos · custo por unidade vendida</div>
          </div>
        </div>
        <div class="mkb-body">
          <div class="mkb-card mkb-filtros">
            <div class="mkb-f-cc">
              <label for="mkb-cc">Empreendimento</label>
              <input id="mkb-cc" list="mkb-cc-list" placeholder="Digite o ID ou o nome do empreendimento" value="${this.esc(cc ? this.ccLabel(cc) : "")}" ${s.loading ? "disabled" : ""}
                onchange="MarketingBudgetApp.onCcInput(this.value)">
              <datalist id="mkb-cc-list">${opts}</datalist>
            </div>
            <div>
              <label for="mkb-de">De (vencimento)</label>
              <input id="mkb-de" type="date" value="${this.esc(s.startDate)}" ${s.loading ? "disabled" : ""} onchange="MarketingBudgetApp.onField('startDate', this.value)">
            </div>
            <div>
              <label for="mkb-ate">Até</label>
              <input id="mkb-ate" type="date" value="${this.esc(s.endDate)}" ${s.loading ? "disabled" : ""} onchange="MarketingBudgetApp.onField('endDate', this.value)">
            </div>
            <button type="button" class="btn btn-primary" ${s.loading ? "disabled" : ""} onclick="MarketingBudgetApp.consultar()"
              style="height:38px;width:140px;justify-content:center;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="search" style="width:14px;"></i> Consultar
            </button>
          </div>
          ${corpo}
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    if (s.consultado && !s.loading && !s.error) this.desenharGraficos();
  },

  destruirGraficos() {
    Object.keys(this.charts).forEach((k) => {
      try { this.charts[k].destroy(); } catch (e) {}
    });
    this.charts = {};
  },

  desenharGraficos() {
    if (typeof Chart === "undefined") return;
    const r = this.resumo();
    const meses = this.meses();
    const rot = meses.map((m) => ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m.slice(5)) - 1] + "/" + m.slice(2, 4));
    const porMes = (st) => meses.map((m) => r.rows.filter((x) => x.status === st && String(x.data).slice(0, 7) === m).reduce((t, x) => t + x.valor, 0));
    const real = porMes("realizado");
    const comp = porMes("comprometido");
    let acc = 0;
    const acum = meses.map((_, i) => (acc += real[i] + comp[i]));
    const tick = { callback: (v) => this.moneyShort(v) };
    const tip = { callbacks: { label: (c) => `${c.dataset.label}: ${this.money(c.parsed.y != null ? c.parsed.y : c.parsed)}` } };
    const elMes = document.getElementById("mkb-ch-mes");
    if (elMes) {
      const ds = [
        { type: "bar", label: "Realizado", data: real, backgroundColor: "#105436", stack: "g", order: 2 },
        { type: "bar", label: "Comprometido", data: comp, backgroundColor: "#f37021", stack: "g", order: 2 },
        { type: "line", label: "Acumulado", data: acum, borderColor: "#0ea5e9", backgroundColor: "#0ea5e9", tension: 0.25, pointRadius: 2, order: 1 }
      ];
      if (r.verba > 0) ds.push({ type: "line", label: "Verba", data: meses.map(() => r.verba), borderColor: "#b91c1c", borderDash: [6, 4], pointRadius: 0, order: 0 });
      this.charts.mes = new Chart(elMes, {
        data: { labels: rot, datasets: ds },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: tip, legend: { position: "bottom" } }, scales: { x: { stacked: true }, y: { stacked: false, beginAtZero: true, ticks: tick } } }
      });
    }
    const elCat = document.getElementById("mkb-ch-cat");
    if (elCat) {
      const porCat = {};
      r.rows.filter((x) => x.status !== "previsao").forEach((x) => { porCat[x.catNome] = (porCat[x.catNome] || 0) + x.valor; });
      const pares = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
      const cores = ["#105436", "#f37021", "#0ea5e9", "#6366f1", "#0f766e", "#eab308", "#b91c1c", "#64748b", "#a855f7", "#14b8a6"];
      this.charts.cat = new Chart(elCat, {
        type: "doughnut",
        data: { labels: pares.map((p) => p[0]), datasets: [{ data: pares.map((p) => p[1]), backgroundColor: pares.map((_, i) => cores[i % cores.length]) }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${this.money(c.parsed)}` } } } }
      });
    }
    const elV = document.getElementById("mkb-ch-vendas");
    if (elV) {
      const s = this.state;
      const vend = meses.map((m) => s.vendas.filter((v) => v.data.slice(0, 7) === m).reduce((t, v) => t + v.unidades, 0));
      const dist = meses.map((m) => s.distratos.filter((v) => (v.dataCancel || v.data).slice(0, 7) === m).reduce((t, v) => t + v.unidades, 0));
      let accR = 0;
      let accU = 0;
      const cac = meses.map((_, i) => {
        accR += real[i];
        accU += vend[i] - dist[i];
        return accU > 0 ? accR / accU : null;
      });
      this.charts.vendas = new Chart(elV, {
        data: {
          labels: rot,
          datasets: [
            { type: "bar", label: "Unidades vendidas", data: vend, backgroundColor: "#6366f1", yAxisID: "u", order: 2 },
            { type: "bar", label: "Distratos", data: dist.map((d) => -d), backgroundColor: "#fca5a5", yAxisID: "u", order: 2 },
            { type: "line", label: "Custo por unidade (acumulado)", data: cac, borderColor: "#105436", backgroundColor: "#105436", tension: 0.25, pointRadius: 2, spanGaps: true, yAxisID: "cac", order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => c.dataset.yAxisID === "cac" ? `${c.dataset.label}: ${this.money(c.parsed.y)}` : `${c.dataset.label}: ${Math.abs(c.parsed.y)}` } } },
          scales: {
            u: { type: "linear", position: "left", beginAtZero: true, ticks: { precision: 0, callback: (v) => Math.abs(v) } },
            cac: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, ticks: tick }
          }
        }
      });
    }
  }
};

window.MarketingBudgetApp = MarketingBudgetApp;
