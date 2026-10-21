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
    if (tag === "Base para Vendas de Lote" || /DESCONTO DE JUROS CONTRAT/.test(nome) || String(l.conta || "").replace(/\D/g, "") === "2050103") bucket = "vendas";
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
      const celulas = pago.slice(0, 12).map((v, i) => this.cel(v, row.id, i === 0 ? "PIS e COFINS do forecast de dezembro de 2026 e trimestre de outubro a dezembro" : "")).join("");
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
      <p class="orc-est-nota">Janeiro de 2027 usa o forecast de 2026. Clique na empresa para ver a receita de cada mês e o mês em que o imposto é pago.</p>`;
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
    const dica = [cheio, title].filter(Boolean).join(". ");
    const texto = v == null ? "—" : this.moneyGrade(v);
    return `<td data-est-id="${OrcEst.esc(id)}" title="${OrcEst.esc(dica)}">${texto}</td>`;
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
    const dezBag = this.bases2026()["2026-12"];
    const dez = (dezBag && dezBag[Number(row.id)]) || null;
    const cols = [{ nome: "Vendas", arr: row.vendas, dez: dez && dez.vendas }];
    if (tem(row.redV) || (dez && Math.abs(Number(dez.redV) || 0) >= 0.5)) cols.push({ nome: "Redutoras", arr: row.redV, dez: dez ? dez.redV : null, dica: "Já abatida da venda. O valor da coluna Vendas está líquido. Dezembro de 2026 vem do forecast." });
    cols.push({ nome: "Serviços", arr: row.servicos, dez: dez && dez.servicos });
    if (tem(row.redS) || (dez && Math.abs(Number(dez.redS) || 0) >= 0.5)) cols.push({ nome: "Red. serviços", arr: row.redS, dez: dez ? dez.redS : null });
    if (tem(row.financeiras) || tem(row.redF)) cols.push({ nome: "Aplicações", arr: row.financeiras, dez: dez && dez.financeiras });
    if (tem(row.redF) || (dez && Math.abs(Number(dez.redF) || 0) >= 0.5)) cols.push({ nome: "Red. aplicações", arr: row.redF, dez: dez ? dez.redF : null });
    const head = `<th>Competência</th>${cols.map((c) => `<th${c.dica ? ` title="${OrcEst.esc(c.dica)}"` : ""}>${c.nome}</th>`).join("")}<th>PIS</th><th>COFINS</th><th>Pago em</th>`;
    const celBase = (c, i) => `<td>${i == null ? mo(c.dez) : mo(c.arr[i])}</td>`;
    const linhaMes = (rotulo, i, pis, cofins, quando) => `<tr><td>${rotulo}</td>${cols.map((c) => celBase(c, i)).join("")}<td>${mo(pis)}</td><td>${mo(cofins)}</td><td class="orc-imp-quando">${quando}</td></tr>`;
    const meses = nomes.map((nome, i) => linhaMes(nome, i, row.pis[i], row.cofins[i], pagoEm[i])).join("");
    const linhaDez = linhaMes("Dez/26", null, row.pagar.pis[0], row.pagar.cofins[0], "Jan");
    const tris = [
      ["Out–dez/26", row.pagar.irpj[0], row.pagar.csll[0], "Jan"],
      ["Jan–mar", row.q0 && row.q0.irpj, row.q0 && row.q0.csll, "Abr"],
      ["Abr–jun", row.q1 && row.q1.irpj, row.q1 && row.q1.csll, "Jul"],
      ["Jul–set", row.q2 && row.q2.irpj, row.q2 && row.q2.csll, "Out"],
      ["Out–dez", row.q3 && row.q3.irpj, row.q3 && row.q3.csll, "Jan/28"]
    ];
    const triCorpo = tris.map((t) => `<tr><td>${t[0]}</td><td>${mo(t[1])}</td><td>${mo(t[2])}</td><td class="orc-imp-quando">${t[3]}</td></tr>`).join("");
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
