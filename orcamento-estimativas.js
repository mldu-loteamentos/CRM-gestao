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

  montarIndice() {
    const grupo = new Map();
    const tag = new Map();
    const ignored = new Set();
    const app = typeof OrcamentoDfcApp !== "undefined" ? OrcamentoDfcApp : null;
    const visao = app && typeof app.visaoDfc === "function" ? (app.visaoDfc() || { groups: [] }) : { groups: [] };
    (visao.ignoredAccounts || []).forEach((id) => {
      const sid = String(id || "").trim();
      if (!sid) return;
      ignored.add(sid);
      const nk = sid.replace(/\D/g, "");
      if (nk) ignored.add(nk);
    });
    (visao.groups || []).forEach((g) => {
      if (!g || g.type !== "resultado") return;
      (g.accounts || []).forEach((id) => {
        const sid = String(id || "").trim();
        const nk = sid.replace(/\D/g, "");
        if (sid) grupo.set(sid, g.id);
        if (nk) grupo.set(nk, g.id);
      });
    });
    const cfg = this.taxConfig();
    Object.keys(cfg || {}).forEach((k) => {
      const sid = String(k || "").trim();
      const nk = sid.replace(/\D/g, "");
      if (sid) tag.set(sid, cfg[k]);
      if (nk) tag.set(nk, cfg[k]);
    });
    this._ind = { grupo: grupo, tag: tag, ignored: ignored, sugestao: new Map() };
    return this._ind;
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
    if (!this._ind) this.montarIndice();
    const ind = this._ind;
    const dotted = String(conta || "").trim();
    const key = dotted.replace(/\D/g, "");
    if (!dotted) return null;
    if (ind.ignored.has(dotted) || (key && ind.ignored.has(key))) return null;
    if (ind.grupo.has(dotted)) return ind.grupo.get(dotted);
    if (key && ind.grupo.has(key)) return ind.grupo.get(key);
    const cache = key || dotted;
    if (ind.sugestao.has(cache)) return ind.sugestao.get(cache) || null;
    const plano = typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null;
    const achado = plano && typeof plano.suggestGroup === "function" ? plano.suggestGroup({ id: dotted, name: nome }) : null;
    ind.sugestao.set(cache, achado || "");
    return achado || null;
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
    if (this._ind) {
      const nk = sid.replace(/\D/g, "");
      return this._ind.tag.get(sid) || (nk && this._ind.tag.get(nk)) || "";
    }
    if (cfg && cfg[sid]) return cfg[sid];
    const nk = sid.replace(/\D/g, "");
    const hit = Object.keys(cfg || {}).find((k) => String(k).replace(/\D/g, "") === nk);
    return hit ? cfg[hit] : "";
  },

  /* Centro de parceiro, ou com "Imposto pago pela empresa?" desmarcado, fica fora da base. */
  centroImposto(ccId, ccNome) {
    const dig = String(ccId == null ? "" : ccId).replace(/\D/g, "");
    const lista = (window.CentrosCustoState && CentrosCustoState.costCenters) || [];
    const cc = dig ? lista.find((c) => String(c.id).replace(/\D/g, "") === dig) : null;
    const nome = (cc && cc.name) || ccNome || "";
    const app = window.CentrosCustoApp;
    if (app && cc && typeof app.isCorporativo === "function" && app.isCorporativo(cc)) return { entra: true, nome: nome };
    if (app && cc && typeof app.isParceiro === "function" && app.isParceiro(cc)) return { entra: false, nome: nome };
    const fiscal = window.FiscalApp;
    const custom = fiscal && typeof fiscal.customCc === "function" ? (fiscal.customCc(dig || ccId) || {}) : {};
    const tipo = String((custom && custom.tipo_cc) || "");
    if (tipo === "Corporativo") return { entra: true, nome: nome };
    if (/parce(ir|ri)/i.test(String(nome || "")) && tipo !== "Corporativo") return { entra: false, nome: nome };
    if (custom && Object.prototype.hasOwnProperty.call(custom, "imposto_pago_empresa")) {
      return { entra: custom.imposto_pago_empresa === true, nome: nome };
    }
    return { entra: true, nome: nome };
  },

  /* SPE 36 recolhe sobre a receita inteira. O flag do parceiro não tira o centro da base. */
  empresaReceitaInteira(empresa) {
    return String(empresa == null ? "" : empresa).replace(/\D/g, "") === "36";
  },

  entraNoImposto(ccId, ccNome, empresa) {
    if (this.empresaReceitaInteira(empresa)) return true;
    return this.centroImposto(ccId, ccNome).entra;
  },

  /* Conta de classe 2, ou com nome de desconto/cancelamento, reduz a base em que foi parametrizada. */
  contaRedutora(conta, nome, gid, marca, bucket) {
    const fluxo = typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : (window.FluxoCaixaApp || null);
    if (fluxo && typeof fluxo.isDescontoFolhaAccount === "function" && fluxo.isDescontoFolhaAccount(conta, nome)) return false;
    if (marca === "Base de Dedução" || gid === "g_01_04") return true;
    const nodeId = gid || (bucket === "vendas" ? "g_01_01" : (bucket === "servicos" ? "g_01_02" : (bucket === "financeiras" ? "g_09_01" : "")));
    const node = { id: nodeId, redutora: nodeId === "g_01_04" || nodeId === "g_11_01" };
    if (fluxo && typeof fluxo.isReducingAccount === "function" && fluxo.isReducingAccount(conta, nome, node)) return true;
    const classe2 = String(conta || "").replace(/\D/g, "").charAt(0) === "2";
    const baseReceita = marca === "Base para Vendas de Lote" || marca === "Base para Receita de Serviços" || marca === "Base para Aplicações Financeiras";
    return !!(classe2 && baseReceita);
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
    let bucket = "";
    if (String(l.e || "") === "3" && String(l.conta || "").replace(/\D/g, "") === "1020102") bucket = "vendas";
    else if (tag === "Base para Vendas de Lote" || /DESCONTO DE JUROS CONTRAT/.test(nome) || String(l.conta || "").replace(/\D/g, "") === "2050103") bucket = "vendas";
    else if (tag === "Base para Receita de Serviços") bucket = "servicos";
    else if (tag === "Base para Aplicações Financeiras") bucket = "financeiras";
    else if (tag === "Base de Dedução") bucket = gid === "g_01_02" ? "servicos" : (gid === "g_01_03" || gid === "g_09_01" ? "financeiras" : "vendas");
    else if (fora) return null;
    else if (gid === "g_01_01" || gid === "g_01_04") bucket = "vendas";
    else if (gid === "g_01_02") bucket = "servicos";
    else if (gid === "g_09_01") bucket = "financeiras";
    else if (gid === "g_01_03" && /JUROS|RENDIMENTO|APLICAC/.test(nome)) bucket = "financeiras";
    else return null;
    return { bucket: bucket, red: this.contaRedutora(l.conta, l.cn, gid, tag, bucket) };
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
    OrcEst.montarIndice();
    const cfg = OrcEst.taxConfig();
    const prev = this.bases2026();
    const emp = {};
    const garantir = (id, nome) => {
      if (!emp[id]) {
        emp[id] = {
          id, nome: nome || "",
          vendas: OrcEst.z(), servicos: OrcEst.z(), financeiras: OrcEst.z(),
          redV: OrcEst.z(), redS: OrcEst.z(), redF: OrcEst.z(),
          pis: OrcEst.z(), cofins: OrcEst.z(), irMes: OrcEst.z(), csllMes: OrcEst.z(),
          ap: { pis: OrcEst.z(), cofins: OrcEst.z(), irpj: OrcEst.z(), csll: OrcEst.z() }
        };
      } else if (nome && !emp[id].nome) emp[id].nome = nome;
      return emp[id];
    };
    (linhas || OrcEst.linhas()).forEach((l) => {
      const id = String(l.e || "");
      if (!id) return;
      if (!OrcEst.entraNoImposto(l.cc, l.en, id)) return;
      const row = garantir(id, l.enome);
      const tipo = OrcEst.tipoApurado(l);
      if (tipo) {
        (l.m || []).forEach((v, i) => { if (i < 12) row.ap[tipo][i] += Math.abs(Number(v) || 0); });
        return;
      }
      const cl = OrcEst.classe(l, cfg);
      if (!cl) return;
      const gid = OrcEst.grupo(l.conta, l.cn);
      (l.m || []).forEach((v, i) => {
        if (i > 11) return;
        let s = OrcEst.sinal(gid, l.conta, l.cn, v);
        if (cl.red && s > 0) s = -Math.abs(s);
        row[cl.bucket][i] += s;
        if (cl.red && s) {
          const chave = cl.bucket === "servicos" ? "redS" : (cl.bucket === "financeiras" ? "redF" : "redV");
          row[chave][i] += s;
        }
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
      this.aplicarJaneiro(row, prev, ali);
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
    const out = {};
    if (app && typeof app.basesForecast === "function") {
      ["2026-10", "2026-11", "2026-12"].forEach((ym) => {
        const bag = app.basesForecast(ym);
        if (bag) out[ym] = bag;
      });
    }
    this.baseCarteira21(out);
    return out;
  },

  /* A empresa 21 não está no forecast de caixa. Outubro a dezembro de 2026 vêm da carteira enviada. */
  baseCarteira21(out) {
    const linhas = (window.ORCAMENTO_RECEITA_2026 && window.ORCAMENTO_RECEITA_2026.lines) || [];
    [["2026-10", 9], ["2026-11", 10], ["2026-12", 11]].forEach((par) => {
      const ym = par[0];
      const idx = par[1];
      const ja = out[ym] && out[ym][21] && (Number(out[ym][21].vendas) || 0) > 0;
      if (ja) return;
      let vendas = 0;
      linhas.forEach((l) => {
        if (String(l.e) !== "21") return;
        vendas += Number(l.m && l.m[idx]) || 0;
      });
      if (!(vendas > 0)) return;
      if (!out[ym]) out[ym] = {};
      out[ym][21] = { vendas: vendas, servicos: 0, financeiras: 0, redV: 0, redS: 0, redF: 0 };
    });
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

  aplicarJaneiro(row, prev, ali) {
    prev = prev || {};
    ali = ali || OrcEst.aliquotas();
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
    const ids = this.selectedCompanyIds.map(String).join(",");
    const stamp = OrcEst.linhas().length + "|" + ids + "|" + (this._fcToken || 0);
    if (this._stamp === stamp && this._rows) return this._rows;
    const mapa = this.calcular(this.escopo());
    const rows = Object.values(mapa)
      .filter((r) => r.vendas.some((v) => Math.abs(v) >= 0.5) || r.servicos.some((v) => Math.abs(v) >= 0.5) || r.financeiras.some((v) => Math.abs(v) >= 0.5) || r.ap.pis.some((v) => v >= 0.5))
      .sort((a, b) => Number(a.id) - Number(b.id));
    this._rows = rows;
    this._stamp = stamp;
    return rows;
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
      <div class="orc-est-page orc-imp-page">
        ${typeof OrcamentoApp !== "undefined" ? OrcamentoApp.abasHtml() : ""}
        <p class="orc-dfc-lead">PIS e COFINS da receita do mês pagam no mês seguinte. IRPJ e CSLL do trimestre pagam no mês seguinte ao trimestre.</p>
        <div class="orc-dfc-tools">
          <div id="orc-imp-emp-box"></div>
          <button type="button" class="btn btn-excel" id="orc-imp-excel" title="Exportar tabela atual para Excel"><i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel</button>
        </div>
        <div id="orc-imp-body"></div>
      </div>`;
    this.paintFiltro();
    this.paintCorpo();
    const excelBtn = document.getElementById("orc-imp-excel");
    if (excelBtn) excelBtn.addEventListener("click", () => this.exportExcel());
    this.carregarForecast();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  async carregarForecast() {
    const app = window.ResultadoCaixaApp;
    if (!app) return;
    const token = (this._fcToken = (this._fcToken || 0) + 1);
    try {
      const semForecast = !app.forecasts || !Object.keys(app.forecasts).length;
      if (semForecast && typeof app.lerLocal === "function") app.lerLocal();
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
    const head = OrcEst.MESES.map((m) => `<th>${m}</th>`).join("") + `<th>Total</th><th title="PIS e COFINS de dezembro e o trimestre de outubro a dezembro">Jan/28</th>`;
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
      const nomeCheio = row.id + " - " + OrcEst.norm(row.nome);
      const nome = OrcEst.esc(nomeCheio);
      const id = OrcEst.esc(row.id);
      const celulas = pago.slice(0, 12).map((v, i) => this.cel(v, row.id, this.memoriaPago(row, i))).join("");
      const det = aberto ? `<tr class="orc-imp-det-row"><td colspan="15">${this.detalhe(row)}</td></tr>` : "";
      return `<tr class="${aberto ? "is-open" : ""}">
        <td class="orc-imp-nome" data-est-id="${id}" title="${nome}"><i data-lucide="${aberto ? "chevron-down" : "chevron-right"}"></i><span>${nome}</span><small class="${chip.cls}">${chip.txt}</small></td>
        ${celulas}
        <td data-est-id="${id}" title="${OrcEst.esc(OrcEst.money(this.somaAte(pago, 12)))}">${this.moneyGrade(this.somaAte(pago, 12))}</td>
        <td data-est-id="${id}" title="${OrcEst.esc(OrcEst.money(pago[12]))}">${this.moneyGrade(pago[12])}</td>
      </tr>${det}`;
    }).join("");
    const totCel = tot.slice(0, 12).map((v, i) => `<td title="${temTot[i] ? OrcEst.esc(OrcEst.money(v)) : ""}">${temTot[i] ? this.moneyGrade(v) : "—"}</td>`).join("");
    body.innerHTML = `
      <div class="orc-imp-scroll">
        <table class="orc-imp-tab">
          <colgroup><col class="orc-imp-c-nome">${OrcEst.MESES.map(() => "<col>").join("")}<col><col></colgroup>
          <thead><tr><th>Imposto a pagar</th>${head}</tr></thead>
          <tbody>${linhas}</tbody>
          <tfoot><tr>
            <td>Total</td>${totCel}
            <td title="${OrcEst.esc(OrcEst.money(this.somaAte(tot, 12)))}">${this.moneyGrade(this.somaAte(tot, 12))}</td>
            <td title="${OrcEst.esc(OrcEst.money(tot[12]))}">${this.moneyGrade(tot[12])}</td>
          </tr></tfoot>
        </table>
      </div>
      <p class="orc-est-nota">Janeiro de 2027 usa o forecast de 2026. Receita de centro de custo de parceiro, e de centro com o imposto desmarcado, fica de fora. Na SPE 36, o imposto incide sobre a receita inteira: a parte do parceiro entra na base. A taxa de cessão entra na venda de lotes quando o plano marca essa conta nessa base. Na empresa 3, a administração de carteira de recebíveis entra na venda de lotes. A coluna Vendas é a receita integral. As redutoras ficam à parte e entram abatidas na base do imposto. Passe o mouse no valor para ver a conta do PIS, do COFINS, do IRPJ e da CSLL.</p>`;
    const tab = body.querySelector(".orc-imp-tab");
    if (tab) tab.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-est-id]");
      if (!el || !tab.contains(el) || el.closest(".orc-imp-det-row")) return;
      this.toggle(el.getAttribute("data-est-id"));
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  cel(v, id, title) {
    const cheio = v == null ? "" : OrcEst.money(v);
    const dica = title ? (cheio ? cheio + "\n" + title : title) : cheio;
    const texto = v == null ? "—" : this.moneyGrade(v);
    return `<td data-est-id="${OrcEst.esc(id)}" title="${OrcEst.esc(dica).replace(/\n/g, "&#10;")}">${texto}</td>`;
  },

  vendaIntegral(liquido, red) {
    return (Number(liquido) || 0) - (Number(red) || 0);
  },

  aliTxt(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  },

  baseMes(row, i) {
    return {
      vendas: row.vendas[i] || 0,
      servicos: row.servicos[i] || 0,
      financeiras: row.financeiras[i] || 0,
      redV: row.redV[i] || 0,
      redS: row.redS[i] || 0,
      redF: row.redF[i] || 0
    };
  },

  somarBases(bases) {
    const acc = { vendas: 0, servicos: 0, financeiras: 0, redV: 0, redS: 0, redF: 0 };
    (bases || []).forEach((b) => {
      if (!b) return;
      acc.vendas += Number(b.vendas) || 0;
      acc.servicos += Number(b.servicos) || 0;
      acc.financeiras += Number(b.financeiras) || 0;
      acc.redV += Number(b.redV) || 0;
      acc.redS += Number(b.redS) || 0;
      acc.redF += Number(b.redF) || 0;
    });
    return acc;
  },

  linhasReceita(b) {
    const mo = (v) => OrcEst.money(v);
    const linhas = [];
    linhas.push("Vendas " + mo(this.vendaIntegral(b.vendas, b.redV)));
    if (Math.abs(Number(b.redV) || 0) >= 0.5) linhas.push("Redutoras " + mo(b.redV));
    linhas.push("Base de vendas " + mo(b.vendas));
    if (Math.abs(Number(b.servicos) || 0) >= 0.5 || Math.abs(Number(b.redS) || 0) >= 0.5) {
      if (Math.abs(Number(b.redS) || 0) >= 0.5) {
        linhas.push("Serviços " + mo(this.vendaIntegral(b.servicos, b.redS)));
        linhas.push("Red. serviços " + mo(b.redS));
      }
      linhas.push("Base de serviços " + mo(b.servicos));
    }
    if (Math.abs(Number(b.financeiras) || 0) >= 0.5 || Math.abs(Number(b.redF) || 0) >= 0.5) {
      if (Math.abs(Number(b.redF) || 0) >= 0.5) {
        linhas.push("Aplicações " + mo(this.vendaIntegral(b.financeiras, b.redF)));
        linhas.push("Red. aplicações " + mo(b.redF));
      }
      linhas.push("Base de aplicações " + mo(b.financeiras));
    }
    return linhas;
  },

  basePisDe(b, ali) {
    return (Number(b.vendas) || 0) + (Number(b.servicos) || 0) + (ali.financNoPis ? (Number(b.financeiras) || 0) : 0);
  },

  memoriaPis(ali, b, rotulo, pagoEm) {
    const mo = (v) => OrcEst.money(v);
    const base = this.basePisDe(b, ali);
    const pis = base > 0 ? base * ali.pis / 100 : 0;
    const linhas = ["PIS de " + rotulo + (pagoEm ? ", pago em " + pagoEm : "")];
    linhas.push.apply(linhas, this.linhasReceita(b));
    if (!ali.financNoPis && Math.abs(Number(b.financeiras) || 0) >= 0.5) linhas.push("Aplicações não entram no PIS.");
    linhas.push("Base do PIS " + mo(base) + " × " + this.aliTxt(ali.pis) + " = " + mo(pis));
    return linhas;
  },

  memoriaCofins(ali, b, rotulo, pagoEm) {
    const mo = (v) => OrcEst.money(v);
    const base = this.basePisDe(b, ali);
    const cofins = base > 0 ? base * ali.cofins / 100 : 0;
    const linhas = ["COFINS de " + rotulo + (pagoEm ? ", pago em " + pagoEm : "")];
    linhas.push.apply(linhas, this.linhasReceita(b));
    if (!ali.financNoPis && Math.abs(Number(b.financeiras) || 0) >= 0.5) linhas.push("Aplicações não entram no COFINS.");
    linhas.push("Base do COFINS " + mo(base) + " × " + this.aliTxt(ali.cofins) + " = " + mo(cofins));
    return linhas;
  },

  memoriaIrpj(ali, bases, rotulo, pagoEm) {
    const b = this.somarBases(bases);
    const mo = (v) => OrcEst.money(v);
    const presV = (Number(b.vendas) || 0) * ali.vendasIrpj / 100;
    const presS = (Number(b.servicos) || 0) * ali.servicosIrpj / 100;
    const presF = (Number(b.financeiras) || 0) * ali.financIrpj / 100;
    const lucro = presV + presS + presF;
    const limite = (Number(ali.limiteMensal) || 0) * 3;
    const ir = lucro > 0 ? lucro * ali.irpj / 100 : 0;
    const ad = lucro > limite ? (lucro - limite) * ali.adicional / 100 : 0;
    const linhas = ["IRPJ de " + rotulo + (pagoEm ? ", pago em " + pagoEm : "")];
    linhas.push.apply(linhas, this.linhasReceita(b));
    linhas.push("Vendas × " + this.aliTxt(ali.vendasIrpj) + " = " + mo(presV));
    if (Math.abs(b.servicos) >= 0.5) linhas.push("Serviços × " + this.aliTxt(ali.servicosIrpj) + " = " + mo(presS));
    if (Math.abs(b.financeiras) >= 0.5) linhas.push("Aplicações × " + this.aliTxt(ali.financIrpj) + " = " + mo(presF));
    linhas.push("Lucro presumido " + mo(lucro));
    linhas.push("IRPJ " + this.aliTxt(ali.irpj) + " = " + mo(ir));
    if (ad >= 0.5) linhas.push("Adicional " + this.aliTxt(ali.adicional) + " sobre " + mo(lucro - limite) + " acima de " + mo(limite) + " = " + mo(ad));
    else linhas.push("Sem adicional. O lucro do trimestre não passa de " + mo(limite) + ".");
    linhas.push("IRPJ " + mo(ir + ad));
    return linhas;
  },

  memoriaCsll(ali, bases, rotulo, pagoEm) {
    const b = this.somarBases(bases);
    const mo = (v) => OrcEst.money(v);
    const presV = (Number(b.vendas) || 0) * ali.vendasCsll / 100;
    const presS = (Number(b.servicos) || 0) * ali.servicosCsll / 100;
    const presF = (Number(b.financeiras) || 0) * ali.financCsll / 100;
    const lucro = presV + presS + presF;
    const csll = lucro > 0 ? lucro * ali.csll / 100 : 0;
    const linhas = ["CSLL de " + rotulo + (pagoEm ? ", pago em " + pagoEm : "")];
    linhas.push.apply(linhas, this.linhasReceita(b));
    linhas.push("Vendas × " + this.aliTxt(ali.vendasCsll) + " = " + mo(presV));
    if (Math.abs(b.servicos) >= 0.5) linhas.push("Serviços × " + this.aliTxt(ali.servicosCsll) + " = " + mo(presS));
    if (Math.abs(b.financeiras) >= 0.5) linhas.push("Aplicações × " + this.aliTxt(ali.financCsll) + " = " + mo(presF));
    linhas.push("Lucro presumido " + mo(lucro));
    linhas.push("CSLL " + this.aliTxt(ali.csll) + " = " + mo(csll));
    return linhas;
  },

  memoriaPago(row, i) {
    const ali = OrcEst.aliquotas();
    const curtos = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const pagos = ["janeiro/2027", "fevereiro/2027", "março/2027", "abril/2027", "maio/2027", "junho/2027", "julho/2027", "agosto/2027", "setembro/2027", "outubro/2027", "novembro/2027", "dezembro/2027", "janeiro/2028"];
    const partes = ["Pago em " + pagos[i] + ": " + OrcEst.money(this.totalPago(row)[i])];
    if (i === 0) {
      const dez = this.baseForecastMes(row, "2026-12");
      if (dez) {
        partes.push(this.memoriaPis(ali, dez, "dez/2026", "jan/2027").join("\n"));
        partes.push(this.memoriaCofins(ali, dez, "dez/2026", "jan/2027").join("\n"));
      }
      const tri = this.basesForecastTri(row);
      if (tri.some(Boolean)) {
        partes.push(this.memoriaIrpj(ali, tri, "out–dez/2026", "jan/2027").join("\n"));
        partes.push(this.memoriaCsll(ali, tri, "out–dez/2026", "jan/2027").join("\n"));
      }
    } else if (i >= 1 && i <= 12) {
      const mes = i - 1;
      const pago = i < 12 ? curtos[i] + "/2027" : "jan/2028";
      partes.push(this.memoriaPis(ali, this.baseMes(row, mes), curtos[mes] + "/2027", pago).join("\n"));
      partes.push(this.memoriaCofins(ali, this.baseMes(row, mes), curtos[mes] + "/2027", pago).join("\n"));
      const triIdx = { 3: 0, 6: 1, 9: 2, 12: 3 }[i];
      if (triIdx != null) {
        const rotulos = ["jan–mar/2027", "abr–jun/2027", "jul–set/2027", "out–dez/2027"];
        const bases = [0, 1, 2].map((k) => this.baseMes(row, triIdx * 3 + k));
        partes.push(this.memoriaIrpj(ali, bases, rotulos[triIdx], pago).join("\n"));
        partes.push(this.memoriaCsll(ali, bases, rotulos[triIdx], pago).join("\n"));
      }
    }
    return partes.join("\n\n");
  },

  baseForecastMes(row, ym) {
    const prev = this.bases2026();
    return (prev[ym] && prev[ym][Number(row.id)]) || null;
  },

  basesForecastTri(row) {
    return ["2026-10", "2026-11", "2026-12"].map((ym) => this.baseForecastMes(row, ym));
  },

  moneyGrade(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || Math.abs(n) < 0.005) return "—";
    const abs = Math.abs(n);
    const texto = abs >= 100
      ? Math.round(abs).toLocaleString("pt-BR")
      : abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? "-" + texto : texto;
  },

  detalhe(row) {
    const mo = (v) => OrcEst.money(v);
    const tem = (arr) => (arr || []).some((v) => Math.abs(Number(v) || 0) >= 0.5);
    const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const pagoEm = ["Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez", "Jan/28"];
    const ali = OrcEst.aliquotas();
    const dez = this.baseForecastMes(row, "2026-12");
    const cols = [{ nome: "Vendas", arr: row.vendas.map((v, i) => this.vendaIntegral(v, row.redV[i])), dez: dez ? this.vendaIntegral(dez.vendas, dez.redV) : null, dica: "Receita integral, antes das redutoras." }];
    if (tem(row.redV) || (dez && Math.abs(Number(dez.redV) || 0) >= 0.5)) cols.push({ nome: "Redutoras", arr: row.redV, dez: dez ? dez.redV : null, dica: "Distratos e as outras contas redutoras. Ficam fora da coluna Vendas e entram abatidas na base do imposto." });
    cols.push({ nome: "Serviços", arr: row.servicos, dez: dez && dez.servicos });
    if (tem(row.redS) || (dez && Math.abs(Number(dez.redS) || 0) >= 0.5)) cols.push({ nome: "Red. serviços", arr: row.redS, dez: dez ? dez.redS : null });
    if (tem(row.financeiras) || tem(row.redF)) cols.push({ nome: "Aplicações", arr: row.financeiras, dez: dez && dez.financeiras });
    if (tem(row.redF) || (dez && Math.abs(Number(dez.redF) || 0) >= 0.5)) cols.push({ nome: "Red. aplicações", arr: row.redF, dez: dez ? dez.redF : null });
    const head = `<th>Competência</th>${cols.map((c) => `<th${c.dica ? ` title="${OrcEst.esc(c.dica)}"` : ""}>${c.nome}</th>`).join("")}<th>PIS</th><th>COFINS</th><th>Pago em</th>`;
    const celTxt = (valor, linhas) => {
      const dica = linhas && linhas.length ? ` title="${linhas.map((l) => OrcEst.esc(l)).join("&#10;")}" style="cursor:help"` : "";
      return `<td${dica}>${mo(valor)}</td>`;
    };
    const celBase = (c, i) => celTxt(i == null ? c.dez : c.arr[i]);
    const linhaMes = (rotulo, i, pis, cofins, quando) => {
      const base = i == null ? dez : this.baseMes(row, i);
      const memP = base ? this.memoriaPis(ali, base, rotulo, quando) : [];
      const memC = base ? this.memoriaCofins(ali, base, rotulo, quando) : [];
      return `<tr><td>${rotulo}</td>${cols.map((c) => celBase(c, i)).join("")}${celTxt(pis, memP)}${celTxt(cofins, memC)}<td class="orc-imp-quando">${quando}</td></tr>`;
    };
    const meses = nomes.map((nome, i) => linhaMes(nome, i, row.pis[i], row.cofins[i], pagoEm[i])).join("");
    const linhaDez = linhaMes("Dez/26", null, row.pagar.pis[0], row.pagar.cofins[0], "Jan");
    const tris = [
      ["Out–dez/26", row.pagar.irpj[0], row.pagar.csll[0], "Jan"],
      ["Jan–mar", row.q0 && row.q0.irpj, row.q0 && row.q0.csll, "Abr"],
      ["Abr–jun", row.q1 && row.q1.irpj, row.q1 && row.q1.csll, "Jul"],
      ["Jul–set", row.q2 && row.q2.irpj, row.q2 && row.q2.csll, "Out"],
      ["Out–dez", row.q3 && row.q3.irpj, row.q3 && row.q3.csll, "Jan/28"]
    ];
    const basesDoTri = [
      this.basesForecastTri(row),
      [0, 1, 2].map((k) => this.baseMes(row, k)),
      [3, 4, 5].map((k) => this.baseMes(row, k)),
      [6, 7, 8].map((k) => this.baseMes(row, k)),
      [9, 10, 11].map((k) => this.baseMes(row, k))
    ];
    const triCorpo = tris.map((t, idx) => {
      const bases = basesDoTri[idx];
      const temBase = bases.some(Boolean);
      const memI = temBase ? this.memoriaIrpj(ali, bases, t[0], t[3]) : [];
      const memC = temBase ? this.memoriaCsll(ali, bases, t[0], t[3]) : [];
      return `<tr><td>${t[0]}</td>${celTxt(t[1], memI)}${celTxt(t[2], memC)}<td class="orc-imp-quando">${t[3]}</td></tr>`;
    }).join("");
    const leituras = [row.leitura.pis, row.leitura.cofins, row.leitura.irpj, row.leitura.csll];
    const notas = leituras.every((l) => !l.tem)
      ? `<p class="orc-est-nota">O orçamento de 2027 não traz PIS, COFINS, IRPJ nem CSLL. A tabela é a estimativa.</p>`
      : `<ul class="orc-est-leituras">${leituras.map((l) => `<li class="${l.tem && l.fecha ? "orc-est-ok" : (l.tem ? "orc-est-alerta" : "")}">${OrcEst.esc(l.texto)}</li>`).join("")}</ul>`;
    return `<div class="orc-imp-det">
        <div>
          <p class="orc-imp-leg">Receita do mês. PIS e COFINS dessa receita pagam no mês ao lado.</p>
          <table class="orc-imp-mes"><thead><tr>${head}</tr></thead><tbody>${linhaDez}${meses}</tbody></table>
        </div>
        <div>
          <p class="orc-imp-leg">IRPJ e CSLL do trimestre, pagos no mês seguinte.</p>
          <table class="orc-imp-tri"><thead><tr><th>Trimestre</th><th>IRPJ</th><th>CSLL</th><th>Pago em</th></tr></thead><tbody>${triCorpo}</tbody></table>
          ${notas}
        </div>
      </div>`;
  },

  async exportExcel() {
    const inv = window.InvestimentoApp;
    if (!inv || typeof inv.ensureExcelJS !== "function") {
      alert("O Excel ainda não carregou. Atualize a página e tente de novo.");
      return;
    }
    const lista = this.lista();
    if (!lista.length) {
      alert("Não há imposto para exportar.");
      return;
    }
    const ExcelJS = await inv.ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    wb.created = new Date();
    const ws = wb.addWorksheet("Impostos", { views: [{ showGridLines: false }] });
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const impostos = [
      ["PIS", "pis"],
      ["COFINS", "cofins"],
      ["CSLL", "csll"],
      ["IRPJ", "irpj"]
    ];
    const colunas = ["Imposto"].concat(meses, ["Total", "Jan/28"]);
    const last = colunas.length;
    ws.properties.showGridLines = false;
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", activeCell: "B5", showGridLines: false }];
    ws.columns = colunas.map((_, i) => ({ width: i === 0 ? 18 : 13 }));
    ws.mergeCells("A1:A2");
    ws.getRow(1).height = 28;
    ws.getRow(2).height = 22;
    ws.getRow(3).height = 8;
    ws.getRow(4).height = 20;
    const title = ws.getCell("A1");
    title.value = {
      richText: [
        { font: { name: "Calibri", size: 14, bold: true, color: { argb: "FF475569" } }, text: "Impostos\n" },
        { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: "A pagar em 2027. PIS e COFINS no mês seguinte. IRPJ e CSLL no mês seguinte ao trimestre. Janeiro inclui o forecast de 2026." }
      ]
    };
    inv.excelPaint(title, { fill: "FFFFFFFF", align: { vertical: "middle", horizontal: "left", wrapText: true, indent: 8 } });
    try {
      const logo = await inv.logoDataUrl();
      if (logo && logo.dataUrl) {
        const img = wb.addImage({ base64: logo.dataUrl, extension: logo.extension || "png" });
        const px = Math.round(1.54 * 96 / 2.54);
        ws.addImage(img, { tl: { col: 0.04, row: 0.08 }, ext: { width: px, height: px } });
      }
    } catch (e) {}
    const serie = (arr) => meses.map((_, i) => (arr && arr[i] != null ? Number(arr[i]) || 0 : null));
    const somaLista = (chave, ate) => {
      let s = 0;
      let algum = false;
      lista.forEach((row) => {
        const arr = row.pagar[chave] || [];
        for (let i = 0; i < ate; i++) {
          if (arr[i] == null) continue;
          algum = true;
          s += Number(arr[i]) || 0;
        }
      });
      return algum ? s : 0;
    };
    const totalAno = impostos.reduce((s, par) => s + somaLista(par[1], 12), 0);
    const totalJan28 = impostos.reduce((s, par) => s + somaLista(par[1], 13) - somaLista(par[1], 12), 0);
    [["Empresas", lista.length, false], ["A pagar em 2027", totalAno, true], ["Jan/28", totalJan28, true]].forEach((par, i) => {
      const col = 4 + i * 2;
      const c1 = ws.getCell(1, col);
      const c2 = ws.getCell(2, col);
      c1.value = par[0];
      c2.value = par[1];
      inv.excelPaint(c1, { font: { size: 8, bold: true, color: { argb: "FF94A3B8" } }, align: { horizontal: "right", vertical: "middle" } });
      inv.excelPaint(c2, {
        font: { size: 12, bold: true, color: { argb: "FF0F172A" } },
        align: { horizontal: "right", vertical: "middle" },
        numFmt: par[2] ? "#,##0.00" : undefined
      });
    });
    const head = ws.getRow(4);
    colunas.forEach((nome, i) => {
      const cell = head.getCell(i + 1);
      cell.value = nome;
      inv.excelPaint(cell, {
        font: { size: 9, bold: true, color: { argb: "FFFFFFFF" } },
        fill: "FF334155",
        align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
        border: true
      });
    });
    const pintarFaixa = (texto, fill) => {
      const linha = ws.addRow([]);
      linha.height = 18;
      ws.mergeCells(linha.number, 1, linha.number, last);
      for (let i = 1; i <= last; i++) {
        const cell = linha.getCell(i);
        if (i === 1) cell.value = texto;
        inv.excelPaint(cell, {
          font: { size: 9, bold: true, color: { argb: "FFFFFFFF" } },
          fill: fill,
          align: { horizontal: "left", vertical: "middle" },
          border: true
        });
      }
    };
    const pintarLinha = (rotulo, valores, fill, fontColor) => {
      const linha = ws.addRow([]);
      const todos = [rotulo].concat(valores);
      todos.forEach((v, i) => {
        const cell = linha.getCell(i + 1);
        const num = i > 0;
        const n = num ? v : null;
        const vazio = num && (n == null || !Number.isFinite(n));
        const zero = num && !vazio && Math.abs(n) < 0.005;
        cell.value = num ? (vazio ? null : n) : v;
        const cor = vazio || zero ? "FF94A3B8" : (num && n < 0 ? "FFB91C1C" : fontColor);
        inv.excelPaint(cell, {
          font: { size: 9, bold: fill !== "FFFFFFFF", color: { argb: cor } },
          fill: fill,
          align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
          border: true,
          numFmt: num ? "#,##0.00" : undefined
        });
      });
    };
    const valoresDe = (arr) => {
      const mesesVal = serie(arr);
      const total = this.somaAte(arr, 12);
      const jan28 = arr && arr[12] != null ? Number(arr[12]) || 0 : null;
      return mesesVal.concat([total, jan28]);
    };
    lista.forEach((row) => {
      pintarFaixa(row.id + " - " + OrcEst.norm(row.nome), "FF0C3D28");
      impostos.forEach((par) => pintarLinha(par[0], valoresDe(row.pagar[par[1]] || []), "FFFFFFFF", "FF0F172A"));
    });
    pintarFaixa("Total", "FF475569");
    impostos.forEach((par) => {
      const acc = Array(13).fill(0);
      const tem = Array(13).fill(false);
      lista.forEach((row) => {
        const arr = row.pagar[par[1]] || [];
        for (let i = 0; i < 13; i++) {
          if (arr[i] == null) continue;
          tem[i] = true;
          acc[i] += Number(arr[i]) || 0;
        }
      });
      const mesesVal = acc.slice(0, 12).map((v, i) => (tem[i] ? v : null));
      const total = tem.slice(0, 12).some(Boolean) ? acc.slice(0, 12).reduce((s, v, i) => s + (tem[i] ? v : 0), 0) : null;
      pintarLinha(par[0], mesesVal.concat([total, tem[12] ? acc[12] : null]), "FF475569", "FFFFFFFF");
    });
    ws.addRow([]);
    const foot = ws.addRow([]);
    foot.height = 18;
    ws.mergeCells(foot.number, 1, foot.number, last);
    const rodape = foot.getCell(1);
    rodape.value = inv.generatedAtLabel(new Date());
    inv.excelPaint(rodape, { font: { size: 8, italic: true, color: { argb: "FF64748B" } }, align: { horizontal: "left", vertical: "middle" } });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Impostos-2027.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
};

window.OrcamentoImpostosApp = OrcamentoImpostosApp;

const OrcamentoRepassesApp = {
  selectedCompanyIds: [],
  companyDropOpen: false,
  companyQuery: "",
  abaId: "",
  obraCode: "",
  visaoAracari: "terrenista",
  fechados: {},
  nos: {},

  pctTxt(n) {
    const v = Number(n) || 0;
    const r = Math.round(v * 1000) / 1000;
    if (Math.abs(r - Math.round(r)) < 0.001) return String(Math.round(r)) + "%";
    return String(r).replace(".", ",") + "%";
  },

  soma(arr) {
    return (arr || []).reduce((s, n) => s + (Number(n) || 0), 0);
  },

  appPar() {
    return typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : (window.ParametrizacaoParceiroApp || null);
  },

  /* Entra o centro marcado em Entra na conta. O nome Corporativo não tira o centro: o 71200 da Ellenco entra no DFC. */
  ccEntraDistribuicao(c, todos) {
    if (!c || !String(c.id || "").replace(/\D/g, "")) return false;
    if (todos) return true;
    return c.inAccount !== false;
  },

  centrosDa(part, obraCode, todos) {
    const map = new Map();
    (part.obras || []).forEach((obra) => {
      if (obraCode && String(obra.code) !== String(obraCode)) return;
      (obra.costCenters || []).forEach((c) => {
        if (!this.ccEntraDistribuicao(c, todos)) return;
        const id = String(c.id || "").replace(/\D/g, "");
        if (!id || map.has(id)) return;
        map.set(id, { obra: obra, nome: String(c.name || "").trim() });
      });
    });
    return map;
  },

  nomeCentro(part, id) {
    const dig = String(id || "").replace(/\D/g, "");
    let nome = "";
    (part && part.obras || []).forEach((obra) => {
      (obra.costCenters || []).forEach((c) => {
        if (String(c.id || "").replace(/\D/g, "") === dig && c.name) nome = String(c.name).trim();
      });
    });
    if (nome) return nome;
    const lista = (window.CentrosCustoState && CentrosCustoState.costCenters) || [];
    const cc = dig ? lista.find((c) => String(c.id).replace(/\D/g, "") === dig) : null;
    return cc && cc.name ? String(cc.name).trim() : "";
  },

  /* Araçari: o terrenista olha o 14202 e o empreendedor olha 14201 + 70600, mesmo fora da obra. */
  centrosFixos(part, obra, ids) {
    const map = new Map();
    (ids || []).forEach((id) => {
      const dig = String(id || "").replace(/\D/g, "");
      if (!dig || map.has(dig)) return;
      map.set(dig, { obra: obra || null, nome: this.nomeCentro(part, dig) });
    });
    return map;
  },

  nomeCc(c) {
    return String((c && c.name) || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  },

  ccEhDoParceiro(nome) {
    return this.nomeCc({ name: nome }).indexOf("PARCERIA") >= 0;
  },

  /* Na parceria a linha do centro principal (13300) não é o repasse. Fica o centro do parceiro. */
  ccsDoRepasse(ccs, sociedade) {
    if (sociedade) return ccs;
    const parceiro = (ccs || []).filter((c) => this.ccEhDoParceiro(c.nome || c.id));
    return parceiro.length ? parceiro : (ccs || []);
  },

  ccProduto(obra) {
    const lista = (obra && obra.costCenters) || [];
    const produto = (c) => this.nomeCc(c).indexOf("PARCERIA") < 0;
    return lista.find((c) => produto(c) && /00$/.test(String(c.id || "").replace(/\D/g, "")))
      || lista.find((c) => produto(c))
      || null;
  },

  /* Obra com o par (16103 empreendedor e 16104 parceria) e outros centros da mesma obra
     (16113, 16114, 16115). O DFC soma todos os marcados; o repasse fica no final.
     A empresa 6 não passa por aqui: ela tem a visão do terrenista e a do empreendedor. */
  parExtra(obra, exigeOutro) {
    const lista = (obra && obra.costCenters) || [];
    const parcs = lista.filter((c) => this.ccEhDoParceiro(c.name || c.id));
    if (parcs.length !== 1) return null;
    const parc = parcs[0];
    const id = String(parc.id || "").replace(/\D/g, "");
    const n = Number(id);
    if (!id || !Number.isFinite(n)) return null;
    const baseId = String(n - 1);
    const base = lista.find((c) => String(c.id || "").replace(/\D/g, "") === baseId && !this.ccEhDoParceiro(c.name || c.id));
    if (!base) return null;
    const outros = lista.filter((c) => {
      const cid = String(c.id || "").replace(/\D/g, "");
      return cid && cid !== id && cid !== baseId;
    });
    if (exigeOutro !== false && !outros.length) return null;
    return { base: base, parc: parc };
  },

  /* Repasse do final: percentual do parceiro sobre o DFC inteiro dos centros marcados. */
  repasseDoExtra(linhas, linhasDez, centros, part, especial, obra) {
    const serie = this.resultadoCc(linhas, linhasDez, centros, part, true);
    const pag = this.serieDeslocada(serie.dez, serie.ano);
    return {
      id: String(especial.parc.id || "").replace(/\D/g, ""),
      nome: String(especial.parc.name || especial.parc.nome || ""),
      pagoEm: String(especial.base.id || "").replace(/\D/g, ""),
      obra: obra ? String(obra.code || "") : "",
      m: pag.m,
      jan28: pag.jan28
    };
  },

  /* O centro principal da obra (13300) ligado significa o valor integral.
     Desligado, o DFC usa o rateio do parceiro sobre a obra inteira. */
  principalMarcado(obra) {
    const principal = this.ccProduto(obra);
    if (!principal) return true;
    return principal.inAccount !== false;
  },

  molde() {
    const app = this.appPar();
    const plano = typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null;
    const tpl = ((plano && typeof plano.dfcTemplateGroups === "function" && plano.dfcTemplateGroups())
      || (app && typeof app.dfcDefaultGroups === "function" && app.dfcDefaultGroups())
      || []).map((g) => ({ ...g, months: OrcEst.z(), accs: new Map() }));
    const byId = {};
    tpl.forEach((g) => { byId[g.id] = g; });
    return { tpl: tpl, byId: byId };
  },

  valorForecast(info, ym) {
    const meses = (info && info.meses) || {};
    let valor = Number(meses[ym]);
    if (!Number.isFinite(valor)) {
      const cel = meses[ym] || meses["12"] || meses[12];
      valor = cel && typeof cel === "object" ? Number(cel.r != null ? cel.r : cel.o) : Number(cel);
    }
    return Number(valor) || 0;
  },

  /* A empresa 1 detalha a conta um nível abaixo do DFC. O valor sobe para a conta alocada. */
  contaNoDfc(code, nome) {
    const bruto = String(code || "").trim();
    if (!bruto) return bruto;
    const dfc = typeof OrcamentoDfcApp !== "undefined" ? OrcamentoDfcApp : null;
    const cabe = (conta) => {
      if (dfc && typeof dfc.grupoDaConta === "function" && dfc.grupoDaConta(conta, nome)) return true;
      return !!OrcEst.grupo(conta, nome);
    };
    if (cabe(bruto)) return bruto;
    const partes = bruto.split(".").filter(Boolean);
    while (partes.length > 1) {
      partes.pop();
      const pai = partes.join(".");
      if (cabe(pai)) return pai;
    }
    return bruto;
  },

  garantirForecastLocal() {
    const app = window.ResultadoCaixaApp;
    if (!app) return false;
    const doc = app.forecasts && app.forecasts["2026-12"];
    const por = doc && doc.porArquivo;
    const tem = (por && typeof por === "object" && Object.keys(por).length) || (doc && doc.contas && Object.keys(doc.contas).length);
    if (tem) return true;
    if (typeof app.lerLocal === "function") {
      try { app.lerLocal(); } catch (e) {}
    }
    const depois = app.forecasts && app.forecasts["2026-12"];
    const por2 = depois && depois.porArquivo;
    return !!((por2 && Object.keys(por2).length) || (depois && depois.contas && Object.keys(depois.contas).length));
  },

  /* Repasse e distribuição previstos no forecast não entram nesta tela: o repasse é calculado aqui. */
  forecastDeRepasse(conta, nome) {
    const gid = this.grupoEfetivo(conta, nome);
    if (gid === "g_04_01" || gid === "g_11_01") return true;
    return /REPASSE|DISTRIBUICAO/.test(OrcEst.norm(nome));
  },

  linhasDez2026(companyId) {
    this.garantirForecastLocal();
    const app = window.ResultadoCaixaApp;
    const doc = app && app.forecasts && app.forecasts["2026-12"];
    if (!doc) return [];
    if (typeof app.normalizarForecastsMemoria === "function") {
      try { app.normalizarForecastsMemoria(); } catch (e) {}
    }
    const lista = [];
    const por = doc.porArquivo;
    if (por && typeof por === "object" && !Array.isArray(por) && Object.keys(por).length) {
      Object.keys(por).forEach((nome) => lista.push(por[nome]));
    } else if (doc.contas) lista.push(doc);
    const emp = String(companyId || "").replace(/\D/g, "");
    const dfc = typeof OrcamentoDfcApp !== "undefined" ? OrcamentoDfcApp : null;
    const out = [];
    lista.forEach((arq) => {
      let id = String((arq && arq.empresa) || "").replace(/\D/g, "");
      if (!id && dfc && typeof dfc.empresaDoArquivo === "function") id = String(dfc.empresaDoArquivo(arq && (arq.rotulo || arq.nome)) || "").replace(/\D/g, "");
      if (emp && id && id !== emp) return;
      Object.keys((arq && arq.contas) || {}).forEach((cc) => {
        Object.keys(arq.contas[cc] || {}).forEach((code) => {
          const info = arq.contas[cc][code] || {};
          const valor = this.valorForecast(info, "2026-12");
          if (!valor) return;
          const nome = info.nome || "";
          const conta = this.contaNoDfc(code, nome);
          if (this.forecastDeRepasse(conta, nome)) return;
          const m = OrcEst.z();
          m[0] = valor;
          out.push({
            e: id || emp,
            cc: String(cc).replace(/\D/g, "") || String(cc),
            conta: conta,
            cn: nome,
            m: m
          });
        });
      });
    });
    return out;
  },

  grupoOculto(part, node) {
    const app = this.appPar();
    if (app && typeof app.isDfcHiddenForParceria === "function" && app.isDfcHiddenForParceria(part, node)) return true;
    const id = String((node && node.id) || "");
    const sociedade = app && typeof app.isSociedade === "function" && app.isSociedade(part);
    if (sociedade && (id === "g_04_01" || /^g_11($|_)/.test(id))) return true;
    return false;
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

  /* Empresa 6: duas visões. O terrenista vê o 14202; o repasse é a variação do 14201 no mês seguinte.
     O empreendedor vê 14201 e 70600; esse saldo é a distribuição entre os sócios. */
  aracariDe(part) {
    const app = this.appPar();
    return !!(app && typeof app.isMista === "function" && app.isMista(part) && String(part && part.companyId) === "6");
  },

  pessoasDe(part) {
    const app = this.appPar();
    const lista = [];
    if (app && typeof app.isMista === "function" && app.isMista(part) && typeof app.efetivoEmpreendedor === "function") {
      const terr = app.pctTerrenista(part);
      const aracari = this.aracariDe(part);
      const fonte = (part.socios || []).some((s) => s && app.papelSocio(s) === "empreendedor" && Number(s.sharePct) > 0)
        ? (part.socios || [])
        : (aracari && Array.isArray(app.ARACARI_EMPREENDEDORES) ? app.ARACARI_EMPREENDEDORES : []);
      fonte.forEach((s) => {
        if (!s || app.papelSocio(s) !== "empreendedor") return;
        const share = Number(s.sharePct) || 0;
        if (!(share > 0) || (!aracari && !(terr > 0))) return;
        const efetivo = app.efetivoEmpreendedor(part, share);
        lista.push({
          nome: s.name || "Empreendedor",
          pct: aracari ? share : (terr > 0 ? efetivo / terr * 100 : 0),
          ccId: String(s.ccTitulo || ""),
          ccNome: String(s.ccTituloNome || "")
        });
      });
      return lista.sort((a, b) => this.ordemCentro(a.ccId, b.ccId) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    }
    (part.socios || []).forEach((s) => {
      if (!s) return;
      const todos = app && typeof app.titulosDoSocio === "function" ? app.titulosDoSocio(s) : [];
      const dividido = todos.length > 1 || (todos.length === 1 && todos[0].pctPlano !== 100);
      const tits = todos.filter((t) => t.efetivo > 0);
      if (dividido && tits.length) {
        tits.forEach((t) => {
          const nomePlano = t.planoNome || t.planoId;
          lista.push({
            nome: (s.name || "Sócio") + (nomePlano ? " · " + nomePlano : ""),
            pct: t.efetivo,
            ccId: String(t.ccId || s.ccTitulo || ""),
            ccNome: String(t.ccNome || s.ccTituloNome || "")
          });
        });
        return;
      }
      const pct = Number(s.sharePct) || 0;
      if (pct > 0) lista.push({
        nome: s.name || (part.partnerName || "Parceiro"),
        pct: pct,
        ccId: String(s.ccTitulo || ""),
        ccNome: String(s.ccTituloNome || "")
      });
    });
    return lista.sort((a, b) => this.ordemCentro(a.ccId, b.ccId) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  },

  ordemCentro(a, b) {
    const da = String(a || "").replace(/\D/g, "");
    const db = String(b || "").replace(/\D/g, "");
    const na = da ? Number(da) : NaN;
    const nb = db ? Number(db) : NaN;
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    if (Number.isFinite(na)) return -1;
    if (Number.isFinite(nb)) return 1;
    return String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true });
  },

  prestacoes() {
    const ids = new Set(this.selectedCompanyIds.map(String));
    return OrcEst.parcerias()
      .filter((p) => !ids.size || ids.has(String(p.companyId)))
      .slice()
      .sort((a, b) => String(a.partnerName || "").localeCompare(String(b.partnerName || ""), "pt-BR") || Number(a.companyId) - Number(b.companyId));
  },

  linhasDaEmpresa(companyId) {
    const ids = new Set(this.selectedCompanyIds.map(String));
    return OrcEst.linhas().filter((l) => {
      const emp = String(l.e || "");
      if (companyId) return emp === String(companyId);
      return !ids.size || ids.has(emp);
    });
  },

  calcular() {
    return this.prestacoes().map((p, i) => this.montarDfc(p, this.linhasDaEmpresa(p.companyId), i));
  },

  encher(tpl, byId, linhas, centros, part, usarRateio, semFiltro) {
    const app = this.appPar();
    const fluxo = typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : (window.FluxoCaixaApp || null);
    const dfc = typeof OrcamentoDfcApp !== "undefined" ? OrcamentoDfcApp : null;
    const sociedade = !!(app && typeof app.isSociedade === "function" && app.isSociedade(part));
    (linhas || []).forEach((l) => {
      const ccId = String(l.cc || "").replace(/\D/g, "");
      const achado = centros.get(ccId);
      if (!achado) return;
      const obra = achado.obra;
      if (!semFiltro && !this.entraConta(part, obra, l.conta)) return;
      const fator = usarRateio ? this.fator(part, obra, l.conta) : 1;
      if (!(Math.abs(fator) > 0)) return;
      const gid = dfc && typeof dfc.grupoDaConta === "function" ? dfc.grupoDaConta(l.conta, l.cn) : OrcEst.grupo(l.conta, l.cn);
      const g = gid ? byId[gid] : null;
      if (!g || g.type !== "resultado" || this.grupoOculto(part, g)) return;
      const pct = usarRateio
        ? (app && typeof app.partnerPctForObra === "function" ? app.partnerPctForObra(part, obra, l.conta) : (Number(obra.defaultPartnerShare) || 0))
        : 0;
      let acc = g.accs.get(l.conta);
      if (!acc) {
        acc = { conta: l.conta, cn: l.cn || "", months: OrcEst.z(), pcts: new Set(), ccs: new Map() };
        g.accs.set(l.conta, acc);
      }
      if (pct) acc.pcts.add(Math.round(Number(pct) * 1000) / 1000);
      let cc = acc.ccs.get(ccId);
      if (!cc) {
        cc = { id: ccId, nome: achado.nome || String(l.en || "").trim(), months: OrcEst.z(), pct: pct };
        acc.ccs.set(ccId, cc);
      } else if (!cc.nome && (achado.nome || l.en)) {
        cc.nome = achado.nome || String(l.en).trim();
      }
      (l.m || []).forEach((v, i) => {
        if (i > 11) return;
        const s = (fluxo && typeof fluxo.signedAmount === "function"
          ? fluxo.signedAmount(g, l.conta, l.cn, v)
          : OrcEst.sinal(gid, l.conta, l.cn, v)) * fator;
        acc.months[i] += s;
        cc.months[i] += s;
        g.months[i] += s;
        });
      });
    const depth = (g) => {
      let d = 0;
      let cur = g;
      while (cur && cur.parentId && byId[cur.parentId]) {
        d += 1;
        cur = byId[cur.parentId];
      }
      return d;
    };
    tpl.filter((g) => g.type !== "formula").sort((a, b) => depth(b) - depth(a)).forEach((g) => {
      tpl.filter((c) => c.parentId === g.id && c.type !== "formula").forEach((ch) => {
        ch.months.forEach((v, i) => { g.months[i] += v; });
      });
    });
    const sum = (ids) => {
      const months = OrcEst.z();
      ids.forEach((id) => {
        const n = byId[id];
        if (!n) return;
        n.months.forEach((v, i) => { months[i] += v; });
      });
      return months;
    };
    const apply = (id, parts) => { if (byId[id]) byId[id].months = sum(parts); };
    apply("g_03", ["g_04", "g_05"]);
    apply("g_06", ["g_01", "g_02", "g_03"]);
    apply("g_08", ["g_06", "g_07"]);
    apply("g_10", ["g_08", "g_09"]);
    apply("g_12", ["g_10", "g_11"]);
    return sociedade;
  },

    /* As duas fatias da Ellenco na empresa 13 entram na 12 como lucro recebido no mês seguinte.
       O resultado de dez/2026 é o lucro recebido em janeiro/2027, não um valor de dezembro na 12. */
    lucrosRecebidosEmpresa13() {
      if (this._semLucros) return null;
      const partes = OrcEst.parcerias().filter((p) => String(p.companyId) === "13");
      if (!partes.length) return null;
      const meses = OrcEst.z();
      let jan28 = 0;
      let achou = false;
      this._semLucros = true;
      try {
        partes.forEach((part) => {
          const card = this.montarDfc(part, this.linhasDaEmpresa("13"), 0, "");
          const ano = card.resultadoMeses || OrcEst.z();
          let pct = 0;
          (card.pessoas || []).forEach((p) => {
            const nome = this.nomeCc({ name: p.nome });
            if (nome.indexOf("ELLENCO") < 0) return;
            if (nome.indexOf("LUCRO") < 0 && nome.indexOf("REMESSA") < 0 && nome.indexOf("CONTROLADORA") < 0) return;
            achou = true;
            pct += Number(p.pct) || 0;
          });
          if (!(pct > 0)) return;
          const fatia = pct / 100;
          meses[0] += (Number(card.dezBruto) || 0) * fatia;
          for (let i = 1; i < 12; i++) meses[i] += (Number(ano[i - 1]) || 0) * fatia;
          jan28 += (Number(ano[11]) || 0) * fatia;
        });
      } finally {
        this._semLucros = false;
      }
      if (!achou) return null;
      return { meses: meses, jan28: jan28 };
    },

  incluirLucros(byId, meses) {
    const g = byId && byId.g_11_02;
    if (!g || !meses) return;
    let acc = g.accs.get("lucros-13");
    if (!acc) {
      acc = { conta: "Lucros recebidos", cn: "Empresa 13", months: OrcEst.z(), pcts: new Set(), ccs: new Map() };
      g.accs.set("lucros-13", acc);
    }
    meses.forEach((v, i) => {
      if (i > 11) return;
      const n = Number(v) || 0;
      acc.months[i] += n;
      g.months[i] += n;
      if (byId.g_11) byId.g_11.months[i] += n;
      if (byId.g_12) byId.g_12.months[i] += n;
    });
  },

  serieDeslocada(dez, ano) {
    const pag = OrcEst.z();
    const meses = ano || OrcEst.z();
    pag[0] = Number(dez) || 0;
    for (let i = 1; i < 12; i++) pag[i] = Number(meses[i - 1]) || 0;
    return { m: pag, jan28: Number(meses[11]) || 0 };
  },

  /* O lucro recebido não nasce num centro. Entra no 71200, o corporativo, para o total dos centros fechar com a distribuição dos sócios. */
  completarLucrosNoCentro(distribuicao, pagamento, jan28) {
    const soma = OrcEst.z();
    let janSoma = 0;
    distribuicao.forEach((r) => {
      (r.m || []).forEach((v, i) => { soma[i] += Number(v) || 0; });
      janSoma += Number(r.jan28) || 0;
    });
    const alvo = distribuicao.find((r) => String(r.id).replace(/\D/g, "") === "71200")
      || distribuicao.find((r) => this.nomeCc({ name: r.nome }).indexOf("CORPORATIVO") >= 0)
      || distribuicao[0];
    if (!alvo) return;
    alvo.m = (alvo.m || OrcEst.z()).map((v, i) => (Number(v) || 0) + ((Number(pagamento[i]) || 0) - soma[i]));
    alvo.jan28 = (Number(alvo.jan28) || 0) + ((Number(jan28) || 0) - janSoma);
  },

  resultadoCc(linhas, linhasDez, um, part, comRateio, semFiltro) {
    const anoMolde = this.molde();
    this.encher(anoMolde.tpl, anoMolde.byId, linhas, um, part, comRateio, semFiltro);
    const ano = (anoMolde.byId.g_12 && anoMolde.byId.g_12.months) ? anoMolde.byId.g_12.months.slice() : OrcEst.z();
    const umDez = this.molde();
    this.encher(umDez.tpl, umDez.byId, linhasDez, um, part, comRateio, semFiltro);
    const dezCc = (umDez.byId.g_12 && umDez.byId.g_12.months && umDez.byId.g_12.months[0]) || 0;
    return { ano: ano, dez: dezCc };
  },

  montarDfc(part, linhas, indice, obraCode, visao) {
    const app = this.appPar();
    const molde = this.molde();
    const tpl = molde.tpl;
    const byId = molde.byId;
    const obraBruta = (part.obras || []).find((o) => String(o.code) === String(obraCode)) || null;
    const sociedade = !!(app && typeof app.isSociedade === "function" && app.isSociedade(part));
    const kind = app && typeof app.kindOf === "function" ? app.kindOf(part) : (part.kind || "parceria");
    const aracari = this.aracariDe(part);
    const visaoAr = aracari ? String(visao || this.visaoAracari || "terrenista") : "";
    const obra = obraBruta;
    const algumMarcado = !obra || (obra.costCenters || []).some((c) => c.inAccount !== false);
    const especial = !sociedade && obra && !aracari ? this.parExtra(obra) : null;
    let usarRateio = !especial && !sociedade && !!obra && !this.principalMarcado(obra) && algumMarcado;
    if (visaoAr) usarRateio = false;
    let centros = this.centrosDa(part, obraCode, usarRateio);
    let semFiltro = false;
    if (visaoAr === "terrenista") {
      centros = this.centrosFixos(part, obra, ["14202"]);
      semFiltro = true;
    } else if (visaoAr === "empreendedor") {
      centros = this.centrosFixos(part, obra, ["14201", "70600"]);
      semFiltro = true;
    }
    this.encher(tpl, byId, linhas, centros, part, usarRateio, semFiltro);
    const resultadoProprio = (byId.g_12 && byId.g_12.months) ? byId.g_12.months.slice() : OrcEst.z();
    const lucros = !this._semLucros && String(part.companyId) === "12" ? this.lucrosRecebidosEmpresa13() : null;
    if (lucros) this.incluirLucros(byId, lucros.meses);
    const resultado = (byId.g_12 && byId.g_12.months) ? byId.g_12.months.slice() : OrcEst.z();
    const linhasDez = this.linhasDez2026(part.companyId);
    const dezMolde = this.molde();
    this.encher(dezMolde.tpl, dezMolde.byId, linhasDez, centros, part, usarRateio, semFiltro);
    const dezMap = {};
    dezMolde.tpl.forEach((g) => {
      dezMap[g.id] = (g.months && g.months[0]) || 0;
      g.accs.forEach((a, conta) => {
        const accId = "acc:" + g.id + ":" + conta;
        dezMap[accId] = (a.months && a.months[0]) || 0;
        a.ccs.forEach((c) => { dezMap[accId + ":" + c.id] = (c.months && c.months[0]) || 0; });
      });
    });
    const dez = dezMap.g_12 || 0;
    /* Na empresa 12 a distribuição do mês é a variação de caixa desse mês (linha 12),
       já com o lucro recebido da empresa 13. Nas demais, o mês paga a variação anterior. */
    let pagamento;
    let jan28;
    if (lucros) {
      pagamento = resultado.slice();
      jan28 = Number(lucros.jan28) || 0;
    } else {
      const seriePropria = this.serieDeslocada(dez, resultado);
      pagamento = seriePropria.m;
      jan28 = seriePropria.jan28;
    }
    const vivo = new Set(["g_03", "g_06", "g_08", "g_10", "g_12"]);
    tpl.forEach((g) => {
      const tem = g.months.some((v) => Math.abs(v) >= 0.005) || [...g.accs.values()].some((a) => a.months.some((v) => Math.abs(v) >= 0.005));
      if (!tem) return;
      vivo.add(g.id);
      let cur = g;
      while (cur && cur.parentId) {
        vivo.add(cur.parentId);
        cur = byId[cur.parentId];
      }
    });
    const rows = [];
    const walk = (node, level) => {
      if (!vivo.has(node.id)) return;
      const children = tpl.filter((g) => g.parentId === node.id && vivo.has(g.id));
      const accs = [...node.accs.values()]
        .filter((a) => a.months.some((v) => Math.abs(v) >= 0.005))
        .sort((a, b) => String(a.conta).localeCompare(String(b.conta), "pt-BR", { numeric: true }));
      rows.push({
        id: node.id,
        name: node.name,
        type: node.type,
        level: level,
        hasKids: children.length > 0 || accs.length > 0,
        isAccount: false,
        months: node.months,
        dez: dezMap[node.id] || 0,
        jan28: null
      });
      children.forEach((ch) => walk(ch, level + 1));
      accs.forEach((a) => {
        const accId = "acc:" + node.id + ":" + a.conta;
        const listaCc = [...a.ccs.values()]
          .filter((c) => c.months.some((v) => Math.abs(v) >= 0.005))
          .sort((x, y) => this.ordemCentro(x.id, y.id));
        const ccs = (especial || visaoAr) ? listaCc : this.ccsDoRepasse(listaCc, sociedade);
        const pcts = [...a.pcts].filter((n) => n > 0).sort((x, y) => x - y);
        rows.push({
          id: accId,
          name: String(a.conta || "") + (a.cn ? " " + a.cn : ""),
          type: "conta",
          level: level + 1,
          hasKids: ccs.length > 0,
          isAccount: true,
          pcts: sociedade ? [] : pcts,
          ccIds: ccs.map((c) => c.id),
          months: a.months,
          dez: dezMap[accId] || 0
        });
        ccs.forEach((c) => {
          rows.push({
            id: accId + ":" + c.id,
            parent: accId,
            name: c.nome ? (c.id + " — " + c.nome) : c.id,
            type: "cc",
            level: level + 2,
            hasKids: false,
            isCc: true,
            pct: sociedade ? 0 : c.pct,
            months: c.months,
            dez: dezMap[accId + ":" + c.id] || 0
          });
        });
      });
    };
    tpl.filter((g) => !g.parentId).forEach((g) => walk(g, 0));
    const variacao = pagamento.slice();
    const pessoas = this.pessoasDe(part).map((p) => ({
      nome: p.nome,
      pct: p.pct,
      ccId: p.ccId || "",
      ccNome: p.ccNome || "",
      dez: dez * p.pct / 100,
      m: variacao.map((v) => v * p.pct / 100),
      jan28: jan28 * p.pct / 100
    }));
    const distribuicao = [];
    const parceiros = [];
    centros.forEach((meta, ccId) => {
      const idDig = String(ccId).replace(/\D/g, "");
      if (!sociedade && /00$/.test(idDig) && !this.ccEhDoParceiro(meta.nome)) return;
      parceiros.push({ ccId: ccId, meta: meta });
    });
    if (especial) {
      distribuicao.push(this.repasseDoExtra(linhas, linhasDez, centros, part, especial, obra));
    } else if (!sociedade && usarRateio && parceiros.length) {
      const pesos = parceiros.map((p) => {
        const bruto = this.resultadoCc(linhas, linhasDez, new Map([[p.ccId, p.meta]]), part, false);
        const peso = Math.abs(bruto.dez) + bruto.ano.reduce((s, v) => s + Math.abs(Number(v) || 0), 0);
        return { p: p, peso: peso };
      });
      const somaP = pesos.reduce((s, item) => s + item.peso, 0);
      pesos.forEach((item) => {
        const fatia = somaP > 0.0001 ? item.peso / somaP : 1 / pesos.length;
        distribuicao.push({
          id: item.p.ccId,
          nome: item.p.meta.nome || "",
          obra: (item.p.meta.obra && item.p.meta.obra.code) || "",
          m: pagamento.map((v) => (Number(v) || 0) * fatia),
          jan28: (Number(jan28) || 0) * fatia
        });
      });
    } else {
      parceiros.forEach((p) => {
        const serie = this.resultadoCc(linhas, linhasDez, new Map([[p.ccId, p.meta]]), part, usarRateio);
        const pag = lucros
          ? { m: (serie.ano || OrcEst.z()).slice(), jan28: 0 }
          : this.serieDeslocada(serie.dez, serie.ano);
        distribuicao.push({
          id: p.ccId,
          nome: p.meta.nome || "",
          obra: (p.meta.obra && p.meta.obra.code) || "",
          m: pag.m,
          jan28: pag.jan28
        });
      });
    }
    if (lucros && distribuicao.length) this.completarLucrosNoCentro(distribuicao, pagamento, jan28);
    distribuicao.sort((a, b) => this.ordemCentro(a.id, b.id));
    let variacaoCard = variacao;
    let janCard = jan28;
    if (especial && distribuicao.length) {
      variacaoCard = (distribuicao[0].m || OrcEst.z()).slice();
      janCard = Number(distribuicao[0].jan28) || 0;
      pessoas.forEach((p) => {
        p.m = variacaoCard.map((v) => (Number(v) || 0) * p.pct / 100);
        p.jan28 = janCard * p.pct / 100;
      });
    }
    if (visaoAr === "terrenista") {
      const um = this.centrosFixos(part, obra, ["14201"]);
      const serie = this.resultadoCc(linhas, linhasDez, um, part, false, true);
      const pag = this.serieDeslocada(serie.dez, serie.ano);
      distribuicao.length = 0;
      distribuicao.push({
        id: "14201",
        nome: this.nomeCentro(part, "14201"),
        pagoEm: "14201",
        m: pag.m,
        jan28: pag.jan28
      });
      variacaoCard = pag.m.slice();
      janCard = Number(pag.jan28) || 0;
      pessoas.length = 0;
    } else if (visaoAr === "empreendedor") {
      distribuicao.length = 0;
      ["14201", "70600"].forEach((id) => {
        const um = this.centrosFixos(part, obra, [id]);
        const serie = this.resultadoCc(linhas, linhasDez, um, part, false, true);
        const pag = this.serieDeslocada(serie.dez, serie.ano);
        distribuicao.push({
          id: id,
          nome: this.nomeCentro(part, id),
          pagoEm: id,
          m: pag.m,
          jan28: pag.jan28
        });
      });
      const baseM = OrcEst.z();
      let baseJan = 0;
      distribuicao.forEach((r) => {
        (r.m || []).forEach((v, i) => { baseM[i] += Number(v) || 0; });
        baseJan += Number(r.jan28) || 0;
      });
      variacaoCard = baseM.slice();
      janCard = baseJan;
      pessoas.forEach((p) => {
        p.m = baseM.map((v) => (Number(v) || 0) * p.pct / 100);
        p.jan28 = baseJan * p.pct / 100;
      });
    }
    pessoas.sort((a, b) => this.ordemCentro(a.ccId, b.ccId) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    const ccIds = [...centros.keys()].sort((a, b) => this.ordemCentro(a, b));
    return {
      id: String(part.id || (part.companyId + "-" + indice)) + (obraCode ? ":" + obraCode : "") + (visaoAr ? ":" + visaoAr : ""),
      obraCode: obra ? String(obra.code) : "",
      obraShare: obra ? Number(obra.defaultPartnerShare) || 0 : 0,
      companyId: String(part.companyId || ""),
      nome: part.partnerName || part.companyName || "Parceria",
      empresa: part.companyName || "",
      kind: kind,
      sociedade: sociedade,
      rateio: usarRateio,
      extra: !!especial,
      aracari: visaoAr === "empreendedor",
      aracariVisao: visaoAr,
      jan28: janCard,
      centros: ccIds,
      rows: rows,
      variacao: variacaoCard,
      distribuicao: distribuicao,
      pessoas: pessoas,
      resultadoMeses: resultadoProprio,
      dezBruto: dez,
      distribuiNoMes: !!lucros,
      pctPessoas: pessoas.reduce((s, p) => s + p.pct, 0),
      temValor: variacaoCard.some((v) => Math.abs(v) >= 0.005) || rows.some((r) => r.isAccount)
    };
  },
  toggle(id) {
    this.fechados[id] = !this.fechados[id];
    this.paintCorpo();
  },

  toggleNo(partId, nodeId) {
    const set = this.nos[partId];
    if (!set || !nodeId) return;
    if (set.has(nodeId)) set.delete(nodeId);
    else set.add(nodeId);
    this.paintCorpo();
  },

  nosDe(card) {
    if (!this.nos[card.id]) {
      const set = new Set();
      (card.rows || []).forEach((r) => {
        if (r.hasKids && !r.isAccount && !r.isCc) set.add(r.id);
      });
      this.nos[card.id] = set;
    }
    return this.nos[card.id];
  },

  empresasFiltro() {
    const map = new Map();
    OrcEst.empresas().forEach((e) => map.set(String(e.id), e));
    OrcEst.parcerias().forEach((p) => {
      const id = String(p.companyId || "");
      if (!id || map.has(id)) return;
      map.set(id, { id: id, name: p.companyName || "", label: id + " - " + OrcEst.norm(p.companyName || "") });
    });
    return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id));
  },

  render(root) {
    root.innerHTML = `
      <div class="orc-est-page">
        ${typeof OrcamentoApp !== "undefined" ? OrcamentoApp.abasHtml() : ""}
        <p class="orc-dfc-lead">Cada aba é uma prestação de contas. Na parceria, escolha a obra e marque os centros de custo. Na sociedade, o resultado geral de todos os centros gera a distribuição.</p>
        <div class="orc-dfc-tools">
          <div id="orc-rep-emp-box"></div>
          <button type="button" class="btn btn-excel" id="orc-rep-excel" title="Exportar a prestação de contas com o repasse por centro de custo">
            <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel
          </button>
        </div>
        <div id="orc-rep-body"></div>
      </div>`;
    this.paintFiltro();
    this.paintCorpo();
    const excel = document.getElementById("orc-rep-excel");
    if (excel) excel.addEventListener("click", () => this.exportDistribuicao());
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
    const items = this.empresasFiltro();
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

  partAtual(lista) {
    const itens = lista || this.prestacoes();
    if (!itens.length) return null;
    return itens.find((p) => String(p.id) === String(this.abaId)) || itens[0];
  },

  obraAtual(part) {
    const obras = (part && part.obras) || [];
    if (!obras.length) return null;
    return obras.find((o) => String(o.code) === String(this.obraCode)) || obras[0];
  },

  setAba(id) {
    this.abaId = String(id || "");
    this.obraCode = "";
    this.paintCorpo();
  },

  setObra(code) {
    this.obraCode = String(code || "");
    this.paintCorpo();
  },

  setVisaoAracari(v) {
    this.visaoAracari = v === "empreendedor" ? "empreendedor" : "terrenista";
    this.paintCorpo();
  },

  nomeSocioCurto(nome) {
    const n = this.nomeCc({ name: nome });
    if (n.indexOf("MOURA") >= 0) return "Moura Leite";
    if (n.indexOf("SOMA") >= 0) return "Soma";
    if (n.indexOf("PRF") >= 0) return "PRF";
    return String(nome || "Sócio");
  },

  marcarCc(ccId, on) {
    const part = this.partAtual();
    const app = this.appPar();
    if (!part) return;
    let row = null;
    (part.obras || []).forEach((obra) => {
      const achado = (obra.costCenters || []).find((c) => String(c.id) === String(ccId));
      if (achado) row = achado;
    });
    if (!row) return;
    row.inAccount = !!on;
    if (app && typeof app.persist === "function") app.persist();
    this.paintCorpo();
  },

  ypesQuerido() {
    const ids = this.selectedCompanyIds.map(String);
    return !ids.length || ids.indexOf("21") >= 0;
  },

  htmlYpes() {
    if (!this.ypesQuerido() || !window.OrcamentoImpostosApp) return "";
    const linhas = OrcEst.linhas().filter((l) => String(l.e) === "21");
    if (!linhas.length) return "";
    const mapa = OrcamentoImpostosApp.calcular(linhas);
    const row = mapa["21"];
    const pago = row ? OrcamentoImpostosApp.totalPago(row) : OrcEst.z().concat([0]);
    const receita = OrcEst.z();
    linhas.forEach((l) => {
      if (String(l.conta || "") !== "1.01.01.01") return;
      (l.m || []).forEach((v, i) => { if (i < 12) receita[i] += Number(v) || 0; });
    });
    const admin = OrcEst.z().map(() => 10000);
    const resultado = receita.map((v, i) => v - (Number(pago[i]) || 0) - admin[i]);
    const pct = window.OrcamentoApp && typeof OrcamentoApp.participation === "function" ? OrcamentoApp.participation("21") : 23.8;
    const ml = resultado.map((v) => v * (Number(pct) || 0) / 100);
    const cel = (arr) => arr.map((v) => {
      const n = Number(v) || 0;
      return `<td${n < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(n)}</td>`;
    }).join("");
    const linha = (nome, arr, forte) => `<tr class="${forte ? "orc-dfc-n1" : ""}"><td>${nome}</td>${cel(arr)}<td>${OrcEst.money(this.soma(arr))}</td></tr>`;
    const meses = OrcEst.MESES.map((m) => `<th>${m}</th>`).join("");
    return `<section class="orc-rep-socios">
      <h4>21 — Reserva dos Ypês IV. O repasse do mês é a receita, menos o imposto a pagar desta tela, menos R$ 10.000 de outras despesas administrativas.</h4>
      <div class="orc-dfc-scroll"><table class="orc-dfc-table orc-est-table orc-rep-quadro">
        <thead><tr><th>Repasse</th>${meses}<th>Total</th></tr></thead>
        <tbody>
          ${linha("Receita de venda de lotes", receita, false)}
          ${linha("Impostos a pagar", pago.slice(0, 12).map((v) => -(Number(v) || 0)), false)}
          ${linha("2.03.02.18 Outras despesas administrativas", admin.map((v) => -v), false)}
          ${linha("Resultado", resultado, true)}
          ${linha("Moura Leite · " + OrcEst.esc(this.pctTxt(pct)), ml, true)}
        </tbody>
      </table></div>
    </section>`;
  },

  abasRepasse(lista, temYpes) {
    const itens = lista.map((p) => {
      const app = this.appPar();
      const tipo = app && typeof app.kindLabel === "function" ? app.kindLabel(p) : (p.kind || "");
      return { id: String(p.id), nome: p.partnerName || "Prestação", tipo: tipo || "" };
    });
    if (temYpes) itens.push({ id: "ypes-21", nome: "Reserva dos Ypês IV", tipo: "21" });
    itens.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR") || String(a.id).localeCompare(String(b.id)));
    return itens.map((p) => {
      const on = String(p.id) === String(this.abaId);
      return `<button type="button" role="tab" aria-selected="${on ? "true" : "false"}" class="ml-tab${on ? " is-active" : ""}" data-rep-aba="${OrcEst.esc(p.id)}"><i data-lucide="hand-coins"></i> ${OrcEst.esc(p.nome)}${p.tipo ? ` <span class="ml-tab-count">${OrcEst.esc(p.tipo)}</span>` : ""}</button>`;
    }).join("");
  },

  paintCorpo() {
    const body = document.getElementById("orc-rep-body");
    if (!body) return;
    const lista = this.prestacoes();
    const ypes = this.htmlYpes();
    const abaYpes = "ypes-21";
    if (!lista.length && !ypes) {
      body.innerHTML = `<div class="orc-dfc-erro">Não há parceria nem sociedade parametrizada para as empresas selecionadas.</div>`;
      if (window.lucide && lucide.createIcons) lucide.createIcons();
      return;
    }
    if (ypes && (String(this.abaId) === abaYpes || !lista.length)) {
      this.abaId = abaYpes;
      body.innerHTML = `<div class="ml-tabs orc-rep-tabs" role="tablist">${this.abasRepasse(lista, true)}</div>${ypes}`;
      body.querySelectorAll("[data-rep-aba]").forEach((btn) => {
        btn.addEventListener("click", () => this.setAba(btn.getAttribute("data-rep-aba")));
      });
      if (window.lucide && lucide.createIcons) lucide.createIcons();
      return;
    }
    const part = this.partAtual(lista);
    this.abaId = String(part.id || "");
    const appPar = this.appPar();
    const sociedade = !!(appPar && typeof appPar.isSociedade === "function" && appPar.isSociedade(part));
    const obra = sociedade ? null : this.obraAtual(part);
    this.obraCode = obra ? String(obra.code) : "";
    const card = this.montarDfc(part, this.linhasDaEmpresa(part.companyId), 0, sociedade ? "" : this.obraCode);
    const abas = this.abasRepasse(lista, !!ypes);
    const obras = sociedade ? "" : (part.obras || []).map((o) => {
      const on = String(o.code) === this.obraCode;
      const n = (o.costCenters || []).filter((c) => c.inAccount !== false).length;
      return `<button type="button" role="tab" aria-selected="${on ? "true" : "false"}" class="ml-tab${on ? " is-active" : ""}" data-rep-obra="${OrcEst.esc(o.code)}"><i data-lucide="building-2"></i> Obra ${OrcEst.esc(o.code)}${n ? ` <span class="ml-tab-count">${n}</span>` : ""}</button>`;
    }).join("");
    const aracari = this.aracariDe(part);
    const visao = aracari ? (this.visaoAracari === "empreendedor" ? "empreendedor" : "terrenista") : "";
    const vistos = new Set();
    const centros = [];
    (sociedade ? (part.obras || []) : (obra ? [obra] : [])).forEach((o) => {
      (o.costCenters || []).forEach((c) => {
        const id = String(c.id || "");
        if (!id || vistos.has(id)) return;
        vistos.add(id);
        centros.push(c);
      });
    });
    centros.sort((a, b) => this.ordemCentro(a.id, b.id));
    const marcas = aracari
      ? `<div class="ml-tabs orc-rep-visao" role="tablist">
          <button type="button" role="tab" aria-selected="${visao === "terrenista" ? "true" : "false"}" class="ml-tab${visao === "terrenista" ? " is-active" : ""}" data-rep-visao="terrenista"><i data-lucide="landmark"></i> Terrenista</button>
          <button type="button" role="tab" aria-selected="${visao === "empreendedor" ? "true" : "false"}" class="ml-tab${visao === "empreendedor" ? " is-active" : ""}" data-rep-visao="empreendedor"><i data-lucide="users"></i> Empreendedor</button>
        </div>`
      : (centros.length
      ? centros.map((c) => {
        const on = c.inAccount !== false;
        const nome = c.name ? " — " + c.name : "";
        return `<label class="orc-rep-cc-mark${on ? " is-on" : ""}"><input type="checkbox" data-rep-cc="${OrcEst.esc(c.id)}" ${on ? "checked" : ""}> ${OrcEst.esc(String(c.id) + nome)}</label>`;
      }).join("")
      : `<p class="orc-est-nota">${sociedade ? "Esta sociedade não tem centro de custo." : "Esta obra não tem centro de custo."} Inclua na parametrização do parceiro.</p>`);
    const rateio = aracari
      ? `<span class="orc-rep-sub">${visao === "empreendedor" ? "14201 · 70600" : "14202"}</span>`
      : (obra && !card.sociedade
      ? `<span class="orc-rep-sub">${card.extra ? "DFC integral · repasse no percentual" : (card.rateio ? ("Rateio " + OrcEst.esc(this.pctTxt(card.obraShare))) : "Integral")}</span>`
      : "");
    body.innerHTML = `
      <div class="ml-tabs orc-rep-tabs" role="tablist">${abas}</div>
      ${sociedade ? "" : (obras ? `<div class="ml-tabs orc-rep-obras" role="tablist">${obras}</div>` : `<p class="orc-est-nota">Esta prestação ainda não tem obra.</p>`)}
      <div class="orc-rep-ccs">${marcas}</div>
      <div class="orc-rep-resumo">
        <span><strong>${OrcEst.esc(card.nome)}</strong> <span class="orc-rep-sub">${OrcEst.esc((card.companyId ? card.companyId + " — " : "") + card.empresa)}</span> ${rateio}</span>
        <span class="orc-rep-valor"><span>${sociedade || visao === "empreendedor" ? "Variação — distribuição" : "Variação — repasse"}</span><b>${OrcEst.money(this.soma(card.variacao))}</b></span>
      </div>
      ${this.dfcHtml(card)}
      <p class="orc-est-nota">${card.companyId === "12"
        ? "Na empresa 12 a distribuição de cada mês é a variação de caixa desse mês. O lucro recebido da empresa 13 já entra nessa variação, no mês em que chega, e o centro 71200 completa a diferença."
        : (sociedade
        ? "Na sociedade o DFC junta todos os centros marcados. A linha 12 fica no mês em que o resultado acontece. A variação desse mês vira distribuição no mês seguinte, por centro de custo: janeiro de 2027 distribui dezembro de 2026, e dezembro de 2027 é distribuído em JAN/28. Cada sócio recebe o seu percentual. Repasse e dividendos já lançados no orçamento ficam de fora, para o valor não se abater duas vezes."
        : (visao === "terrenista"
        ? "O DFC é o centro 14202. O repasse do terrenista é a variação de caixa do centro 14201, paga no mês seguinte."
        : (visao === "empreendedor"
        ? "O DFC junta os centros 14201 e 70600. O saldo dos dois é a distribuição do mês seguinte, separada entre Moura Leite, Soma e PRF."
        : (card.extra
        ? "Esta obra tem o centro do empreendedor, o da parceria e outros centros (marketing, comercial, gestão). O DFC soma os centros marcados por inteiro, só nas contas ligadas na prestação de contas. O repasse do final é o percentual do parceiro sobre esse DFC, pago no mês seguinte no centro do empreendedor."
        : "Com o centro principal da obra marcado, o DFC soma os centros marcados por inteiro. Sem ele, o valor é o rateio do parceiro sobre a obra. A linha 12 fica no mês em que o resultado acontece. O repasse é a variação desse mês paga no mês seguinte: janeiro de 2027 paga dezembro de 2026. A variação do 13301 é paga no 13300, na conta cadastrada no 13301. A do 13401 é paga no 13400, na conta do 13401. O centro de custo não entra no cadastro do credor."))))}</p>`;
    body.querySelectorAll("[data-rep-aba]").forEach((btn) => {
      btn.addEventListener("click", () => this.setAba(btn.getAttribute("data-rep-aba")));
    });
    body.querySelectorAll("[data-rep-obra]").forEach((btn) => {
      btn.addEventListener("click", () => this.setObra(btn.getAttribute("data-rep-obra")));
    });
    body.querySelectorAll("[data-rep-visao]").forEach((btn) => {
      btn.addEventListener("click", () => this.setVisaoAracari(btn.getAttribute("data-rep-visao")));
    });
    body.querySelectorAll("[data-rep-cc]").forEach((el) => {
      el.addEventListener("change", () => this.marcarCc(el.getAttribute("data-rep-cc"), el.checked));
    });
    body.querySelectorAll("[data-rep-no]").forEach((tr) => {
      tr.addEventListener("click", () => this.toggleNo(tr.getAttribute("data-rep-part"), tr.getAttribute("data-rep-no")));
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    this.pedirForecastDezembro();
  },

  /* O forecast de dezembro pode estar só na nuvem. Quando chega, janeiro passa a mostrar o repasse. */
  distribuicaoDa(part) {
    const app = this.appPar();
    const sociedade = !!(app && typeof app.isSociedade === "function" && app.isSociedade(part));
    const linhas = this.linhasDaEmpresa(part.companyId);
    const linhasDez = this.linhasDez2026(part.companyId);
    const obras = sociedade ? [null] : ((part.obras && part.obras.length) ? part.obras : [null]);
    const saida = [];
    obras.forEach((obra) => {
      const especial = !sociedade && obra ? this.parExtra(obra, this.aracariDe(part) ? false : undefined) : null;
      if (especial) {
        const centrosExtra = this.centrosDa(part, obra.code, false);
        const linha = this.repasseDoExtra(linhas, linhasDez, centrosExtra, part, especial, obra);
        if ((linha.m || []).some((v) => Math.abs(Number(v) || 0) >= 0.005) || Math.abs(Number(linha.jan28) || 0) >= 0.005) {
          saida.push(Object.assign({ prestacao: part.partnerName || part.companyName || "Prestação" }, linha));
        }
        return;
      }
      const algumMarcado = !obra || (obra.costCenters || []).some((c) => c.inAccount !== false);
      const usarRateio = !sociedade && !!obra && !this.principalMarcado(obra) && algumMarcado;
      const centros = this.centrosDa(part, obra ? obra.code : "", usarRateio);
      const temParceiro = !sociedade && [...centros.values()].some((meta) => this.ccEhDoParceiro(meta.nome));
      const parceiros = [];
      centros.forEach((meta, ccId) => {
        if (temParceiro && !this.ccEhDoParceiro(meta.nome)) return;
        const idDig = String(ccId).replace(/\D/g, "");
        if (!sociedade && /00$/.test(idDig) && !this.ccEhDoParceiro(meta.nome)) return;
        parceiros.push({ ccId: ccId, meta: meta });
      });
      if (!sociedade && usarRateio && parceiros.length) {
        const anoMolde = this.molde();
        this.encher(anoMolde.tpl, anoMolde.byId, linhas, centros, part, true);
        const ano = (anoMolde.byId.g_12 && anoMolde.byId.g_12.months) ? anoMolde.byId.g_12.months.slice() : OrcEst.z();
        const umDez = this.molde();
        this.encher(umDez.tpl, umDez.byId, linhasDez, centros, part, true);
        const dezObra = (umDez.byId.g_12 && umDez.byId.g_12.months && umDez.byId.g_12.months[0]) || 0;
        const pagamento = this.serieDeslocada(dezObra, ano);
        const pesos = parceiros.map((p) => {
          const bruto = this.resultadoCc(linhas, linhasDez, new Map([[p.ccId, p.meta]]), part, false);
          const peso = Math.abs(bruto.dez) + bruto.ano.reduce((s, v) => s + Math.abs(Number(v) || 0), 0);
          return { p: p, peso: peso };
        });
        const somaP = pesos.reduce((s, item) => s + item.peso, 0);
        pesos.forEach((item) => {
          const fatia = somaP > 0.0001 ? item.peso / somaP : 1 / pesos.length;
          const m = pagamento.m.map((v) => (Number(v) || 0) * fatia);
          if (!m.some((v) => Math.abs(v) >= 0.005)) return;
          saida.push({
            prestacao: part.partnerName || part.companyName || "Prestação",
            obra: obra ? String(obra.code) : "",
            id: item.p.ccId,
            nome: item.p.meta.nome || "",
            m: m
          });
        });
        return;
      }
      parceiros.forEach((p) => {
        const serie = this.resultadoCc(linhas, linhasDez, new Map([[p.ccId, p.meta]]), part, usarRateio);
        const pag = this.serieDeslocada(serie.dez, serie.ano);
        if (!pag.m.some((v) => Math.abs(v) >= 0.005)) return;
        saida.push({
          prestacao: part.partnerName || part.companyName || "Prestação",
          obra: obra ? String(obra.code) : "",
          id: p.ccId,
          nome: p.meta.nome || "",
          m: pag.m
        });
      });
    });
    return saida;
  },

  cardsExportacao() {
    const app = this.appPar();
    const cards = [];
    this.prestacoes().forEach((part, i) => {
      const sociedade = !!(app && typeof app.isSociedade === "function" && app.isSociedade(part));
      const linhas = this.linhasDaEmpresa(part.companyId);
      if (sociedade) {
        cards.push(this.montarDfc(part, linhas, i, ""));
        return;
      }
      const obras = (part.obras && part.obras.length) ? part.obras : [null];
      if (this.aracariDe(part)) {
        obras.forEach((obra) => {
          ["terrenista", "empreendedor"].forEach((visao) => {
            cards.push(this.montarDfc(part, linhas, i, obra ? String(obra.code) : "", visao));
          });
        });
        return;
      }
      obras.forEach((obra) => cards.push(this.montarDfc(part, linhas, i, obra ? String(obra.code) : "")));
    });
    return cards.filter((c) => c && (c.temValor || (c.pessoas && c.pessoas.length)));
  },

  async exportDistribuicao() {
    const inv = window.InvestimentoApp;
    if (!inv || typeof inv.ensureExcelJS !== "function") {
      alert("O Excel ainda não carregou. Atualize a página e tente de novo.");
      return;
    }
    const dfc = typeof OrcamentoDfcApp !== "undefined" ? OrcamentoDfcApp : null;
    const caixa = window.ResultadoCaixaApp;
    if (!this.garantirForecastLocal() && dfc && caixa && typeof dfc.lerForecastsSalvos === "function") {
      try { await dfc.lerForecastsSalvos(caixa); } catch (e) {}
    }
    const cards = this.cardsExportacao();
    const porEmpresa = new Map();
    cards.forEach((card) => {
      const id = String(card.companyId || "");
      if (!porEmpresa.has(id)) porEmpresa.set(id, []);
      porEmpresa.get(id).push(card);
    });
    if (!porEmpresa.size) {
      alert("Não há distribuição para exportar nas prestações selecionadas.");
      return;
    }
    const ExcelJS = await inv.ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    wb.created = new Date();
    const nomesMes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const colunas = ["Centro de custo"].concat(nomesMes, ["JAN/28", "Total"]);
    const last = colunas.length;
    const used = new Set();
    const pintar = (ws, cell, opts) => inv.excelPaint(cell, opts);
    const faixa = (ws, texto, fill, cor) => {
      const linha = ws.addRow([]);
      linha.height = 18;
      ws.mergeCells(linha.number, 1, linha.number, last);
      for (let i = 1; i <= last; i++) {
        const cell = linha.getCell(i);
        if (i === 1) cell.value = texto;
        pintar(ws, cell, {
          font: { size: 9, bold: true, color: { argb: cor } },
          fill: fill,
          align: { horizontal: "left", vertical: "middle" },
          border: true
        });
      }
    };
    const numeros = (ws, rotulo, meses, jan28, fill, branco) => {
      const linha = ws.addRow([]);
      const serie = meses || OrcEst.z();
      const vals = [rotulo].concat(serie.map((v) => Number(v) || 0), [Number(jan28) || 0, this.soma(serie)]);
      vals.forEach((v, i) => {
        const cell = linha.getCell(i + 1);
        const num = i >= 1;
        cell.value = num ? (Number(v) || 0) : v;
        const n = Number(v) || 0;
        const cor = branco ? "FFFFFFFF" : (num && n < -0.004 ? "FFB91C1C" : (num && Math.abs(n) < 0.005 ? "FF94A3B8" : "FF0F172A"));
        pintar(ws, cell, {
          font: { size: 9, bold: !!branco, color: { argb: cor } },
          fill: fill,
          align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
          border: true,
          numFmt: num ? "#,##0.00" : undefined
        });
      });
    };
    for (const [emp, lista] of porEmpresa) {
      const nome = this.nomeEmpresaExport(emp);
      const ws = wb.addWorksheet(inv.excelSheetName(emp, used), { views: [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", activeCell: "B5" }] });
      ws.properties.showGridLines = false;
      ws.columns = colunas.map((_, i) => ({ width: i === 0 ? 42 : 14 }));
      ws.mergeCells("A1:A2");
      ws.getRow(1).height = 28;
      ws.getRow(2).height = 22;
      ws.getRow(3).height = 8;
      ws.getRow(4).height = 20;
      const title = ws.getCell("A1");
      title.value = {
        richText: [
          { font: { name: "Calibri", size: 14, bold: true, color: { argb: "FF475569" } }, text: "Prestação de contas\n" },
          { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: nome + (String(emp) === "12"
            ? ". Cada mês distribui a variação de caixa desse mês. O lucro da empresa 13 entra no mês em que chega."
            : (String(emp) === "6"
            ? ". Terrenista: variação do 14201 no mês seguinte. Empreendedor: saldo de 14201 e 70600, separado entre Moura Leite, Soma e PRF."
            : ". Janeiro é o repasse da variação de dezembro de 2026. Cada mês paga a variação do mês anterior.")) }
        ]
      };
      pintar(ws, title, { fill: "FFFFFFFF", align: { vertical: "middle", horizontal: "left", wrapText: true, indent: 8 } });
      try {
        const logo = await inv.logoDataUrl();
        if (logo && logo.dataUrl) {
          const img = wb.addImage({ base64: logo.dataUrl, extension: logo.extension || "png" });
          const px = Math.round(1.54 * 96 / 2.54);
          ws.addImage(img, { tl: { col: 0.04, row: 0.08 }, ext: { width: px, height: px } });
        }
      } catch (e) {}
      const temAracari = lista.some((card) => card.aracariVisao);
      const totalGeral = lista.reduce((s, card) => s + (card.aracariVisao === "terrenista" ? 0 : this.soma(card.variacao)), 0);
      const c1 = ws.getCell(1, 5);
      const c2 = ws.getCell(2, 5);
      c1.value = temAracari ? "Distribuição 2027" : "Repasse 2027";
      c2.value = totalGeral;
      pintar(ws, c1, { font: { size: 8, bold: true, color: { argb: "FF94A3B8" } }, align: { horizontal: "right", vertical: "middle" } });
      pintar(ws, c2, { font: { size: 12, bold: true, color: { argb: "FF0F172A" } }, align: { horizontal: "right", vertical: "middle" }, numFmt: "#,##0.00" });
      const head = ws.getRow(4);
      colunas.forEach((nomeCol, i) => {
        const cell = head.getCell(i + 1);
        cell.value = nomeCol;
        pintar(ws, cell, {
          font: { size: 9, bold: true, color: { argb: "FFFFFFFF" } },
          fill: "FF334155",
          align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
          border: true
        });
      });
      const porNome = new Map();
      lista.forEach((card) => {
        const chave = String(card.nome || "Prestação") + (card.aracariVisao ? "|" + card.aracariVisao : "");
        if (!porNome.has(chave)) porNome.set(chave, []);
        porNome.get(chave).push(card);
      });
      porNome.forEach((grupo) => {
        const base = grupo[0];
        const vista = base.aracariVisao === "terrenista" ? " · TERRENISTA" : (base.aracariVisao === "empreendedor" ? " · EMPREENDEDOR" : "");
        faixa(ws, "PRESTAÇÃO DE CONTAS " + String(base.nome || "PRESTAÇÃO").toUpperCase() + vista, "FF0C3D28", "FFFFFFFF");
        const centros = [];
        grupo.forEach((card) => {
          (card.distribuicao || []).forEach((r) => {
            if ((r.m || []).some((v) => Math.abs(Number(v) || 0) >= 0.005) || Math.abs(Number(r.jan28) || 0) >= 0.005) centros.push(r);
          });
        });
        centros.sort((a, b) => this.ordemCentro(a.id, b.id));
        const acc = OrcEst.z();
        let janAcc = 0;
        centros.forEach((r) => {
          (r.m || OrcEst.z()).forEach((v, i) => { acc[i] += Number(v) || 0; });
          janAcc += Number(r.jan28) || 0;
        });
        const pessoas = [];
        const visto = new Set();
        grupo.forEach((card) => {
          (card.pessoas || []).forEach((p) => {
            const nomeP = String(p.nome || "").trim();
            if (!nomeP || visto.has(nomeP) || !(Number(p.pct) > 0)) return;
            visto.add(nomeP);
            pessoas.push(p);
          });
        });
        pessoas.sort((a, b) => this.ordemCentro(a.ccId, b.ccId) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
        const divide = pessoas.length > 1 || (pessoas.length === 1 && Math.abs(Number(pessoas[0].pct) - 100) > 0.05);
        const linhaCentro = (r, meses, jan) => {
          const pago = r.pagoEm || this.ccPagamento(r.id);
          const onde = !base.sociedade && pago && pago !== String(r.id).replace(/\D/g, "") ? " · pago no " + pago : "";
          numeros(ws, String(r.id) + (r.nome ? " — " + r.nome : "") + onde, meses, jan, "FFFFFFFF", false);
        };
        if (base.sociedade && pessoas.length) {
          const pAcc = OrcEst.z();
          let pJan = 0;
          pessoas.forEach((p) => {
            const meses = p.m || OrcEst.z();
            meses.forEach((v, i) => { pAcc[i] += Number(v) || 0; });
            pJan += Number(p.jan28) || 0;
            numeros(ws, this.rotuloSocio(p), meses, p.jan28, "FFFFFFFF", false);
          });
          numeros(ws, "Total", pAcc, pJan, "FF475569", true);
        } else if (!centros.length) faixa(ws, "Nenhum centro de custo nesta prestação", "FFFFFFFF", "FF64748B");
        else if (divide) {
          pessoas.forEach((p) => {
            const fatia = (Number(p.pct) || 0) / 100;
            const rotuloP = base.aracariVisao === "empreendedor" ? this.nomeSocioCurto(p.nome) : String(p.nome || "Parceiro");
            faixa(ws, rotuloP.toUpperCase() + " · " + this.pctTxt(p.pct) + (base.aracariVisao === "empreendedor" && p.ccId ? " · " + p.ccId : ""), "FFE7F6EE", "FF105436");
            const pAcc = OrcEst.z();
            let pJan = 0;
            centros.forEach((r) => {
              const meses = (r.m || OrcEst.z()).map((v) => (Number(v) || 0) * fatia);
              const jan = (Number(r.jan28) || 0) * fatia;
              meses.forEach((v, i) => { pAcc[i] += v; });
              pJan += jan;
              linhaCentro(r, meses, jan);
            });
            numeros(ws, "Total", pAcc, pJan, "FF475569", true);
          });
          if (base.aracariVisao === "empreendedor") numeros(ws, "Total 14201 + 70600", acc, janAcc, "FF0C3D28", true);
        } else {
          centros.forEach((r) => linhaCentro(r, r.m || OrcEst.z(), r.jan28));
          numeros(ws, "Total", acc, janAcc, "FF475569", true);
        }
      });
      ws.addRow([]);
      const foot = ws.addRow([]);
      foot.height = 18;
      ws.mergeCells(foot.number, 1, foot.number, last);
      const rodape = foot.getCell(1);
      rodape.value = inv.generatedAtLabel(new Date());
      pintar(ws, rodape, { font: { size: 8, italic: true, color: { argb: "FF64748B" } }, align: { horizontal: "left", vertical: "middle" } });
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Prestacao-de-contas-2027.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  rotuloSocio(p) {
    const pct = Number(p && p.pct) ? " · " + this.pctTxt(p.pct) : "";
    const cc = String((p && p.ccId) || "").trim();
    const ccNome = String((p && p.ccNome) || "").trim();
    if (cc) return cc + (ccNome ? " - " + ccNome : "") + pct;
    return String((p && p.nome) || "Sócio") + pct;
  },

  nomeEmpresaExport(id) {
    const c = this.empresasFiltro().find((e) => String(e.id) === String(id));
    return c ? (c.id + " - " + (c.name || c.label || "")) : String(id || "");
  },

  pedirForecastDezembro() {
    if (this._fcDez) return;
    if (this.garantirForecastLocal()) return;
    const dfc = typeof OrcamentoDfcApp !== "undefined" ? OrcamentoDfcApp : null;
    const app = window.ResultadoCaixaApp;
    if (!dfc || typeof dfc.lerForecastsSalvos !== "function" || !app) return;
    this._fcDez = "lendo";
    dfc.lerForecastsSalvos(app).then(() => {
      const achou = this.garantirForecastLocal();
      this._fcDez = achou ? "" : "vazio";
      if (achou && document.getElementById("orc-rep-body")) this.paintCorpo();
    }).catch(() => { this._fcDez = "vazio"; });
  },

  cardHtml(card) {
    const aberto = !this.fechados[card.id];
    const rotulo = card.kind === "sociedade" ? "Sociedade" : (card.kind === "mista" ? "Mista" : "Parceria");
    const total = this.soma(card.variacao);
    const centros = (card.centros || []).join(" · ") || "nenhum centro cadastrado";
    return `<section class="orc-rep-card">
      <button type="button" class="orc-rep-head" data-rep-card="${OrcEst.esc(card.id)}">
        <span>
          <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}"></i>
          <strong>${OrcEst.esc(card.nome)}</strong>
          <span class="orc-est-tipo">${rotulo}</span>
          <span class="orc-rep-sub">${OrcEst.esc(card.companyId + " — " + card.empresa)}</span>
          <span class="orc-rep-sub">Centros ${OrcEst.esc(centros)}</span>
        </span>
        <span class="orc-rep-valor"><span>Variação — repasse</span><b>${OrcEst.money(total)}</b></span>
      </button>
      ${aberto ? this.dfcHtml(card) : ""}
    </section>`;
  },

  ccPagamento(id) {
    const dig = String(id || "").replace(/\D/g, "");
    if (dig.length < 3 || /00$/.test(dig)) return dig;
    return dig.slice(0, -2) + "00";
  },

  colunasRepasse() {
    const meses = OrcEst.MESES.map(() => `<col class="orc-rep-mes">`).join("");
    return `<colgroup><col class="orc-rep-nome">${meses}<col class="orc-rep-mes"><col class="orc-rep-mes"></colgroup>`;
  },

  cabecaPagamento(primeira, mesmoMes) {
    const meses = OrcEst.MESES.map((m) => `<th>${m}</th>`).join("");
    const origens = OrcEst.MESES.map((m, i) => {
      const de = mesmoMes ? (m + "/27") : (i === 0 ? "DEZ/26" : (OrcEst.MESES[i - 1] + "/27"));
      return `<th>variação de caixa de ${de}</th>`;
    }).join("");
    const jan28 = mesmoMes ? "lucros da empresa 13 de DEZ/27" : "variação de caixa de DEZ/27";
    return `<tr><th rowspan="2">${primeira}</th>${meses}<th>JAN/28</th><th rowspan="2">Total</th></tr><tr class="orc-rep-origem">${origens}<th>${jan28}</th></tr>`;
  },

  dfcHtml(card) {
    if (!card.centros || !card.centros.length) {
      return `<p class="orc-est-nota">Marque ao menos um centro de custo${card.sociedade ? "." : " desta obra."}</p>`;
    }
    if (!card.temValor) {
      return `<p class="orc-est-nota">Não há lançamento de 2027 nos centros desta ${card.sociedade ? "sociedade" : "parceria"}.</p>`;
    }
    const aberto = this.nosDe(card);
    const headMeses = OrcEst.MESES.map((m) => `<th>${m}</th>`).join("") + `<th>JAN/28</th><th>Total 2027</th>`;
    const head = `<th title="Resultado do forecast de dezembro de 2026. O repasse desse resultado entra em janeiro de 2027.">DEZ/26</th>` + headMeses;
    const pilha = [];
    const linhas = [];
    (card.rows || []).forEach((r) => {
      while (pilha.length && pilha[pilha.length - 1].level >= r.level) pilha.pop();
      const escondido = pilha.some((p) => !p.open);
      if (escondido) return;
      if (r.hasKids) pilha.push({ open: aberto.has(r.id), level: r.level });
      const cls = [
        r.isAccount ? "orc-dfc-acc" : "",
        r.isCc ? "orc-dfc-cc" : "",
        r.type === "formula" ? "orc-dfc-formula" : "",
        r.type === "total_n1" ? "orc-dfc-n1" : "",
        r.id === "g_12" ? "orc-rep-var" : "",
        r.id === "g_08" ? "orc-dfc-fcf" : "",
        r.id === "g_03" ? "orc-dfc-saida-forte" : "",
        (r.id === "g_02" || r.id === "g_04" || r.id === "g_05") ? "orc-dfc-saida" : ""
      ].filter(Boolean).join(" ");
      const ico = r.hasKids
        ? `<i data-lucide="${aberto.has(r.id) ? "chevron-down" : "chevron-right"}"></i>`
        : `<i class="orc-dfc-no"></i>`;
      const pcts = (r.pcts || []).map((n) => this.pctTxt(n));
      const pct = r.isCc && r.pct ? `<span class="orc-rep-pct">${this.pctTxt(r.pct)}</span>` : (pcts.length ? `<span class="orc-rep-pct">${OrcEst.esc(pcts.join(" · "))}</span>` : "");
      const ccs = r.isAccount && r.ccIds && r.ccIds.length ? `<span class="orc-rep-cc">${OrcEst.esc(r.ccIds.join(" · "))}</span>` : "";
      const dezN = Number(r.dez) || 0;
      const dezTd = `<td class="orc-rep-fc${dezN < -0.004 ? " orc-dfc-neg" : ""}" title="Forecast de dezembro de 2026">${OrcEst.money(dezN)}</td>`;
      const cel = (r.months || []).map((v) => {
        const n = Number(v) || 0;
        return `<td${n < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(n)}</td>`;
      }).join("");
      const jan = r.id === "g_12"
        ? `<td${Number(r.jan28) < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(r.jan28)}</td>`
        : `<td>—</td>`;
      const click = r.hasKids ? ` data-rep-part="${OrcEst.esc(card.id)}" data-rep-no="${OrcEst.esc(r.id)}"` : "";
      linhas.push(`<tr class="${cls}"${click}>
        <td style="padding-left:${10 + r.level * 14}px">${ico}<span>${OrcEst.esc(r.name)}</span>${pct}${ccs}</td>
        ${dezTd}
        ${cel}
        ${jan}
        <td${this.soma(r.months) < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(this.soma(r.months))}</td>
      </tr>`);
    });
    let socios = "";
    if (card.pessoas && card.pessoas.length) {
      const aviso = card.kind === "mista"
        ? ""
        : (Math.abs(card.pctPessoas - 100) > 0.05
          ? `<p class="orc-est-alerta">As participações somam ${OrcEst.esc(this.pctTxt(card.pctPessoas))}, não 100%.</p>`
          : "");
      let quem = "Cada participante recebe este percentual do repasse do mês seguinte.";
      if (card.extra) quem = "Cada participante recebe este percentual do repasse do mês seguinte.";
      else if (card.aracari) quem = "O saldo dos centros 14201 e 70600 é a distribuição do mês seguinte. Cada sócio recebe a fatia cadastrada.";
      else if (card.kind === "mista") quem = "Cada empreendedor recebe, sobre o valor do terrenista, a proporção da fatia dele. 50% de uma fatia de 56% são 28% do negócio.";
      else if (card.companyId === "12") quem = "Cada sócio recebe este percentual da variação de caixa do mês. O lucro recebido da empresa 13 já está nessa variação.";
      else if (card.sociedade) quem = "Cada sócio recebe este percentual da distribuição do mês seguinte, no centro de custo cadastrado.";
      const coluna = card.sociedade ? "Centro de custo" : "Participante";
      const totM = OrcEst.z();
      let totJan = 0;
      if (card.aracari) {
        card.pessoas.forEach((p) => {
          (p.m || []).forEach((v, i) => { if (i < 12) totM[i] += Number(v) || 0; });
          totJan += Number(p.jan28) || 0;
        });
      }
      const totalEmp = card.aracari
        ? `<tfoot><tr><td>Resultado 14201 + 70600</td>${totM.map((v) => `<td${v < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(v)}</td>`).join("")}<td${totJan < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(totJan)}</td><td>${OrcEst.money(this.soma(totM))}</td></tr></tfoot>`
        : "";
      socios = `<div class="orc-rep-socios"><h4>${quem}</h4>${aviso}
        <div class="orc-dfc-scroll"><table class="orc-dfc-table orc-est-table orc-rep-quadro">${this.colunasRepasse()}<thead>${this.cabecaPagamento(coluna, card.distribuiNoMes)}</thead><tbody>
        ${card.pessoas.map((p) => {
          const quemP = card.sociedade ? this.rotuloSocio(p) : (p.nome + " · " + this.pctTxt(p.pct) + (card.aracari && p.ccId ? " · " + p.ccId : ""));
          return `<tr><td>${OrcEst.esc(quemP)}</td>${(p.m || []).map((v) => `<td${Number(v) < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(v)}</td>`).join("")}<td${Number(p.jan28) < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(p.jan28)}</td><td>${OrcEst.money(this.soma(p.m))}</td></tr>`;
        }).join("")}
        </tbody>${totalEmp}</table></div></div>`;
    }
    const centrosRep = (card.distribuicao || []).slice().sort((a, b) => this.ordemCentro(a.id, b.id));
    const rotuloRep = card.sociedade ? "Distribuição" : "Repasse";
    const fraseRep = card.companyId === "12"
      ? "A distribuição do mês é a variação de caixa desse mês. O lucro recebido da empresa 13 entra no mês em que chega."
      : (card.sociedade
        ? "A variação de caixa de um mês vira distribuição no mês seguinte."
        : (card.aracariVisao === "terrenista"
          ? "O repasse do terrenista é a variação de caixa do centro 14201, paga no mês seguinte."
          : (card.extra
          ? "A variação de caixa do DFC integral, no percentual do parceiro e só nas contas da prestação, é o repasse do mês seguinte. Ele é pago no centro do empreendedor."
          : "A variação de caixa de um mês é o repasse do mês seguinte, pago no centro da obra e na conta cadastrada no centro do parceiro.")));
    let quadro = "";
    if (centrosRep.length) {
      const acc = OrcEst.z();
      let janAcc = 0;
      const corpo = centrosRep.map((r) => {
        const meses = r.m || OrcEst.z();
        meses.forEach((v, i) => { acc[i] += Number(v) || 0; });
        janAcc += Number(r.jan28) || 0;
        const pago = !card.sociedade ? (r.pagoEm || this.ccPagamento(r.id)) : "";
        const nome = String(r.id) + (r.nome ? " — " + r.nome : "") + (pago && pago !== String(r.id).replace(/\D/g, "") ? " · pago no " + pago : "");
        return `<tr><td>${OrcEst.esc(nome)}</td>${meses.map((v) => {
          const n = Number(v) || 0;
          return `<td${n < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(n)}</td>`;
        }).join("")}<td${Number(r.jan28) < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(r.jan28)}</td><td>${OrcEst.money(this.soma(meses))}</td></tr>`;
      }).join("");
      quadro = `<div class="orc-rep-socios"><h4>${OrcEst.esc(rotuloRep)}. ${OrcEst.esc(fraseRep)}</h4>
        <div class="orc-dfc-scroll"><table class="orc-dfc-table orc-est-table orc-rep-quadro">${this.colunasRepasse()}<thead>${this.cabecaPagamento("Centro de custo", card.distribuiNoMes)}</thead>
        <tbody>${corpo}</tbody>
        <tfoot><tr><td>Total</td>${acc.map((v) => `<td${v < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(v)}</td>`).join("")}<td${janAcc < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${OrcEst.money(janAcc)}</td><td>${OrcEst.money(this.soma(acc))}</td></tr></tfoot>
        </table></div></div>`;
    }
    const dfc = `<div class="orc-dfc-scroll"><table class="orc-dfc-table orc-est-table">
      <thead><tr><th>DFC</th>${head}</tr></thead>
      <tbody>${linhas.join("")}</tbody>
    </table></div>`;
    if (card.aracariVisao === "terrenista") return `${dfc}${quadro}`;
    if (card.aracariVisao === "empreendedor") return `${dfc}${socios}`;
    return `${dfc}${quadro}${socios}`;
  }
};
