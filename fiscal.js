/* Calcular impostos — lucro presumido, loteamento.
   A base sai do DFC: contas marcadas no plano (vendas de lote, serviços, aplicações)
   e as redutoras da visão (cancelamentos, descontos, base de dedução). */
const FiscalState = {
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  aba: "pis",
  loading: false,
  erro: "",
  aviso: "",
  linhas: [],
  marcas: 0,
  progresso: 0,
  progressoTexto: "Lendo o caixa do DFC…",
  abertos: {},
  consultou: false
};

const FiscalApp = {
  ALI_KEY: "crm_fiscal_aliquotas_lp",
  PADRAO: {
    pis: 0.65,
    cofins: 3,
    irpj: 15,
    adicional: 10,
    limiteMensal: 20000,
    csll: 9,
    vendasIrpj: 8,
    vendasCsll: 12,
    servicosIrpj: 32,
    servicosCsll: 32,
    financIrpj: 100,
    financCsll: 100,
    financNoPis: false,
    periodo: "trimestre"
  },

  MESES: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],

  aliquotas() {
    let salvo = {};
    try { salvo = JSON.parse(localStorage.getItem(this.ALI_KEY) || "{}") || {}; } catch (e) { salvo = {}; }
    const out = Object.assign({}, this.PADRAO, salvo);
    out.financNoPis = !!salvo.financNoPis;
    if (out.periodo !== "mes") out.periodo = "trimestre";
    return out;
  },

  esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  pct(v) {
    return `${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  },

  parsePt(v, fallback) {
    let s = String(v == null ? "" : v).trim().replace(/\s/g, "").replace("%", "");
    if (!s) return fallback;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  },

  ym(year, month) {
    return `${year}-${String(month).padStart(2, "0")}`;
  },

  /* Abril paga jan–mar, julho paga abr–jun, outubro paga jul–set, janeiro paga out–dez do ano anterior. */
  ehMesDeApuracao(month) {
    const m = month == null ? FiscalState.month : month;
    return m === 1 || m === 4 || m === 7 || m === 10;
  },

  trimestrePago(month, year) {
    const m = month == null ? FiscalState.month : month;
    const y = year == null ? FiscalState.year : year;
    if (m === 4) return [1, 2, 3].map((mm) => this.ym(y, mm));
    if (m === 7) return [4, 5, 6].map((mm) => this.ym(y, mm));
    if (m === 10) return [7, 8, 9].map((mm) => this.ym(y, mm));
    if (m === 1) return [10, 11, 12].map((mm) => this.ym(y - 1, mm));
    return null;
  },

  mesesDaAba(aba) {
    const m = FiscalState.month;
    const y = FiscalState.year;
    if (aba === "irpj" || aba === "csll") {
      const tri = this.trimestrePago(m, y);
      if (tri) return tri;
      return [this.ym(y, m)];
    }
    return [this.ym(y, m)];
  },

  mesesParaLer() {
    const set = new Set(this.mesesDaAba("pis").concat(this.mesesDaAba("irpj")));
    return Array.from(set).sort();
  },

  nomeMes(ym) {
    const [y, m] = String(ym).split("-");
    return `${this.MESES[Number(m) - 1]} de ${y}`;
  },

  rotuloPeriodo(meses, aba) {
    const lista = meses || [];
    if (!lista.length) return "";
    if ((aba === "irpj" || aba === "csll") && lista.length >= 3) {
      const paga = `${this.MESES[FiscalState.month - 1]} de ${FiscalState.year}`;
      return `Apuração de ${this.nomeMes(lista[0])} a ${this.nomeMes(lista[lista.length - 1])} · paga em ${paga}`;
    }
    if (aba === "irpj" || aba === "csll") return `Provisão de ${this.nomeMes(lista[0])}`;
    return this.nomeMes(lista[0]);
  },

  /* ---------- leitura do DFC ---------- */
  mapaDfc() {
    const FC = window.FluxoCaixaApp;
    const visao = FC.visao();
    const accToNode = {};
    const nodes = {};
    (visao.groups || []).forEach((g) => {
      nodes[g.id] = g;
      (g.accounts || []).forEach((id) => {
        const sid = String(id || "").trim();
        if (!sid) return;
        accToNode[sid] = g.id;
        const nk = FC.normAccountKey(sid);
        if (nk) accToNode[nk] = g.id;
        const dotted = FC.formatAccountCode(sid);
        if (dotted) {
          accToNode[dotted] = g.id;
          const nk2 = FC.normAccountKey(dotted);
          if (nk2) accToNode[nk2] = g.id;
        }
      });
    });
    return { accToNode, nodes };
  },

  taxConfig() {
    try { return JSON.parse(localStorage.getItem("crm_plano_impostos") || "{}") || {}; } catch (e) { return {}; }
  },

  tagDaConta(cfg, id) {
    const FC = window.FluxoCaixaApp;
    const sid = String(id || "").trim();
    if (cfg[sid]) return cfg[sid];
    const nk = FC.normAccountKey(sid);
    const dotted = FC.formatAccountCode(sid);
    if (dotted && cfg[dotted]) return cfg[dotted];
    const hit = Object.keys(cfg).find((k) => FC.normAccountKey(k) === nk);
    return hit ? cfg[hit] : "";
  },

  noDaConta(mapa, id) {
    const FC = window.FluxoCaixaApp;
    const sid = String(id || "").trim();
    const nk = FC.normAccountKey(sid);
    const dotted = FC.formatAccountCode(sid);
    const nid = mapa.accToNode[sid] || (nk && mapa.accToNode[nk]) || (dotted && mapa.accToNode[dotted]) || "";
    return nid ? mapa.nodes[nid] : null;
  },

  grupoDaRedutora(node) {
    const id = String(node && node.id || "");
    if (id === "g_01_02") return "servicos";
    if (id === "g_01_03" || id === "g_09_01" || id.startsWith("g_09_01")) return "financeiras";
    return "vendas";
  },

  empresasGeridas() {
    const ids = new Set();
    try {
      const custom = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
      Object.values(custom).forEach((item) => {
        if (item && (item.gerida_pelo_grupo === 1 || item.gerida_pelo_grupo === true)) ids.add(Number(item.company_id));
      });
    } catch (e) {}
    return ids;
  },

  nomeEmpresa(id, mov) {
    const n = Number(id);
    const lista = (window.AppState && AppState.companies) || [];
    const hit = lista.find((c) => Number(c.id) === n);
    return (hit && (hit.name || hit.tradeName)) || (mov && mov.companyName) || `Empresa ${n}`;
  },

  etapaCarga(ratio, texto) {
    FiscalState.loading = true;
    FiscalState.progresso = ratio;
    FiscalState.progressoTexto = texto;
    const txt = document.getElementById("fim-carga-txt");
    const bar = document.getElementById("fim-carga-bar");
    if (txt) txt.textContent = texto;
    if (bar) bar.style.width = Math.round(ratio * 100) + "%";
    if (!txt || !bar) this.render();
  },

  async loadData() {
    FiscalState.erro = "";
    FiscalState.aviso = "";
    this.etapaCarga(0.06, "Lendo o caixa do DFC…");
    const FC = window.FluxoCaixaApp;
    if (!FC || typeof FC.allocate !== "function" || !window.SiengeApiService) {
      FiscalState.loading = false;
      FiscalState.consultou = true;
      FiscalState.erro = "A visão do DFC não está disponível nesta tela.";
      this.render();
      return;
    }
    const geridas = this.empresasGeridas();
    if (!geridas.size) {
      FiscalState.loading = false;
      FiscalState.consultou = true;
      FiscalState.linhas = [];
      FiscalState.aviso = "Nenhuma empresa está marcada como gerida pelo grupo.";
    this.render();
      return;
    }
    const meses = this.mesesParaLer();
    const start = `${meses[0]}-01`;
    const fimMes = Number(meses[meses.length - 1].slice(5));
    const fimAno = Number(meses[meses.length - 1].slice(0, 4));
    const last = new Date(fimAno, fimMes, 0).getDate();
    const end = `${meses[meses.length - 1]}-${String(last).padStart(2, "0")}`;
    try {
      const ids = Array.from(geridas);
      let lidos = 0;
      const chunks = await Promise.all(ids.map(async (id) => {
        try {
          const data = await SiengeApiService.getBankMovements(start, end, { selectionType: "M", companyId: id });
          return (data || []).map((m) => Object.assign({}, m, { companyId: m.companyId || id }));
      } catch (e) {
          return [];
        } finally {
          lidos += 1;
          this.etapaCarga(0.06 + 0.5 * (lidos / ids.length), "Lendo o caixa do DFC…");
        }
      }));
      let movements = chunks.flat();
      if (typeof window.siengeDedupeBankMovements === "function") movements = siengeDedupeBankMovements(movements);
      movements = movements.filter((m) => {
        const d = FC.cashDate(m);
        return d && d >= start && d <= end && geridas.has(Number(m.companyId));
      });
      this.etapaCarga(0.62, "Analisando as bases");
      await new Promise((r) => setTimeout(r, 40));
      const mapa = this.mapaDfc();
      const cfg = this.taxConfig();
      FiscalState.marcas = Object.keys(cfg).length;
      const linhas = [];
      movements.forEach((mov) => {
        FC.allocate(mov, 1).forEach((a) => {
          const node = this.noDaConta(mapa, a.categoryId);
          const tag = this.tagDaConta(cfg, a.categoryId);
          const base = tag === "Base para Vendas de Lote" ? "vendas"
            : (tag === "Base para Receita de Serviços" ? "servicos"
              : (tag === "Base para Aplicações Financeiras" ? "financeiras" : ""));
          const noReceita = node && (FC.isRevenueGroup(node.id) || node.id === "g_09_01" || String(node.id).startsWith("g_09_01"));
          const reduz = tag === "Base de Dedução" || !!(noReceita && (node.redutora || FC.isReducingAccount(a.categoryId, a.categoryName, node)));
          if (!base && !reduz) return;
          const signed = node
            ? FC.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov)
            : (reduz ? -Math.abs(Number(a.amount) || 0) : (Number(a.amount) || 0));
          if (!signed) return;
          const bucket = base || this.grupoDaRedutora(node);
          let valor = signed;
          let papel = (!base || signed < 0) ? "redutora" : "base";
          if (papel === "redutora" && valor > 0 && node && !FC.isRevenueGroup(node.id) && !FC.isEstornoName(a.categoryName)) valor = -Math.abs(valor);
          linhas.push({
            companyId: Number(mov.companyId),
            companyName: this.nomeEmpresa(mov.companyId, mov),
            month: FC.movMonth(mov),
            ccId: a.costCenterId != null && String(a.costCenterId).trim() !== "" ? String(a.costCenterId) : "—",
            ccName: String(a.costCenterName || "").trim(),
            bucket,
            papel,
            categoryId: FC.formatAccountCode(a.categoryId) || String(a.categoryId),
            categoryName: a.categoryName || "",
            valor: valor
          });
        });
      });
      this.etapaCarga(0.86, "Fazendo os cálculos");
      await new Promise((r) => setTimeout(r, 40));
      this.etapaCarga(0.96, "Cruzando as bases fiscais");
      await new Promise((r) => setTimeout(r, 40));
      FiscalState.linhas = linhas;
      if (!FiscalState.marcas) {
        FiscalState.aviso = "Nenhuma conta do plano está marcada como base fiscal. Marque em Plano Financeiro e Visões. As redutoras de receita do DFC entram mesmo assim.";
      }
    } catch (err) {
      console.error(err);
      FiscalState.erro = `Não consegui calcular: ${(err && err.message) || err}`;
      FiscalState.linhas = [];
    } finally {
      FiscalState.loading = false;
      FiscalState.consultou = true;
      this.render();
    }
  },

  /* ---------- apuração ---------- */
  pacote(aba, mesesForcados) {
    const ali = this.aliquotas();
    const qual = aba || FiscalState.aba || "pis";
    const meses = mesesForcados || this.mesesDaAba(qual);
    const apuracao = (qual === "irpj" || qual === "csll") && meses.length >= 3;
    const linhas = (FiscalState.linhas || []).filter((l) => meses.includes(l.month));
    const empresas = {};
    const contas = {};
    linhas.forEach((l) => {
      const c = empresas[l.companyId] || (empresas[l.companyId] = this.empresaVazia(l.companyId, l.companyName));
      const entra = this.entraNaEmpresa(l.ccId, l.ccName);
      const k = `${l.categoryId}|${l.papel}|${l.bucket}`;
      const acc = c.contas[k] || (c.contas[k] = Object.assign(this.empresaVazia(l.categoryId, l.categoryName || l.categoryId), {
        papel: l.papel, bucket: l.bucket, ccs: {}
      }));
      acc.name = l.categoryName || acc.name;
      acc.papel = l.papel;
      acc.bucket = l.bucket;
      const cc = acc.ccs[l.ccId] || (acc.ccs[l.ccId] = this.empresaVazia(l.ccId, l.ccName || l.ccId));
      cc.name = l.ccName || cc.name || l.ccId;
      cc.entra = entra;
      this.somar(cc, l);
      if (!entra) return;
      this.somar(c, l);
      this.somar(acc, l);
      const g = contas[k] || (contas[k] = { id: l.categoryId, name: l.categoryName, papel: l.papel, bucket: l.bucket, valor: 0 });
      g.valor += l.valor;
      if (l.categoryName) g.name = l.categoryName;
    });
    const lista = Object.values(empresas).map((c) => {
      const contasEmp = Object.values(c.contas).map((acc) => {
        const ccs = Object.values(acc.ccs).map((cc) => this.fechar(cc, ali, qual, apuracao))
          .sort((a, b) => (a.entra === b.entra ? Math.abs(this.valorAba(b, qual)) - Math.abs(this.valorAba(a, qual)) : (a.entra ? -1 : 1)));
        const fechada = this.fechar(acc, ali, qual, apuracao);
        fechada.ccs = ccs;
        return fechada;
      }).sort((a, b) => Math.abs(this.valorAba(b, qual)) - Math.abs(this.valorAba(a, qual)));
      const emp = this.fechar(c, ali, qual, apuracao);
      emp.contas = contasEmp;
      return emp;
    }).sort((a, b) => Number(a.id) - Number(b.id));
    return {
      ali,
      aba: qual,
      meses,
      apuracao,
      modo: (qual === "irpj" || qual === "csll") ? (apuracao ? "apuracao" : "provisao") : "mes",
      periodo: this.rotuloPeriodo(meses, qual),
      empresas: lista,
      contas: Object.values(contas).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
    };
  },

  empresaVazia(id, name) {
    const z = () => ({ vendas: 0, servicos: 0, financeiras: 0 });
    return { id, name: name || "", bruto: z(), red: z(), ccs: {}, contas: {}, entra: true };
  },

  customCc(id) {
    const mem = window.CentrosCustoState && CentrosCustoState.customFields;
    if (mem && (mem[id] || mem[String(id)])) return mem[id] || mem[String(id)];
    try {
      const map = JSON.parse(localStorage.getItem("crm_centros_custo_custom") || "{}") || {};
      return map[id] || map[String(id)] || {};
    } catch (e) {
      return {};
    }
  },

  entraNaEmpresa(ccId, ccName) {
    const custom = this.customCc(ccId);
    const tipo = String(custom.tipo_cc || "");
    const parceiro = /parce(ir|ri)/i.test(String(ccName || "")) && tipo !== "Corporativo";
    if (parceiro) return false;
    return custom.imposto_pago_empresa === true;
  },

  somarConta(alvo, l) {
    const k = `${l.categoryId}|${l.papel}|${l.bucket}`;
    const acc = alvo.contas[k] || (alvo.contas[k] = { id: l.categoryId, name: l.categoryName, papel: l.papel, bucket: l.bucket, valor: 0 });
    acc.valor += l.valor;
    if (l.categoryName) acc.name = l.categoryName;
  },

  somar(c, l) {
    const dest = l.papel === "redutora" ? c.red : c.bruto;
    dest[l.bucket] = (dest[l.bucket] || 0) + l.valor;
  },

  liquido(c, bucket) {
    return (c.bruto[bucket] || 0) + (c.red[bucket] || 0);
  },

  fechar(c, ali, aba, apuracao) {
    const qual = aba || FiscalState.aba || "pis";
    const tri = apuracao != null ? !!apuracao : ((qual === "irpj" || qual === "csll") && this.ehMesDeApuracao());
    const vendas = this.liquido(c, "vendas");
    const servicos = this.liquido(c, "servicos");
    const financeiras = this.liquido(c, "financeiras");
    const basePis = vendas + servicos + (ali.financNoPis ? financeiras : 0);
    const lucroIrpj = vendas * ali.vendasIrpj / 100 + servicos * ali.servicosIrpj / 100 + financeiras * ali.financIrpj / 100;
    const lucroCsll = vendas * ali.vendasCsll / 100 + servicos * ali.servicosCsll / 100 + financeiras * ali.financCsll / 100;
    const limite = ali.limiteMensal * ((qual === "irpj" || qual === "csll") && tri ? 3 : 1);
    const ir = lucroIrpj > 0 ? lucroIrpj * ali.irpj / 100 : 0;
    const adicional = lucroIrpj > limite ? (lucroIrpj - limite) * ali.adicional / 100 : 0;
    const pis = basePis > 0 ? basePis * ali.pis / 100 : 0;
    const cofins = basePis > 0 ? basePis * ali.cofins / 100 : 0;
    const csll = lucroCsll > 0 ? lucroCsll * ali.csll / 100 : 0;
    return Object.assign(c, {
      vendas, servicos, financeiras, basePis, lucroIrpj, lucroCsll,
      pis, cofins, ir, adicional, irpj: ir + adicional, csll, limite
    });
  },

  /* ---------- alíquotas ---------- */
  abrirAliquotas() {
    const velho = document.getElementById("fim-ali-pop");
    if (velho) velho.remove();
    const a = this.aliquotas();
    const campo = (id, label, valor) => `<label class="fim-ali-l">${label}<input id="${id}" value="${this.esc(String(valor).replace(".", ","))}"></label>`;
    const pop = document.createElement("div");
    pop.id = "fim-ali-pop";
    pop.className = "fim-pop";
    pop.innerHTML = `<div class="fim-pop-box" role="dialog" aria-modal="true">
      <div class="fim-pop-h"><b>Alíquotas do lucro presumido</b><button type="button" class="fim-pop-x" onclick="FiscalApp.fecharAliquotas()">×</button></div>
      <p class="fim-muted">Loteamento. O padrão é o do lucro presumido. Ajuste se a empresa tiver outro enquadramento.</p>
      <div class="fim-ali-grid">
        ${campo("fim-pis", "PIS (%)", a.pis)}
        ${campo("fim-cofins", "COFINS (%)", a.cofins)}
        ${campo("fim-irpj", "IRPJ (%)", a.irpj)}
        ${campo("fim-adic", "Adicional de IRPJ (%)", a.adicional)}
        ${campo("fim-limite", "Limite mensal do adicional", a.limiteMensal)}
        ${campo("fim-csll", "CSLL (%)", a.csll)}
        ${campo("fim-vi", "Presunção IRPJ · vendas de lote (%)", a.vendasIrpj)}
        ${campo("fim-vc", "Presunção CSLL · vendas de lote (%)", a.vendasCsll)}
        ${campo("fim-si", "Presunção IRPJ · serviços (%)", a.servicosIrpj)}
        ${campo("fim-sc", "Presunção CSLL · serviços (%)", a.servicosCsll)}
        ${campo("fim-fi", "Presunção IRPJ · aplicações (%)", a.financIrpj)}
        ${campo("fim-fc", "Presunção CSLL · aplicações (%)", a.financCsll)}
      </div>
      <label class="fim-chk"><input id="fim-fin-pis" type="checkbox" ${a.financNoPis ? "checked" : ""}> Aplicações financeiras entram na base do PIS e da COFINS</label>
      <p class="fim-muted">IRPJ e CSLL: janeiro a março pagam em abril, abril a junho em julho, julho a setembro em outubro, outubro a dezembro em janeiro. Fora desses meses a tela mostra a provisão do mês.</p>
      <div class="fim-pop-acoes">
        <button type="button" class="btn btn-cancel" onclick="FiscalApp.fecharAliquotas()">Cancelar</button>
        <button type="button" class="btn btn-outline" onclick="FiscalApp.restaurarAliquotas()">Restaurar padrão</button>
        <button type="button" class="btn btn-primary" onclick="FiscalApp.salvarAliquotas()">Salvar</button>
      </div>
    </div>`;
    pop.addEventListener("click", (ev) => { if (ev.target === pop) this.fecharAliquotas(); });
    document.body.appendChild(pop);
  },

  fecharAliquotas() {
    const pop = document.getElementById("fim-ali-pop");
    if (pop) pop.remove();
  },

  salvarAliquotas() {
    const p = this.PADRAO;
    const ali = {
      pis: this.parsePt((document.getElementById("fim-pis") || {}).value, p.pis),
      cofins: this.parsePt((document.getElementById("fim-cofins") || {}).value, p.cofins),
      irpj: this.parsePt((document.getElementById("fim-irpj") || {}).value, p.irpj),
      adicional: this.parsePt((document.getElementById("fim-adic") || {}).value, p.adicional),
      limiteMensal: this.parsePt((document.getElementById("fim-limite") || {}).value, p.limiteMensal),
      csll: this.parsePt((document.getElementById("fim-csll") || {}).value, p.csll),
      vendasIrpj: this.parsePt((document.getElementById("fim-vi") || {}).value, p.vendasIrpj),
      vendasCsll: this.parsePt((document.getElementById("fim-vc") || {}).value, p.vendasCsll),
      servicosIrpj: this.parsePt((document.getElementById("fim-si") || {}).value, p.servicosIrpj),
      servicosCsll: this.parsePt((document.getElementById("fim-sc") || {}).value, p.servicosCsll),
      financIrpj: this.parsePt((document.getElementById("fim-fi") || {}).value, p.financIrpj),
      financCsll: this.parsePt((document.getElementById("fim-fc") || {}).value, p.financCsll),
      financNoPis: !!(document.getElementById("fim-fin-pis") || {}).checked,
      periodo: "trimestre"
    };
    localStorage.setItem(this.ALI_KEY, JSON.stringify(ali));
    this.fecharAliquotas();
    this.render();
  },

  restaurarAliquotas() {
    localStorage.removeItem(this.ALI_KEY);
    this.fecharAliquotas();
    this.abrirAliquotas();
  },

  calcular() {
    const m = document.getElementById("fim-month");
    const y = document.getElementById("fim-year");
    if (m) FiscalState.month = parseInt(m.value, 10) || FiscalState.month;
    if (y) FiscalState.year = parseInt(y.value, 10) || FiscalState.year;
    this.loadData();
  },

  setCompetencia() {
    const m = document.getElementById("fim-month");
    const y = document.getElementById("fim-year");
    const nm = m ? (parseInt(m.value, 10) || FiscalState.month) : FiscalState.month;
    const ny = y ? (parseInt(y.value, 10) || FiscalState.year) : FiscalState.year;
    if (nm === FiscalState.month && ny === FiscalState.year) return;
    FiscalState.month = nm;
    FiscalState.year = ny;
    FiscalState.consultou = false;
    FiscalState.linhas = [];
    FiscalState.erro = "";
    FiscalState.aviso = "";
    this.render();
  },

  setAba(id) {
    FiscalState.aba = id;
    this.render();
  },

  /* ---------- tela ---------- */
  css() {
    return `
      .fim { padding: 4px 2px 28px; }
      .fim-lead, .fim-muted { color: #64748b; font-size: 0.84rem; margin: 0 0 12px; line-height: 1.45; }
      .fim-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
      .fim-mes { display: flex; align-items: center; gap: 6px; height: 38px; padding: 0 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
      .fim-mes select { border: 0; background: transparent; font-weight: 650; color: #0f172a; }
      .fim-tabs { margin-bottom: 14px; }
      .fim-racional { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
      .fim-racional h3 { margin: 0 0 8px; font-size: 0.92rem; color: #105436; }
      .fim-form { display: grid; grid-template-columns: 220px 1fr auto; gap: 4px 12px; font-size: 0.84rem; margin: 8px 0 0; }
      .fim-form b { text-align: right; font-variant-numeric: tabular-nums; }
      .fim-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
      .fim-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; border-left: 4px solid #105436; }
      .fim-card span { display: block; font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
      .fim-card strong { display: block; margin-top: 6px; font-size: 1.25rem; color: #0f172a; }
      .fim { position: relative; }
      .fim-carga { position: absolute; inset: 0; z-index: 4; background: rgba(248,250,252,0.86); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 220px; }
      .fim-carga p { margin: 0; color: #475569; font-size: 0.9rem; }
      .fim-carga-trilha { width: min(420px, 80%); height: 8px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
      .fim-carga-trilha i { display: block; height: 100%; background: #105436; border-radius: 99px; transition: width 0.25s linear; }
      .fim-scroll { overflow: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; }
      .fim-grid { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .fim-grid th, .fim-grid td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
      .fim-grid th { background: #105436; color: #fff; font-size: 0.68rem; }
      .fim-num { text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .fim-grid th.fim-num, .fim-grid td.fim-num { text-align: left; }
      .fim-head, .fim-linha { display: grid; gap: 8px; align-items: center; text-align: left; }
      .fim-head { background: #105436; color: #fff; padding: 8px 12px; font-size: 0.68rem; font-weight: 700; }
      .fim-emp { border-bottom: 1px solid #e2e8f0; }
      .fim-linha { padding: 8px 12px; }
      .fim-linha:hover { background: #e7f6ee; }
      .fim-head:hover { background: #105436; }
      .fim-grid tbody tr:hover td { background: #e7f6ee; }
      .fim-abre { display: flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 0; cursor: pointer; text-align: left; color: inherit; font: inherit; min-width: 0; }
      .fim-abre b, .fim-abre span { min-width: 0; }
      .fim-filhos { background: #f8fafc; }
      .fim-conta .fim-linha { padding-left: 28px; }
      .fim-cc .fim-linha { padding-left: 48px; }
      .fim-fora { color: #94a3b8; }
      .fim-fora .fim-nome, .fim-fora .fim-val { text-decoration: line-through; }
      .fim-contas-cc { padding: 0 12px 10px 48px; }
      .fim-contas-cc .fim-grid { font-size: 0.76rem; }
      .fim-acao { display: flex; gap: 6px; align-items: center; justify-content: flex-start; flex-wrap: wrap; }
      .fim-acao .btn { height: 32px; padding: 0 10px; white-space: nowrap; font-size: 0.75rem; }
      .fim-arquivo { flex: 1 0 100%; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.68rem; color: #64748b; }
      .fim-aviso { margin: 0 0 12px; padding: 10px 12px; background: #fffbeb; color: #92400e; border-radius: 8px; font-size: 0.84rem; }
      .fim-erro { margin: 0 0 12px; padding: 10px 12px; background: #fef2f2; color: #991b1b; border-radius: 8px; font-size: 0.84rem; }
      .fim-contas { margin-top: 8px; }
      .fim-contas summary { cursor: pointer; font-weight: 700; color: #105436; font-size: 0.82rem; }
      .fim-pop { position: fixed; inset: 0; background: rgba(12, 41, 29, 0.55); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 16px; }
      .fim-pop-box { background: #fff; border-radius: 12px; width: min(760px, 100%); max-height: min(86vh, 820px); overflow: auto; padding: 16px 18px 18px; }
      .fim-pop-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .fim-pop-x { border: 0; background: transparent; font-size: 1.3rem; cursor: pointer; color: #64748b; }
      .fim-ali-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .fim-ali-l { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; font-weight: 700; color: #475569; margin-top: 8px; }
      .fim-ali-l input, .fim-ali-l select { height: 36px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0 8px; font-weight: 600; color: #0f172a; }
      .fim-chk { display: flex; gap: 8px; align-items: center; margin: 12px 0; font-size: 0.84rem; color: #0f172a; font-weight: 600; }
      .fim-pop-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
      .fim-acao input[type="file"] { display: none; }
      @media (max-width: 900px) { .fim-cards, .fim-ali-grid, .fim-form { grid-template-columns: 1fr; } }`;
  },

  cargaHtml() {
    const pct = Math.round((FiscalState.progresso || 0) * 100);
    return `<div class="fim-carga" id="fim-carga">
      <div class="loading-spinner"></div>
      <p id="fim-carga-txt">${this.esc(FiscalState.progressoTexto || "Lendo o caixa do DFC…")}</p>
      <div class="fim-carga-trilha"><i id="fim-carga-bar" style="width:${pct}%"></i></div>
    </div>`;
  },

  render() {
    const root = document.getElementById("fiscal-root");
    if (!root) return;
    if (FiscalState.loading && document.getElementById("fim-carga-txt")) return;
    const p = FiscalState.consultou
      ? this.pacote()
      : { ali: this.aliquotas(), aba: FiscalState.aba || "pis", empresas: [], contas: [], periodo: "", apuracao: false, modo: "mes", meses: [] };
    if (FiscalState.consultou && !FiscalState.loading) FiscalState.empresas = p.empresas;
    const carga = FiscalState.loading ? this.cargaHtml() : "";
    root.innerHTML = `<style>${this.css()}</style><div class="fim">${this.corpo(p)}${carga}</div>`;
    if (window.lucide) lucide.createIcons();
  },

  corpo(p) {
    const months = this.MESES.map((nome, i) => `<option value="${i + 1}" ${FiscalState.month === i + 1 ? "selected" : ""}>${nome.charAt(0).toUpperCase() + nome.slice(1)}</option>`).join("");
    const ano = new Date().getFullYear();
    let anos = "";
    for (let y = 2024; y <= ano + 1; y++) anos += `<option value="${y}" ${FiscalState.year === y ? "selected" : ""}>${y}</option>`;
    const tabs = [
      { id: "pis", label: "PIS", icon: "percent" },
      { id: "cofins", label: "COFINS", icon: "coins" },
      { id: "irpj", label: "IRPJ", icon: "landmark" },
      { id: "csll", label: "CSLL", icon: "scale" }
    ];
    const abas = tabs.map((t) => `<button type="button" role="tab" aria-selected="${p.aba === t.id}" class="ml-tab ${p.aba === t.id ? "is-active" : ""}" onclick="FiscalApp.setAba('${t.id}')"><i data-lucide="${t.icon}"></i> ${t.label}</button>`).join("");
    return `
      <p class="fim-lead">Lucro presumido do loteamento. A base é a do DFC: contas marcadas no plano, menos as redutoras da visão.</p>
      <div class="fim-tools">
        <div class="fim-mes"><i data-lucide="calendar" style="width:16px;height:16px;color:#64748b;"></i>
          <select id="fim-month" onchange="FiscalApp.setCompetencia()">${months}</select><span>/</span><select id="fim-year" onchange="FiscalApp.setCompetencia()">${anos}</select>
        </div>
        <button type="button" class="btn btn-outline" style="height:38px;" onclick="FiscalApp.abrirAliquotas()"><i data-lucide="sliders-horizontal"></i> Alíquotas</button>
        <button type="button" class="btn btn-outline" style="height:38px;" onclick="switchTab('plano-financeiro')"><i data-lucide="settings-2"></i> Contas do plano</button>
        <button type="button" class="btn btn-primary" style="height:38px;" onclick="FiscalApp.calcular()"><i data-lucide="search"></i> Calcular</button>
        <button type="button" class="btn btn-outline" style="height:38px;" onclick="FiscalApp.gerarPdf()"><i data-lucide="download"></i> Resumo em PDF</button>
      </div>
      ${FiscalState.erro ? `<div class="fim-erro">${this.esc(FiscalState.erro)}</div>` : ""}
      ${FiscalState.aviso ? `<div class="fim-aviso">${this.esc(FiscalState.aviso)}</div>` : ""}
      <div class="ml-tabs fim-tabs" role="tablist">${abas}</div>
      ${FiscalState.consultou ? `${this.racional(p)}${this.cards(p)}${this.tabela(p)}` : `<div class="fim-racional"><p class="fim-muted" style="margin:0;">Escolha o mês e o ano da competência e clique em Calcular.</p></div>`}`;
  },

  racional(p) {
    const a = p.ali;
    const t = p.empresas.reduce((s, c) => {
      s.vendas += c.vendas; s.servicos += c.servicos; s.financeiras += c.financeiras;
      s.bv += c.bruto.vendas; s.bs += c.bruto.servicos; s.bf += c.bruto.financeiras;
      s.rv += c.red.vendas; s.rs += c.red.servicos; s.rf += c.red.financeiras;
      s.basePis += c.basePis; s.lucroIrpj += c.lucroIrpj; s.lucroCsll += c.lucroCsll;
      s.pis += c.pis; s.cofins += c.cofins; s.ir += c.ir; s.adicional += c.adicional; s.csll += c.csll;
      return s;
    }, { vendas: 0, servicos: 0, financeiras: 0, bv: 0, bs: 0, bf: 0, rv: 0, rs: 0, rf: 0, basePis: 0, lucroIrpj: 0, lucroCsll: 0, pis: 0, cofins: 0, ir: 0, adicional: 0, csll: 0 });
    const linha = (nome, valor) => `<span>${nome}</span><b class="fim-num">${this.money(valor)}</b><span></span>`;
    let formula = "";
    if (p.aba === "pis" || p.aba === "cofins") {
      const aliq = p.aba === "pis" ? a.pis : a.cofins;
      const imposto = p.aba === "pis" ? t.pis : t.cofins;
      formula = `
        ${linha("Vendas de lote (contas de base)", t.bv)}
        ${linha("Redutoras de vendas", t.rv)}
        ${linha("Serviços (contas de base)", t.bs)}
        ${linha("Redutoras de serviços", t.rs)}
        ${linha(a.financNoPis ? "Aplicações financeiras" : "Aplicações (fora do PIS e da COFINS)", t.financeiras)}
        <span>Base do ${p.aba === "pis" ? "PIS" : "COFINS"}</span><b class="fim-num">${this.money(t.basePis)}</b><span></span>
        <span>× ${this.pct(aliq)}</span><b class="fim-num">${this.money(imposto)}</b><span></span>`;
    } else if (p.aba === "irpj") {
      formula = `
        ${linha(`Vendas de lote × ${this.pct(a.vendasIrpj)}`, t.vendas * a.vendasIrpj / 100)}
        ${linha(`Serviços × ${this.pct(a.servicosIrpj)}`, t.servicos * a.servicosIrpj / 100)}
        ${linha(`Aplicações × ${this.pct(a.financIrpj)}`, t.financeiras * a.financIrpj / 100)}
        <span>Lucro presumido</span><b class="fim-num">${this.money(t.lucroIrpj)}</b><span></span>
        <span>× ${this.pct(a.irpj)}</span><b class="fim-num">${this.money(t.ir)}</b><span></span>
        <span>Adicional ${this.pct(a.adicional)} acima de ${this.money(a.limiteMensal * (p.apuracao ? 3 : 1))}</span><b class="fim-num">${this.money(t.adicional)}</b><span></span>`;
    } else {
      formula = `
        ${linha(`Vendas de lote × ${this.pct(a.vendasCsll)}`, t.vendas * a.vendasCsll / 100)}
        ${linha(`Serviços × ${this.pct(a.servicosCsll)}`, t.servicos * a.servicosCsll / 100)}
        ${linha(`Aplicações × ${this.pct(a.financCsll)}`, t.financeiras * a.financCsll / 100)}
        <span>Base da CSLL</span><b class="fim-num">${this.money(t.lucroCsll)}</b><span></span>
        <span>× ${this.pct(a.csll)}</span><b class="fim-num">${this.money(t.csll)}</b><span></span>`;
    }
    const texto = this.textoRacional(p, a);
    const contas = p.contas.length ? `<details class="fim-contas"><summary>Contas que formaram a base (${p.contas.length})</summary>
      <table class="fim-grid" style="margin-top:8px;"><thead><tr><th>Conta</th><th>Papel</th><th class="fim-num">Valor no DFC</th></tr></thead><tbody>
      ${p.contas.map((c) => `<tr><td>${this.esc(c.id)} ${this.esc(c.name)}</td><td>${c.papel === "redutora" ? "Redutora" : this.esc(this.nomeBase(c.bucket))}</td><td class="fim-num">${this.money(c.valor)}</td></tr>`).join("")}
      </tbody></table></details>` : "";
    return `<div class="fim-racional"><h3>Racional · ${this.esc(p.periodo)}</h3><p class="fim-muted">${texto}</p><div class="fim-form">${formula}</div>${contas}</div>`;
  },

  nomeBase(bucket) {
    return bucket === "servicos" ? "Serviços" : (bucket === "financeiras" ? "Aplicações" : "Vendas de lote");
  },

  textoRacional(p, a) {
    const fin = a.financNoPis
      ? "As aplicações financeiras entram na base do PIS e da COFINS porque essa opção está ligada."
      : "As aplicações financeiras ficam de fora do PIS e da COFINS. Entram por inteiro no IRPJ e na CSLL.";
    const cal = "Janeiro, fevereiro e março pagam em abril. Abril, maio e junho pagam em julho. Julho, agosto e setembro pagam em outubro. Outubro, novembro e dezembro pagam em janeiro.";
    let per = p.apuracao
      ? `${p.periodo}. O adicional de IRPJ usa três vezes o limite mensal (${this.money(a.limiteMensal)} por mês).`
      : `${p.periodo}. A coluna é a provisão deste mês. O trimestre fecha no mês do pagamento. O adicional usa o limite de um mês (${this.money(a.limiteMensal)}).`;
    if (p.apuracao && FiscalState.month === 1) {
      per += " A coluna Provisão de janeiro mostra só janeiro, que entra no trimestre pago em abril.";
    }
    if (p.aba === "pis" || p.aba === "cofins") {
      return `PIS ${this.pct(a.pis)} e COFINS ${this.pct(a.cofins)} sobre a receita do mês. Entram as contas marcadas como vendas de lote e serviços. As redutoras do DFC (cancelamento, desconto e base de dedução) diminuem o grupo correspondente. ${fin}`;
    }
    if (p.aba === "irpj") {
      return `IRPJ ${this.pct(a.irpj)} sobre o lucro presumido: ${this.pct(a.vendasIrpj)} das vendas de lote, ${this.pct(a.servicosIrpj)} dos serviços e ${this.pct(a.financIrpj)} das aplicações, já líquidas das redutoras. O adicional é ${this.pct(a.adicional)} do que passar de ${this.money(a.limiteMensal)} por mês, por empresa. ${cal} ${per}`;
    }
    return `CSLL ${this.pct(a.csll)} sobre ${this.pct(a.vendasCsll)} das vendas de lote, ${this.pct(a.servicosCsll)} dos serviços e ${this.pct(a.financCsll)} das aplicações, já líquidas das redutoras. ${cal} ${per}`;
  },

  cards(p) {
    const t = p.empresas.reduce((s, c) => {
      s.base += p.aba === "irpj" ? c.lucroIrpj : (p.aba === "csll" ? c.lucroCsll : c.basePis);
      s.imp += c[p.aba] || 0;
      s.adi += c.adicional || 0;
      return s;
    }, { base: 0, imp: 0, adi: 0 });
    const nomeBase = p.aba === "irpj" ? "Lucro presumido" : (p.aba === "csll" ? "Base da CSLL" : "Base de cálculo");
    const nomeImp = p.modo === "provisao"
      ? "Provisão do mês"
      : (p.aba === "irpj" ? "IRPJ a recolher" : (p.modo === "apuracao" ? `${p.aba.toUpperCase()} a recolher` : p.aba.toUpperCase()));
    const terceiro = p.aba === "irpj"
      ? `<div class="fim-card"><span>Adicional</span><strong>${this.money(t.adi)}</strong></div>`
      : `<div class="fim-card"><span>Empresas</span><strong>${p.empresas.length}</strong></div>`;
    return `<div class="fim-cards">
      <div class="fim-card"><span>${nomeBase}</span><strong>${this.money(t.base)}</strong></div>
      <div class="fim-card"><span>${nomeImp}</span><strong>${this.money(t.imp)}</strong></div>
      ${terceiro}
    </div>`;
  },

  valorAba(item, aba) {
    if (aba === "irpj") return item.lucroIrpj;
    if (aba === "csll") return item.lucroCsll;
    return item.basePis;
  },

  impostoAba(item, aba) {
    if (aba === "irpj") return item.ir;
    return item[aba] || 0;
  },

  toggle(tipo, id) {
    const key = tipo + "-" + id;
    FiscalState.abertos[key] = !FiscalState.abertos[key];
    const box = document.getElementById("fim-box-" + key);
    const aberto = !!FiscalState.abertos[key];
    if (box) box.hidden = !aberto;
    const btn = document.getElementById("fim-abre-" + key);
    if (btn) {
      btn.setAttribute("aria-expanded", aberto ? "true" : "false");
      const ic = btn.querySelector("i");
      if (ic) ic.setAttribute("data-lucide", aberto ? "chevron-down" : "chevron-right");
    }
    if (window.lucide) lucide.createIcons();
  },

  nomeGuia(input) {
    const el = document.getElementById(String(input.id || "").replace("file-", "nome-"));
    if (el) el.textContent = input.files && input.files[0] ? input.files[0].name : "";
  },

  contasHtml(contas) {
    if (!contas || !contas.length) return `<p class="fim-muted" style="margin:0;">Nenhuma conta nesta base.</p>`;
    return `<table class="fim-grid"><thead><tr><th>Conta</th><th>Papel</th><th>Valor no DFC</th></tr></thead><tbody>
      ${contas.map((c) => `<tr><td>${this.esc(c.id)} ${this.esc(c.name)}</td><td>${c.papel === "redutora" ? "Redutora" : this.esc(this.nomeBase(c.bucket))}</td><td>${this.money(c.valor)}</td></tr>`).join("")}
    </tbody></table>`;
  },

  slug(v) {
    return String(v == null ? "" : v).replace(/[^A-Za-z0-9_-]/g, "");
  },

  grelha(aba, comProv) {
    const cols = ["minmax(240px, 1.6fr)", "128px", "132px"];
    if (aba === "irpj") cols.push("118px");
    if (comProv) cols.push("148px");
    cols.push("minmax(230px, 300px)");
    return `grid-template-columns:${cols.join(" ")}`;
  },

  tabela(p) {
    if (!p.empresas.length) {
      return `<div class="fim-racional"><p class="fim-muted">Nenhuma base neste período. Calcule de novo ou marque as contas no plano financeiro.</p></div>`;
    }
    const aba = p.aba;
    const comProv = p.apuracao && FiscalState.month === 1 && (aba === "irpj" || aba === "csll");
    const provMap = {};
    if (comProv) {
      this.pacote(aba, [this.ym(FiscalState.year, 1)]).empresas.forEach((e) => { provMap[e.id] = e; });
    }
    const estilo = this.grelha(aba, comProv);
    const headBase = aba === "irpj" ? "Lucro presumido" : (aba === "csll" ? "Base da CSLL" : "Base");
    const colImp = p.modo === "provisao" ? "Provisão do mês" : aba.toUpperCase();
    const cel = (v) => `<span class="fim-val">${this.money(v)}</span>`;
    const provEmp = (id) => (provMap[id] && provMap[id][aba]) || 0;
    const provAcc = (empId, acc) => {
      const emp = provMap[empId];
      if (!emp) return 0;
      const hit = (emp.contas || []).find((a) => a.id === acc.id && a.papel === acc.papel && a.bucket === acc.bucket);
      return hit ? (hit[aba] || 0) : 0;
    };
    const provCc = (empId, acc, cc) => {
      const emp = provMap[empId];
      if (!emp) return 0;
      const conta = (emp.contas || []).find((a) => a.id === acc.id && a.papel === acc.papel && a.bucket === acc.bucket);
      if (!conta) return 0;
      const hit = (conta.ccs || []).find((x) => String(x.id) === String(cc.id));
      return hit ? (hit[aba] || 0) : 0;
    };
    const linhas = p.empresas.map((c) => {
      const empKey = "e-" + c.id;
      const aberto = !!FiscalState.abertos[empKey];
      const acao = `<div class="fim-acao">
        <label class="btn btn-outline">Carregar a guia
          <input type="file" id="file-${aba}-${c.id}" accept=".pdf,.png,.jpg" onchange="FiscalApp.nomeGuia(this)">
        </label>
        <button type="button" id="btn-${aba}-${c.id}" class="btn btn-primary" onclick="FiscalApp.sendToSienge(${c.id}, '${aba}')">Gerar título</button>
        <span class="fim-arquivo" id="nome-${aba}-${c.id}"></span>
      </div>`;
      const contas = (c.contas || []).map((acc) => {
        const accKey = "a-" + c.id + "-" + this.slug(`${acc.id}-${acc.papel}-${acc.bucket}`);
        const accAberto = !!FiscalState.abertos[accKey];
        const papel = acc.papel === "redutora" ? "Redutora" : this.nomeBase(acc.bucket);
        const ccs = (acc.ccs || []).map((cc) => {
          const motivo = cc.entra ? "" : (/parce(ir|ri)/i.test(String(cc.name || "")) ? "Parceiro — não entra na soma" : "Sem imposto pago pela empresa — não entra na soma");
          return `<div class="fim-cc${cc.entra ? "" : " fim-fora"}">
            <div class="fim-linha" style="${estilo}">
              <span class="fim-nome">${this.esc(cc.id)} ${this.esc(cc.name || "")}${motivo ? ` <small>${this.esc(motivo)}</small>` : ""}</span>
              ${cel(this.valorAba(cc, aba))}
              ${cel(cc[aba] || 0)}
              ${aba === "irpj" ? `<span class="fim-val">${cc.entra ? this.money(cc.adicional) : "—"}</span>` : ""}
              ${comProv ? cel(provCc(c.id, acc, cc)) : ""}
              <span></span>
            </div>
          </div>`;
        }).join("");
        return `<div class="fim-conta">
          <div class="fim-linha" style="${estilo}">
            <button type="button" class="fim-abre" id="fim-abre-${accKey}" aria-expanded="${accAberto ? "true" : "false"}" onclick="FiscalApp.toggle('a', '${c.id}-${this.slug(`${acc.id}-${acc.papel}-${acc.bucket}`)}')">
              <i data-lucide="${accAberto ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i>
              <span class="fim-nome">${this.esc(acc.id)} ${this.esc(acc.name || "")} <small>${this.esc(papel)}</small></span>
            </button>
            ${cel(this.valorAba(acc, aba))}
            ${cel(acc[aba] || 0)}
            ${aba === "irpj" ? cel(acc.adicional) : ""}
            ${comProv ? cel(provAcc(c.id, acc)) : ""}
            <span></span>
          </div>
          <div class="fim-filhos" id="fim-box-${accKey}" ${accAberto ? "" : "hidden"}>${ccs}</div>
        </div>`;
      }).join("");
      return `<div class="fim-emp">
        <div class="fim-linha" style="${estilo}">
          <button type="button" class="fim-abre" id="fim-abre-${empKey}" aria-expanded="${aberto ? "true" : "false"}" onclick="FiscalApp.toggle('e', '${c.id}')">
            <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}" style="width:16px;height:16px;"></i>
            <b>${this.esc(c.id)} ${this.esc(c.name)}</b>
          </button>
          ${cel(this.valorAba(c, aba))}
          ${cel(c[aba] || 0)}
          ${aba === "irpj" ? cel(c.adicional) : ""}
          ${comProv ? cel(provEmp(c.id)) : ""}
          ${acao}
        </div>
        <div class="fim-filhos" id="fim-box-${empKey}" ${aberto ? "" : "hidden"}>${contas}</div>
      </div>`;
    }).join("");
    return `<p class="fim-muted">A empresa abre as contas financeiras. A conta abre o centro de custo. Parceiro, ou centro sem a marca de imposto pago pela empresa, fica riscado e fora da soma.</p><div class="fim-scroll">
      <div class="fim-head" style="${estilo}"><span>Empresa / conta / centro de custo</span><span>${headBase}</span><span>${colImp}</span>${aba === "irpj" ? "<span>Adicional</span>" : ""}${comProv ? "<span>Provisão de janeiro</span>" : ""}<span></span></div>
      ${linhas}
    </div>`;
  },

  metaTitulo(type) {
    const map = {
      pis: { doc: "PIS", nome: "PIS", conta: 2 },
      cofins: { doc: "COFI", nome: "COFINS", conta: 3 },
      irpj: { doc: "IRPJ", nome: "IRPJ", conta: null },
      csll: { doc: "CSLL", nome: "CSLL", conta: null }
    };
    return map[type] || map.pis;
  },

  vencimentoTitulo(type) {
    const m = FiscalState.month;
    const y = FiscalState.year;
    if (type === "pis" || type === "cofins") {
      return m === 12 ? { month: 1, year: y + 1 } : { month: m + 1, year: y };
    }
    if (this.ehMesDeApuracao(m)) return { month: m, year: y };
    if (m <= 3) return { month: 4, year: y };
    if (m <= 6) return { month: 7, year: y };
    if (m <= 9) return { month: 10, year: y };
    return { month: 1, year: y + 1 };
  },

  auditarTitulo(status, summary, details) {
    if (!window.AuditService || typeof AuditService.logEvent !== "function") return;
    const u = (window.AppState && AppState.currentUser) || {};
    try {
      AuditService.logEvent({
        module: "Fiscal",
        action: "Gerar título",
        status,
        summary,
        user: u.name || u.nome || "",
        userEmail: u.email || "",
        enterpriseId: details && details.companyId != null ? String(details.companyId) : "",
        titleId: details && details.billId ? String(details.billId) : "",
        endpoint: "/bills",
        method: "POST",
        details: details || {}
      });
    } catch (e) {}
  },

  async sendToSienge(companyId, type) {
    const comp = (FiscalState.empresas || []).find((c) => Number(c.id) === Number(companyId));
    if (!comp) return;
    const meta = this.metaTitulo(type);
    const amount = Number(comp[type]) || 0;
    if (!(amount > 0)) {
      alert(this.ehMesDeApuracao() && (type === "irpj" || type === "csll")
        ? "Não há imposto a recolher nesta empresa."
        : "Não há valor nesta empresa.");
      return;
    }
    const fileInput = document.getElementById(`file-${type}-${companyId}`);
    const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (!file && !confirm(`Você não anexou a guia de ${meta.nome}. Deseja criar o título sem anexo?`)) return;
    const btn = document.getElementById(`btn-${type}-${companyId}`);
    if (!btn) return;
    btn.innerHTML = `<div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div> Enviando...`;
    btn.disabled = true;
    const monthStr = String(FiscalState.month).padStart(2, "0");
    const yearStr = FiscalState.year;
    const venc = this.vencimentoTitulo(type);
    const modo = (type === "irpj" || type === "csll") ? (this.ehMesDeApuracao() ? "Apuração" : "Provisão") : "Recolhimento mensal";
    try {
      const corporativoId = Number(`7${String(comp.id).padStart(2, "0")}00`);
      const issueDate = new Date().toISOString().split("T")[0];
      const dueDate = `${venc.year}-${String(venc.month).padStart(2, "0")}-25`;
      const baseDate = `${FiscalState.year}-${monthStr}-01`;
      const billPayload = {
        debtorId: comp.id,
        creditorId: 229,
        documentIdentificationId: meta.doc,
        documentNumber: `${meta.nome} ML ${monthStr}/${yearStr}`,
        issueDate, installmentsNumber: 1, baseDate, dueDate, billDate: baseDate,
        totalInvoiceAmount: parseFloat(amount.toFixed(2)),
        notes: `${modo} de ${meta.nome} - ${monthStr}/${yearStr}`,
        discount: 0, indexId: 0,
        budgetCategories: [Object.assign({ costCenterId: corporativoId, rate: 100 }, meta.conta != null ? { financialCategoryId: meta.conta } : {})],
        departmentsCost: [{ id: 37, rate: 100 }],
        taxes: [], buildingsCost: [], units: []
      };
      const host = window.location.hostname || "localhost";
      const proxyUrl = `http://${host}:3001/sienge-proxy/bills`;
      let authHeader = "";
      if (window.SIENGE_CONFIG) authHeader = "Basic " + btoa(window.SIENGE_CONFIG.user + ":" + window.SIENGE_CONFIG.pass);
      const req = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(billPayload)
      });
      let billId = `SIMULADO_${Math.floor(Math.random() * 1000)}`;
      if (!req.ok) throw new Error(await req.text());
        const textResp = await req.text();
        if (textResp) {
        try { billId = JSON.parse(textResp).id || billId; } catch (e) {}
        }
      if (file && !String(billId).startsWith("SIMULADO_")) {
          try {
          const attUrl = `http://${host}:3001/sienge-proxy/bills/${billId}/attachments?description=Guia_${type.toUpperCase()}`;
            const formData = new FormData();
          formData.append("file", file);
          await fetch(attUrl, { method: "POST", headers: { Authorization: authHeader }, body: formData });
          } catch (errAtt) {
            alert("O título foi criado, mas houve uma falha ao enviar o anexo da guia.");
        }
      }
      btn.innerHTML = `Gerado: #${billId}`;
      btn.style.backgroundColor = "#10b981";
      btn.style.color = "white";
      this.auditarTitulo("ok", `Título de ${meta.nome} #${billId} · ${comp.id} ${comp.name} · ${modo} · ${monthStr}/${yearStr}`, {
        companyId: comp.id, billId, type, modo, amount, documento: meta.doc
      });
    } catch (err) {
      console.error(err);
      alert(`Erro ao criar o título no Sienge: ${err.message}`);
      btn.innerHTML = "Erro! Tentar de novo";
      btn.disabled = false;
      this.auditarTitulo("erro", `Falha ao gerar título de ${meta.nome} · ${comp.id} ${comp.name} · ${modo} · ${monthStr}/${yearStr}`, {
        companyId: comp.id, type, modo, amount, documento: meta.doc, erro: (err && err.message) || String(err)
      });
    }
  },

  gerarPdf() {
    if (!FiscalState.consultou || FiscalState.loading) {
      alert("Calcule a competência antes de gerar o PDF.");
      return;
    }
    const lib = window.jspdf;
    if (!lib || typeof lib.jsPDF !== "function") {
      alert("O gerador de PDF não carregou. Atualize a página com Ctrl+F5.");
      return;
    }
    const pdf = new lib.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pis = this.pacote("pis");
    const cof = this.pacote("cofins");
    const ir = this.pacote("irpj");
    const cs = this.pacote("csll");
    const janeiro = FiscalState.month === 1 && ir.apuracao;
    const provIr = janeiro ? this.pacote("irpj", [this.ym(FiscalState.year, 1)]) : null;
    const provCs = janeiro ? this.pacote("csll", [this.ym(FiscalState.year, 1)]) : null;
    const ids = [];
    const nomes = {};
    [pis, cof, ir, cs].forEach((p) => p.empresas.forEach((c) => {
      if (!nomes[c.id]) { nomes[c.id] = c.name; ids.push(c.id); }
    }));
    const achar = (p, id, campo) => {
      const c = (p.empresas || []).find((e) => Number(e.id) === Number(id));
      return c ? (Number(c[campo]) || 0) : 0;
    };
    const head = ["Empresa", "PIS", "COFINS", "IRPJ", "CSLL"];
    if (janeiro) head.push("Provisão IRPJ", "Provisão CSLL");
    const body = ids.map((id) => {
      const linha = [
        `${id} ${nomes[id] || ""}`,
        this.money(achar(pis, id, "pis")),
        this.money(achar(cof, id, "cofins")),
        this.money(achar(ir, id, "irpj")),
        this.money(achar(cs, id, "csll"))
      ];
      if (janeiro) {
        linha.push(this.money(achar(provIr, id, "irpj")), this.money(achar(provCs, id, "csll")));
      }
      return linha;
    });
    const soma = (p, campo) => p.empresas.reduce((s, c) => s + (Number(c[campo]) || 0), 0);
    const total = ["Total", this.money(soma(pis, "pis")), this.money(soma(cof, "cofins")), this.money(soma(ir, "irpj")), this.money(soma(cs, "csll"))];
    if (janeiro) total.push(this.money(soma(provIr, "irpj")), this.money(soma(provCs, "csll")));
    body.push(total);
    const comp = `${this.MESES[FiscalState.month - 1]} de ${FiscalState.year}`;
    const modo = ir.apuracao ? ir.periodo : `Provisão de ${comp}`;
    pdf.setFontSize(14);
    pdf.text("Resumo de impostos", 14, 14);
    pdf.setFontSize(9);
    pdf.text(`Competência ${comp}`, 14, 20);
    pdf.text(`PIS e COFINS do mês. IRPJ e CSLL: ${modo}.`, 14, 25);
    pdf.autoTable({
      head: [head],
      body,
      startY: 30,
      styles: { fontSize: 8, halign: "right" },
      columnStyles: { 0: { halign: "left" } },
      headStyles: { fillColor: [16, 84, 54], halign: "center" },
      didParseCell: (hook) => {
        if (hook.section === "body" && hook.row.index === body.length - 1) hook.cell.styles.fontStyle = "bold";
      }
    });
    pdf.save(`impostos-${FiscalState.year}-${monthPad(FiscalState.month)}.pdf`);
  }
};

function monthPad(m) {
  return String(m).padStart(2, "0");
}

function initFiscalModule() {
  const root = document.getElementById("fiscal-root");
  if (!root) return;
  FiscalState.consultou = false;
  FiscalState.loading = false;
  FiscalState.linhas = [];
  FiscalState.erro = "";
  FiscalState.aviso = "";
  FiscalApp.render();
}

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "construcao-fiscal") initFiscalModule();
});
