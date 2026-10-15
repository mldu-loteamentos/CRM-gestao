/* Estimativa de impostos e repasses do orçamento 2027.
   Imposto: mesmas bases e alíquotas de Calcular impostos.
   PIS e COFINS da competência pagam no mês seguinte.
   IRPJ e CSLL de jan–mar pagam em abril, e assim por diante.
   Repasse de sociedade abate esses impostos da distribuição. */
const OrcEst = {
  MESES: ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || Math.abs(n) < 0.005) return "—";
    const abs = Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? "-" + abs : abs;
  },

  norm(s) {
    return String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ").trim().toUpperCase();
  },

  z() { return Array(12).fill(0); },

  aliquotas() {
    const fiscal = typeof FiscalApp !== "undefined" ? FiscalApp : null;
    if (fiscal && typeof fiscal.aliquotas === "function") return fiscal.aliquotas();
    return {
      pis: 0.65, cofins: 3, irpj: 15, adicional: 10, limiteMensal: 20000, csll: 9,
      vendasIrpj: 8, vendasCsll: 12, servicosIrpj: 32, servicosCsll: 32,
      financIrpj: 100, financCsll: 100, financNoPis: false
    };
  },

  linhas() {
    const app = typeof OrcamentoDfcApp !== "undefined" ? OrcamentoDfcApp : null;
    return app && typeof app.lines === "function" ? app.lines() : [];
  },

  empresas() {
    const map = new Map();
    this.linhas().forEach((l) => {
      const id = String(l.e || "");
      if (id && !map.has(id)) map.set(id, String(l.enome || ""));
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name, label: id + " - " + this.norm(name) }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  },

  grupoEfetivo(conta, nome) {
    const cadeia = this.cadeiaConta(conta);
    for (let i = 0; i < cadeia.length; i++) {
      const g = this.grupo(cadeia[i], nome);
      if (g) return g;
    }
    return "";
  },

  grupo(conta, nome) {
    const app = typeof OrcamentoDfcApp !== "undefined" ? OrcamentoDfcApp : null;
    if (app && typeof app.grupoDaConta === "function") return app.grupoDaConta(conta, nome);
    return null;
  },

  sinal(gid, conta, nome, valor) {
    const fluxo = typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : (window.FluxoCaixaApp || null);
    const node = { id: gid, redutora: gid === "g_01_04" || gid === "g_11_01" };
    if (fluxo && typeof fluxo.signedAmount === "function") {
      return fluxo.signedAmount(node, conta, nome, valor);
    }
    const raw = Number(valor) || 0;
    if (!raw) return 0;
    const abs = Math.abs(raw);
    if (gid === "g_01_04" || gid === "g_11_01") return -abs;
    if (String(gid).startsWith("g_01") || gid === "g_09_01" || gid === "g_11_02" || gid === "g_11_03") return abs;
    return -abs;
  },

  taxConfig() {
    const fiscal = typeof FiscalApp !== "undefined" ? FiscalApp : null;
    if (fiscal && typeof fiscal.taxConfig === "function") return fiscal.taxConfig();
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem("crm_plano_impostos") || "{}") || {}; } catch (e) { cfg = {}; }
    return cfg;
  },

  tag(cfg, id) {
    const sid = String(id || "").trim();
    if (!sid) return "";
    if (cfg[sid]) return cfg[sid];
    const nk = sid.replace(/\D/g, "");
    const hit = Object.keys(cfg).find((k) => String(k).replace(/\D/g, "") === nk);
    return hit ? cfg[hit] : "";
  },

  /* Conta da base fiscal. Sem marca no plano, a visão DFC define venda, serviço ou dedução.
     Lucro recebido e aporte ficam de fora: não são base de PIS nem de lucro presumido. */
  cadeiaConta(conta) {
    const out = [];
    let code = String(conta || "").trim();
    while (code && out.indexOf(code) < 0) {
      out.push(code);
      const i = code.lastIndexOf(".");
      if (i <= 0) break;
      code = code.slice(0, i);
    }
    return out;
  },

  classe(l, cfg) {
    const cadeia = this.cadeiaConta(l.conta);
    let gid = "";
    let tag = "";
    cadeia.forEach((code) => {
      if (!gid) gid = this.grupo(code, l.cn) || "";
      if (!tag) tag = this.tag(cfg, code);
    });
    const nome = this.norm(l.cn);
    const fora = /LUCRO RECEB|DIVIDEND|APORTE/.test(nome);
    if (/DESCONTO DE JUROS CONTRAT/.test(nome) || String(l.conta || "").replace(/\D/g, "") === "2050103") {
      return { bucket: "vendas", red: true };
    }
    if (tag === "Base para Vendas de Lote") return { bucket: "vendas", red: false };
    if (tag === "Base para Receita de Serviços") return { bucket: "servicos", red: false };
    if (tag === "Base para Aplicações Financeiras") return { bucket: "financeiras", red: false };
    if (tag === "Base de Dedução") {
      const bucket = gid === "g_01_02" ? "servicos" : (gid === "g_01_03" || gid === "g_09_01" ? "financeiras" : "vendas");
      return { bucket, red: true };
    }
    if (fora) return null;
    if (gid === "g_01_01") return { bucket: "vendas", red: false };
    if (gid === "g_01_02") return { bucket: "servicos", red: false };
    if (gid === "g_09_01") return { bucket: "financeiras", red: false };
    if (gid === "g_01_03" && /JUROS|RENDIMENTO|APLICAC/.test(nome)) return { bucket: "financeiras", red: false };
    if (gid === "g_01_04") return { bucket: "vendas", red: true };
    return null;
  },

  tipoApurado(l) {
    const nome = this.norm(l.cn);
    const conta = String(l.conta || "");
    if (nome === "PIS" || conta === "2.04.01.01") return "pis";
    if (nome === "COFINS" || conta === "2.04.01.02") return "cofins";
    if (nome === "IRPJ" || conta === "2.04.01.03") return "irpj";
    if (nome === "CSLL" || conta === "2.04.01.04") return "csll";
    return "";
  },

  perto(a, b) {
    const d = Math.abs((Number(a) || 0) - (Number(b) || 0));
    const base = Math.max(Math.abs(Number(a) || 0), Math.abs(Number(b) || 0), 1);
    return d <= 1.5 || d / base <= 0.02;
  },

  parcerias() {
    const app = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : (window.ParametrizacaoParceiroApp || null);
    let items = app && Array.isArray(app.items) && app.items.length ? app.items : null;
    if (!items) {
      try { items = JSON.parse(localStorage.getItem("crm_parcerias_v1") || "[]") || []; } catch (e) { items = []; }
    }
    return items.map((p) => {
      if (app && typeof app.normalizeItem === "function") return app.normalizeItem(p);
      return p;
    });
  }
};

