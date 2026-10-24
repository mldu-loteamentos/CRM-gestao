// Aportes e lucros recebidos do caixa da empresa 1 (Moura Leite), orçado 2027.
const OrcamentoCaixaApp = {
  MESES: ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],
  // Planilha Receitas e Despesas — empresa 1. A observação diz a empresa da outra ponta.
  // Serve enquanto o orçamento carregado ainda não gravou essa coluna.
  base: [
    { tipo: "aporte", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "2.06.01.04", obs: "14-PIRAPITINGUI EMPREENDIMENTOS IMOBILIARIOS SPE LTDA", m: [20000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { tipo: "aporte", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "2.06.01.04", obs: "31-SPE EMPREENDEDORA MIRANTE DOS RAMOS II LTDA", m: [70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000, 70000] },
    { tipo: "aporte", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "2.06.01.04", obs: "15-SPE EMPREENDEDORA MIRANTE DOS RAMOS LTDA", m: [0, 100000, 0, 100000, 0, 100000, 0, 100000, 0, 100000, 0, 100000] },
    { tipo: "aporte", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "2.06.01.04", obs: "32-NOVO HORIZONTE ITATINGA EMPREENDEDORA SPE LTDA", m: [0, 0, 0, 500000, 0, 200000, 0, 0, 0, 0, 0, 0] },
    { tipo: "aporte", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "2.06.01.04", obs: "36-SPE TAGUAÍ EMPREENDEDORA JARDIM DOS IPÊS III LTDA", m: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200000, 0] },
    { tipo: "aporte", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "2.06.01.04", obs: "4-TERRAS DE ITU EMPREENDIMENTOS & PARTICIPAÇÕES LTDA", m: [0, 0, 0, 0, 0, 0, 0, 53125.63, 106251.26, 53125.63, 0, 0] },
    { tipo: "lucro-aporte", cc: "70101", en: "SOMA DESENVOLVIMENTO IMOBILIARIO LTDA", conta: "2.07.02", obs: "4-TERRAS DE ITU EMPREENDIMENTOS & PARTICIPAÇÕES LTDA", m: [0, 0, 0, 0, 0, 0, 0, 115910.8, 231821.6, 115910.8, 0, 0] },
    { tipo: "lucro-aporte", cc: "70102", en: "PR&F PARTICIPAÇÕES IMOBILIÁRIAS LTDA", conta: "2.07.02", obs: "4-TERRAS DE ITU EMPREENDIMENTOS & PARTICIPAÇÕES LTDA", m: [0, 0, 0, 0, 0, 0, 0, 115910.8, 231821.6, 115910.8, 0, 0] },
    { tipo: "lucro", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "1.04.01.08", obs: "16-LOTEADORA YPES IV SPE LTDA", m: [250746.49, 280283.45, 272685.95, 247666.24, 275367.25, 271798.51, 61625.37, 86600.5, 82057.05, 70021.62, 75186.68, 71934.42] },
    { tipo: "lucro", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "1.04.01.08", obs: "12-ELLENCO & MOURA LEITE BOITUVA EMPREENDIMENTO IMOBILIÁRIO SPE LTDA", m: [190360.43, 219844.54, 232937.45, 236241.14, 194500.53, 245122.6, 215314.29, 205296.27, 223892.19, 220115.54, 187689.07, 235857.66] },
    { tipo: "lucro", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "1.04.01.08", obs: "36-SPE TAGUAÍ EMPREENDEDORA JARDIM DOS IPÊS III LTDA", m: [40769.57, 53673.58, 65856.35, 68538.54, 68946.2, 72584.75, 69604.81, 69123.11, 74061.76, 75191.47, 78675.4, 80726.95] },
    { tipo: "lucro", cc: "70109", en: "TRANSAÇÕES ENTRE EMPRESAS", conta: "1.04.01.08", obs: "6-ARAÇARI EMPREENDIMENTO IMOBILIÁRIO SPE LTDA", m: [61946.26, 49081.77, 49081.77, 48552.02, 48060.67, 47353.84, 48124.71, 48148.34, 48192.67, 47603.38, 47603.38, 48215.59] }
  ],

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  norm(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  },

  money(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) < 0.005) return "—";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  mesesDe(l) {
    const m = Array.isArray(l && l.m) ? l.m : [];
    const out = [];
    for (let i = 0; i < 12; i++) out.push(Math.round((Number(m[i]) || 0) * 100) / 100);
    return out;
  },

  soma(a, b) {
    return a.map((v, i) => Math.round((v + (Number(b[i]) || 0)) * 100) / 100);
  },

  total(m) {
    return Math.round(m.reduce((a, b) => a + (Number(b) || 0), 0) * 100) / 100;
  },

  sig(l) {
    return [String(l.conta || ""), String(l.cc || ""), this.mesesDe(l).join(",")].join("|");
  },

  tipoDe(l) {
    if (l && l.tipo) return l.tipo;
    const conta = String((l && l.conta) || "").trim();
    const cn = this.norm(l && l.cn);
    if (conta === "2.06.01.04" || cn === "APORTES EM EMPREENDIMENTOS") return "aporte";
    if (conta === "2.07.02" || cn === "DISTRIBUICAO LUCRO - APORTE") return "lucro-aporte";
    if (conta === "1.04.01.08" || cn === "LUCROS RECEBIDOS") return "lucro";
    return "";
  },

  destino(obs) {
    const s = String(obs || "").trim();
    const m = s.match(/^(\d+)\s*-\s*(.*)$/);
    if (m) return { id: m[1], nome: String(m[2] || "").trim() };
    return { id: "", nome: s };
  },

  rotulo(dest) {
    if (dest.id && dest.nome) return dest.id + " — " + dest.nome;
    return dest.nome || "Empresa não informada";
  },

  origemTxt(l) {
    if (this.tipoDe(l) === "lucro-aporte") {
      const quem = String(l.en || "").trim();
      return "Distribuição de lucro - aporte" + (quem ? " · " + quem : "");
    }
    return "Aporte em empreendimentos";
  },

  linhas() {
    let vivas = [];
    try {
      if (window.OrcamentoDfcApp && typeof OrcamentoDfcApp.lines === "function") {
        vivas = OrcamentoDfcApp.lines().filter((l) => String(l.e) === "1" && this.tipoDe(l));
      }
    } catch (e) {
      vivas = [];
    }
    const mapa = new Map();
    this.base.forEach((b) => mapa.set(this.sig(b), b.obs));
    const comObs = vivas.some((l) => String(l.obs || "").trim());
    if (comObs || vivas.length >= this.base.length) {
      return vivas.map((l) => {
        const obs = String(l.obs || "").trim() || mapa.get(this.sig(l)) || "";
        return {
          tipo: this.tipoDe(l),
          cc: l.cc,
          en: l.en,
          conta: l.conta,
          obs: obs,
          m: this.mesesDe(l)
        };
      });
    }
    return this.base.map((b) => ({ tipo: b.tipo, cc: b.cc, en: b.en, conta: b.conta, obs: b.obs, m: this.mesesDe(b) }));
  },

  grupos(tipo) {
    const quer = tipo === "lucros" ? { lucro: 1 } : { aporte: 1, "lucro-aporte": 1 };
    const map = new Map();
    this.linhas().forEach((l) => {
      if (!quer[l.tipo]) return;
      const dest = this.destino(l.obs);
      const chave = (dest.id || "z") + "|" + this.norm(dest.nome || l.en || l.cc);
      if (!map.has(chave)) map.set(chave, { dest: dest, linhas: [] });
      map.get(chave).linhas.push(l);
    });
    const lista = [...map.values()];
    lista.forEach((g) => {
      g.linhas.sort((a, b) => {
        const oa = a.tipo === "lucro-aporte" ? 1 : 0;
        const ob = b.tipo === "lucro-aporte" ? 1 : 0;
        if (oa !== ob) return oa - ob;
        return String(a.en || "").localeCompare(String(b.en || ""), "pt-BR");
      });
      g.meses = g.linhas.reduce((acc, l) => this.soma(acc, l.m), Array(12).fill(0));
    });
    lista.sort((a, b) => {
      const ia = Number(a.dest.id) || 9999;
      const ib = Number(b.dest.id) || 9999;
      if (ia !== ib) return ia - ib;
      return this.rotulo(a.dest).localeCompare(this.rotulo(b.dest), "pt-BR");
    });
    return lista;
  },

  celulas(m) {
    return m.map((v) => `<td${v < -0.004 ? " class=\"orc-dfc-neg\"" : ""}>${this.money(v)}</td>`).join("")
      + `<td>${this.money(this.total(m))}</td>`;
  },

  tabela(tipo) {
    const grupos = this.grupos(tipo);
    const cab = this.MESES.map((m) => `<th>${m}</th>`).join("");
    const natureza = tipo === "aportes";
    const vazio = tipo === "aportes"
      ? "Não há aporte da empresa 1 neste orçamento."
      : "Não há lucro recebido pela empresa 1 neste orçamento.";
    if (!grupos.length) {
      return `<div class="orc-dfc-erro">${vazio}</div>`;
    }
    const corpo = [];
    const geral = Array(12).fill(0);
    grupos.forEach((g) => {
      geral.forEach((_, i) => { geral[i] = Math.round((geral[i] + g.meses[i]) * 100) / 100; });
      const nome = this.esc(this.rotulo(g.dest));
      if (g.linhas.length === 1 && g.linhas[0].tipo !== "lucro-aporte") {
        corpo.push(`<tr><td>${nome}</td>${natureza ? `<td>${this.esc(this.origemTxt(g.linhas[0]))}</td>` : ""}${this.celulas(g.meses)}</tr>`);
        return;
      }
      g.linhas.forEach((l, i) => {
        const emp = i === 0 ? nome : "";
        const orig = natureza ? `<td>${this.esc(this.origemTxt(l))}</td>` : "";
        corpo.push(`<tr><td>${emp}</td>${orig}${this.celulas(l.m)}</tr>`);
      });
      if (g.linhas.length > 1) {
        corpo.push(`<tr class="orc-dfc-n1"><td>Total ${nome}</td>${natureza ? "<td></td>" : ""}${this.celulas(g.meses)}</tr>`);
      }
    });
    const rotuloTotal = tipo === "aportes" ? "Total a aportar" : "Total de lucros recebidos";
    corpo.push(`<tr class="orc-dfc-formula"><td>${rotuloTotal}</td>${natureza ? "<td></td>" : ""}${this.celulas(geral)}</tr>`);
    const colNat = natureza ? "<th>Natureza</th>" : "";
    const primeira = tipo === "aportes" ? "Empresa que recebe" : "SPE que paga";
    return `<div class="orc-dfc-scroll"><table class="orc-dfc-table">
      <thead><tr><th>${primeira}</th>${colNat}${cab}<th>Total</th></tr></thead>
      <tbody>${corpo.join("")}</tbody>
    </table></div>`;
  },

  render(root, aba) {
    const aportes = aba !== "lucros";
    const lead = aportes
      ? "Caixa da empresa 1 — Moura Leite Desenvolvimento e Urbanização — em 2027. Cada linha é uma empresa em que a Moura Leite aporta. A distribuição de lucro - aporte entra junto, na empresa que recebe esse valor."
      : "Caixa da empresa 1 — Moura Leite Desenvolvimento e Urbanização — em 2027. Cada linha é uma SPE de onde entra dinheiro na conta Lucros recebidos.";
    root.innerHTML = `
      <div class="orc-dfc-page">
        ${typeof OrcamentoApp !== "undefined" ? OrcamentoApp.abasHtml() : ""}
        <p class="orc-dfc-lead">${lead}</p>
        ${this.tabela(aportes ? "aportes" : "lucros")}
      </div>`;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
};
