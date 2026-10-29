// Painel e tabela mensal do DFC 2027, no desenho dos slides do grupo.
const OrcamentoDfcSlidesApp = {
  MESES: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
  MESES_LONGOS: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"],

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  soma(a, b) {
    const out = [];
    for (let i = 0; i < 12; i++) out.push((Number(a && a[i]) || 0) + (Number(b && b[i]) || 0));
    return out;
  },

  total(m) {
    return (m || []).reduce((a, b) => a + (Number(b) || 0), 0);
  },

  mi(n, casas) {
    const v = (Number(n) || 0) / 1000000;
    const abs = Math.abs(v);
    const d = casas != null ? casas : (abs >= 0.095 ? 1 : 2);
    if (abs < 0.005) return "0,0";
    const t = abs.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
    return v < 0 ? "(" + t + ")" : t;
  },

  miHero(n) {
    return this.mi(n, 1).replace(/[()]/g, "") + " M";
  },

  nomeCurto(id, enome) {
    const n = Number(id) || 0;
    try {
      const raw = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}");
      const cfg = raw[n] || raw[String(n)] || {};
      const usual = String(cfg.nome_usual || "").trim();
      if (usual) return usual;
    } catch (e) {}
    let s = String(enome || "").replace(/^\d+\s*-\s*/, "").trim();
    s = s.replace(/\s+(LTDA|SPE|EIRELI|S\.?A\.?).*/i, "").trim();
    if (s.length > 28) s = s.slice(0, 26).trim() + "…";
    return s || (n ? "Empresa " + n : "Sem empresa");
  },

  nomeProjeto(en, cc) {
    let s = String(en || "").replace(/^\d+\s*-\s*/, "").trim();
    const pedaco = s.split("|").pop();
    s = String(pedaco || s).trim();
    if (s.length > 26) s = s.slice(0, 24).trim() + "…";
    return s || (cc ? String(cc) : "Sem projeto");
  },

  appDfc() {
    if (typeof OrcamentoDfcApp !== "undefined") return OrcamentoDfcApp;
    return window.OrcamentoDfcApp || null;
  },

  fluxoDfc() {
    if (typeof FluxoCaixaApp !== "undefined") return FluxoCaixaApp;
    return window.FluxoCaixaApp || null;
  },

  empresaSlide(app) {
    const lista = app && typeof app.empresas === "function" ? app.empresas() : [];
    const achou = lista.find((e) => String(e.id) === "1")
      || lista.find((e) => /MOURA\s+LEITE/i.test(String(e.name || "")));
    return achou ? String(achou.id) : "1";
  },

  quadro() {
    const app = this.appDfc();
    if (!app || typeof app.montar !== "function") return null;
    if (typeof app.garantir === "function") app.garantir();
    const emp = (app.selectedCompanyIds || []).slice();
    const cc = (app.selectedCcIds || []).slice();
    const planos = (app.selectedPlanIds || []).slice();
    const grupos = (app.selectedGrupoIds || []).slice();
    app.selectedCompanyIds = [this.empresaSlide(app)];
    app.selectedCcIds = [];
    app.selectedPlanIds = [];
    app.selectedGrupoIds = [];
    let pack = null;
    try {
      pack = app.montar();
      if (app._saldoEstado === "ok" && typeof app.chaveSaldos === "function") {
        const chave = app.chaveSaldos();
        if (String(app._saldoChave || "") === chave) this._chaveSaldo = chave;
      }
    }
    finally {
      app.selectedCompanyIds = emp;
      app.selectedCcIds = cc;
      app.selectedPlanIds = planos;
      app.selectedGrupoIds = grupos;
    }
    const byId = {};
    ((pack && pack.rows) || []).forEach((r) => { if (r && r.id && !byId[r.id]) byId[r.id] = r; });
    const meses = (id) => {
      const r = byId[id];
      const src = (r && r.months) || [];
      const out = [];
      for (let i = 0; i < 12; i++) out.push(Number(src[i]) || 0);
      return out;
    };
    const base = (id) => {
      const r = byId[id];
      const src = (r && r.base) || [];
      const out = [];
      for (let i = 0; i < 12; i++) out.push(Number(src[i]) || 0);
      return out;
    };
    const juntar = (ids) => ids.reduce((acc, id) => ({
      meses: this.soma(acc.meses, meses(id)),
      base: this.soma(acc.base, base(id))
    }), { meses: Array(12).fill(0), base: Array(12).fill(0) });
    const entradas = juntar(["g_01"]);
    const impostos = juntar(["g_02"]);
    const repasses = juntar(["g_04_01"]);
    const projetos = juntar(["g_04_02"]);
    const obras = juntar(["g_04_03"]);
    const terrenos = juntar(["g_04_05"]);
    const despesas = juntar(["g_05", "g_04_04"]);
    const capex = juntar(["g_07", "g_09"]);
    const fcfM = [entradas, impostos, repasses, projetos, obras, terrenos, despesas, capex]
      .reduce((acc, p) => this.soma(acc, p.meses), Array(12).fill(0));
    const fcfB = [entradas, impostos, repasses, projetos, obras, terrenos, despesas, capex]
      .reduce((acc, p) => this.soma(acc, p.base), Array(12).fill(0));
    const linhas = [
      { id: "entradas", nome: "Entradas", meses: entradas.meses, base: entradas.base },
      { id: "impostos", nome: "Impostos", meses: impostos.meses, base: impostos.base },
      { id: "repasses", nome: "Repasses", meses: repasses.meses, base: repasses.base },
      { id: "projetos", nome: "Projetos", meses: projetos.meses, base: projetos.base },
      { id: "obras", nome: "Obras", meses: obras.meses, base: obras.base },
      { id: "terrenos", nome: "Aquisição de terrenos", meses: terrenos.meses, base: terrenos.base },
      { id: "despesas", nome: "Despesas", meses: despesas.meses, base: despesas.base },
      { id: "capex", nome: "Capex / desp. finan.", meses: capex.meses, base: capex.base },
      { id: "fcf", nome: "FCF — fluxo de caixa livre", meses: fcfM, base: fcfB, forte: true },
      { id: "aportes", nome: "Aportes", meses: meses("g_11_03"), base: base("g_11_03") },
      { id: "divmenos", nome: "(−) Dividendos", meses: meses("g_11_01"), base: base("g_11_01") },
      { id: "divmais", nome: "(+) Dividendos", meses: meses("g_11_02"), base: base("g_11_02") }
    ];
    const variacao = meses("g_12");
    const variacao26 = base("g_12");
    if (!variacao.some((v) => Math.abs(v) >= 0.5) && !linhas.some((l) => Math.abs(this.total(l.meses)) >= 0.5)) {
      return { vazio: true };
    }
    const barras = this.barras();
    const fechar = (itens, meses) => {
      const soma = (itens || []).reduce((s, x) => s + (Number(x.valor) || 0), 0);
      const diff = this.total(meses) - soma;
      if (Math.abs(diff) >= 500) itens.push({ nome: "Outros", valor: diff });
      return itens;
    };
    fechar(barras.entradas, entradas.meses);
    fechar(barras.obras, obras.meses);
    return {
      vazio: false,
      linhas: linhas,
      variacao: variacao,
      variacao26: variacao26,
      saldos: this.saldos(variacao, variacao26),
      barras: barras
    };
  },

  /* Mesma régua do DFC: caixa realizado até o corte e, daí em diante, a variação de 2026. Janeiro de 2027 abre no saldo final de dezembro. */
  saldos(variacao, variacao26) {
    const app = this.appDfc();
    const chaveOk = !!(app && this._chaveSaldo && String(app._saldoChave || "") === String(this._chaveSaldo));
    const estado = app && app._saldoEstado;
    const pronto = chaveOk && estado === "ok";
    const aguardando = !chaveOk || !estado || estado === "lendo";
    let fim26 = 0;
    let temCaixa = false;
    if (pronto) {
      try {
        const corte = typeof app.corteForecast === "function" ? app.corteForecast() : 9;
        let cursor = 0;
        for (let i = 0; i < 12; i++) {
          if (i < corte) {
            cursor = app.somaSaldo(app.dataSaldo(2026, i + 1));
            if (Math.abs(cursor) >= 0.5) temCaixa = true;
          } else cursor += Number(variacao26[i]) || 0;
        }
        fim26 = cursor;
      } catch (e) { fim26 = 0; temCaixa = false; }
    }
    const y = [];
    for (let i = 0; i < 12; i++) {
      const ini = i === 0 ? fim26 : y[i - 1].fim;
      const v = Number(variacao[i]) || 0;
      y.push({ ini: ini, fim: ini + v, variacao: v });
    }
    let minI = 0;
    y.forEach((p, i) => { if (p.fim < y[minI].fim) minI = i; });
    return { meses: y, temCaixa: temCaixa, minI: minI, aguardando: aguardando };
  },

  async garantirSaldoSlide(app) {
    if (!app || typeof app.pedirSaldos !== "function") return;
    const emp = (app.selectedCompanyIds || []).slice();
    const cc = (app.selectedCcIds || []).slice();
    let chave = "";
    app.selectedCompanyIds = [this.empresaSlide(app)];
    app.selectedCcIds = [];
    try {
      chave = typeof app.chaveSaldos === "function" ? app.chaveSaldos() : "";
      app.pedirSaldos();
    } finally {
      app.selectedCompanyIds = emp;
      app.selectedCcIds = cc;
    }
    this._chaveSaldo = chave;
    for (let i = 0; i < 120; i++) {
      const st = app._saldoEstado;
      if (chave && String(app._saldoChave || "") === chave && st && st !== "lendo") return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  },

  /* 2.07.10 ainda não está no Excel importado. O total é o de 2027 da linha Cisão no DFC. */
  dividendosEnviados: [
    { conta: "2.07.10", nome: "Cisão", total: 12076617.29 }
  ],

  normNome(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  },

  nomeDividendo(cn) {
    let s = String(cn || "").replace(/^distribui[cç][aã]o\s+(de\s+)?lucro\s*-\s*/i, "").trim();
    if (!s) s = "Dividendos";
    if (s.length > 28) s = s.slice(0, 26).trim() + "…";
    return s;
  },

  nomeEmpresaBarra(id, nome) {
    try {
      const raw = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}");
      const cfg = raw[Number(id)] || raw[String(Number(id))] || {};
      const usual = String(cfg.nome_usual || "").trim();
      if (usual) return usual.length > 32 ? usual.slice(0, 30).trim() + "…" : usual;
    } catch (e) {}
    let s = String(nome || "").replace(/^\d+\s*-\s*/, "").trim();
    s = s.replace(/\b(LTDA|EIRELI|S\.?A\.?|SPE)\b\.?/gi, " ");
    s = s.replace(/\b(EMPREENDIMENTOS?|EMPREENDEDORA|IMOBILI[AÁ]RIOS?|PARTICIPA[CÇ][OÕ]ES|DESENVOLVIMENTO|URBANIZA[CÇ][AÃ]O)\b/gi, " ");
    s = s.replace(/&/g, " ").replace(/\s+/g, " ").trim();
    if (!s) s = id ? "Empresa " + id : "Empresa";
    if (s.length > 32) s = s.slice(0, 30).trim() + "…";
    return s;
  },

  barrasDaAba(tipo) {
    const caixa = typeof OrcamentoCaixaApp !== "undefined" ? OrcamentoCaixaApp : null;
    if (!caixa || typeof caixa.grupos !== "function") return [];
    return caixa.grupos(tipo).map((g) => {
      const bruto = caixa.total(g.meses);
      const valor = tipo === "aportes" ? -Math.abs(bruto) : bruto;
      return { nome: this.nomeEmpresaBarra(g.dest.id, g.dest.nome), valor: valor };
    }).filter((x) => Math.abs(x.valor) >= 50000);
  },

  /* Saídas de 11.01 da Moura Leite, uma barra por conta, mais a Cisão enviada se o Excel não tiver a linha. */
  barrasDividendosMenos() {
    const app = this.appDfc();
    const fluxo = this.fluxoDfc();
    const emp = this.empresaSlide(app);
    const mapa = new Map();
    const linhas = app && typeof app.lines === "function" ? app.lines() : [];
    linhas.forEach((l) => {
      if (String(l.e) !== String(emp)) return;
      const gid = typeof app.grupoDaConta === "function" ? app.grupoDaConta(l.conta, l.cn) : "";
      if (gid !== "g_11_01") return;
      const node = { id: gid, redutora: true };
      let tot = 0;
      for (let i = 0; i < 12; i++) {
        const bruto = Number((l.m || [])[i]) || 0;
        if (!bruto) continue;
        const s = fluxo && typeof fluxo.signedAmount === "function"
          ? fluxo.signedAmount(node, l.conta, l.cn, bruto)
          : (/ESTORNO/.test(this.normNome(l.cn)) || bruto < 0 ? Math.abs(bruto) : -Math.abs(bruto));
        tot += s;
      }
      if (Math.abs(tot) < 0.5) return;
      const chave = String(l.conta || "") + "|" + this.normNome(l.cn);
      if (!mapa.has(chave)) mapa.set(chave, { nome: this.nomeDividendo(l.cn), valor: 0, conta: String(l.conta || "") });
      mapa.get(chave).valor += tot;
    });
    const itens = [...mapa.values()].filter((x) => x.valor <= -50000);
    const temConta = (conta) => linhas.some((l) => String(l.e) === String(emp) && String(l.conta) === conta);
    (this.dividendosEnviados || []).forEach((d) => {
      if (temConta(d.conta)) return;
      itens.push({ nome: d.nome, valor: -Math.abs(Number(d.total) || 0), conta: d.conta });
    });
    return itens.map((x) => ({ nome: x.nome, valor: x.valor }));
  },

  barrasAportesDividendos() {
    return this.barrasDaAba("aportes")
      .concat(this.barrasDividendosMenos())
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  },

  barrasLucros() {
    return this.barrasDaAba("lucros")
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  },

  barras() {
    const app = this.appDfc();
    const fluxo = this.fluxoDfc();
    const linhas = (app && typeof app.lines === "function") ? app.lines() : [];
    const porGrupo = {};
    const porCc = {};
    const guardar = (bolsa, gid, chave, nome, tot) => {
      if (!bolsa[gid]) bolsa[gid] = new Map();
      const mapa = bolsa[gid];
      if (!mapa.has(chave)) mapa.set(chave, { nome: nome, total: 0 });
      mapa.get(chave).total += tot;
    };
    linhas.forEach((l) => {
      const gid = app.grupoDaConta(l.conta, l.cn);
      if (!gid) return;
      const node = { id: gid };
      const meses = [];
      for (let i = 0; i < 12; i++) {
        const bruto = Number((l.m || [])[i]) || 0;
        const s = fluxo && typeof fluxo.signedAmount === "function"
          ? fluxo.signedAmount(node, l.conta, l.cn, bruto)
          : bruto;
        meses.push(s);
      }
      const tot = this.total(meses);
      if (Math.abs(tot) < 0.5) return;
      if (!porGrupo[gid]) porGrupo[gid] = 0;
      porGrupo[gid] += tot;
      guardar(porCc, gid, String(l.cc || l.en || "—"), this.nomeProjeto(l.en, l.cc), tot);
    });
    const deGrupo = (id, nome) => ({ nome: nome, valor: porGrupo[id] || 0 });
    const juntar = (bolsa, ids) => {
      const mapa = new Map();
      ids.forEach((gid) => {
        const bag = bolsa[gid];
        if (!bag) return;
        bag.forEach((item, chave) => {
          if (!mapa.has(chave)) mapa.set(chave, { nome: item.nome, valor: 0 });
          mapa.get(chave).valor += item.total;
        });
      });
      return [...mapa.values()].filter((x) => Math.abs(x.valor) >= 500)
        .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    };
    const cortar = (lista, n) => {
      if (lista.length <= n) return lista;
      const topo = lista.slice(0, n);
      const resto = lista.slice(n).reduce((s, x) => s + x.valor, 0);
      if (Math.abs(resto) >= 500) topo.push({ nome: "Outros", valor: resto });
      return topo;
    };
    return {
      entradas: [
        deGrupo("g_01_01", "Venda"),
        deGrupo("g_01_02", "Serviços"),
        deGrupo("g_01_03", "Não operacionais"),
        deGrupo("g_01_04", "Cancelamentos")
      ].filter((x) => Math.abs(x.valor) >= 500),
      obras: cortar(juntar(porCc, ["g_04_03"]), 6),
      aportes: this.barrasAportesDividendos(),
      dividendos: this.barrasLucros()
    };
  },

  htmlBarras(titulo, itens, cores, magnitude) {
    const lista = itens || [];
    const max = lista.reduce((m, x) => Math.max(m, Math.abs(x.valor)), 0) || 1;
    const rows = lista.length
      ? lista.map((x, i) => {
        const w = Math.max(4, Math.round(Math.abs(x.valor) / max * 100));
        const cor = cores[Math.min(i, cores.length - 1)];
        const valor = magnitude ? Math.abs(x.valor) : x.valor;
        return `<div class="orc-slide-bar">
          <span>${this.esc(x.nome)}</span>
          <i style="width:${w}%;background:${cor}"></i>
          <b>${this.mi(valor, 1)}</b>
        </div>`;
      }).join("")
      : `<p class="orc-slide-vazio">Sem valor neste grupo.</p>`;
    return `<section class="orc-slide-col"><h3>${this.esc(titulo)}</h3>${rows}</section>`;
  },

  htmlPainel(q) {
    const s = q.saldos;
    const y = s.meses;
    const ini = y[0].ini;
    const fim = y[11].fim;
    const marcos = [
      { i: 2, rotulo: "1T27" },
      { i: 5, rotulo: "2T27" },
      { i: 8, rotulo: "3T27" }
    ];
    const minLeft = ((s.minI + 1) / 12) * 100;
    const pontos = s.aguardando ? "" : marcos.map((m) => {
      const left = ((m.i + 1) / 12) * 100;
      return `<span class="orc-slide-pt" style="left:${left}%">
        <span class="orc-slide-acima"><b>${m.rotulo}</b><strong>${this.mi(y[m.i].fim, 1)} M</strong><small>saldo parcial acumulado</small></span>
        <i></i>
      </span>`;
    }).join("");
    const exposicao = s.aguardando ? "" : `<span class="orc-slide-pt is-min" style="left:${minLeft}%">
      <i></i>
      <span class="orc-slide-abaixo"><strong>${this.mi(y[s.minI].fim, 1)} M</strong><small>exposição máxima ${this.MESES_LONGOS[s.minI]}/27</small></span>
    </span>`;
    const grandes = [
      ["entradas", "Entradas", false],
      ["impostos", "Impostos", false],
      ["repasses", "Repasse", false],
      ["projetos", "Projeto", false],
      ["obras", "Obras", false],
      ["terrenos", "Aquis. terrenos", false],
      ["despesas", "Despesas", false],
      ["capex", "Capex / desp. finan.", false],
      ["fcf", "FCF fluxo cx livre", true],
      ["aportes", "Aportes", false],
      ["divmenos", "Dividendos (−)", false],
      ["divmais", "Dividendos (+)", false]
    ];
    const nums = grandes.map(([id, nome, caixa]) => {
      const linha = q.linhas.find((l) => l.id === id);
      const v = id === "divmais"
        ? (q.barras.dividendos || []).reduce((s, x) => s + (Number(x.valor) || 0), 0)
        : this.total(linha.meses);
      const seta = v >= 0 ? "arrow-up" : "arrow-down";
      return `<div class="orc-slide-num${caixa ? " is-fcf" : ""}${v < 0 ? " is-neg" : " is-pos"}">
        <i data-lucide="${seta}"></i>
        <span>${this.esc(nome)}</span>
        <strong>${this.mi(v, Math.abs(v) >= 100000 ? 1 : 2)}</strong>
      </div>`;
    }).join("");
    const nota = s.aguardando
      ? `<p class="orc-slide-nota">Lendo o saldo de caixa de 2026 para o saldo inicial de janeiro de 2027.</p>`
      : (s.temCaixa ? "" : `<p class="orc-slide-nota">A régua parte de zero enquanto o saldo de caixa de dezembro de 2026 não estiver carregado. A variação de cada mês é a do DFC 2027.</p>`);
    const hero = (v) => s.aguardando ? "…" : (v < 0 ? "(" + this.miHero(v).replace(" M", "") + ") M" : this.miHero(v));
    const verdes = ["#14532d", "#15803d", "#22c55e", "#86efac"];
    const quentes = ["#b91c1c", "#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa"];
    return `<article class="orc-slide">
      <header class="orc-slide-top">
        <span class="orc-slide-flag"></span>
        <strong>DFC 2027 — Moura Leite</strong>
        <span>Em milhões (R$)</span>
      </header>
      <h2>Fluxo de caixa</h2>
      <div class="orc-regua">
        <div class="orc-regua-ponta">
          <strong>${hero(ini)}</strong>
          <span>Saldo inicial</span>
        </div>
        <div class="orc-regua-miolo">
          <div class="orc-regua-linha"></div>
          ${pontos}
          ${exposicao}
        </div>
        <div class="orc-regua-ponta is-fim">
          <strong>${hero(fim)}</strong>
          <span>Saldo final</span>
        </div>
      </div>
      ${nota}
      <h2>Grandes números</h2>
      <div class="orc-slide-nums">${nums}</div>
      <div class="orc-slide-cols">
        ${this.htmlBarras("Entradas", q.barras.entradas, verdes, false)}
        ${this.htmlBarras("Obras", q.barras.obras, quentes, true)}
        ${this.htmlBarras("Aportes e dividendos (−)", q.barras.aportes, quentes, true)}
        ${this.htmlBarras("Dividendos (+)", q.barras.dividendos, verdes, false)}
      </div>
    </article>`;
  },

  htmlMensal(q) {
    const s = q.saldos.meses;
    const cab = this.MESES.map((m) => `<th>${m}/27</th>`).join("");
    const cel = (v, forte) => {
      const neg = v < -0.5;
      return `<td class="${neg ? "is-neg" : ""}${forte ? " is-forte" : ""}">${this.mi(v, 1)}</td>`;
    };
    const linha = (nome, meses, base, forte) => {
      const t = this.total(meses);
      const b = this.total(base);
      return `<tr class="${forte ? "is-fcf" : ""}"><th>${this.esc(nome)}</th>${meses.map((v) => cel(v, forte)).join("")}${cel(t, true)}${cel(b, false)}${cel(t - b, false)}</tr>`;
    };
    const corpo = q.linhas.map((l) => linha(l.nome, l.meses, l.base, !!l.forte)).join("");
    const saldoIni = s.map((p) => p.ini);
    const saldoFim = s.map((p) => p.fim);
    const var27 = q.variacao;
    const var26 = q.variacao26;
    const extraSaldo = (nome, meses, total) => {
      if (q.saldos.aguardando) {
        return `<tr class="is-saldo"><th>${nome}</th>${meses.map(() => "<td>…</td>").join("")}<td>…</td><td>—</td><td>—</td></tr>`;
      }
      return `<tr class="is-saldo"><th>${nome}</th>${meses.map((v) => cel(v, false)).join("")}${cel(total, true)}<td>—</td><td>—</td></tr>`;
    };
    const nota = q.saldos.aguardando
      ? "Lendo o saldo de caixa de 2026 para o saldo inicial de janeiro de 2027."
      : (q.saldos.temCaixa
        ? "Janeiro de 2027 começa no saldo final de 2026. Cada mês seguinte parte do saldo final do anterior."
        : "O saldo inicial fica em zero enquanto o caixa de dezembro de 2026 não estiver carregado. A variação de caixa é a do DFC 2027.");
    return `<article class="orc-slide">
      <header class="orc-slide-top">
        <span class="orc-slide-flag"></span>
        <strong>DFC 2027 — Moura Leite</strong>
        <span>Em milhões (R$)</span>
      </header>
      <div class="orc-dfc-scroll orc-slide-tabela">
        <table class="orc-slide-grade">
          <thead><tr><th></th>${cab}<th>Total</th><th>2026</th><th>Variação R$</th></tr></thead>
          <tbody>
            ${corpo}
            ${extraSaldo("Saldo inicial", saldoIni, saldoIni[0])}
            ${extraSaldo("Saldo final", saldoFim, saldoFim[11])}
            <tr class="is-var"><th>Variação de caixa</th>${var27.map((v) => cel(v, false)).join("")}${cel(this.total(var27), true)}${cel(this.total(var26), false)}${cel(this.total(var27) - this.total(var26), false)}</tr>
          </tbody>
        </table>
      </div>
      <p class="orc-slide-nota">${nota} A coluna 2026 é a base do DFC (realizado e forecast). A variação é 2027 menos 2026, em milhões.</p>
    </article>`;
  },

  pintar(root, aba) {
    const q = this.quadro();
    const corpo = !q || q.vazio
      ? `<div class="orc-dfc-erro">Ainda não há lançamentos do DFC 2027 para montar estes slides.</div>`
      : (aba === "mensal" ? this.htmlMensal(q) : this.htmlPainel(q));
    root.innerHTML = `<div class="orc-dfc-page orc-slide-page">
      ${typeof OrcamentoApp !== "undefined" ? OrcamentoApp.abasHtml() : ""}
      ${corpo}
    </div>`;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  async atualizar(aba) {
    const app = this.appDfc();
    if (!app) return;
    const token = (this._token = (this._token || 0) + 1);
    const pronto = app._caixaEstado === "ok" || app._caixaEstado === "vazio" || app._caixaEstado === "erro";
    try {
      if (!pronto && app._caixaEstado !== "lendo" && typeof app.carregarBase === "function") await app.carregarBase();
      else if (app._caixaEstado === "lendo") {
        for (let i = 0; i < 80 && app._caixaEstado === "lendo"; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch (e) {}
    if (token !== this._token) return;
    try { await this.garantirSaldoSlide(app); } catch (e) {}
    if (token !== this._token) return;
    if (typeof OrcamentoApp !== "undefined" && OrcamentoApp.aba !== aba) return;
    const root = document.getElementById("orcamento-root");
    if (root) this.pintar(root, aba);
  },

  render(root, aba) {
    this.pintar(root, aba);
    this.atualizar(aba);
  }
};
