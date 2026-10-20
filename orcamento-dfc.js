// DFC do orçamento 2027. A visão de receitas (OrcamentoApp) não passa por aqui.
const OrcamentoDfcApp = {
  LS: "crm_orcamento_dfc_2027",
  MESES: ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],
  selectedCompanyIds: [],
  selectedCcIds: [],
  companyDropOpen: false,
  companyQuery: "",
  ccDropOpen: false,
  ccQuery: "",
  expanded: new Set(),
  _expandInited: false,
  _custom: null,
  _pronto: false,
  busy: false,
  erro: "",

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) < 0.005) return "—";
    const abs = Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? "-" + abs : abs;
  },

  mil(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) < 0.5) return "—";
    const milhar = v / 1000;
    const abs = Math.abs(milhar);
    const texto = abs >= 100
      ? Math.round(abs).toLocaleString("pt-BR")
      : abs.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    return v < 0 ? "-" + texto : texto;
  },

  pct(orc, real) {
    const b = Number(real) || 0;
    if (Math.abs(b) < 0.5) return "—";
    const p = ((Number(orc) || 0) - b) / Math.abs(b) * 100;
    const texto = Math.abs(p) >= 10
      ? Math.round(p).toLocaleString("pt-BR")
      : p.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    return (p > 0 ? "+" : "") + texto + "%";
  },

  celCmp(orc, real, prev) {
    const o = Number(orc) || 0;
    const b = Number(real) || 0;
    const d = o - b;
    const titulo = (prev ? "Previsão 2026 " : "2026 ") + this.money(b) + " · Orçado 2027 " + this.money(o) + " · Variação " + this.money(d);
    const cls = d < -0.5 ? " orc-dfc-neg" : "";
    return `<td title="${this.esc(titulo)}">${this.mil(b)}</td><td title="${this.esc(titulo)}">${this.mil(o)}</td><td class="${cls.trim()}" title="${this.esc(titulo)}">${this.mil(d)}</td><td title="${this.esc(titulo)}">${this.pct(o, b)}</td>`;
  },

  norm(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  },

  garantir() {
    if (this._pronto) return;
    this._pronto = true;
    try {
      const raw = localStorage.getItem(this.LS);
      if (!raw) return;
      const pack = JSON.parse(raw);
      if (pack && Array.isArray(pack.lines) && pack.lines.length) this._custom = pack;
    } catch (e) {}
  },

  origem() {
    this.garantir();
    if (this._custom && Array.isArray(this._custom.lines) && this._custom.lines.length) return this._custom;
    return window.ORCAMENTO_DFC_2027 || { fileName: "", lines: [] };
  },

  lines() {
    return this.origem().lines || [];
  },

  empresas() {
    const map = new Map();
    this.lines().forEach((l) => {
      const id = String(l.e || "");
      if (!id || map.has(id)) return;
      map.set(id, String(l.enome || ""));
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  },

  empreendimentos() {
    const emp = new Set(this.selectedCompanyIds.map(String));
    const map = new Map();
    this.lines().forEach((l) => {
      if (emp.size && !emp.has(String(l.e))) return;
      const id = String(l.cc || "");
      if (!id || map.has(id)) return;
      map.set(id, String(l.en || ""));
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  },

  linhasFiltradas() {
    const emp = new Set(this.selectedCompanyIds.map(String));
    const cc = new Set(this.selectedCcIds.map(String));
    return this.lines().filter((l) => {
      if (emp.size && !emp.has(String(l.e))) return false;
      if (cc.size && !cc.has(String(l.cc))) return false;
      return true;
    });
  },

  podarCentros() {
    const vivos = new Set(this.empreendimentos().map((c) => String(c.id)));
    this.selectedCcIds = this.selectedCcIds.filter((id) => vivos.has(String(id)));
  },

  z12() {
    return Array(12).fill(0);
  },

  /* Primeiro mês (0 = jan) que entra como forecast. Em outubro de 2026, janeiro a setembro é realizado. */
  corteForecast() {
    const hoje = new Date();
    if (hoje.getFullYear() > 2026) return 12;
    if (hoje.getFullYear() < 2026) return 0;
    return hoje.getMonth();
  },

  textoCorte() {
    const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const corte = this.corteForecast();
    if (corte <= 0) return "2026 entra como forecast.";
    if (corte >= 12) return "2026 entra pelo realizado do ano.";
    return "Até " + nomes[corte - 1] + " entra o realizado. De " + nomes[corte] + " a dezembro entra o forecast.";
  },

  chaveConta(code) {
    return String(code || "").replace(/\s/g, "");
  },

  empresaCabe(arq) {
    const emp = new Set(this.selectedCompanyIds.map(String));
    if (!emp.size) return true;
    return emp.has(String((arq && arq.empresa) || ""));
  },

  ccCabe(cc) {
    if (!this.selectedCcIds.length) return true;
    const id = String(cc || "");
    const dig = id.replace(/\D/g, "");
    return this.selectedCcIds.some((s) => {
      const sid = String(s);
      return sid === id || (dig && sid.replace(/\D/g, "") === dig);
    });
  },

  arquivos2026() {
    const app = window.ResultadoCaixaApp;
    const meses = (app && app.acervo && app.acervo.meses) || {};
    const chaves = Object.keys(meses).filter((k) => k.indexOf("2026-") === 0).sort().reverse();
    const visto = {};
    const out = [];
    chaves.forEach((k) => {
      const arquivos = (meses[k] && meses[k].arquivos) || {};
      Object.keys(arquivos).forEach((nome) => {
        const arq = arquivos[nome];
        if (!arq) return;
        const emp = String(arq.empresa || "");
        const chave = emp && emp !== "0" ? emp : nome;
        if (visto[chave]) return;
        visto[chave] = 1;
        out.push(arq);
      });
    });
    return out;
  },

  somarBase(arr, i, v) {
    if (!arr || i < 0 || i > 11) return;
    arr[i] += Number(v) || 0;
  },

  base2026() {
    const corte = this.corteForecast();
    this._corte = corte;
    const grupos = {};
    const contas = {};
    const ccs = {};
    const bag = (map, key) => map[key] || (map[key] = this.z12());
    const groups = (this.visaoDfc().groups || []);
    const byId = {};
    const porCodigo = {};
    groups.forEach((g) => {
      byId[g.id] = g;
      const m = String(g.name || "").match(/^(\d{2}(?:\.\d{2})*)/);
      if (m && g.type === "resultado") porCodigo[m[1]] = g.id;
    });
    const gidDe = (code, nome, node) => {
      if (node && byId[node]) return node;
      const direto = this.grupoDaConta(code, nome);
      if (direto) return direto;
      const bruto = this.chaveConta(code);
      return porCodigo[bruto] || "";
    };
    const por = (gid, code, cc, i, v) => {
      if (!gid || !v) return;
      const chave = this.chaveConta(code);
      const dig = chave.replace(/\D/g, "");
      this.somarBase(bag(grupos, gid), i, v);
      if (chave) this.somarBase(bag(contas, gid + "|" + chave), i, v);
      if (dig && dig !== chave) this.somarBase(bag(contas, gid + "|" + dig), i, v);
      const ccId = String(cc || "").replace(/\D/g, "") || String(cc || "");
      if (chave) this.somarBase(bag(ccs, gid + "|" + chave + "|" + ccId), i, v);
      if (dig) this.somarBase(bag(ccs, gid + "|" + dig + "|" + ccId), i, v);
    };
    let arquivos = 0;
    this.arquivos2026().forEach((arq) => {
      if (!this.empresaCabe(arq)) return;
      arquivos += 1;
      const planos = arq.planosPorCc || {};
      const temPlano = Object.keys(planos).some((cc) => Object.keys((planos[cc] && planos[cc].contas) || {}).length);
      if (temPlano) {
        Object.keys(planos).forEach((cc) => {
          if (!this.ccCabe(cc)) return;
          const bloco = planos[cc] || {};
          Object.keys(bloco.contas || {}).forEach((code) => {
            const info = bloco.contas[code] || {};
            const gid = gidDe(code, info.nome, info.node);
            Object.keys(info.meses || {}).forEach((mm) => {
              const i = Number(mm) - 1;
              if (i < 0 || i >= corte) return;
              por(gid, code, cc, i, info.meses[mm].r);
            });
          });
        });
        return;
      }
      const porCc = arq.contasPorCc || {};
      Object.keys(porCc).forEach((cc) => {
        if (!this.ccCabe(cc)) return;
        const bloco = porCc[cc] || {};
        Object.keys(bloco.contas || {}).forEach((code) => {
          const info = bloco.contas[code] || {};
          const gid = gidDe(code, info.nome, "");
          Object.keys(info.meses || {}).forEach((mm) => {
            const i = Number(mm) - 1;
            if (i < 0 || i >= corte) return;
            por(gid, code, cc, i, info.meses[mm].r);
          });
        });
      });
    });
    const app = window.ResultadoCaixaApp;
    const forecasts = (app && app.forecasts) || {};
    const fluxo = typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : null;
    for (let i = corte; i < 12; i++) {
      const ym = "2026-" + String(i + 1).padStart(2, "0");
      const doc = forecasts[ym];
      if (!doc) continue;
      const lista = [];
      const porArq = doc.porArquivo;
      if (porArq && typeof porArq === "object" && !Array.isArray(porArq) && Object.keys(porArq).length) {
        Object.keys(porArq).forEach((nome) => lista.push(porArq[nome]));
      } else if (doc.contas) lista.push(doc);
      lista.forEach((arq) => {
        if (!this.empresaCabe(arq)) return;
        if (arq && (arq.empresa || arq.contas)) arquivos += 1;
        Object.keys(arq.contas || {}).forEach((cc) => {
          if (!this.ccCabe(cc)) return;
          Object.keys(arq.contas[cc] || {}).forEach((code) => {
            const info = arq.contas[cc][code] || {};
            const gid = gidDe(code, info.nome, "");
            let valor = Number((info.meses || {})[ym]) || 0;
            const node = byId[gid];
            if (valor && node && fluxo && typeof fluxo.signedAmount === "function") {
              valor = fluxo.signedAmount(node, code, info.nome || "", valor);
            }
            por(gid, code, cc, i, valor);
          });
        });
      });
    }
    this._basePronta = arquivos > 0;
    return { grupos: grupos, contas: contas, ccs: ccs, corte: corte };
  },

  acharBase(map, gid, code, cc) {
    const chave = this.chaveConta(code);
    const dig = chave.replace(/\D/g, "");
    const ccId = cc == null ? "" : (String(cc).replace(/\D/g, "") || String(cc));
    const chaves = cc == null
      ? [gid + "|" + chave, dig ? gid + "|" + dig : ""]
      : [gid + "|" + chave + "|" + ccId, dig ? gid + "|" + dig + "|" + ccId : ""];
    for (let i = 0; i < chaves.length; i++) {
      if (chaves[i] && map[chaves[i]]) return map[chaves[i]];
    }
    return null;
  },

  visaoDfc() {
    if (typeof FluxoCaixaApp !== "undefined" && typeof FluxoCaixaApp.visao === "function") {
      return FluxoCaixaApp.visao() || { groups: [] };
    }
    let visoes = [];
    try { visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]") || []; } catch (e) { visoes = []; }
    return visoes.find((v) => v.id === "dfc_default") || { groups: [] };
  },

  /** Nó da visão DFC em que a conta está alocada. A alocação salva vale antes do palpite pelo nome. */
  grupoDaConta(conta, nome) {
    const dotted = String(conta || "").trim();
    const key = dotted.replace(/\D/g, "");
    const visao = this.visaoDfc();
    const ignored = new Set();
    (visao.ignoredAccounts || []).forEach((id) => {
      const sid = String(id || "").trim();
      if (!sid) return;
      ignored.add(sid);
      const nk = sid.replace(/\D/g, "");
      if (nk) ignored.add(nk);
    });
    if (ignored.has(dotted) || (key && ignored.has(key))) return null;
    let found = null;
    (visao.groups || []).forEach((g) => {
      if (!g || g.type !== "resultado") return;
      (g.accounts || []).forEach((id) => {
        const sid = String(id || "").trim();
        const nk = sid.replace(/\D/g, "");
        if (sid === dotted || (key && nk && nk === key)) found = g.id;
      });
    });
    if (found) return found;
    const plano = typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null;
    if (plano && typeof plano.suggestGroup === "function") {
      return plano.suggestGroup({ id: dotted, name: nome });
    }
    return null;
  },

  montar() {
    const plano = typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null;
    const fluxo = typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : null;
    const base = this.base2026();
    const tpl = (plano && typeof plano.dfcTemplateGroups === "function" ? plano.dfcTemplateGroups() : []).map((g) => ({
      ...g,
      months: Array(12).fill(0),
      base: Array(12).fill(0),
      accs: new Map()
    }));
    const byId = {};
    tpl.forEach((g) => { byId[g.id] = g; });
    const fora = new Map();
    this.linhasFiltradas().forEach((l) => {
      const gid = this.grupoDaConta(l.conta, l.cn);
      const g = gid ? byId[gid] : null;
      if (!g || g.type !== "resultado") {
        const key = String(l.conta || "") + "|" + String(l.cn || "");
        const cur = fora.get(key) || { conta: l.conta, cn: l.cn, total: 0 };
        (l.m || []).forEach((v) => { cur.total += Number(v) || 0; });
        fora.set(key, cur);
        return;
      }
      let acc = g.accs.get(l.conta);
      if (!acc) {
        const achado = this.acharBase(base.contas, gid, l.conta);
        acc = { conta: l.conta, cn: l.cn, months: Array(12).fill(0), base: achado ? achado.slice() : Array(12).fill(0), ccs: new Map() };
        g.accs.set(l.conta, acc);
      }
      const ccId = String(l.cc || "").trim() || "—";
      let cc = acc.ccs.get(ccId);
      if (!cc) {
        const achadoCc = this.acharBase(base.ccs, gid, l.conta, ccId);
        cc = { id: ccId, name: String(l.en || "").trim(), months: Array(12).fill(0), base: achadoCc ? achadoCc.slice() : Array(12).fill(0) };
        acc.ccs.set(ccId, cc);
      } else if (!cc.name && l.en) {
        cc.name = String(l.en).trim();
      }
      (l.m || []).forEach((v, i) => {
        if (i > 11) return;
        const s = fluxo && typeof fluxo.signedAmount === "function"
          ? fluxo.signedAmount(g, l.conta, l.cn, v)
          : (Number(v) || 0);
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
    tpl.forEach((g) => {
      if (g.type === "resultado" && base.grupos[g.id]) g.base = base.grupos[g.id].slice();
    });
    tpl.filter((g) => g.type !== "formula").sort((a, b) => depth(b) - depth(a)).forEach((g) => {
      tpl.filter((c) => c.parentId === g.id && c.type !== "formula").forEach((ch) => {
        ch.months.forEach((v, i) => { g.months[i] += v; });
        ch.base.forEach((v, i) => { g.base[i] += v; });
      });
    });
    const sum = (ids, campo) => {
      const months = Array(12).fill(0);
      ids.forEach((id) => {
        const n = byId[id];
        if (!n) return;
        (n[campo] || []).forEach((v, i) => { months[i] += v; });
      });
      return months;
    };
    const apply = (id, parts) => {
      if (!byId[id]) return;
      byId[id].months = sum(parts, "months");
      byId[id].base = sum(parts, "base");
    };
    apply("g_03", ["g_04", "g_05"]);
    apply("g_06", ["g_01", "g_02", "g_03"]);
    apply("g_08", ["g_06", "g_07"]);
    apply("g_10", ["g_08", "g_09"]);
    apply("g_12", ["g_10", "g_11"]);

    if (!this._expandInited) {
      tpl.filter((g) => !g.parentId).forEach((g) => this.expanded.add(g.id));
      this._expandInited = true;
    }

    const rows = [];
    const walk = (node, level) => {
      const children = tpl.filter((g) => g.parentId === node.id);
      const accs = [...node.accs.values()]
        .filter((a) => a.months.some((v) => Math.abs(v) >= 0.005))
        .sort((a, b) => String(a.conta).localeCompare(String(b.conta), "pt-BR", { numeric: true }));
      const hasKids = children.length > 0 || accs.length > 0;
      const total = node.months.reduce((a, b) => a + b, 0);
      const baseTotal = (node.base || []).reduce((a, b) => a + b, 0);
      rows.push({
        id: node.id,
        name: node.name,
        type: node.type,
        level,
        hasKids,
        isAccount: false,
        months: node.months,
        base: node.base,
        total,
        baseTotal
      });
      if (!this.expanded.has(node.id)) return;
      children.forEach((ch) => walk(ch, level + 1));
      accs.forEach((a) => {
        const accId = "acc:" + node.id + ":" + a.conta;
        const ccs = [...(a.ccs ? a.ccs.values() : [])]
          .filter((c) => c.months.some((v) => Math.abs(v) >= 0.005))
          .sort((x, y) => String(x.id).localeCompare(String(y.id), "pt-BR", { numeric: true }));
        rows.push({
          id: accId,
          name: a.conta + " " + (a.cn || ""),
          type: "conta",
          level: level + 1,
          hasKids: ccs.length > 0,
          isAccount: true,
          isCc: false,
          months: a.months,
          base: a.base || Array(12).fill(0),
          total: a.months.reduce((x, y) => x + y, 0),
          baseTotal: (a.base || []).reduce((x, y) => x + y, 0)
        });
        if (!ccs.length || !this.expanded.has(accId)) return;
        ccs.forEach((c) => {
          const label = c.id === "—" ? "Sem centro de custo" : (c.name ? c.id + " - " + c.name : c.id);
          rows.push({
            id: accId + ":" + c.id,
            name: label,
            type: "cc",
            level: level + 2,
            hasKids: false,
            isAccount: false,
            isCc: true,
            months: c.months,
            base: c.base || Array(12).fill(0),
            total: c.months.reduce((x, y) => x + y, 0),
            baseTotal: (c.base || []).reduce((x, y) => x + y, 0)
          });
        });
      });
    };
    tpl.filter((g) => !g.parentId).forEach((g) => walk(g, 0));
    const foraLista = [...fora.values()]
      .filter((x) => Math.abs(x.total) >= 0.005)
      .sort((a, b) => String(a.conta).localeCompare(String(b.conta), "pt-BR", { numeric: true }));
    return { rows, fora: foraLista };
  },

  toggle(id) {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.paintBody();
  },

  render(root) {
    this.garantir();
    const src = this.origem();
    root.innerHTML = `
      <div class="orc-dfc-page">
        ${typeof OrcamentoApp !== "undefined" ? OrcamentoApp.abasHtml() : ""}
        <p class="orc-dfc-lead">Orçamento de 2027 contra o DFC de 2026, em R$ mil. ${this.textoCorte()} Passe o mouse para ver o valor em reais.</p>
        <div class="orc-dfc-tools">
          <div id="orc-dfc-emp-box"></div>
          <div id="orc-dfc-cc-box"></div>
          <button type="button" class="orc-dfc-up" id="orc-dfc-up"><i data-lucide="upload"></i> Subir Excel 2027</button>
          <input id="orc-dfc-file" type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
          <button type="button" class="orc-dfc-base" id="orc-dfc-base" ${this._custom ? "" : "hidden"}>Base original</button>
          <span class="orc-dfc-meta" id="orc-dfc-meta"></span>
        </div>
        <div class="orc-dfc-layout">
          <div id="orc-dfc-body"></div>
          <aside id="orc-dfc-fora"></aside>
        </div>
      </div>`;
    this.paintMeta(src);
    this.paintEmp();
    this.paintCc();
    this.paintBody();
    const up = document.getElementById("orc-dfc-up");
    const file = document.getElementById("orc-dfc-file");
    if (up && file) up.addEventListener("click", () => file.click());
    if (file) file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (f) this.lerArquivo(f);
    });
    const baseBtn = document.getElementById("orc-dfc-base");
    if (baseBtn) baseBtn.addEventListener("click", () => this.voltarBase());
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    this.carregarBase();
  },

  async carregarBase() {
    const app = window.ResultadoCaixaApp;
    if (!app) return;
    const token = (this._bToken = (this._bToken || 0) + 1);
    try {
      if ((!app.acervo || typeof app.temAcervo !== "function" || !app.temAcervo()) && typeof app.lerLocal === "function") app.lerLocal();
      if (typeof app.carregarNuvem === "function" && !app._nuvemOk) await app.carregarNuvem();
      if (typeof app.carregarForecasts === "function") await app.carregarForecasts();
      if (typeof app.normalizarForecastsMemoria === "function") app.normalizarForecastsMemoria();
    } catch (e) {}
    if (token !== this._bToken) return;
    if (document.getElementById("orc-dfc-body")) this.paintBody();
  },

  paintMeta(src) {
    const el = document.getElementById("orc-dfc-meta");
    if (!el) return;
    const pack = src || this.origem();
    const n = (pack.lines || []).length;
    const nome = pack.fileName || "Base 2027";
    const extra = this._custom ? " · arquivo enviado" : "";
    el.textContent = n ? (nome + " · " + n.toLocaleString("pt-BR") + " lançamentos" + extra) : "Nenhum orçamento carregado.";
  },

  paintEmp() {
    const box = document.getElementById("orc-dfc-emp-box");
    if (!box || !window.MlEmpresaFilter) return;
    const items = this.empresas();
    box.innerHTML = MlEmpresaFilter.html({
      id: "orc-dfc-emp",
      label: "Empresas",
      items,
      selectedIds: this.selectedCompanyIds.map(String),
      open: this.companyDropOpen,
      query: this.companyQuery,
      emptyMeansAll: true
    });
    MlEmpresaFilter.bind("orc-dfc-emp", {
      toggleOpen: () => {
        this.companyDropOpen = !this.companyDropOpen;
        if (this.companyDropOpen) {
          this.ccDropOpen = false;
          this.paintCc();
        }
        this.paintEmp();
      },
      setQuery: (q) => {
        this.companyQuery = q || "";
        const list = document.getElementById("orc-dfc-emp-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-dfc-emp",
            items,
            selectedIds: this.selectedCompanyIds,
            query: this.companyQuery
          });
        }
      },
      toggleId: (id, on) => {
        const sid = String(id);
        if (on) {
          if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid);
        } else {
          this.selectedCompanyIds = this.selectedCompanyIds.filter((x) => x !== sid);
        }
        this.companyDropOpen = true;
        this.podarCentros();
        this.paintEmp();
        this.paintCc();
        this.paintBody();
      },
      selectAll: () => {
        this.selectedCompanyIds = items.map((c) => c.id);
        this.companyDropOpen = true;
        this.podarCentros();
        this.paintEmp();
        this.paintCc();
        this.paintBody();
      },
      selectNone: () => {
        this.selectedCompanyIds = [];
        this.companyDropOpen = true;
        this.podarCentros();
        this.paintEmp();
        this.paintCc();
        this.paintBody();
      }
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  paintCc() {
    const box = document.getElementById("orc-dfc-cc-box");
    if (!box || !window.MlEmpresaFilter) return;
    const items = this.empreendimentos();
    box.innerHTML = MlEmpresaFilter.html({
      id: "orc-dfc-cc",
      label: "Empreendimentos",
      items,
      selectedIds: this.selectedCcIds.map(String),
      open: this.ccDropOpen,
      query: this.ccQuery,
      emptyMeansAll: true,
      nouns: {
        singular: "empreendimento",
        plural: "empreendimentos",
        none: "Nenhum empreendimento",
        noMatch: "Nenhum empreendimento com esse nome."
      }
    });
    MlEmpresaFilter.bind("orc-dfc-cc", {
      toggleOpen: () => {
        this.ccDropOpen = !this.ccDropOpen;
        if (this.ccDropOpen) {
          this.companyDropOpen = false;
          this.paintEmp();
        }
        this.paintCc();
      },
      setQuery: (q) => {
        this.ccQuery = q || "";
        const list = document.getElementById("orc-dfc-cc-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-dfc-cc",
            items,
            selectedIds: this.selectedCcIds,
            query: this.ccQuery,
            nouns: { singular: "empreendimento", noMatch: "Nenhum empreendimento com esse nome." }
          });
        }
      },
      toggleId: (id, on) => {
        const sid = String(id);
        if (on) {
          if (!this.selectedCcIds.includes(sid)) this.selectedCcIds.push(sid);
        } else {
          this.selectedCcIds = this.selectedCcIds.filter((x) => x !== sid);
        }
        this.ccDropOpen = true;
        this.paintCc();
        this.paintBody();
      },
      selectAll: () => {
        this.selectedCcIds = items.map((c) => c.id);
        this.ccDropOpen = true;
        this.paintCc();
        this.paintBody();
      },
      selectNone: () => {
        this.selectedCcIds = [];
        this.ccDropOpen = true;
        this.paintCc();
        this.paintBody();
      }
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  paintBody() {
    const body = document.getElementById("orc-dfc-body");
    const foraEl = document.getElementById("orc-dfc-fora");
    if (!body) return;
    if (this.busy) {
      body.innerHTML = `
        <div class="ml-load orc-dfc-load">
          <div class="loading-spinner" aria-hidden="true"></div>
          <div class="loading-status-text">Lendo o Excel do orçamento…</div>
          <div class="ml-load-track"><div class="loading-progress-bar" style="width:45%"></div></div>
        </div>`;
      if (foraEl) foraEl.innerHTML = "";
      return;
    }
    if (!this.lines().length) {
      body.innerHTML = `<div class="orc-dfc-erro">${this.esc(this.erro || "Suba o Excel do orçamento 2027 para montar o DFC.")}</div>`;
      if (foraEl) foraEl.innerHTML = "";
      return;
    }
    const { rows, fora } = this.montar();
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    const h1 = this.MESES.map((m) => `<th colspan="4">${m}</th>`).join("") + `<th colspan="4">Total</th>`;
    const sub = (rotulo) => `<th>${rotulo}</th><th>Orç</th><th>Var R$</th><th>Var %</th>`;
    const h2 = this.MESES.map((_, i) => sub(i >= corte ? "Prev" : "Real")).join("") + sub("2026");
    const trs = rows.map((r) => {
      const cls = [
        r.isAccount ? "orc-dfc-acc" : "",
        r.isCc ? "orc-dfc-cc" : "",
        r.type === "formula" ? "orc-dfc-formula" : "",
        r.type === "total_n1" ? "orc-dfc-n1" : ""
      ].filter(Boolean).join(" ");
      const ico = r.hasKids
        ? `<i data-lucide="${this.expanded.has(r.id) ? "chevron-down" : "chevron-right"}"></i>`
        : `<i class="orc-dfc-no"></i>`;
      const base = r.base || [];
      const cells = r.months.map((v, i) => this.celCmp(v, base[i], i >= corte)).join("");
      const click = r.hasKids ? ` data-dfc-id="${this.esc(r.id)}"` : "";
      return `<tr class="${cls}"${click}>
        <td style="padding-left:${6 + r.level * 8}px">${ico}<span>${this.esc(r.name)}</span></td>
        ${cells}
        ${this.celCmp(r.total, r.baseTotal, false)}
      </tr>`;
    }).join("");
    const aviso = this.erro ? `<div class="orc-dfc-erro">${this.esc(this.erro)}</div>` : "";
    body.innerHTML = `
      ${aviso}
      <div class="orc-dfc-scroll">
        <table class="orc-dfc-table orc-dfc-cmp">
          <thead><tr><th rowspan="2">Conta</th>${h1}</tr><tr>${h2}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`;
    body.querySelectorAll("[data-dfc-id]").forEach((tr) => {
      tr.addEventListener("click", () => this.toggle(tr.getAttribute("data-dfc-id")));
    });
    if (foraEl) {
      if (!fora.length) {
        foraEl.innerHTML = "";
        foraEl.hidden = true;
      } else {
        foraEl.hidden = false;
        foraEl.innerHTML = `
          <div class="orc-dfc-alerta">
            <strong>Contas fora do DFC</strong>
            <p>Estas contas do Excel não têm lugar na visão e ficaram de fora da soma.</p>
            <ul>
              ${fora.map((f) => `<li><b>${this.esc(f.conta)}</b> ${this.esc(f.cn)}<span>${this.money(f.total)}</span></li>`).join("")}
            </ul>
          </div>`;
      }
    }
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  async lerArquivo(file) {
    this.erro = "";
    this.busy = true;
    this.paintBody();
    try {
      const buf = await file.arrayBuffer();
      const lines = await this.parseExcel(buf);
      if (!lines.length) throw new Error("O Excel não tem lançamentos com valor na aba de importação.");
      this._custom = { fileName: file.name, savedAt: Date.now(), lines };
      try { localStorage.setItem(this.LS, JSON.stringify(this._custom)); } catch (e) {}
      this.selectedCompanyIds = [];
      this.selectedCcIds = [];
      this._expandInited = false;
      this.expanded = new Set();
    } catch (err) {
      this.erro = (err && err.message) ? err.message : "Não consegui ler esse Excel.";
    }
    this.busy = false;
    const base = document.getElementById("orc-dfc-base");
    if (base) base.hidden = !this._custom;
    this.paintMeta();
    this.paintEmp();
    this.paintCc();
    this.paintBody();
  },

  voltarBase() {
    this._custom = null;
    this.erro = "";
    try { localStorage.removeItem(this.LS); } catch (e) {}
    this.selectedCompanyIds = [];
    this.selectedCcIds = [];
    this._expandInited = false;
    this.expanded = new Set();
    const base = document.getElementById("orc-dfc-base");
    if (base) base.hidden = true;
    this.paintMeta();
    this.paintEmp();
    this.paintCc();
    this.paintBody();
  },

  cellText(cell) {
    if (!cell || cell.value == null) return "";
    let v = cell.value;
    if (v && typeof v === "object") {
      if (v.result != null) v = v.result;
      else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text || "").join("");
      else if (v.text != null) v = v.text;
      else v = "";
    }
    return String(v == null ? "" : v).trim();
  },

  cellNum(cell) {
    if (!cell || cell.value == null) return 0;
    let v = cell.value;
    if (v && typeof v === "object") {
      if (v.result != null) v = v.result;
      else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text || "").join("");
      else if (v.text != null) v = v.text;
    }
    if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
    const s = String(v || "").trim();
    if (!s) return 0;
    const n = s.indexOf(",") >= 0
      ? Number(s.replace(/\./g, "").replace(",", "."))
      : Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  },

  cabecalho(ws) {
    for (let r = 1; r <= 8; r++) {
      const row = ws.getRow(r);
      const map = {};
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const h = this.norm(this.cellText(cell));
        if (h) map[h] = col;
      });
      if (!map.EMPRESA || !map.CONTA || !map.JAN) continue;
      const meses = this.MESES.map((m) => map[m]);
      if (meses.some((c) => !c)) continue;
      return {
        row: r,
        emp: map.EMPRESA,
        cc: map.CODIGO || 0,
        en: map.DESCRICAO || 0,
        conta: map.CONTA,
        cn: map["DESCRICAO CONTA"] || 0,
        meses
      };
    }
    return null;
  },

  async parseExcel(buf) {
    if (typeof ExcelJS === "undefined") {
      throw new Error("O leitor de Excel ainda não carregou. Atualize a página e tente de novo.");
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    let sheet = null;
    let header = null;
    wb.worksheets.forEach((ws) => {
      if (sheet) return;
      if (this.norm(ws.name) !== "IMPORTACAO") return;
      const h = this.cabecalho(ws);
      if (h) { sheet = ws; header = h; }
    });
    if (!sheet) {
      wb.worksheets.forEach((ws) => {
        if (sheet) return;
        const h = this.cabecalho(ws);
        if (h) { sheet = ws; header = h; }
      });
    }
    if (!sheet || !header) {
      throw new Error("Não achei a planilha com as colunas EMPRESA, CONTA e os meses de janeiro a dezembro.");
    }
    const lines = [];
    sheet.eachRow((row, n) => {
      if (n <= header.row) return;
      const emp = this.cellText(row.getCell(header.emp));
      const conta = this.cellText(row.getCell(header.conta));
      if (!emp && !conta) return;
      const meses = header.meses.map((col) => this.cellNum(row.getCell(col)));
      if (!meses.some((v) => Math.abs(v) >= 0.005)) return;
      const corte = emp.match(/^(\d+)\s*-\s*(.*)$/);
      lines.push({
        e: corte ? corte[1] : emp,
        enome: corte ? String(corte[2] || "").trim() : emp,
        cc: header.cc ? this.cellText(row.getCell(header.cc)) : "",
        en: header.en ? this.cellText(row.getCell(header.en)) : "",
        conta,
        cn: header.cn ? this.cellText(row.getCell(header.cn)) : "",
        m: meses
      });
    });
    return lines;
  }
};