const OrcamentoImpostosApp = {
  selectedCompanyIds: [],
  companyDropOpen: false,
  companyQuery: "",
  abertos: {},

  calcular(linhas) {
    const ali = OrcEst.aliquotas();
    const cfg = OrcEst.taxConfig();
    const emp = {};
    const garantir = (id, nome) => {
      if (!emp[id]) {
        emp[id] = {
          id, nome: nome || "",
          vendas: OrcEst.z(), servicos: OrcEst.z(), financeiras: OrcEst.z(),
          pis: OrcEst.z(), cofins: OrcEst.z(), irMes: OrcEst.z(), csllMes: OrcEst.z(),
          ap: { pis: OrcEst.z(), cofins: OrcEst.z(), irpj: OrcEst.z(), csll: OrcEst.z() }
        };
      } else if (nome && !emp[id].nome) emp[id].nome = nome;
      return emp[id];
    };
    (linhas || OrcEst.linhas()).forEach((l) => {
      const id = String(l.e || "");
      if (!id) return;
      const row = garantir(id, l.enome);
      const tipo = OrcEst.tipoApurado(l);
      if (tipo) {
        (l.m || []).forEach((v, i) => { if (i < 12) row.ap[tipo][i] += Math.abs(Number(v) || 0); });
        return;
      }
      const cl = OrcEst.classe(l, cfg);
      if (!cl) return;
      (l.m || []).forEach((v, i) => {
        if (i > 11) return;
        let s = OrcEst.sinal(OrcEst.grupo(l.conta, l.cn), l.conta, l.cn, v);
        if (cl.red && s > 0) s = -Math.abs(s);
        if (!cl.red && s < 0) s = s;
        row[cl.bucket][i] += s;
      });
    });
    Object.values(emp).forEach((row) => {
      for (let i = 0; i < 12; i++) {
        const v = row.vendas[i];
        const s = row.servicos[i];
        const f = row.financeiras[i];
        const basePis = v + s + (ali.financNoPis ? f : 0);
        row.pis[i] = basePis > 0 ? basePis * ali.pis / 100 : 0;
        row.cofins[i] = basePis > 0 ? basePis * ali.cofins / 100 : 0;
      }
      for (let q = 0; q < 4; q++) {
        let v = 0, s = 0, f = 0;
        for (let k = 0; k < 3; k++) {
          v += row.vendas[q * 3 + k];
          s += row.servicos[q * 3 + k];
          f += row.financeiras[q * 3 + k];
        }
        const lucroI = v * ali.vendasIrpj / 100 + s * ali.servicosIrpj / 100 + f * ali.financIrpj / 100;
        const lucroC = v * ali.vendasCsll / 100 + s * ali.servicosCsll / 100 + f * ali.financCsll / 100;
        const limite = ali.limiteMensal * 3;
        const ir = lucroI > 0 ? lucroI * ali.irpj / 100 : 0;
        const ad = lucroI > limite ? (lucroI - limite) * ali.adicional / 100 : 0;
        const csll = lucroC > 0 ? lucroC * ali.csll / 100 : 0;
        const irTot = ir + ad;
        for (let k = 0; k < 3; k++) {
          row.irMes[q * 3 + k] = irTot / 3;
          row.csllMes[q * 3 + k] = csll / 3;
        }
        row["q" + q] = { irpj: irTot, csll };
      }
      row.pagar = {
        pis: this.desloca(row.pis),
        cofins: this.desloca(row.cofins),
        irpj: this.trimestrePago(row),
        csll: this.trimestrePago(row, "csll")
      };
      this.aplicarJaneiro(row);
      row.leitura = {
        pis: this.lerLinha("PIS", row.pagar.pis, row.pis, row.ap.pis),
        cofins: this.lerLinha("COFINS", row.pagar.cofins, row.cofins, row.ap.cofins),
        irpj: this.lerTrimestre("IRPJ", row, "irpj"),
        csll: this.lerTrimestre("CSLL", row, "csll")
      };
    });
    return emp;
  },

  /* Índice 0 é janeiro de 2027. PIS e COFINS vêm do forecast de dezembro de 2026.
     IRPJ e CSLL vêm do forecast de outubro, novembro e dezembro de 2026. */
  bases2026() {
    const app = window.ResultadoCaixaApp;
    if (!app || typeof app.basesForecast !== "function") return {};
    const out = {};
    ["2026-10", "2026-11", "2026-12"].forEach((ym) => {
      const bag = app.basesForecast(ym);
      if (bag) out[ym] = bag;
    });
    return out;
  },

  impostoMes(base, ali) {
    if (!base) return null;
    const v = Number(base.vendas) || 0;
    const s = Number(base.servicos) || 0;
    const f = Number(base.financeiras) || 0;
    const basePis = v + s + (ali.financNoPis ? f : 0);
    return {
      pis: basePis > 0 ? basePis * ali.pis / 100 : 0,
      cofins: basePis > 0 ? basePis * ali.cofins / 100 : 0,
      vendas: v,
      servicos: s,
      financeiras: f
    };
  },

  trimestreDe(bases, ali) {
    let v = 0;
    let s = 0;
    let f = 0;
    let meses = 0;
    bases.forEach((b) => {
      if (!b) return;
      meses += 1;
      v += Number(b.vendas) || 0;
      s += Number(b.servicos) || 0;
      f += Number(b.financeiras) || 0;
    });
    if (!meses) return null;
    const lucroI = v * ali.vendasIrpj / 100 + s * ali.servicosIrpj / 100 + f * ali.financIrpj / 100;
    const lucroC = v * ali.vendasCsll / 100 + s * ali.servicosCsll / 100 + f * ali.financCsll / 100;
    const limite = ali.limiteMensal * 3;
    const ir = lucroI > 0 ? lucroI * ali.irpj / 100 : 0;
    const ad = lucroI > limite ? (lucroI - limite) * ali.adicional / 100 : 0;
    const csll = lucroC > 0 ? lucroC * ali.csll / 100 : 0;
    return { irpj: ir + ad, csll: csll, meses: meses };
  },

  aplicarJaneiro(row) {
    const ali = OrcEst.aliquotas();
    const prev = this.bases2026();
    const dez = prev["2026-12"] && prev["2026-12"][Number(row.id)];
    const pis = this.impostoMes(dez, ali);
    if (pis) {
      row.pagar.pis[0] = pis.pis;
      row.pagar.cofins[0] = pis.cofins;
    }
    const tri = this.trimestreDe(["2026-10", "2026-11", "2026-12"].map((ym) => prev[ym] && prev[ym][Number(row.id)]), ali);
    if (tri) {
      row.pagar.irpj[0] = tri.irpj;
      row.pagar.csll[0] = tri.csll;
      row.forecastMeses = tri.meses;
    }
    row.forecastDez = !!pis;
  },

  desloca(accrual) {
    const out = Array(13).fill(null);
    out[0] = null;
    for (let i = 0; i < 12; i++) out[i + 1] = accrual[i];
    return out;
  },

  trimestrePago(row, campo) {
    const out = Array(13).fill(0);
    out[0] = null;
    const key = campo === "csll" ? "csll" : "irpj";
    out[3] = row.q0[key];
    out[6] = row.q1[key];
    out[9] = row.q2[key];
    out[12] = row.q3[key];
    return out;
  },

  lerLinha(nome, pagamento, competencia, orcamento) {
    const tem = orcamento.some((v) => Math.abs(v) >= 0.5);
    if (!tem) return { nome, tem: false, fecha: false, texto: "O orçamento não traz essa linha. O valor é a estimativa." };
    const pag = [];
    const comp = [];
    for (let i = 0; i < 12; i++) {
      comp.push({ est: competencia[i], orc: orcamento[i] });
      if (i > 0 && pagamento[i] != null) pag.push({ est: pagamento[i], orc: orcamento[i] });
    }
    const score = (pares) => pares.reduce((s, p) => s + Math.abs(p.est - p.orc), 0);
    const sp = score(pag);
    const sc = score(comp);
    const soma = (pares, k) => pares.reduce((s, p) => s + p[k], 0);
    const pagFecha = pag.length && OrcEst.perto(soma(pag, "est"), soma(pag, "orc")) && sp <= Math.max(12, soma(pag, "orc") * 0.03);
    const compFecha = OrcEst.perto(soma(comp, "est"), soma(comp, "orc")) && sc <= Math.max(12, soma(comp, "orc") * 0.03);
    if (pagFecha && compFecha) {
      return { nome, tem: true, fecha: true, texto: nome + " fecha com o cálculo. A base quase não muda de um mês para o outro, então o deslocamento do pagamento não altera o valor." };
    }
    if (pagFecha) {
      return { nome, tem: true, fecha: true, texto: nome + " fecha no mês do pagamento: a competência entra no mês seguinte." };
    }
    if (compFecha) {
      return { nome, tem: true, fecha: false, texto: nome + " do orçamento está na competência, não no mês do pagamento. Janeiro no arquivo é a base de janeiro, e o pagamento cai em fevereiro." };
    }
    const est = soma(pag, "est");
    const orc = soma(pag, "orc");
    return {
      nome, tem: true, fecha: false,
      texto: nome + " não fecha. No mês do pagamento a estimativa dá " + OrcEst.money(est) + " e a linha do orçamento dá " + OrcEst.money(orc) + "."
    };
  },

  lerTrimestre(nome, row, campo) {
    const orc = row.ap[campo];
    const tem = orc.some((v) => Math.abs(v) >= 0.5);
    if (!tem) return { nome, tem: false, fecha: false, texto: "O orçamento não traz essa linha. O valor é a estimativa." };
    const pago = [
      { est: row.q0[campo], orc: orc[3] },
      { est: row.q1[campo], orc: orc[6] },
      { est: row.q2[campo], orc: orc[9] }
    ];
    const inicio = [
      { est: row.q0[campo], orc: orc[0] },
      { est: row.q1[campo], orc: orc[3] },
      { est: row.q2[campo], orc: orc[6] },
      { est: row.q3[campo], orc: orc[9] }
    ];
    const score = (pares) => pares.reduce((s, p) => s + Math.abs(p.est - p.orc), 0);
    const soma = (pares, k) => pares.reduce((s, p) => s + p[k], 0);
    const pagoFecha = OrcEst.perto(soma(pago, "est"), soma(pago, "orc")) && score(pago) <= Math.max(8, soma(pago, "orc") * 0.03);
    const inicioFecha = OrcEst.perto(soma(inicio, "est"), soma(inicio, "orc")) && score(inicio) <= Math.max(8, soma(inicio, "orc") * 0.03);
    if (pagoFecha) {
      return { nome, tem: true, fecha: true, texto: nome + " fecha no mês do pagamento: janeiro a março entram em abril." };
    }
    if (inicioFecha) {
      return { nome, tem: true, fecha: false, texto: nome + " do orçamento está no primeiro mês do trimestre, não no mês do pagamento. O trimestre de janeiro a março está em janeiro, e o pagamento é em abril." };
    }
    return {
      nome, tem: true, fecha: false,
      texto: nome + " não fecha. O trimestre pago em abril, julho e outubro dá " + OrcEst.money(soma(pago, "est")) + " e a linha do orçamento, nesses meses, dá " + OrcEst.money(soma(pago, "orc")) + "."
    };
  },

  escopo() {
    const ids = new Set(this.selectedCompanyIds.map(String));
    const todas = OrcEst.linhas();
    if (!ids.size) return todas;
    return todas.filter((l) => ids.has(String(l.e)));
  },

  lista() {
    const mapa = this.calcular(this.escopo());
    return Object.values(mapa)
      .filter((r) => r.vendas.some((v) => Math.abs(v) >= 0.5) || r.servicos.some((v) => Math.abs(v) >= 0.5) || r.financeiras.some((v) => Math.abs(v) >= 0.5) || r.ap.pis.some((v) => v >= 0.5))
      .sort((a, b) => Number(a.id) - Number(b.id));
  },

  totalPago(row) {
    const out = Array(13).fill(0);
    for (let i = 0; i < 13; i++) {
      const partes = [row.pagar.pis[i], row.pagar.cofins[i], row.pagar.irpj[i], row.pagar.csll[i]];
      if (partes.every((v) => v == null)) {
        out[i] = null;
        continue;
      }
      out[i] = partes.reduce((s, v) => s + (Number(v) || 0), 0);
    }
    return out;
  },

  somaAte(arr, ate) {
    let s = 0;
    let algum = false;
    for (let i = 0; i < ate; i++) {
      if (arr[i] == null) continue;
      algum = true;
      s += arr[i];
    }
    return algum ? s : null;
  },

  chip(row) {
    const leituras = [row.leitura.pis, row.leitura.cofins, row.leitura.irpj, row.leitura.csll];
    const comLinha = leituras.filter((l) => l.tem);
    if (!comLinha.length) return { cls: "orc-est-mudo", txt: "sem linha no orçamento" };
    if (comLinha.every((l) => l.fecha)) return { cls: "orc-est-ok", txt: "linha confere" };
    return { cls: "orc-est-alerta", txt: "rever a linha" };
  },

  toggle(id) {
    this.abertos[id] = !this.abertos[id];
    this.paintCorpo();
  },

  render(root) {
    root.innerHTML = `
      <div class="orc-est-page">
        ${typeof OrcamentoApp !== "undefined" ? OrcamentoApp.abasHtml() : ""}
        <p class="orc-dfc-lead">Estimativa do imposto a pagar em 2027, com as contas do DFC e as alíquotas do lucro presumido. PIS e COFINS do mês pagam no mês seguinte. O trimestre de janeiro a março paga em abril, o de abril a junho em julho, o de julho a setembro em outubro, e o de outubro a dezembro em janeiro de 2028.</p>
        <div class="orc-dfc-tools">
          <div id="orc-imp-emp-box"></div>
        </div>
        <div id="orc-imp-body"></div>
      </div>`;
    this.paintFiltro();
    this.paintCorpo();
    this.carregarForecast();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  async carregarForecast() {
    const app = window.ResultadoCaixaApp;
    if (!app) return;
    const token = (this._fcToken = (this._fcToken || 0) + 1);
    try {
      const semForecast = !app.forecasts || !Object.keys(app.forecasts).length;
      const semAcervo = typeof app.temAcervo === "function" ? !app.temAcervo() : false;
      if (semForecast && semAcervo && typeof app.lerLocal === "function") app.lerLocal();
      if (typeof app.carregarNuvem === "function" && !app._nuvemOk) await app.carregarNuvem();
      if (typeof app.carregarForecasts === "function") await app.carregarForecasts();
      if (typeof app.normalizarForecastsMemoria === "function") app.normalizarForecastsMemoria();
      if (typeof app.montarVista === "function") app.montarVista();
    } catch (e) {}
    if (token !== this._fcToken) return;
    const body = document.getElementById("orc-imp-body");
    if (body) this.paintCorpo();
  },

  paintFiltro() {
    const box = document.getElementById("orc-imp-emp-box");
    if (!box || !window.MlEmpresaFilter) return;
    const items = OrcEst.empresas();
    box.innerHTML = MlEmpresaFilter.html({
      id: "orc-imp-emp",
      label: "Empresas",
      items,
      selectedIds: this.selectedCompanyIds.map(String),
      open: this.companyDropOpen,
      query: this.companyQuery,
      emptyMeansAll: true
    });
    MlEmpresaFilter.bind("orc-imp-emp", {
      toggleOpen: () => { this.companyDropOpen = !this.companyDropOpen; this.paintFiltro(); },
      setQuery: (q) => {
        this.companyQuery = q || "";
        const list = document.getElementById("orc-imp-emp-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-imp-emp",
            items,
            selectedIds: this.selectedCompanyIds,
            query: this.companyQuery
          });
        }
      },
      toggleId: (id, on) => {
        const sid = String(id);
        if (on) { if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid); }
        else this.selectedCompanyIds = this.selectedCompanyIds.filter((x) => x !== sid);
        this.companyDropOpen = true;
        this.paintFiltro();
        this.paintCorpo();
      },
      selectAll: () => {
        this.selectedCompanyIds = items.map((c) => c.id);
        this.companyDropOpen = true;
        this.paintFiltro();
        this.paintCorpo();
      },
      selectNone: () => {
        this.selectedCompanyIds = [];
        this.companyDropOpen = true;
        this.paintFiltro();
        this.paintCorpo();
      }
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  paintCorpo() {
    const body = document.getElementById("orc-imp-body");
    if (!body) return;
    const lista = this.lista();
    if (!lista.length) {
      body.innerHTML = `<div class="orc-dfc-erro">Não há receita de 2027 na base para estimar o imposto.</div>`;
      return;
    }
    const head = OrcEst.MESES.map((m) => `<th>${m}</th>`).join("") + `<th>Total 2027</th><th title="PIS e COFINS de dezembro e o trimestre de outubro a dezembro">JAN/28</th>`;
    const tot = Array(13).fill(0);
    const temTot = Array(13).fill(false);
    const linhas = lista.map((row) => {
      const pago = this.totalPago(row);
      for (let i = 0; i < 13; i++) {
        if (pago[i] == null) continue;
        temTot[i] = true;
        tot[i] += pago[i];
      }
      const chip = this.chip(row);
      const aberto = !!this.abertos[row.id];
      const nome = OrcEst.esc(row.id + " - " + OrcEst.norm(row.nome));
      const celulas = pago.slice(0, 12).map((v, i) => this.td(v, i === 0 ? "PIS e COFINS do forecast de dezembro de 2026 e trimestre de outubro a dezembro" : "")).join("");
      const extra = aberto ? this.detalhe(row) : "";
      return `<tr data-est-id="${OrcEst.esc(row.id)}" onclick="OrcamentoImpostosApp.toggle('${OrcEst.esc(row.id)}')">
        <td><i data-lucide="${aberto ? "chevron-down" : "chevron-right"}"></i>${nome} <span class="${chip.cls}">${chip.txt}</span></td>
        ${celulas}
        <td>${OrcEst.money(this.somaAte(pago, 12))}</td>
        <td>${this.tdTxt(pago[12])}</td>
      </tr>${extra}`;
    }).join("");
    const totCel = tot.slice(0, 12).map((v, i) => `<td>${temTot[i] ? OrcEst.money(v) : "—"}</td>`).join("");
    body.innerHTML = `
      <div class="orc-dfc-scroll">
        <table class="orc-dfc-table orc-est-table">
          <thead><tr><th>Imposto a pagar</th>${head}</tr></thead>
          <tbody>${linhas}</tbody>
          <tfoot><tr class="orc-dfc-formula"><td>Total</td>${totCel}<td>${OrcEst.money(this.somaAte(tot, 12))}</td><td>${OrcEst.money(tot[12])}</td></tr></tfoot>
        </table>
      </div>
      <p class="orc-est-nota">Janeiro de 2027 paga o PIS e a COFINS do forecast de dezembro de 2026 e o IRPJ e a CSLL do forecast de outubro a dezembro. Cada arquivo de forecast vale só para a competência em que foi enviado e fica salvo na nuvem. Sem o arquivo daquele mês, a parte correspondente continua em branco. A marca ao lado da empresa diz se a linha de 2027 fecha com esta conta.</p>`;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  td(v, title) {
    if (v == null) return `<td title="${OrcEst.esc(title)}">—</td>`;
    return `<td>${OrcEst.money(v)}</td>`;
  },

  tdTxt(v) {
    return OrcEst.money(v);
  },

  detalhe(row) {
    const linhas = [
      ["Vendas na competência", row.vendas, false],
      ["Serviços na competência", row.servicos, false],
      ["Aplicações na competência", row.financeiras, false],
      ["PIS a pagar", row.pagar.pis, true],
      ["COFINS a pagar", row.pagar.cofins, true],
      ["IRPJ a pagar", row.pagar.irpj, true],
      ["CSLL a pagar", row.pagar.csll, true]
    ];
    const corpo = linhas.map(([nome, arr, paga]) => {
      const cel = [];
      for (let i = 0; i < 12; i++) {
        const v = paga ? arr[i] : arr[i];
        cel.push(`<td>${paga && i === 0 && arr[0] == null ? "—" : OrcEst.money(v)}</td>`);
      }
      const ate2027 = paga ? this.somaAte(arr, 12) : arr.reduce((s, n) => s + n, 0);
      const jan28 = paga ? arr[12] : null;
      return `<tr class="orc-est-sub"><td>${nome}</td>${cel.join("")}<td>${OrcEst.money(ate2027)}</td><td>${paga ? OrcEst.money(jan28) : "—"}</td></tr>`;
    }).join("");
    const notas = [row.leitura.pis, row.leitura.cofins, row.leitura.irpj, row.leitura.csll]
      .map((l) => `<li class="${l.tem && l.fecha ? "orc-est-ok" : (l.tem ? "orc-est-alerta" : "")}">${OrcEst.esc(l.texto)}</li>`)
      .join("");
    return `<tr class="orc-est-det"><td colspan="15">
      <table class="orc-dfc-table orc-est-mini"><tbody>${corpo}</tbody></table>
      <ul class="orc-est-leituras">${notas}</ul>
    </td></tr>`;
  }
};

const OrcamentoRepassesApp = {
  selectedCompanyIds: [],
  companyDropOpen: false,
  companyQuery: "",
  abertos: {},

  grupoEntra(gid, sociedade) {
    if (!gid) return false;
    if (/^g_(02|06|07|08|10|11|12)($|_)/.test(gid)) return false;
    if (gid === "g_03") return false;
    if (!sociedade && /^g_(07)($|_)/.test(gid)) return false;
    return true;
  },

  obraDoCc(part, cc) {
    const digits = String(cc || "").replace(/\D/g, "");
    const prefix = digits.length >= 3 ? digits.slice(0, -2) : digits;
    return (part.obras || []).find((o) => {
      if (String(o.code || "") && String(o.code) === prefix) return true;
      return (o.costCenters || []).some((c) => String(c.id).replace(/\D/g, "") === digits);
    }) || null;
  },

  fator(part, obra, conta) {
    const app = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : (window.ParametrizacaoParceiroApp || null);
    if (!part || !obra) return 1;
    if (app && typeof app.partnershipAmountFactor === "function") {
      return app.partnershipAmountFactor(part, obra, conta);
    }
    if (part.kind === "sociedade") return 1;
    const pct = Number(obra.defaultPartnerShare) || 0;
    return pct / 100;
  },

  entraConta(part, obra, conta) {
    const app = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : (window.ParametrizacaoParceiroApp || null);
    if (!app || typeof app.accountEntersPartnership !== "function") return true;
    try { return app.accountEntersPartnership(part, obra, conta); }
    catch (e) { return true; }
  },

  calcular() {
    const impostos = OrcamentoImpostosApp.calcular(OrcEst.linhas());
    const ids = new Set(this.selectedCompanyIds.map(String));
    const linhas = OrcEst.linhas().filter((l) => !ids.size || ids.has(String(l.e)));
    const porEmpresa = new Map();
    linhas.forEach((l) => {
      const id = String(l.e || "");
      if (!porEmpresa.has(id)) porEmpresa.set(id, { id, nome: l.enome || "", linhas: [] });
      porEmpresa.get(id).linhas.push(l);
    });
    const pars = OrcEst.parcerias().filter((p) => !ids.size || ids.has(String(p.companyId)));
    const porParam = new Map();
    pars.forEach((p) => {
      const id = String(p.companyId || "");
      if (!id) return;
      const pack = porParam.get(id) || { itens: [] };
      pack.itens.push(p);
      porParam.set(id, pack);
    });
    const saida = [];
    const vistos = new Set();
    porEmpresa.forEach((emp, id) => {
      vistos.add(id);
      const item = this.montar(emp, (porParam.get(id) && porParam.get(id).itens) || [], impostos[id] || null);
      if (item) saida.push(item);
    });
    porParam.forEach((pack, id) => {
      if (vistos.has(id)) return;
      const nome = (pack.itens[0] && pack.itens[0].companyName) || "";
      const item = this.montar({ id, nome, linhas: [] }, pack.itens, impostos[id] || null);
      if (item) saida.push(item);
    });
    saida.sort((a, b) => Number(a.id) - Number(b.id));
    return saida;
  },

  montar(emp, itens, imposto) {
    const apurada = OrcEst.z();
    const apuradaCc = new Map();
    emp.linhas.forEach((l) => {
      const gid = OrcEst.grupo(l.conta, l.cn) || "";
      const nome = OrcEst.norm(l.cn);
      const eh = gid === "g_11_01" || String(l.conta) === "2.07.01" || (gid === "g_04_01" && /REPASSE|DISTRIBUICAO/.test(nome));
      if (!eh) return;
      (l.m || []).forEach((v, i) => {
        if (i > 11) return;
        const n = Math.abs(Number(v) || 0);
        apurada[i] += n;
        const cc = String(l.cc || "");
        const cur = apuradaCc.get(cc) || { id: cc, nome: l.en || "", m: OrcEst.z() };
        cur.m[i] += n;
        apuradaCc.set(cc, cur);
      });
    });
    const temApurada = apurada.some((v) => v >= 0.5);
    if (!itens.length && !temApurada) return null;

    const socios = [];
    const obras = [];
    itens.forEach((p) => {
      const kind = String(p.kind || "parceria");
      if (kind === "sociedade" || kind === "mista") {
        (p.socios || []).forEach((s) => {
          if (!s || !(Number(s.sharePct) > 0)) return;
          socios.push({ id: String(s.id || ""), nome: s.name || "Sócio", pct: Number(s.sharePct) || 0 });
        });
      }
      if (kind === "parceria" || kind === "mista") {
        (p.obras || []).forEach((o) => obras.push({ part: p, obra: o, nome: p.partnerName || "Parceiro" }));
      }
    });
    const kind = itens.some((p) => p.kind === "mista") ? "mista"
      : (itens.some((p) => p.kind === "sociedade") ? "sociedade"
        : (itens.length ? "parceria" : ""));

    const resultado = OrcEst.z();
    const parceiro = OrcEst.z();
    emp.linhas.forEach((l) => {
      const gid = OrcEst.grupo(l.conta, l.cn) || "";
      if (!this.grupoEntra(gid, kind === "sociedade" || kind === "mista")) return;
      const nome = OrcEst.norm(l.cn);
      if (/^PIS$|^COFINS$|^IRPJ$|^CSLL$/.test(nome)) return;
      const obrasDaLinha = (kind === "parceria" || kind === "mista")
        ? obras.filter((ob) => this.obraDoCc(ob.part, l.cc) === ob.obra && this.entraConta(ob.part, ob.obra, l.conta))
        : [];
      (l.m || []).forEach((v, i) => {
        if (i > 11) return;
        const s = OrcEst.sinal(gid, l.conta, l.cn, v);
        if (kind === "sociedade" || kind === "mista") resultado[i] += s;
        obrasDaLinha.forEach((ob) => { parceiro[i] += s * this.fator(ob.part, ob.obra, l.conta); });
      });
    });

    const impostoMes = OrcEst.z();
    if (imposto && (kind === "sociedade" || kind === "mista")) {
      for (let i = 0; i < 12; i++) {
        impostoMes[i] = (imposto.pis[i] || 0) + (imposto.cofins[i] || 0) + (imposto.irMes[i] || 0) + (imposto.csllMes[i] || 0);
      }
    }
    const pctSocios = socios.reduce((s, x) => s + x.pct, 0);
    const distSocios = OrcEst.z();
    const pessoas = socios.map((s) => ({ ...s, m: OrcEst.z() }));
    for (let i = 0; i < 12; i++) {
      const base = resultado[i] - (kind === "mista" ? Math.max(parceiro[i], 0) : 0) - impostoMes[i];
      const distribuivel = base > 0 ? base : 0;
      pessoas.forEach((p) => {
        p.m[i] = distribuivel * p.pct / 100;
        distSocios[i] += p.m[i];
      });
    }
    const pagarParc = parceiro.map((v) => (v > 0 ? v : 0));
    const pagar = OrcEst.z();
    for (let i = 0; i < 12; i++) pagar[i] = pagarParc[i] + distSocios[i];

    const leitura = this.lerApurada(kind, pagar, resultado, impostoMes, apurada, pctSocios);
    return {
      id: emp.id,
      nome: emp.nome,
      kind,
      itens: itens.length,
      socios: pessoas,
      pctSocios,
      resultado,
      impostoMes,
      parceiro: pagarParc,
      pagar,
      apurada,
      temApurada,
      leitura,
      semParam: !itens.length
    };
  },

  lerApurada(kind, pagar, resultado, impostoMes, apurada, pctSocios) {
    const tem = apurada.some((v) => v >= 0.5);
    if (!tem) {
      return { fecha: false, tem: false, texto: "O orçamento não traz linha de repasse nem de distribuição. O valor é a estimativa pela parametrização." };
    }
    const soma = (a) => a.reduce((s, n) => s + (Number(n) || 0), 0);
    const linha = soma(apurada);
    const est = soma(pagar);
    const bruto = soma(resultado.map((v, i) => (v > 0 ? v : 0)));
    const impostos = soma(impostoMes);
    if (!kind) {
      return { fecha: false, tem: true, texto: "Há linha de distribuição no orçamento (" + OrcEst.money(linha) + "), mas esta empresa não tem sócio nem parceiro parametrizado. Não dá para conferir o percentual." };
    }
    if (OrcEst.perto(linha, est)) {
      const extra = kind === "sociedade" || kind === "mista"
        ? " Os impostos da competência já estão abatidos da distribuição."
        : "";
      return { fecha: true, tem: true, texto: "A linha apurada fecha com o cálculo." + extra };
    }
    const liquidoCheio = soma(resultado.map((v, i) => {
      const b = v - impostoMes[i];
      return b > 0 ? b : 0;
    }));
    if ((kind === "sociedade" || kind === "mista") && pctSocios > 0 && OrcEst.perto(linha, liquidoCheio * pctSocios / 100) === false && OrcEst.perto(linha, bruto * (pctSocios / 100))) {
      return { fecha: false, tem: true, texto: "A linha apurada (" + OrcEst.money(linha) + ") se aproxima do resultado bruto, sem abater os impostos (" + OrcEst.money(impostos) + "). A distribuição dos sócios sai líquida: " + OrcEst.money(est) + "." };
    }
    return {
      fecha: false, tem: true,
      texto: "A linha apurada (" + OrcEst.money(linha) + ") não fecha com a estimativa (" + OrcEst.money(est) + ")."
    };
  },

  toggle(id) {
    this.abertos[id] = !this.abertos[id];
    this.paintCorpo();
  },

  render(root) {
    root.innerHTML = `
      <div class="orc-est-page">
        ${typeof OrcamentoApp !== "undefined" ? OrcamentoApp.abasHtml() : ""}
        <p class="orc-dfc-lead">Repasse de 2027 pela parametrização de sócios e parceiros. Na parceria, o percentual incide sobre o resultado das contas que entram no rateio. Na sociedade, o imposto da competência sai antes da distribuição. Quando o orçamento já traz a linha, a tela diz se o valor fecha.</p>
        <div class="orc-dfc-tools">
          <div id="orc-rep-emp-box"></div>
        </div>
        <div id="orc-rep-body"></div>
      </div>`;
    this.paintFiltro();
    this.paintCorpo();
    this.garantirParams();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  garantirParams() {
    const app = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : null;
    if (!app || this._pedido || (app.items && app.items.length)) return;
    if (typeof app.loadItems !== "function") return;
    this._pedido = true;
    Promise.resolve(app.loadItems()).then(() => {
      this._pedido = false;
      if (document.getElementById("orc-rep-body")) this.paintCorpo();
    }).catch(() => { this._pedido = false; });
  },

  paintFiltro() {
    const box = document.getElementById("orc-rep-emp-box");
    if (!box || !window.MlEmpresaFilter) return;
    const items = OrcEst.empresas();
    box.innerHTML = MlEmpresaFilter.html({
      id: "orc-rep-emp",
      label: "Empresas",
      items,
      selectedIds: this.selectedCompanyIds.map(String),
      open: this.companyDropOpen,
      query: this.companyQuery,
      emptyMeansAll: true
    });
    MlEmpresaFilter.bind("orc-rep-emp", {
      toggleOpen: () => { this.companyDropOpen = !this.companyDropOpen; this.paintFiltro(); },
      setQuery: (q) => {
        this.companyQuery = q || "";
        const list = document.getElementById("orc-rep-emp-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-rep-emp",
            items,
            selectedIds: this.selectedCompanyIds,
            query: this.companyQuery
          });
        }
      },
      toggleId: (id, on) => {
        const sid = String(id);
        if (on) { if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid); }
        else this.selectedCompanyIds = this.selectedCompanyIds.filter((x) => x !== sid);
        this.companyDropOpen = true;
        this.paintFiltro();
        this.paintCorpo();
      },
      selectAll: () => {
        this.selectedCompanyIds = items.map((c) => c.id);
        this.companyDropOpen = true;
        this.paintFiltro();
        this.paintCorpo();
      },
      selectNone: () => {
        this.selectedCompanyIds = [];
        this.companyDropOpen = true;
        this.paintFiltro();
        this.paintCorpo();
      }
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  paintCorpo() {
    const body = document.getElementById("orc-rep-body");
    if (!body) return;
    const lista = this.calcular();
    if (!lista.length) {
      body.innerHTML = `<div class="orc-dfc-erro">Não há parametrização de sócio ou parceiro nem linha de distribuição neste orçamento.</div>`;
      return;
    }
    const head = OrcEst.MESES.map((m) => `<th>${m}</th>`).join("") + `<th>Total 2027</th>`;
    const tot = OrcEst.z();
    const linhas = lista.map((row) => {
      row.pagar.forEach((v, i) => { tot[i] += v; });
      const aberto = !!this.abertos[row.id];
      const chip = row.semParam
        ? { cls: "orc-est-alerta", txt: "sem parametrização" }
        : (row.leitura.fecha ? { cls: "orc-est-ok", txt: "linha confere" }
          : (row.leitura.tem ? { cls: "orc-est-alerta", txt: "rever a linha" } : { cls: "orc-est-mudo", txt: "sem linha no orçamento" }));
      const rotulo = row.kind === "sociedade" ? "Sociedade" : (row.kind === "mista" ? "Mista" : (row.kind === "parceria" ? "Parceria" : "Sem cadastro"));
      const cel = row.pagar.map((v) => `<td>${OrcEst.money(v)}</td>`).join("");
      const extra = aberto ? this.detalhe(row) : "";
      return `<tr data-est-id="${OrcEst.esc(row.id)}" onclick="OrcamentoRepassesApp.toggle('${OrcEst.esc(row.id)}')">
        <td><i data-lucide="${aberto ? "chevron-down" : "chevron-right"}"></i>${OrcEst.esc(row.id + " - " + OrcEst.norm(row.nome))} <span class="orc-est-tipo">${rotulo}</span> <span class="${chip.cls}">${chip.txt}</span></td>
        ${cel}
        <td>${OrcEst.money(row.pagar.reduce((s, n) => s + n, 0))}</td>
      </tr>${extra}`;
    }).join("");
    body.innerHTML = `
      <div class="orc-dfc-scroll">
        <table class="orc-dfc-table orc-est-table">
          <thead><tr><th>Repasse a pagar</th>${head}</tr></thead>
          <tbody>${linhas}</tbody>
          <tfoot><tr class="orc-dfc-formula"><td>Total</td>${tot.map((v) => `<td>${OrcEst.money(v)}</td>`).join("")}<td>${OrcEst.money(tot.reduce((s, n) => s + n, 0))}</td></tr></tfoot>
        </table>
      </div>
      <p class="orc-est-nota">Sociedade: o PIS, a COFINS e o IRPJ/CSLL da competência saem do resultado antes de aplicar o percentual do sócio. O pagamento do imposto continua no mês seguinte e no trimestre, mas o abatimento da distribuição usa o mês em que a receita aconteceu.</p>`;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  detalhe(row) {
    const linha = (nome, arr) => `<tr class="orc-est-sub"><td>${OrcEst.esc(nome)}</td>${arr.map((v) => `<td>${OrcEst.money(v)}</td>`).join("")}<td>${OrcEst.money(arr.reduce((s, n) => s + (Number(n) || 0), 0))}</td></tr>`;
    let corpo = "";
    if (row.kind === "parceria" || row.kind === "mista") corpo += linha("Parceiro", row.parceiro);
    if (row.kind === "sociedade" || row.kind === "mista") {
      corpo += linha("Resultado antes do imposto", row.resultado);
      corpo += linha("Impostos abatidos", row.impostoMes.map((v) => -v));
      row.socios.forEach((s) => { corpo += linha(s.nome + " · " + String(s.pct).replace(".", ",") + "%", s.m); });
    }
    if (row.temApurada) corpo += linha("Linha do orçamento", row.apurada);
    const avisoPct = (row.kind === "sociedade" || row.kind === "mista") && row.socios.length && Math.abs(row.pctSocios - 100) > 0.05
      ? `<li class="orc-est-alerta">As participações dos sócios somam ${String(row.pctSocios.toFixed(2)).replace(".", ",")}%, não 100%.</li>`
      : "";
    return `<tr class="orc-est-det"><td colspan="14">
      <table class="orc-dfc-table orc-est-mini"><tbody>${corpo}</tbody></table>
      <ul class="orc-est-leituras"><li class="${row.leitura.fecha ? "orc-est-ok" : (row.leitura.tem ? "orc-est-alerta" : "")}">${OrcEst.esc(row.leitura.texto)}</li>${avisoPct}</ul>
    </td></tr>`;
  }
};
