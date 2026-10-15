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
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem("crm_plano_impostos") || "{}") || {}; } catch (e) { cfg = {}; }
    const mem = window.PlanoFinanceiroApp && PlanoFinanceiroApp.taxConfig;
    if (mem && typeof mem === "object") cfg = Object.assign({}, cfg, mem);
    return cfg;
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
          const signed = node
            ? FC.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov)
            : (reduz ? -Math.abs(Number(a.amount) || 0) : (Number(a.amount) || 0));
          if (!base && !reduz) {
            if (noReceita && signed) {
              linhas.push({
                companyId: Number(mov.companyId),
                companyName: this.nomeEmpresa(mov.companyId, mov),
                month: FC.movMonth(mov),
                ccId: a.costCenterId != null && String(a.costCenterId).trim() !== "" ? String(a.costCenterId) : "—",
                ccName: String(a.costCenterName || "").trim(),
                bucket: this.grupoDaRedutora(node),
                papel: "base",
                semMarca: true,
                categoryId: FC.formatAccountCode(a.categoryId) || String(a.categoryId),
                categoryName: a.categoryName || "",
                valor: signed
              });
            }
            return;
          }
          if (!signed) return;
          const bucket = base || this.grupoDaRedutora(node);
          let valor = signed;
          let papel = (!base || signed < 0) ? "redutora" : "base";
          if (tag === "Base de Dedução") papel = "redutora";
          if (papel === "redutora" && valor > 0 && !FC.isEstornoName(a.categoryName) && (tag === "Base de Dedução" || !(node && FC.isRevenueGroup(node.id)))) valor = -Math.abs(valor);
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
      const entra = l.semMarca ? false : this.entraNaEmpresa(l.ccId, l.ccName);
      const k = `${l.categoryId}|${l.papel}|${l.bucket}${l.semMarca ? "|fora" : ""}`;
      const acc = c.contas[k] || (c.contas[k] = Object.assign(this.empresaVazia(l.categoryId, l.categoryName || l.categoryId), {
        papel: l.papel, bucket: l.bucket, ccs: {}
      }));
      acc.name = l.categoryName || acc.name;
      acc.papel = l.papel;
      acc.bucket = l.bucket;
      const cc = acc.ccs[l.ccId] || (acc.ccs[l.ccId] = this.empresaVazia(l.ccId, l.ccName || l.ccId));
      cc.name = l.ccName || cc.name || l.ccId;
      cc.entra = entra;
      cc.semMarca = !!l.semMarca;
      acc.semMarca = !!l.semMarca;
      if (l.semMarca) {
        acc.aviso = (acc.aviso || 0) + l.valor;
        cc.aviso = (cc.aviso || 0) + l.valor;
        return;
      }
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
    }).filter((emp) => this.temMovimento(emp, qual) || (emp.contas || []).some((acc) => Math.abs(Number(acc.aviso) || 0) > 0.004))
      .sort((a, b) => Number(a.id) - Number(b.id));
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

  /* ---------- bases do plano (mesma marcação do DFC) ---------- */
  basesPadrao() {
    return [
      { id: "Base para Vendas de Lote", titulo: "Base de receita de venda de lotes" },
      { id: "Base para Receita de Serviços", titulo: "Base para receita de serviços" },
      { id: "Base para Aplicações Financeiras", titulo: "Base para aplicações financeiras" },
      { id: "Base de Dedução", titulo: "Base de deduções" }
    ];
  },

  listaBases() {
    const out = this.basesPadrao().slice();
    const seen = new Set(out.map((b) => b.id));
    const extras = [];
    try {
      const custom = JSON.parse(localStorage.getItem("crm_impostos_custom") || "null");
      if (Array.isArray(custom)) extras.push(...custom);
    } catch (e) {}
    if (window.PlanoFinanceiroApp && Array.isArray(PlanoFinanceiroApp.taxBases)) extras.push(...PlanoFinanceiroApp.taxBases);
    Object.values(this.taxConfig()).forEach((tag) => extras.push(tag));
    extras.forEach((nome) => {
      const id = String(nome || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ id, titulo: id });
    });
    return out;
  },

  normConta(id) {
    const FC = window.FluxoCaixaApp;
    if (FC && typeof FC.normAccountKey === "function") return FC.normAccountKey(id);
    return String(id || "").replace(/\D/g, "");
  },

  codigoConta(catOrId) {
    const PF = window.PlanoFinanceiroApp;
    const FC = window.FluxoCaixaApp;
    if (catOrId && typeof catOrId === "object" && PF && typeof PF.formatAccountCode === "function" && PF.categories && PF.categories.length) {
      return PF.formatAccountCode(catOrId);
    }
    const id = catOrId && typeof catOrId === "object" ? catOrId.id : catOrId;
    if (FC && typeof FC.formatAccountCode === "function") return FC.formatAccountCode(id);
    return String(id || "");
  },

  async garantirContasDfc() {
    const PF = window.PlanoFinanceiroApp;
    const FC = window.FluxoCaixaApp;
    if (PF && PF.categories && PF.categories.length) {
      if (FC) FC.categories = PF.categories;
      return PF.categories;
    }
    if (FC && FC.categories && FC.categories.length) {
      if (PF) {
        PF.categories = FC.categories;
        if (typeof PF.buildAccountTreeMeta === "function") PF.buildAccountTreeMeta();
      }
      return PF && PF.categories ? PF.categories : FC.categories;
    }
    if (!window.SiengeApiService || typeof SiengeApiService.getPaymentCategories !== "function") return [];
    const cats = await SiengeApiService.getPaymentCategories();
    const list = (cats || []).map((c) => ({
      ...c,
      name: c.name || c.description || c.financialCategoryName || "",
      tpConta: c.tpConta || c.type || c.financialCategoryType || ""
    }));
    if (FC) FC.categories = list;
    if (PF) {
      PF.categories = list;
      if (typeof PF.buildAccountTreeMeta === "function") PF.buildAccountTreeMeta();
    }
    return (PF && PF.categories && PF.categories.length) ? PF.categories : list;
  },

  contasAnaliticas() {
    const cats = this._contasDfc || [];
    const pais = new Set(cats.map((c) => c._parentId).filter((id) => id != null && String(id) !== "").map(String));
    return cats.filter((c) => {
      const t = String(c.tpConta || c.type || "").toLowerCase();
      if (t === "t" || t.includes("total") || t.includes("sintet")) return false;
      if (t === "r" || t.includes("result") || t.includes("analit")) return true;
      return !pais.has(String(c.id));
    });
  },

  contaPorChave(key) {
    const nk = this.normConta(key);
    return (this._contasDfc || []).find((c) => String(c.id) === String(key) || (nk && this.normConta(c.id) === nk)) || null;
  },

  contasDaBase(baseId) {
    const cfg = this.taxConfig();
    return Object.keys(cfg).filter((k) => cfg[k] === baseId).map((k) => {
      const cat = this.contaPorChave(k);
      return {
        key: k,
        code: this.codigoConta(cat || k),
        name: (cat && (cat.name || cat.description)) || ""
      };
    }).sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
  },

  baseDaConta(id) {
    const cfg = this.taxConfig();
    const nk = this.normConta(id);
    const hit = Object.keys(cfg).find((k) => String(k) === String(id) || (nk && this.normConta(k) === nk));
    return hit ? cfg[hit] : "";
  },

  foldBusca(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  },

  contasBuscaveis() {
    const cats = this._contasDfc || [];
    return cats.filter((c) => {
      const t = String(c.tpConta || c.type || "").toLowerCase();
      return !(t === "t" || t.includes("total") || t.includes("sintet"));
    });
  },

  sugestoesBase(baseId, q) {
    const termo = this.foldBusca(String(q || "").trim());
    if (termo.length < 1) return [];
    const nkQ = this.normConta(termo);
    return this.contasBuscaveis().filter((c) => {
      if (this.baseDaConta(c.id) === baseId) return false;
      const code = this.foldBusca(this.codigoConta(c));
      const nome = this.foldBusca(c.name || c.description || "");
      const id = this.foldBusca(c.id);
      if (code.includes(termo) || nome.includes(termo) || id.includes(termo)) return true;
      return !!(nkQ && this.normConta(c.id).includes(nkQ));
    }).slice(0, 8);
  },

  sincronizarPlano(cfg) {
    localStorage.setItem("crm_plano_impostos", JSON.stringify(cfg));
    const PF = window.PlanoFinanceiroApp;
    if (PF) {
      PF.taxConfig = cfg;
      if (document.getElementById("pf-table-wrapper") && typeof PF.renderTable === "function") {
        try { PF.renderTable(); } catch (e) {}
      }
    }
    window._planoImpostosWriting = true;
    const done = () => { window._planoImpostosWriting = false; };
    if (typeof window.forceUploadLocalConfig === "function") {
      window.forceUploadLocalConfig(true).then(done, done);
    } else done();
  },

  gravarBase(cfg) {
    this.sincronizarPlano(cfg);
    if (FiscalState.consultou) {
      FiscalState.aviso = "Bases atualizadas no DFC. Clique em Calcular para refazer os números.";
    }
    if (document.getElementById("fim-bases-pop")) this.pintarBases();
    else this.render();
  },

  incluirContaBase(baseId, accountId) {
    const cfg = this.taxConfig();
    const nk = this.normConta(accountId);
    Object.keys(cfg).forEach((k) => {
      if (String(k) === String(accountId) || (nk && this.normConta(k) === nk)) delete cfg[k];
    });
    cfg[String(accountId)] = baseId;
    if (!this._basesQ) this._basesQ = {};
    this._basesQ[baseId] = "";
    this.gravarBase(cfg);
  },

  removerContaBase(accountKey) {
    const cfg = this.taxConfig();
    const nk = this.normConta(accountKey);
    Object.keys(cfg).forEach((k) => {
      if (String(k) === String(accountKey) || (nk && this.normConta(k) === nk)) delete cfg[k];
    });
    this.gravarBase(cfg);
  },

  tituloBase(id) {
    const hit = (this._listaBases || this.listaBases()).find((b) => b.id === id);
    return hit ? hit.titulo : id;
  },

  htmlBase(base) {
    const contas = this.contasDaBase(base.id);
    const q = (this._basesQ && this._basesQ[base.id]) || "";
    const itens = contas.length
      ? contas.map((c) => `<div class="fim-base-item"><span><b class="fim-cod">${this.esc(c.code)}</b> ${this.esc(c.name)}</span><button type="button" class="tvig-ico is-danger" title="Remover" data-fim-rem="${this.esc(c.key)}"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button></div>`).join("")
      : `<p class="fim-base-vazio">Nenhuma conta nesta base.</p>`;
    const sug = this.sugestoesBase(base.id, q).map((c) => {
      const onde = this.baseDaConta(c.id);
      const nota = onde ? `<span class="fim-base-onde">Está em ${this.esc(this.tituloBase(onde))}. Incluir move para cá.</span>` : "";
      return `<button type="button" class="fim-base-hit" data-fim-add="${this.esc(c.id)}" data-fim-base="${this.esc(base.id)}"><span><b class="fim-cod">${this.esc(this.codigoConta(c))}</b> ${this.esc(c.name || "")}${nota}</span><em>${onde ? "Mover" : "Incluir"}</em></button>`;
    }).join("");
    return `<section class="fim-base">
      <div class="fim-base-h"><span>${this.esc(base.titulo)}</span><span class="fim-base-n">${contas.length}</span></div>
      <div class="fim-base-lista">${itens}</div>
      <div class="fim-base-busca">
        <input type="text" data-fim-q="${this.esc(base.id)}" value="${this.esc(q)}" placeholder="Buscar conta do DFC pelo código ou pelo nome" autocomplete="off">
        <div class="fim-base-sug">${sug}</div>
      </div>
    </section>`;
  },

  pintarBases() {
    const box = document.getElementById("fim-bases-corpo");
    if (!box) return;
    const ativo = document.activeElement;
    const ativoBase = ativo && ativo.getAttribute && ativo.getAttribute("data-fim-q");
    const pos = ativoBase ? ativo.selectionStart : 0;
    const lista = this._listaBases || this.listaBases();
    const aviso = this._contasDfc && this._contasDfc.length ? "" : `<p class="fim-erro">Não encontrei as contas do DFC para a busca. As bases abaixo continuam valendo. Abra o Fluxo de Caixa e tente de novo.</p>`;
    box.innerHTML = aviso + lista.map((b) => this.htmlBase(b)).join("");
    if (ativoBase) {
      const el = [...box.querySelectorAll("[data-fim-q]")].find((n) => n.getAttribute("data-fim-q") === ativoBase);
      if (el) {
        el.focus();
        const p = Math.min(pos || 0, el.value.length);
        el.setSelectionRange(p, p);
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  async abrirBases() {
    const velho = document.getElementById("fim-bases-pop");
    if (velho) velho.remove();
    this._basesQ = {};
    this._listaBases = this.listaBases();
    const pop = document.createElement("div");
    pop.id = "fim-bases-pop";
    pop.className = "fim-pop";
    pop.innerHTML = `<div class="fim-pop-box fim-bases-box" role="dialog" aria-modal="true">
      <div class="fim-pop-h"><b>Contas do plano</b><button type="button" class="btn btn-fechar" data-fim-fechar="1">Fechar</button></div>
      <p class="fim-muted" style="margin:0;">As mesmas bases do DFC. Incluir ou remover uma conta aqui atualiza a marcação fiscal do plano. Desconto de juros contratuais entra na base de deduções.</p>
      <div id="fim-bases-corpo"><p class="fim-bases-aviso">Buscando as contas do DFC…</p></div>
    </div>`;
    pop.addEventListener("mousedown", (ev) => {
      if (ev.target.closest("[data-fim-add]")) ev.preventDefault();
    });
    pop.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-fim-fechar]")) {
        this.fecharBases();
        return;
      }
      const add = ev.target.closest("[data-fim-add]");
      if (add) {
        this.incluirContaBase(add.getAttribute("data-fim-base"), add.getAttribute("data-fim-add"));
        return;
      }
      const rem = ev.target.closest("[data-fim-rem]");
      if (rem) this.removerContaBase(rem.getAttribute("data-fim-rem"));
    });
    pop.addEventListener("input", (ev) => {
      const q = ev.target.getAttribute && ev.target.getAttribute("data-fim-q");
      if (!q) return;
      this._basesQ[q] = ev.target.value;
      this.pintarBases();
    });
    document.body.appendChild(pop);
    try {
      this._contasDfc = await this.garantirContasDfc();
    } catch (e) {
      this._contasDfc = [];
    }
    const corpo = document.getElementById("fim-bases-corpo");
    if (!corpo) return;
    this.pintarBases();
  },

  fecharBases() {
    const pop = document.getElementById("fim-bases-pop");
    if (pop) pop.remove();
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

  competenciaDoCampo() {
    const el = document.getElementById("fim-comp");
    const m = /^(\d{4})-(\d{2})$/.exec(String((el && el.value) || ""));
    return m
      ? { month: parseInt(m[2], 10), year: parseInt(m[1], 10) }
      : { month: FiscalState.month, year: FiscalState.year };
  },

  calcular() {
    const c = this.competenciaDoCampo();
    FiscalState.month = c.month;
    FiscalState.year = c.year;
    this.loadData();
  },

  setCompetencia() {
    const c = this.competenciaDoCampo();
    const nm = c.month;
    const ny = c.year;
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
      .fim-toolbar { align-items: flex-end; }
      .fim-btn, .fim-btn-excel { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; font-weight: 600; white-space: nowrap; }
      .fim-btn svg { width: 15px; height: 15px; }
      .fim-btn:disabled, .fim-btn-excel:disabled { opacity: 0.5; cursor: not-allowed; }
      .fim-topo .ppcc-sub { max-width: 640px; line-height: 1.45; }
      .fim-topo .ppcc-kpi { min-width: 160px; }
      .fim-rac-scroll { max-height: none; margin-top: 10px; }
      .cc-table.fim-rac-table { font-size: 0.8rem; }
      .cc-table.fim-rac-table col.fim-c-val { width: 180px; }
      .cc-table.fim-rac-table col.fim-c-papel { width: 160px; }
      .cc-table.fim-rac-table thead th { position: static; padding: 8px 12px; }
      .cc-table.fim-rac-table td { height: 34px; padding: 4px 12px; white-space: normal; }
      .cc-table.fim-rac-table td.is-right { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
      .cc-table.fim-rac-table td.is-neg { color: #b91c1c; }
      .cc-table.fim-rac-table tr.is-fora td { color: #94a3b8; }
      .cc-table.fim-rac-table tbody tr.is-base,
      .cc-table.fim-rac-table tbody tr.is-base:hover { background: #e8f5ee; }
      .cc-table.fim-rac-table tr.is-base td { font-weight: 800; color: #105436; border-top: 1px solid #cfe8da; }
      .cc-table.fim-rac-table tbody tr.is-imposto,
      .cc-table.fim-rac-table tbody tr.is-imposto:hover { background: #105436; }
      .cc-table.fim-rac-table tr.is-imposto td { font-weight: 800; color: #fff; }
      .fim-cod { color: #105436; font-weight: 800; margin-right: 4px; }
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
      .fim-head { background: #1b8253; color: #fff; padding: 8px 12px; font-size: 0.72rem; font-weight: 700; }
      .fim-emp { border-bottom: 1px solid #e2e8f0; }
      .fim-linha { padding: 8px 12px; }
      .fim-head:hover { background: #1b8253; }
      .fim-emp > .fim-linha,
      .fim-emp:nth-child(odd) > .fim-linha { background: #105436; color: #fff; }
      .fim-emp > .fim-linha:hover { background: #0c3f28; }
      .fim-emp > .fim-linha .btn-primary { background: #fff; color: #105436; border-color: #fff; }
      .fim-emp > .fim-linha .btn-outline { background: transparent; color: #fff; border-color: rgba(255,255,255,0.7); }
      .fim-emp > .fim-linha .fim-arquivo { color: #d1fae5; }
      .fim-conta > .fim-linha { background: #d1fae5; color: #14532d; }
      .fim-conta > .fim-linha:hover { background: #a7f3d0; }
      .fim-cc > .fim-linha { background: #fff; color: #1e293b; }
      .fim-cc > .fim-linha:hover { background: #f1f5f9; }
      .fim-grid tbody tr:hover td { background: #f1f5f9; }
      .fim-abre { display: flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 0; cursor: pointer; text-align: left; color: inherit; font: inherit; min-width: 0; }
      .fim-abre b, .fim-abre span { min-width: 0; }
      .fim-filhos { background: #fff; }
      .fim-conta { border-top: 1px solid #a7f3d0; }
      .fim-conta .fim-linha { padding-left: 28px; }
      .fim-cc { border-top: 1px solid #e2e8f0; }
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
      .fim-bases-box { width: min(920px, 100%); }
      .fim-base { border: 1px solid #e2e8f0; border-radius: 10px; margin-top: 12px; overflow: hidden; }
      .fim-base-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: #f7faf8; color: #105436; font-weight: 800; font-size: 0.82rem; }
      .fim-base-n { font-size: 0.72rem; font-weight: 700; color: #64748b; }
      .fim-base-lista { display: flex; flex-direction: column; }
      .fim-base-item, .fim-base-hit { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px 6px 12px; font-size: 0.8rem; color: #1c2e24; }
      .fim-base-item + .fim-base-item, .fim-base-hit + .fim-base-hit { border-top: 1px solid #eef2f1; }
      .fim-base-vazio { margin: 0; padding: 8px 12px; color: #94a3b8; font-size: 0.78rem; }
      .fim-base-busca { padding: 8px 12px 10px; border-top: 1px solid #e8eee9; }
      .fim-base-busca input { width: 100%; height: 34px; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 10px; font-size: 0.8rem; color: #0f172a; }
      .fim-base-busca input:focus { outline: none; border-color: #105436; }
      .fim-base-hit { width: 100%; border: 0; background: #fff; cursor: pointer; text-align: left; font: inherit; }
      .fim-base-hit:hover { background: #e7f6ee; }
      .fim-base-hit em { font-style: normal; font-size: 0.72rem; font-weight: 800; color: #105436; white-space: nowrap; }
      .fim-base-onde { display: block; font-size: 0.68rem; color: #64748b; font-weight: 600; }
      .fim-bases-aviso { margin: 8px 0 0; font-size: 0.78rem; color: #64748b; }
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
    const comp = `${FiscalState.year}-${String(FiscalState.month).padStart(2, "0")}`;
    const ano = new Date().getFullYear();
    const nomeMes = this.MESES[FiscalState.month - 1] || "";
    const tabs = [
      { id: "pis", label: "PIS", icon: "percent" },
      { id: "cofins", label: "COFINS", icon: "coins" },
      { id: "irpj", label: "IRPJ", icon: "landmark" },
      { id: "csll", label: "CSLL", icon: "scale" }
    ];
    const abas = tabs.map((t) => `<button type="button" role="tab" aria-selected="${p.aba === t.id}" class="ml-tab ${p.aba === t.id ? "is-active" : ""}" onclick="FiscalApp.setAba('${t.id}')"><i data-lucide="${t.icon}"></i> ${t.label}</button>`).join("");
    return `
      <div class="cc-toolbar fim-toolbar">
        <div class="cc-filters">
          <div class="ml-comp-slot">
            <label class="ml-comp-label" for="fim-comp">Competência</label>
            <input type="month" id="fim-comp" class="ml-comp-input" value="${comp}" min="2024-01" max="${ano + 1}-12" onchange="FiscalApp.setCompetencia()">
          </div>
        </div>
        <div class="cc-toolbar-actions">
          <button type="button" class="btn btn-outline fim-btn" onclick="FiscalApp.abrirAliquotas()"><i data-lucide="sliders-horizontal"></i> Alíquotas</button>
          <button type="button" class="btn btn-outline fim-btn" onclick="FiscalApp.abrirBases()"><i data-lucide="list-tree"></i> Contas do plano</button>
          <button type="button" class="btn btn-outline fim-btn" onclick="FiscalApp.gerarPdf()" ${FiscalState.consultou ? "" : "disabled"}><i data-lucide="file-down"></i> Resumo em PDF</button>
          <button type="button" class="btn btn-excel fim-btn-excel" onclick="FiscalApp.exportarExcel()" ${FiscalState.consultou ? "" : "disabled"} title="Exportar a memória de cálculo para Excel">
            <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel
          </button>
          <button type="button" class="btn btn-primary fim-btn" onclick="FiscalApp.calcular()"><i data-lucide="calculator"></i> Calcular</button>
        </div>
      </div>
      <div class="ppcc-head fim-topo">
        <div>
          <div class="ppcc-titulo">Lucro presumido do loteamento</div>
          <div class="ppcc-sub">A base é a do DFC: contas marcadas no plano, menos as redutoras da visão. Competência ${this.esc(nomeMes)} de ${FiscalState.year}.</div>
        </div>
        ${FiscalState.consultou ? `<div class="ppcc-kpis">${this.cards(p)}</div>` : ""}
      </div>
      ${FiscalState.erro ? `<div class="fim-erro">${this.esc(FiscalState.erro)}</div>` : ""}
      ${FiscalState.aviso ? `<div class="fim-aviso">${this.esc(FiscalState.aviso)}</div>` : ""}
      <div class="ml-tabs fim-tabs" role="tablist">${abas}</div>
      ${FiscalState.consultou ? `${this.racional(p)}${this.tabela(p)}` : `<div class="fim-racional"><p class="fim-muted" style="margin:0;">Escolha a competência e clique em Calcular.</p></div>`}`;
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
    const linhas = [];
    const linha = (nome, valor, tipo) => linhas.push({ nome, valor, tipo: tipo || "" });
    if (p.aba === "pis" || p.aba === "cofins") {
      const aliq = p.aba === "pis" ? a.pis : a.cofins;
      const imposto = p.aba === "pis" ? t.pis : t.cofins;
      linha("Vendas de lote (contas de base)", t.bv);
      linha("Redutoras de vendas", t.rv, "redutora");
      linha("Serviços (contas de base)", t.bs);
      linha("Redutoras de serviços", t.rs, "redutora");
      linha(a.financNoPis ? "Aplicações financeiras" : "Aplicações (fora do PIS e da COFINS)", t.financeiras, a.financNoPis ? "" : "fora");
      linha(`Base do ${p.aba === "pis" ? "PIS" : "COFINS"}`, t.basePis, "base");
      linha(`${p.aba === "pis" ? "PIS" : "COFINS"} (× ${this.pct(aliq)})`, imposto, "imposto");
    } else if (p.aba === "irpj") {
      linha(`Vendas de lote × ${this.pct(a.vendasIrpj)}`, t.vendas * a.vendasIrpj / 100);
      linha(`Serviços × ${this.pct(a.servicosIrpj)}`, t.servicos * a.servicosIrpj / 100);
      linha(`Aplicações × ${this.pct(a.financIrpj)}`, t.financeiras * a.financIrpj / 100);
      linha("Lucro presumido", t.lucroIrpj, "base");
      linha(`IRPJ (× ${this.pct(a.irpj)})`, t.ir, "imposto");
      linha(`Adicional ${this.pct(a.adicional)} acima de ${this.money(a.limiteMensal * (p.apuracao ? 3 : 1))}`, t.adicional, "imposto");
    } else {
      linha(`Vendas de lote × ${this.pct(a.vendasCsll)}`, t.vendas * a.vendasCsll / 100);
      linha(`Serviços × ${this.pct(a.servicosCsll)}`, t.servicos * a.servicosCsll / 100);
      linha(`Aplicações × ${this.pct(a.financCsll)}`, t.financeiras * a.financCsll / 100);
      linha("Base da CSLL", t.lucroCsll, "base");
      linha(`CSLL (× ${this.pct(a.csll)})`, t.csll, "imposto");
    }
    const texto = this.textoRacional(p, a);
    const formula = `
      <div class="cc-scroll fim-rac-scroll">
        <table class="cc-table fim-rac-table">
          <colgroup><col><col class="fim-c-val"></colgroup>
          <thead><tr><th>Composição</th><th class="is-right">Valor</th></tr></thead>
          <tbody>
            ${linhas.map((l) => `<tr class="${l.tipo ? "is-" + l.tipo : ""}"><td>${this.esc(l.nome)}</td><td class="is-right${l.valor < 0 ? " is-neg" : ""}">${this.money(l.valor)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    const contas = p.contas.length ? `<details class="fim-contas"><summary>Contas que formaram a base (${p.contas.length})</summary>
      <div class="cc-scroll fim-rac-scroll">
        <table class="cc-table fim-rac-table">
          <colgroup><col><col class="fim-c-papel"><col class="fim-c-val"></colgroup>
          <thead><tr><th>Conta</th><th>Papel</th><th class="is-right">Valor no DFC</th></tr></thead>
          <tbody>
            ${p.contas.map((c) => `<tr class="${c.papel === "redutora" ? "is-redutora" : ""}"><td><b class="fim-cod">${this.esc(c.id)}</b> ${this.esc(c.name)}</td><td>${c.papel === "redutora" ? "Redutora" : this.esc(this.nomeBase(c.bucket))}</td><td class="is-right${c.valor < 0 ? " is-neg" : ""}">${this.money(c.valor)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div></details>` : "";
    return `<div class="fim-racional"><h3>Racional · ${this.esc(p.periodo)}</h3><p class="fim-muted">${texto}</p>${formula}${contas}</div>`;
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
    const kpi = (rot, val, cls) => `<div class="ppcc-kpi"><span class="ppcc-kpi-rot">${rot}</span><span class="ppcc-kpi-val${cls ? " " + cls : ""}">${val}</span></div>`;
    return kpi(nomeBase, this.money(t.base)) +
      kpi(nomeImp, this.money(t.imp), "is-pos") +
      (p.aba === "irpj" ? kpi("Adicional", this.money(t.adi)) : kpi("Empresas", p.empresas.length));
  },

  temMovimento(item, aba) {
    if (Math.abs(Number(item && item.aviso) || 0) > 0.004) return true;
    const base = Math.abs(Number(this.valorAba(item, aba)) || 0);
    const imp = Math.abs(Number(this.impostoAba(item, aba)) || 0);
    const adi = aba === "irpj" ? Math.abs(Number(item && item.adicional) || 0) : 0;
    return base > 0.004 || imp > 0.004 || adi > 0.004;
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
        <label class="btn btn-outline" title="O recibo de entrega é obrigatório antes do envio">Recibo de entrega
          <input type="file" id="file-${aba}-${c.id}" accept=".pdf,.png,.jpg" onchange="FiscalApp.nomeGuia(this)">
        </label>
        <button type="button" id="btn-${aba}-${c.id}" class="btn btn-primary" onclick="FiscalApp.sendToSienge(${c.id}, '${aba}')">Gerar título</button>
        <span class="fim-arquivo" id="nome-${aba}-${c.id}"></span>
      </div>`;
      const contas = (c.contas || []).map((acc) => {
        const accKey = "a-" + c.id + "-" + this.slug(`${acc.id}-${acc.papel}-${acc.bucket}${acc.semMarca ? "-fora" : ""}`);
        const accAberto = !!FiscalState.abertos[accKey];
        const papel = acc.semMarca ? "Sem marca fiscal — fora do cálculo" : (acc.papel === "redutora" ? "Redutora" : this.nomeBase(acc.bucket));
        const ccs = (acc.ccs || []).filter((cc) => this.temMovimento(cc, aba)).map((cc) => {
          const motivo = cc.semMarca
            ? "Sem marca fiscal no plano — não entra na soma"
            : (cc.entra ? "" : (/parce(ir|ri)/i.test(String(cc.name || "")) ? "Parceiro — não entra na soma" : "Sem imposto pago pela empresa — não entra na soma"));
          const baseCc = cc.semMarca ? cc.aviso : this.valorAba(cc, aba);
          return `<div class="fim-cc${cc.entra ? "" : " fim-fora"}">
            <div class="fim-linha" style="${estilo}">
              <span class="fim-nome">${this.esc(cc.id)} ${this.esc(cc.name || "")}${motivo ? ` <small>${this.esc(motivo)}</small>` : ""}</span>
              ${cel(baseCc)}
              ${cc.semMarca ? `<span class="fim-val">—</span>` : cel(cc[aba] || 0)}
              ${aba === "irpj" ? `<span class="fim-val">${cc.entra ? this.money(cc.adicional) : "—"}</span>` : ""}
              ${comProv ? cel(provCc(c.id, acc, cc)) : ""}
              <span></span>
            </div>
          </div>`;
        }).join("");
        if (!ccs && !this.temMovimento(acc, aba)) return "";
        const baseAcc = acc.semMarca ? acc.aviso : this.valorAba(acc, aba);
        return `<div class="fim-conta${acc.semMarca ? " fim-fora" : ""}">
          <div class="fim-linha" style="${estilo}">
            <button type="button" class="fim-abre" id="fim-abre-${accKey}" aria-expanded="${accAberto ? "true" : "false"}" onclick="FiscalApp.toggle('a', '${c.id}-${this.slug(`${acc.id}-${acc.papel}-${acc.bucket}${acc.semMarca ? "-fora" : ""}`)}')">
              <i data-lucide="${accAberto ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i>
              <span class="fim-nome">${this.esc(acc.id)} ${this.esc(acc.name || "")} <small>${this.esc(papel)}</small></span>
            </button>
            ${cel(baseAcc)}
            ${acc.semMarca ? `<span class="fim-val">—</span>` : cel(acc[aba] || 0)}
            ${aba === "irpj" ? cel(acc.adicional) : ""}
            ${comProv ? cel(provAcc(c.id, acc)) : ""}
            <span></span>
          </div>
          <div class="fim-filhos" id="fim-box-${accKey}" ${accAberto ? "" : "hidden"}>${ccs}</div>
        </div>`;
      }).join("");
      if (!contas && !this.temMovimento(c, aba)) return "";
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
    return `<p class="fim-muted">A empresa abre as contas financeiras. A conta abre o centro de custo. Linha zerada fica de fora. Parceiro, centro sem imposto pago pela empresa e conta de receita sem marca no plano ficam riscados e fora da soma.</p><div class="fim-scroll">
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

  siglaEmpresa(id, nome) {
    const fixas = {
      1: "ML", 3: "TER AR", 6: "ARA", 13: "VERCE", 28: "RAMOS", 32: "NV", 36: "TAGUAI"
    };
    if (fixas[Number(id)]) return fixas[Number(id)];
    const limpa = String(nome || "").replace(/\b(ltda|spe|eireli|s\/a|sa)\b/ig, "").replace(/[^A-Za-zÀ-ú0-9 ]/g, " ").trim();
    const palavra = limpa.split(/\s+/).filter(Boolean)[0] || "EMP";
    return palavra.slice(0, 10).toUpperCase();
  },

  numeroDocumento(meta, comp) {
    const mes = String(FiscalState.month).padStart(2, "0");
    const ano = FiscalState.year;
    if ((meta.doc === "IRPJ" || meta.doc === "CSLL") && this.ehMesDeApuracao()) {
      const tri = FiscalState.month === 4 ? 1 : (FiscalState.month === 7 ? 2 : (FiscalState.month === 10 ? 3 : 4));
      const anoTri = FiscalState.month === 1 ? ano - 1 : ano;
      return `${meta.doc} ${tri} TRIM ${anoTri}`;
    }
    return `${meta.nome} ${this.siglaEmpresa(comp.id, comp.name)} ${mes}/${ano}`;
  },

  observacaoTitulo(meta) {
    const bruto = this.MESES[FiscalState.month - 1] || "";
    const mesNome = bruto.charAt(0).toUpperCase() + bruto.slice(1);
    const ano = FiscalState.year;
    if ((meta.doc === "IRPJ" || meta.doc === "CSLL") && this.ehMesDeApuracao()) {
      const tri = FiscalState.month === 4 ? 1 : (FiscalState.month === 7 ? 2 : (FiscalState.month === 10 ? 3 : 4));
      const anoTri = FiscalState.month === 1 ? ano - 1 : ano;
      const ord = ["", "1º", "2º", "3º", "4º"][tri];
      return `Recolhimento de ${meta.nome} - ${ord} trimestre de ${anoTri}`;
    }
    return `Recolhimento mensal de ${meta.nome} - ${mesNome} ${ano}`;
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
    if (!file) {
      alert("Anexe o recibo de entrega antes de enviar o título.");
      return;
    }
    const btn = document.getElementById(`btn-${type}-${companyId}`);
    if (!btn) return;
    const monthStr = String(FiscalState.month).padStart(2, "0");
    const yearStr = FiscalState.year;
    const venc = this.vencimentoTitulo(type);
    const modo = (type === "irpj" || type === "csll") ? (this.ehMesDeApuracao() ? "Apuração" : "Provisão") : "Recolhimento mensal";
    const documento = this.numeroDocumento(meta, comp);
    const notes = this.observacaoTitulo(meta);
    alert("A geração de títulos no Sienge está pausada. Nenhum título foi enviado.");
    return;
    try {
      const corporativoId = Number(`7${String(comp.id).padStart(2, "0")}00`);
      const issueDate = new Date().toISOString().split("T")[0];
      const dueDate = `${venc.year}-${String(venc.month).padStart(2, "0")}-25`;
      const baseDate = `${FiscalState.year}-${monthStr}-01`;
      const billPayload = {
        debtorId: comp.id,
        creditorId: 229,
        documentIdentificationId: meta.doc,
        documentNumber: documento,
        issueDate, installmentsNumber: 1, baseDate, dueDate, billDate: baseDate,
        totalInvoiceAmount: parseFloat(amount.toFixed(2)),
        notes,
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

  /** Por empresa: os números do PIS/COFINS (mês) e do IRPJ/CSLL (provisão ou trimestre), já fechados com as alíquotas. */
  memoria() {
    const pis = this.pacote("pis");
    const ir = this.pacote("irpj");
    const cs = this.pacote("csll");
    const ids = [];
    const nomes = {};
    [pis, ir, cs].forEach((p) => p.empresas.forEach((c) => {
      if (!nomes[c.id]) { nomes[c.id] = c.name; ids.push(c.id); }
    }));
    ids.sort((a, b) => Number(a) - Number(b));
    const pegar = (p, id) => p.empresas.find((e) => Number(e.id) === Number(id))
      || this.fechar(this.empresaVazia(id, nomes[id]), p.ali, p.aba, p.apuracao);
    return {
      ali: pis.ali,
      pis, ir, cs,
      comp: `${this.MESES[FiscalState.month - 1]} de ${FiscalState.year}`,
      empresas: ids.map((id) => ({ id, nome: nomes[id] || "", pis: pegar(pis, id), ir: pegar(ir, id), cs: pegar(cs, id) }))
    };
  },

  textoAliquotas(a) {
    return `PIS ${this.pct(a.pis)} · COFINS ${this.pct(a.cofins)} · IRPJ ${this.pct(a.irpj)} + adicional ${this.pct(a.adicional)} acima de ${this.money(a.limiteMensal)} por mês · CSLL ${this.pct(a.csll)}. ` +
      `Presunção IRPJ: vendas ${this.pct(a.vendasIrpj)}, serviços ${this.pct(a.servicosIrpj)}, aplicações ${this.pct(a.financIrpj)}. ` +
      `Presunção CSLL: vendas ${this.pct(a.vendasCsll)}, serviços ${this.pct(a.servicosCsll)}, aplicações ${this.pct(a.financCsll)}.`;
  },

  pdfMemoria(pdf, m) {
    const a = m.ali;
    const soma = (lista, f) => lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
    const tabela = (titulo, sub, head, linhas, total) => {
      pdf.addPage();
      pdf.setFontSize(12);
      pdf.text(titulo, 10, 13);
      pdf.setFontSize(8);
      pdf.text(sub, 10, 18, { maxWidth: 277 });
      pdf.autoTable({
        head: [head],
        body: linhas.concat([total]),
        startY: 23,
        margin: { left: 8, right: 8 },
        styles: { fontSize: 6.5, halign: "right", cellPadding: 1.2 },
        columnStyles: { 0: { halign: "left", cellWidth: 52 } },
        headStyles: { fillColor: [16, 84, 54], halign: "center", valign: "middle" },
        didParseCell: (hook) => {
          if (hook.section === "body" && hook.row.index === linhas.length) hook.cell.styles.fontStyle = "bold";
        }
      });
    };
    const nome = (e) => `${e.id} ${e.nome}`;
    const mo = (v) => this.money(v);
    const fin = (c) => (c.bruto.financeiras || 0) + (c.red.financeiras || 0);

    const lp = m.empresas.map((e) => e.pis);
    tabela(
      `PIS e COFINS · ${m.pis.periodo}`,
      `Base = vendas de lote + serviços, já descontadas as deduções (redutoras do DFC)${a.financNoPis ? " + aplicações financeiras" : ". As aplicações financeiras ficam fora da base"}. PIS ${this.pct(a.pis)} e COFINS ${this.pct(a.cofins)} sobre a base.`,
      ["Empresa", "Vendas de lote", "(-) Deduções vendas", "Serviços", "(-) Deduções serviços", a.financNoPis ? "Aplicações" : "Aplicações (fora)", "Base", `PIS ${this.pct(a.pis)}`, `COFINS ${this.pct(a.cofins)}`],
      m.empresas.map((e) => {
        const c = e.pis;
        return [nome(e), mo(c.bruto.vendas), mo(c.red.vendas), mo(c.bruto.servicos), mo(c.red.servicos), mo(fin(c)), mo(c.basePis), mo(c.pis), mo(c.cofins)];
      }),
      ["Total", mo(soma(lp, (c) => c.bruto.vendas)), mo(soma(lp, (c) => c.red.vendas)), mo(soma(lp, (c) => c.bruto.servicos)), mo(soma(lp, (c) => c.red.servicos)), mo(soma(lp, fin)), mo(soma(lp, (c) => c.basePis)), mo(soma(lp, (c) => c.pis)), mo(soma(lp, (c) => c.cofins))]
    );

    const blocoLucro = (qual) => {
      const ehIr = qual === "irpj";
      const p = ehIr ? m.ir : m.cs;
      const lista = m.empresas.map((e) => (ehIr ? e.ir : e.cs));
      const pv = ehIr ? a.vendasIrpj : a.vendasCsll;
      const ps = ehIr ? a.servicosIrpj : a.servicosCsll;
      const pf = ehIr ? a.financIrpj : a.financCsll;
      const bruto = (c) => (c.bruto.vendas || 0) + (c.bruto.servicos || 0) + (c.bruto.financeiras || 0);
      const deducoes = (c) => (c.red.vendas || 0) + (c.red.servicos || 0) + (c.red.financeiras || 0);
      const base = (c) => (ehIr ? c.lucroIrpj : c.lucroCsll);
      const limite = lista.length ? lista[0].limite : a.limiteMensal;
      const head = ["Empresa", "Receita bruta", "(-) Deduções", "Vendas líquidas", `× ${this.pct(pv)}`, "Serviços líquidos", `× ${this.pct(ps)}`, "Aplicações", `× ${this.pct(pf)}`, ehIr ? "Lucro presumido" : "Base da CSLL"];
      if (ehIr) head.push(`IRPJ ${this.pct(a.irpj)}`, `Adicional ${this.pct(a.adicional)}`, "IRPJ a recolher");
      else head.push(`CSLL ${this.pct(a.csll)}`);
      const linhaDe = (rot, c) => {
        const l = [rot, mo(bruto(c)), mo(deducoes(c)), mo(c.vendas), mo(c.vendas * pv / 100), mo(c.servicos), mo(c.servicos * ps / 100), mo(c.financeiras), mo(c.financeiras * pf / 100), mo(base(c))];
        if (ehIr) l.push(mo(c.ir), mo(c.adicional), mo(c.irpj));
        else l.push(mo(c.csll));
        return l;
      };
      const tot = ["Total", mo(soma(lista, bruto)), mo(soma(lista, deducoes)), mo(soma(lista, (c) => c.vendas)), mo(soma(lista, (c) => c.vendas * pv / 100)), mo(soma(lista, (c) => c.servicos)), mo(soma(lista, (c) => c.servicos * ps / 100)), mo(soma(lista, (c) => c.financeiras)), mo(soma(lista, (c) => c.financeiras * pf / 100)), mo(soma(lista, base))];
      if (ehIr) tot.push(mo(soma(lista, (c) => c.ir)), mo(soma(lista, (c) => c.adicional)), mo(soma(lista, (c) => c.irpj)));
      else tot.push(mo(soma(lista, (c) => c.csll)));
      tabela(
        `${ehIr ? "IRPJ" : "CSLL"} · ${p.periodo}`,
        ehIr
          ? `Lucro presumido = vendas líquidas × ${this.pct(pv)} + serviços líquidos × ${this.pct(ps)} + aplicações × ${this.pct(pf)}. IRPJ ${this.pct(a.irpj)} sobre o lucro presumido. Adicional ${this.pct(a.adicional)} sobre o que passar de ${mo(limite)} por empresa.`
          : `Base da CSLL = vendas líquidas × ${this.pct(pv)} + serviços líquidos × ${this.pct(ps)} + aplicações × ${this.pct(pf)}. CSLL ${this.pct(a.csll)} sobre a base.`,
        head,
        m.empresas.map((e) => linhaDe(nome(e), ehIr ? e.ir : e.cs)),
        tot
      );
    };
    blocoLucro("irpj");
    blocoLucro("csll");
  },

  /* ---------- Excel (formato Aplicações e Investimentos) ---------- */
  async exportarExcel() {
    if (!FiscalState.consultou || FiscalState.loading) {
      alert("Calcule a competência antes de exportar.");
      return;
    }
    const Inv = window.InvestimentoApp;
    let ExcelJS = window.ExcelJS;
    try {
      if (!ExcelJS && Inv && typeof Inv.ensureExcelJS === "function") ExcelJS = await Inv.ensureExcelJS();
    } catch (e) { ExcelJS = null; }
    if (!ExcelJS) {
      alert("Não foi possível carregar a biblioteca de Excel. Recarregue a página.");
      return;
    }
    const m = this.memoria();
    if (!m.empresas.length) {
      alert("Nenhuma empresa com base nesta competência.");
      return;
    }
    const a = m.ali;
    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    wb.created = new Date();
    let imgId = null;
    try {
      if (Inv && typeof Inv.logoDataUrl === "function") {
        const logo = await Inv.logoDataUrl();
        imgId = wb.addImage({ base64: logo.dataUrl, extension: logo.extension || "png" });
      }
    } catch (e) { imgId = null; }

    const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
    const lado = { style: "thin", color: { argb: "FFE2E8F0" } };
    const borda = { top: lado, bottom: lado, left: lado, right: lado };
    const MONEY = "#,##0.00";
    const PCT = "0.00%";
    const geradoEm = (() => {
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, "0");
      return `Relatório gerado em ${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} às ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    })();
    const corValor = (v) => (Math.abs(Number(v) || 0) < 0.005 ? "FF94A3B8" : (Number(v) < 0 ? "FFB91C1C" : "FF0F172A"));

    const cabecalho = (ws, titulo, subtitulo, kpis) => {
      ws.properties.showGridLines = false;
      ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", activeCell: "B5", showGridLines: false }];
      ws.mergeCells("A1:A2");
      ws.getRow(1).height = 28;
      ws.getRow(2).height = 22;
      const t = ws.getCell("A1");
      t.value = {
        richText: [
          { font: { name: "Calibri", size: 14, bold: true, color: { argb: "FF475569" } }, text: titulo + "\n" },
          { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: subtitulo }
        ]
      };
      t.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 8 };
      if (imgId != null) {
        const px = Math.round(1.54 * 96 / 2.54);
        try { ws.addImage(imgId, { tl: { col: 0.04, row: 0.08 }, ext: { width: px, height: px } }); } catch (e) {}
      }
      kpis.forEach((k, i) => {
        const l = ws.getRow(1).getCell(4 + i);
        const v = ws.getRow(2).getCell(4 + i);
        l.value = k.rotulo;
        l.font = { name: "Calibri", size: 8, bold: true, color: { argb: "FF94A3B8" } };
        l.alignment = { horizontal: "right", vertical: "bottom" };
        v.value = k.valor;
        v.font = { name: "Calibri", size: 12, bold: true, color: { argb: k.cor || "FF0F172A" } };
        v.alignment = { horizontal: "right", vertical: "middle" };
        v.numFmt = MONEY;
      });
      ws.getRow(3).height = 8;
    };
    const cabecalhoTabela = (ws, titulos) => {
      const row = ws.getRow(4);
      row.height = 20;
      titulos.forEach((h, i) => {
        const c = row.getCell(i + 1);
        c.value = h;
        c.fill = fill("FF334155");
        c.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
        c.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle" };
        c.border = borda;
      });
    };
    const rodape = (ws, linha, ultimaCol) => {
      const c = ws.getRow(linha + 1).getCell(1);
      c.value = geradoEm;
      c.font = { name: "Calibri", size: 8, italic: true, color: { argb: "FF64748B" } };
      ws.mergeCells(linha + 1, 1, linha + 1, ultimaCol);
    };
    const nomeAba = (() => {
      const usados = new Set(["resumo"]);
      return (id, nome) => {
        let base = `${id}-${String(nome || "EMPRESA").replace(/[:\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim()}`.slice(0, 31);
        let n = base;
        let i = 2;
        while (usados.has(n.toLowerCase())) {
          const suf = `-${i++}`;
          n = base.slice(0, 31 - suf.length) + suf;
        }
        usados.add(n.toLowerCase());
        return n;
      };
    })();
    const ref = (aba, cel) => `'${aba.replace(/'/g, "''")}'!${cel}`;

    const resumo = wb.addWorksheet("Resumo", { properties: { showGridLines: false } });
    const refs = [];

    /* Uma aba por empresa com a memória de cálculo em fórmulas: valor × alíquota = resultado. */
    m.empresas.forEach((e) => {
      const aba = nomeAba(e.id, e.nome);
      const ws = wb.addWorksheet(aba, { properties: { showGridLines: false } });
      ws.columns = [{ width: 50 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }];
      cabecalho(ws, "Memória de cálculo dos impostos", `${e.id} ${e.nome} · competência ${m.comp}`, [
        { rotulo: "PIS", valor: e.pis.pis },
        { rotulo: "COFINS", valor: e.pis.cofins },
        { rotulo: "IRPJ", valor: e.ir.irpj },
        { rotulo: "CSLL", valor: e.cs.csll }
      ]);
      cabecalhoTabela(ws, ["Item", "Valor", "Alíquota", "Resultado"]);
      let r = 5;
      const faixa = (texto) => {
        ws.mergeCells(r, 1, r, 4);
        const c = ws.getRow(r).getCell(1);
        c.value = texto;
        c.fill = fill("FF0C3D28");
        c.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
        c.border = borda;
        ws.getRow(r).height = 18;
        r++;
      };
      /* tipo: "" linha comum, "sub" subtotal (faixa verde clara), "total" imposto a recolher (faixa cinza). */
      const item = (rotulo, valor, aliq, resultado, tipo) => {
        const row = ws.getRow(r);
        const cels = [row.getCell(1), row.getCell(2), row.getCell(3), row.getCell(4)];
        cels[0].value = rotulo;
        if (valor != null) cels[1].value = valor;
        if (aliq != null) cels[2].value = aliq;
        if (resultado != null) cels[3].value = resultado;
        cels.forEach((c, i) => {
          c.border = borda;
          const cache = c.value && typeof c.value === "object" && "result" in c.value ? c.value.result : c.value;
          const cor = tipo === "total" ? "FFFFFFFF" : (tipo === "sub" ? "FF105436" : (i === 0 ? "FF0F172A" : corValor(cache)));
          c.font = { name: "Calibri", size: 9, bold: tipo === "sub" || tipo === "total", color: { argb: cor } };
          if (tipo === "sub") c.fill = fill("FFE7F6EE");
          if (tipo === "total") c.fill = fill("FF475569");
          if (i > 0) {
            c.alignment = { horizontal: "right" };
            c.numFmt = i === 2 ? PCT : MONEY;
          }
        });
        return r++;
      };
      const f = (formula, result) => ({ formula, result: Number(result) || 0 });

      const P = e.pis;
      const finP = (P.bruto.financeiras || 0) + (P.red.financeiras || 0);
      faixa(`PIS e COFINS · ${m.pis.periodo}`);
      const rV = item("Vendas de lote (contas de base)", P.bruto.vendas || 0);
      const rVd = item("(−) Deduções de vendas (redutoras do DFC)", P.red.vendas || 0);
      const rS = item("Serviços (contas de base)", P.bruto.servicos || 0);
      const rSd = item("(−) Deduções de serviços (redutoras do DFC)", P.red.servicos || 0);
      const rF = item(a.financNoPis ? "Aplicações financeiras" : "Aplicações financeiras (fora da base do PIS e da COFINS)", finP);
      const rBase = item("Base do PIS e da COFINS", f(`B${rV}+B${rVd}+B${rS}+B${rSd}${a.financNoPis ? `+B${rF}` : ""}`, P.basePis), null, null, "sub");
      const rPis = item("PIS", f(`MAX(0,B${rBase})`, Math.max(0, P.basePis)), a.pis / 100, f(`B${r}*C${r}`, P.pis), "total");
      const rCof = item("COFINS", f(`MAX(0,B${rBase})`, Math.max(0, P.basePis)), a.cofins / 100, f(`B${r}*C${r}`, P.cofins), "total");

      const blocoLucro = (qual) => {
        const ehIr = qual === "irpj";
        const c = ehIr ? e.ir : e.cs;
        const p = ehIr ? m.ir : m.cs;
        const pv = (ehIr ? a.vendasIrpj : a.vendasCsll) / 100;
        const ps = (ehIr ? a.servicosIrpj : a.servicosCsll) / 100;
        const pf = (ehIr ? a.financIrpj : a.financCsll) / 100;
        r++;
        faixa(`${ehIr ? "IRPJ" : "CSLL"} · ${p.periodo}`);
        const v1 = item("Vendas de lote (contas de base)", c.bruto.vendas || 0);
        const v2 = item("(−) Deduções de vendas", c.red.vendas || 0);
        const vl = item("Vendas líquidas × presunção", f(`B${v1}+B${v2}`, c.vendas), pv, f(`B${r}*C${r}`, c.vendas * pv));
        const s1 = item("Serviços (contas de base)", c.bruto.servicos || 0);
        const s2 = item("(−) Deduções de serviços", c.red.servicos || 0);
        const sl = item("Serviços líquidos × presunção", f(`B${s1}+B${s2}`, c.servicos), ps, f(`B${r}*C${r}`, c.servicos * ps));
        const fl = item("Aplicações financeiras × presunção", c.financeiras || 0, pf, f(`B${r}*C${r}`, c.financeiras * pf));
        const base = ehIr ? c.lucroIrpj : c.lucroCsll;
        const rb = item(ehIr ? "Lucro presumido" : "Base da CSLL", null, null, f(`D${vl}+D${sl}+D${fl}`, base), "sub");
        if (ehIr) {
          const ri = item(`IRPJ`, f(`MAX(0,D${rb})`, Math.max(0, base)), a.irpj / 100, f(`B${r}*C${r}`, c.ir));
          const ra = item(`Adicional (lucro acima de ${this.money(c.limite)})`, f(`MAX(0,D${rb}-${c.limite})`, Math.max(0, base - c.limite)), a.adicional / 100, f(`B${r}*C${r}`, c.adicional));
          return item("IRPJ a recolher", null, null, f(`D${ri}+D${ra}`, c.irpj), "total");
        }
        return item("CSLL a recolher", f(`MAX(0,D${rb})`, Math.max(0, base)), a.csll / 100, f(`B${r}*C${r}`, c.csll), "total");
      };
      const rIr = blocoLucro("irpj");
      const rCs = blocoLucro("csll");
      rodape(ws, r, 4);
      refs.push({ e, aba, base: `B${rBase}`, pis: `D${rPis}`, cofins: `D${rCof}`, irpj: `D${rIr}`, csll: `D${rCs}` });
    });

    /* Resumo: puxa os resultados das abas, então uma correção feita na aba da empresa recalcula o total. */
    const tot = (campo) => m.empresas.reduce((s, e) => s + (Number(campo(e)) || 0), 0);
    resumo.columns = [{ width: 56 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }];
    cabecalho(resumo, "Resumo de impostos", `Competência ${m.comp} · PIS e COFINS: ${m.pis.periodo} · IRPJ e CSLL: ${m.ir.periodo}`, [
      { rotulo: "PIS", valor: tot((e) => e.pis.pis) },
      { rotulo: "COFINS", valor: tot((e) => e.pis.cofins) },
      { rotulo: "IRPJ", valor: tot((e) => e.ir.irpj) },
      { rotulo: "CSLL", valor: tot((e) => e.cs.csll) }
    ]);
    cabecalhoTabela(resumo, ["Empresa", "Base PIS/COFINS", "PIS", "COFINS", "IRPJ", "CSLL", "Total"]);
    let r = 5;
    refs.forEach((x) => {
      const row = resumo.getRow(r);
      const vals = [x.e.pis.basePis, x.e.pis.pis, x.e.pis.cofins, x.e.ir.irpj, x.e.cs.csll];
      row.getCell(1).value = `${x.e.id} ${x.e.nome}`;
      [x.base, x.pis, x.cofins, x.irpj, x.csll].forEach((cel, i) => {
        row.getCell(i + 2).value = { formula: ref(x.aba, cel), result: Number(vals[i]) || 0 };
      });
      row.getCell(7).value = { formula: `C${r}+D${r}+E${r}+F${r}`, result: vals[1] + vals[2] + vals[3] + vals[4] };
      for (let i = 1; i <= 7; i++) {
        const c = row.getCell(i);
        const cache = i === 1 ? null : (c.value && c.value.result);
        c.border = borda;
        c.font = { name: "Calibri", size: 9, bold: i === 7, color: { argb: i === 1 ? "FF0F172A" : corValor(cache) } };
        if (i > 1) { c.alignment = { horizontal: "right" }; c.numFmt = MONEY; }
      }
      r++;
    });
    const totRow = resumo.getRow(r);
    totRow.getCell(1).value = "Total";
    const somas = [tot((e) => e.pis.basePis), tot((e) => e.pis.pis), tot((e) => e.pis.cofins), tot((e) => e.ir.irpj), tot((e) => e.cs.csll)];
    for (let i = 2; i <= 7; i++) {
      const L = String.fromCharCode(64 + i);
      const cache = i === 7 ? somas[1] + somas[2] + somas[3] + somas[4] : somas[i - 2];
      totRow.getCell(i).value = { formula: `SUM(${L}5:${L}${r - 1})`, result: cache };
    }
    for (let i = 1; i <= 7; i++) {
      const c = totRow.getCell(i);
      c.fill = fill("FF475569");
      c.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      c.border = borda;
      if (i > 1) { c.alignment = { horizontal: "right" }; c.numFmt = MONEY; }
    }
    r += 2;
    const nota = resumo.getRow(r).getCell(1);
    nota.value = this.textoAliquotas(a);
    nota.font = { name: "Calibri", size: 8, color: { argb: "FF64748B" } };
    nota.alignment = { wrapText: true, vertical: "top" };
    resumo.mergeCells(r, 1, r, 7);
    resumo.getRow(r).height = 30;
    rodape(resumo, r + 1, 7);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `impostos-${FiscalState.year}-${monthPad(FiscalState.month)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
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
    const head = ["Empresa", "Base PIS/COFINS", "PIS", "COFINS", "IRPJ", "CSLL", "Total"];
    if (janeiro) head.push("Provisão IRPJ", "Provisão CSLL");
    const body = ids.map((id) => {
      const vals = [achar(pis, id, "pis"), achar(cof, id, "cofins"), achar(ir, id, "irpj"), achar(cs, id, "csll")];
      const linha = [
        `${id} ${nomes[id] || ""}`,
        this.money(achar(pis, id, "basePis")),
        ...vals.map((v) => this.money(v)),
        this.money(vals.reduce((s, v) => s + v, 0))
      ];
      if (janeiro) {
        linha.push(this.money(achar(provIr, id, "irpj")), this.money(achar(provCs, id, "csll")));
      }
      return linha;
    });
    const soma = (p, campo) => p.empresas.reduce((s, c) => s + (Number(c[campo]) || 0), 0);
    const total = ["Total", this.money(soma(pis, "basePis")), this.money(soma(pis, "pis")), this.money(soma(cof, "cofins")), this.money(soma(ir, "irpj")), this.money(soma(cs, "csll")),
      this.money(soma(pis, "pis") + soma(cof, "cofins") + soma(ir, "irpj") + soma(cs, "csll"))];
    if (janeiro) total.push(this.money(soma(provIr, "irpj")), this.money(soma(provCs, "csll")));
    body.push(total);
    const comp = `${this.MESES[FiscalState.month - 1]} de ${FiscalState.year}`;
    const modo = ir.apuracao ? ir.periodo : `Provisão de ${comp}`;
    pdf.setFontSize(14);
    pdf.text("Resumo de impostos", 14, 14);
    pdf.setFontSize(9);
    pdf.text(`Competência ${comp}`, 14, 20);
    pdf.text(`PIS e COFINS do mês. IRPJ e CSLL: ${modo}.`, 14, 25);
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(this.textoAliquotas(pis.ali) + " A memória de cálculo de cada imposto está nas páginas seguintes.", 14, 30, { maxWidth: 269 });
    pdf.setTextColor(0, 0, 0);
    pdf.autoTable({
      head: [head],
      body,
      startY: 39,
      styles: { fontSize: 8, halign: "right" },
      columnStyles: { 0: { halign: "left" } },
      headStyles: { fillColor: [16, 84, 54], halign: "center" },
      didParseCell: (hook) => {
        if (hook.section === "body" && hook.row.index === body.length - 1) hook.cell.styles.fontStyle = "bold";
      }
    });
    this.pdfMemoria(pdf, this.memoria());
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
