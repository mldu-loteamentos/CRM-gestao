/* Novo forecast do orçamento 2027.
   V1 é a importação, só leitura. V2 em diante é o ajuste editado aqui.
   Impostos são recalculados. A distribuição gerada não soma a distribuição já lançada. */
const OrcamentoForecastApp = {
  LS: "crm_orcamento_forecast_v2",
  CORTE: "2027-01-01",
  MESES: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
  state: {
    companyId: "",
    de: "2027-01-01",
    ate: "2027-12-31",
    versao: 2,
    openEmp: false,
    qEmp: "",
    sortKey: "cc",
    sortDir: 1,
    ccAberto: "",
    abertos: {},
    carregando: false
  },
  _base: null,
  _imposto: null,
  _saveTimer: null,

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  norm(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  },

  num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },

  dinheiro(v) {
    return this.num(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  parseValor(s) {
    const t = String(s == null ? "" : s).trim().replace(/\s/g, "");
    if (!t) return 0;
    if (t.indexOf(",") >= 0) return this.num(t.replace(/\./g, "").replace(",", "."));
    return this.num(t);
  },

  z() { return Array(12).fill(0); },

  hoje() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  },

  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  parseIso(s) {
    const p = String(s || "").slice(0, 10).split("-");
    if (p.length !== 3) return null;
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  },

  init() {
    this.carregarLocal();
    this.base();
    this.render();
    const emp = this.state.companyId;
    if (emp) this.carregarNuvem(emp);
    this.sincronizarBase();
  },

  /* A V1 é o último Excel enviado na base do orçamento, o mesmo que o DFC mostra. O arquivo embutido só entra se não houver envio. */
  fonteDfc() {
    if (typeof OrcamentoDfcApp !== "undefined" && typeof OrcamentoDfcApp.origem === "function") {
      if (typeof OrcamentoDfcApp.garantir === "function") OrcamentoDfcApp.garantir();
      return OrcamentoDfcApp.origem();
    }
    return window.ORCAMENTO_DFC_2027 || { fileName: "", lines: [], savedAt: 0 };
  },

  async sincronizarBase() {
    if (typeof OrcamentoDfcApp === "undefined" || typeof OrcamentoDfcApp.lerOrcamentoNuvem !== "function") return;
    const token = (Number(OrcamentoDfcApp._bToken) || 0) + 1;
    OrcamentoDfcApp._bToken = token;
    try { await OrcamentoDfcApp.lerOrcamentoNuvem(token); } catch (e) {}
    this._base = null;
    this._baseMarca = "";
    if (document.getElementById("orcamento-forecast-root")) this.render();
  },

  carregarLocal() {
    try {
      this._store = JSON.parse(localStorage.getItem(this.LS) || "{}") || {};
    } catch (e) {
      this._store = {};
    }
    if (!this._store.empresas) this._store.empresas = {};
  },

  pacote(emp, criar) {
    const id = String(emp || "");
    if (!id) return null;
    if (!this._store.empresas[id] && criar) {
      this._store.empresas[id] = { atual: 2, versoes: { "2": { edits: {}, fatias: {}, criadaEm: new Date().toISOString() } } };
    }
    return this._store.empresas[id] || null;
  },

  persistir() {
    try { localStorage.setItem(this.LS, JSON.stringify(this._store)); } catch (e) {}
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.salvarNuvem(), 500);
  },

  async salvarNuvem() {
    const emp = this.state.companyId;
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    const pack = this.pacote(emp, false);
    if (!emp || !pack || !fx || !db || typeof fx.setDoc !== "function") return;
    try {
      await fx.setDoc(fx.doc(db, "orcamento_forecast", "emp_" + emp), {
        savedAt: Date.now(),
        atual: pack.atual,
        versoes: pack.versoes
      });
    } catch (e) {}
  },

  async carregarNuvem(emp) {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!emp || !fx || !db || typeof fx.getDoc !== "function") return;
    this.state.carregando = true;
    try {
      const snap = await fx.getDoc(fx.doc(db, "orcamento_forecast", "emp_" + emp));
      const data = snap && typeof snap.data === "function" ? snap.data() : null;
      if (data && data.versoes) {
        const local = this.pacote(emp, false);
        const localAt = local && local.savedAt || 0;
        if (!local || Number(data.savedAt) >= localAt) {
          this._store.empresas[emp] = {
            atual: Number(data.atual) || 2,
            versoes: data.versoes,
            savedAt: Number(data.savedAt) || 0
          };
          if (this.state.versao > 1) this.state.versao = Number(data.atual) || this.state.versao;
          try { localStorage.setItem(this.LS, JSON.stringify(this._store)); } catch (e) {}
        }
      }
    } catch (e) {}
    this.state.carregando = false;
    if (this.state.companyId === emp) this.render();
  },

  base() {
    const src = this.fonteDfc();
    const linhas = (src && src.lines) || [];
    const marca = String(src && src.savedAt || 0) + "|" + linhas.length + "|" + String(src && src.fileName || "");
    if (this._base && this._baseMarca === marca) return this._base;
    const map = new Map();
    const por = (l, origem) => {
      const e = String(l.e || "").replace(/\D/g, "");
      const cc = String(l.cc || "").replace(/\D/g, "");
      const conta = String(l.conta || "").trim();
      if (!e || !cc || !conta) return;
      const key = e + "|" + cc + "|" + conta;
      const meses = Array.from({ length: 12 }, (_, i) => this.num((l.m || [])[i]));
      let row = map.get(key);
      if (!row) {
        row = {
          e: e,
          enome: "",
          cc: cc,
          ccNome: "",
          conta: conta,
          nome: "",
          m: this.z()
        };
        map.set(key, row);
      }
      if (origem === "dfc") {
        row.enome = String(l.enome || row.enome || "").trim();
        row.ccNome = String(l.en || row.ccNome || "").trim();
        row.nome = String(l.cn || row.nome || "").trim();
        row.m = meses;
      } else if (!row.nome) {
        row.enome = row.enome || String(l.en || "").trim();
        row.ccNome = row.ccNome || String(l.cn || "").trim();
        const nomes = (window.ORCAMENTO_RECEITA_2027 && ORCAMENTO_RECEITA_2027.names) || {};
        row.nome = nomes[conta] || conta;
        row.m = meses;
      }
    };
    linhas.forEach((l) => por(l, "dfc"));
    const enviado = typeof OrcamentoDfcApp !== "undefined" && OrcamentoDfcApp._custom && Array.isArray(OrcamentoDfcApp._custom.lines) && OrcamentoDfcApp._custom.lines.length;
    if (!enviado) {
      const rec = window.ORCAMENTO_RECEITA_2027;
      ((rec && rec.lines) || []).forEach((l) => por(l, "rec"));
    }
    this._base = map;
    this._baseMarca = marca;
    this._baseNome = String(src && src.fileName || "");
    return map;
  },

  empresas() {
    const map = new Map();
    this.base().forEach((l) => {
      if (!map.has(l.e)) map.set(l.e, l.enome || ("Empresa " + l.e));
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id: id, name: this.norm(name) }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  },

  linhasEmpresa(emp) {
    const id = String(emp || "");
    const out = [];
    this.base().forEach((l) => { if (l.e === id) out.push(l); });
    return out;
  },

  chave(l) { return l.e + "|" + l.cc + "|" + l.conta; },

  versoesDaEmpresa() {
    const pack = this.pacote(this.state.companyId, false);
    const nums = pack ? Object.keys(pack.versoes || {}).map(Number).filter((n) => n > 1) : [];
    nums.sort((a, b) => a - b);
    return [1].concat(nums);
  },

  /* Sem edição de entrada, custo ou despesa, o imposto importado permanece. Recalcular sem mudança faz a versão divergir da V1. */
  versaoMudouBase(emp, versao) {
    if (Number(versao) <= 1) return false;
    const doc = this.docVersao(versao, false);
    const edits = (doc && doc.edits) || {};
    return this.linhasEmpresa(emp).some((l) => {
      if (this.ehImposto(l.conta, l.nome) || this.ehDistribuicao(l.conta, l.nome)) return false;
      const ed = edits[this.chave(l)];
      if (!ed) return false;
      const base = l.m || [];
      return ed.some((v, i) => Math.abs(this.num(v) - this.num(base[i])) > 0.004);
    });
  },

  docVersao(n, criar) {
    if (n <= 1) return null;
    const pack = this.pacote(this.state.companyId, criar);
    if (!pack) return null;
    const k = String(n);
    if (!pack.versoes[k] && criar) pack.versoes[k] = { edits: {}, fatias: {}, criadaEm: new Date().toISOString() };
    return pack.versoes[k] || null;
  },

  mesesDe(versao, linha) {
    const v1 = (linha.m || this.z()).slice(0, 12);
    while (v1.length < 12) v1.push(0);
    if (versao <= 1) return v1;
    const doc = this.docVersao(versao, false);
    const ed = doc && doc.edits && doc.edits[this.chave(linha)];
    if (!ed) return v1;
    return v1.map((v, i) => ed[i] == null ? v : this.num(ed[i]));
  },

  ehImposto(conta, nome) {
    if (typeof OrcEst !== "undefined" && typeof OrcEst.tipoApurado === "function") {
      return !!OrcEst.tipoApurado({ conta: conta, cn: nome });
    }
    return /^(2\.04\.01\.0[1-4])$/.test(String(conta || ""));
  },

  ehDistribuicao(conta, nome) {
    const n = this.norm(nome);
    if (/DISTRIBUICAO (DE )?LUCRO|DIVIDEND/.test(n) && !/REPASSE DE LUCRO RECEB/.test(n)) return true;
    const c = String(conta || "").replace(/\D/g, "");
    if (c.indexOf("207") === 0) return true;
    if (typeof OrcEst !== "undefined" && typeof OrcEst.grupoEfetivo === "function") {
      const g = OrcEst.grupoEfetivo(conta, nome);
      if (g === "g_11_01") return true;
    }
    return false;
  },

  ehReceitaPartida(conta, nome) {
    if (this.ehImposto(conta, nome) || this.ehDistribuicao(conta, nome)) return false;
    const g = typeof OrcEst !== "undefined" && typeof OrcEst.grupoEfetivo === "function" ? (OrcEst.grupoEfetivo(conta, nome) || "") : "";
    if (g === "g_01_01" || g === "g_01_02" || g === "g_01_04") return true;
    const c = String(conta || "");
    return c.indexOf("1.01") === 0 || c.indexOf("1.02") === 0;
  },

  fatiasV1(linha) {
    const total = (linha.m || this.z()).slice(0, 12);
    if (String(linha.conta || "").replace(/\D/g, "") === "1020106") {
      return { cart: total.map((v) => this.num(v)), vend: this.z(), ant: this.z(), serv: this.z() };
    }
    const mapa = window.ORCAMENTO_ORIGEM_2027 || {};
    const o = mapa[linha.e + "|" + linha.cc + "|" + linha.conta] || {};
    const vend = Array.isArray(o.vm) ? o.vm.map((v) => this.num(v)) : this.z();
    const classificado = !!(o.cart || o.vend || o.serv || o.ant || o.cm || o.vm || o.sm);
    const servico = classificado
      ? !!(o.serv || (Array.isArray(o.sm) && o.sm.some((v) => Math.abs(this.num(v)) > 0.004)))
      : (String(linha.conta || "").indexOf("1.02") === 0 || (typeof OrcEst !== "undefined" && OrcEst.grupoEfetivo && OrcEst.grupoEfetivo(linha.conta, linha.nome) === "g_01_02"));
    const serv = servico ? (Array.isArray(o.sm) ? o.sm.map((v) => this.num(v)) : total.slice()) : this.z();
    const cart = servico ? this.z() : (Array.isArray(o.cm) ? o.cm.map((v) => this.num(v)) : total.map((v, i) => this.num(v) - this.num(vend[i])));
    return { cart: cart, vend: vend, ant: this.z(), serv: serv };
  },

  fatiasDe(versao, linha) {
    const base = this.fatiasV1(linha);
    if (versao <= 1) return base;
    const doc = this.docVersao(versao, false);
    const ed = doc && doc.fatias && doc.fatias[this.chave(linha)];
    if (!ed) return base;
    const mix = (arr, alt) => (arr || this.z()).map((v, i) => alt && alt[i] != null ? this.num(alt[i]) : this.num(v));
    return {
      cart: mix(base.cart, ed.cart),
      vend: mix(base.vend, ed.vend),
      ant: mix(base.ant, ed.ant),
      serv: mix(base.serv, ed.serv)
    };
  },

  mesNoPeriodo(i) {
    const ini = new Date(2027, i, 1);
    const fim = new Date(2027, i + 1, 0);
    const de = this.parseIso(this.state.de) || new Date(2027, 0, 1);
    const ate = this.parseIso(this.state.ate) || new Date(2027, 11, 31);
    return fim >= de && ini <= ate;
  },

  mesEditavel(i) {
    if (this.state.versao <= 1) return false;
    if (!this.mesNoPeriodo(i)) return false;
    const hoje = this.hoje();
    const corte = new Date(2027, 0, 1);
    if (hoje >= corte) {
      const inicioMes = new Date(2027, i, 1);
      const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      if (inicioMes < mesAtual) return false;
    }
    return true;
  },

  mesesVisiveis() {
    const out = [];
    for (let i = 0; i < 12; i++) if (this.mesNoPeriodo(i)) out.push(i);
    return out.length ? out : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  },

  rotuloVersao(n) {
    if (n <= 1) return "V1 · importação";
    const hoje = this.hoje();
    if (hoje < new Date(2027, 0, 1)) return "V" + n + " · ajuste do orçamento";
    if (hoje.getFullYear() > 2027) return "V" + n + " · forecast 12+0";
    const realizados = hoje.getMonth();
    return "V" + n + " · forecast " + realizados + "+" + (12 - realizados);
  },

  grupos() {
    let groups = [];
    if (typeof OrcamentoDfcApp !== "undefined" && typeof OrcamentoDfcApp.visaoDfc === "function") {
      groups = (OrcamentoDfcApp.visaoDfc() || {}).groups || [];
    }
    if (!groups.length && typeof PlanoFinanceiroApp !== "undefined" && typeof PlanoFinanceiroApp.dfcTemplateGroups === "function") {
      groups = PlanoFinanceiroApp.dfcTemplateGroups();
    }
    return groups || [];
  },

  grupoDe(conta, nome) {
    if (typeof OrcEst !== "undefined" && typeof OrcEst.grupoEfetivo === "function") {
      OrcEst.montarIndice && OrcEst.montarIndice();
      return OrcEst.grupoEfetivo(conta, nome) || "";
    }
    return "";
  },

  sinal(gid, conta, nome, valor) {
    if (typeof OrcEst !== "undefined" && typeof OrcEst.sinal === "function") return OrcEst.sinal(gid, conta, nome, valor);
    const raw = this.num(valor);
    if (!raw) return 0;
    const abs = Math.abs(raw);
    if (String(conta || "").charAt(0) === "1") return abs;
    return -abs;
  },

  /* Resultado do mês sem a distribuição lançada. O imposto só é trocado pelo cálculo quando a versão alterou a base. */
  resultadoEmpresa(emp, versao) {
    const mudou = this.versaoMudouBase(emp, versao);
    const linhas = this.linhasEmpresa(emp).map((l) => ({
      e: l.e,
      cc: l.cc,
      en: l.ccNome,
      enome: l.enome,
      conta: l.conta,
      cn: l.nome,
      m: this.mesesDe(versao, l)
    }));
    let imposto = null;
    if (mudou && typeof OrcamentoImpostosApp !== "undefined" && typeof OrcamentoImpostosApp.calcular === "function") {
      try { imposto = (OrcamentoImpostosApp.calcular(linhas) || {})[String(emp)] || null; } catch (e) { imposto = null; }
    }
    this._imposto = imposto;
    this._impostoAtivo = mudou;
    const pagar = (imposto && imposto.pagar) || { pis: this.z(), cofins: this.z(), irpj: this.z(), csll: this.z() };
    const meses = this.z();
    linhas.forEach((l) => {
      if (this.ehDistribuicao(l.conta, l.cn)) return;
      if (mudou && this.ehImposto(l.conta, l.cn)) return;
      const gid = this.grupoDe(l.conta, l.cn);
      l.m.forEach((v, i) => { meses[i] += this.sinal(gid, l.conta, l.cn, v); });
    });
    if (mudou) {
      for (let i = 0; i < 12; i++) {
        meses[i] -= this.num(pagar.pis[i]) + this.num(pagar.cofins[i]) + this.num(pagar.irpj[i]) + this.num(pagar.csll[i]);
      }
    }
    return { meses: meses, pagar: pagar };
  },

  distribuicaoPorCentro(emp, versao) {
    const linhas = this.linhasEmpresa(emp);
    const pesos = new Map();
    linhas.forEach((l) => {
      if (!this.ehDistribuicao(l.conta, l.nome)) return;
      const orc = (l.m || this.z()).reduce((s, v) => s + Math.abs(this.num(v)), 0);
      pesos.set(l.cc, (pesos.get(l.cc) || 0) + orc);
    });
    let total = 0;
    pesos.forEach((v) => { total += v; });
    const res = this.resultadoEmpresa(emp, versao);
    const out = new Map();
    pesos.forEach((peso, cc) => {
      const share = total > 0.5 ? peso / total : 0;
      out.set(cc, res.meses.map((v) => v * share));
    });
    return { pesos: pesos, gerado: out, resultado: res.meses, pagar: res.pagar };
  },

  somaPeriodo(arr) {
    return this.mesesVisiveis().reduce((s, i) => s + this.num((arr || [])[i]), 0);
  },

  centrosDaEmpresa() {
    const emp = this.state.companyId;
    if (!emp) return [];
    const dist = this.distribuicaoPorCentro(emp, this.state.versao);
    const mudou = !!this._impostoAtivo;
    const map = new Map();
    this.linhasEmpresa(emp).forEach((l) => {
      let row = map.get(l.cc);
      if (!row) {
        row = { id: l.cc, nome: l.ccNome || l.cc, contas: 0, v1: 0, atual: 0, distOrc: 0, distGer: 0 };
        map.set(l.cc, row);
      }
      if (!row.nome && l.ccNome) row.nome = l.ccNome;
      row.contas += 1;
      const v1 = l.m || this.z();
      const agora = (mudou && this.ehImposto(l.conta, l.nome)) ? this.impostoMeses(l) : this.mesesDe(this.state.versao, l);
      if (this.ehDistribuicao(l.conta, l.nome)) {
        row.distOrc += this.somaPeriodo(v1.map((v) => Math.abs(this.num(v))));
      } else {
        const gid = this.grupoDe(l.conta, l.nome);
        this.mesesVisiveis().forEach((i) => {
          row.v1 += this.sinal(gid, l.conta, l.nome, v1[i]);
          row.atual += this.sinal(gid, l.conta, l.nome, agora[i]);
        });
      }
    });
    map.forEach((row) => {
      const g = dist.gerado.get(row.id);
      row.distGer = g ? this.somaPeriodo(g) : 0;
    });
    const lista = [...map.values()];
    const dir = this.state.sortDir;
    const key = this.state.sortKey;
    lista.sort((a, b) => {
      const va = key === "nome" ? a.nome : (key === "cc" ? Number(a.id) : a[key]);
      const vb = key === "nome" ? b.nome : (key === "cc" ? Number(b.id) : b[key]);
      if (typeof va === "string") return va.localeCompare(vb, "pt") * dir;
      return (va - vb) * dir;
    });
    return { lista: lista, dist: dist };
  },

  ordenar(key) {
    if (this.state.sortKey === key) this.state.sortDir = -this.state.sortDir;
    else { this.state.sortKey = key; this.state.sortDir = 1; }
    this.render();
  },

  th(rotulo, key) {
    const onclick = key ? ` onclick="OrcamentoForecastApp.ordenar('${key}')" style="cursor:pointer;user-select:none;"` : "";
    const ico = key ? ` <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i>` : "";
    return `<th${onclick}>${rotulo}${ico}</th>`;
  },

  render() {
    const root = document.getElementById("orcamento-forecast-root");
    if (!root) return;
    let st = document.getElementById("ofc-style");
    if (!st) {
      st = document.createElement("style");
      st.id = "ofc-style";
      document.head.appendChild(st);
    }
    st.textContent = this.css();
    const corpoAntes = document.getElementById("ofc-corpo");
    const keepTop = corpoAntes ? corpoAntes.scrollTop : 0;
    const keepLeft = corpoAntes ? corpoAntes.scrollLeft : 0;
    document.querySelectorAll(".ofc-modal").forEach((n) => n.remove());
    const emp = this.state.companyId;
    const versoes = emp ? this.versoesDaEmpresa() : [1];
    if (versoes.indexOf(this.state.versao) < 0) this.state.versao = versoes[versoes.length - 1];
    const info = emp ? this.centrosDaEmpresa() : { lista: [], dist: null };
    const filtro = window.MlEmpresaFilter ? MlEmpresaFilter.html({
      id: "ofc-emp",
      label: "Empresas",
      items: this.empresas(),
      selectedIds: emp ? [emp] : [],
      query: this.state.qEmp,
      open: this.state.openEmp,
      single: true,
      emptyLabel: "Selecione a empresa"
    }) : "";
    const res = info.dist ? this.somaPeriodo(info.dist.resultado) : 0;
    const distOrc = info.lista.reduce((s, c) => s + c.distOrc, 0);
    const distGer = info.lista.reduce((s, c) => s + c.distGer, 0);
    root.innerHTML = `
      <p class="ofc-lead">A V1 é o último arquivo enviado na base do orçamento${this._baseNome ? " (" + this.esc(this._baseNome) + ")" : ""}. Esta tela grava o ajuste a partir da V2, de 01/01/2027 em diante, sem subir outra planilha. Enquanto 2027 não começa, a versão é um ajuste do orçamento. No meio do ano ela passa a ser os meses já realizados mais os que ainda vão acontecer, como forecast 2+10 em março.</p>
      <div class="ofc-bar">
        ${filtro}
        <label class="ofc-data">De
          <input type="date" min="2027-01-01" value="${this.esc(this.state.de)}" onchange="OrcamentoForecastApp.setPeriodo('de', this.value)">
        </label>
        <label class="ofc-data">Até
          <input type="date" min="2027-01-01" value="${this.esc(this.state.ate)}" onchange="OrcamentoForecastApp.setPeriodo('ate', this.value)">
        </label>
        <div class="ofc-versoes">
          ${versoes.map((n) => `<button type="button" class="ofc-ver${n === this.state.versao ? " is-on" : ""}" onclick="OrcamentoForecastApp.setVersao(${n})">${this.esc(this.rotuloVersao(n))}</button>`).join("")}
          ${emp ? `<button type="button" class="btn btn-primary ofc-nova" onclick="OrcamentoForecastApp.novaVersao()">Nova versão</button>` : ""}
          ${emp && this.state.versao > 1 ? `<button type="button" class="ofc-excluir" onclick="OrcamentoForecastApp.excluirVersao()">Excluir versão</button>` : ""}
        </div>
      </div>
      ${emp ? `<div class="ofc-kpis">
        <div><span>Resultado no período</span><strong>${this.dinheiro(res)}</strong></div>
        <div><span>Distribuição orçada</span><strong>${this.dinheiro(distOrc)}</strong></div>
        <div><span>Distribuição gerada</span><strong>${this.dinheiro(distGer)}</strong></div>
      </div>
      <p class="ofc-nota">O resultado sai das entradas, dos custos, das despesas e do PIS, COFINS, IRPJ e CSLL recalculados. A distribuição que veio na importação fica de fora desse saldo, para não contar duas vezes. A coluna gerada é a parte de cada centro, no peso do que foi orçado.</p>
      <div class="cc-scroll">
        <table class="cc-table ofc-table">
          <thead><tr>
            ${this.th("Centro de custo", "cc")}
            ${this.th("Contas", "contas")}
            ${this.th("Resultado V1", "v1")}
            ${this.th("Resultado desta versão", "atual")}
            ${this.th("Distribuição orçada", "distOrc")}
            ${this.th("Distribuição gerada", "distGer")}
            <th class="is-right">Ações</th>
          </tr></thead>
          <tbody>
            ${info.lista.map((c) => `<tr>
              <td class="cc-nome" title="${this.esc(c.id + " - " + c.nome)}">${this.esc(c.id + " - " + c.nome)}</td>
              <td class="is-right">${c.contas}</td>
              <td class="is-right">${this.dinheiro(c.v1)}</td>
              <td class="is-right">${this.dinheiro(c.atual)}</td>
              <td class="is-right">${c.distOrc ? this.dinheiro(c.distOrc) : "—"}</td>
              <td class="is-right">${c.distGer ? this.dinheiro(c.distGer) : "—"}</td>
              <td class="is-right"><button type="button" class="tvig-ico" title="Editar" onclick="OrcamentoForecastApp.abrir('${c.id}')"><i data-lucide="pencil" style="width:15px;height:15px;"></i></button></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="crm-card ofc-vazio">Escolha a empresa para ver os centros de custo que têm orçamento.</div>`}
      ${this.state.ccAberto ? this.modalHtml() : ""}`;
    const modal = root.querySelector(".ofc-modal");
    if (modal) document.body.appendChild(modal);
    const corpo = document.getElementById("ofc-corpo");
    if (corpo) {
      corpo.scrollTop = keepTop;
      corpo.scrollLeft = keepLeft;
    }
    this.bindFiltro();
    if (window.lucide) lucide.createIcons();
  },

  bindFiltro() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    MlEmpresaFilter.bind("ofc-emp", {
      close() {
        if (!self.state.openEmp && !self.state.qEmp) return;
        self.state.openEmp = false;
        self.state.qEmp = "";
        self.render();
      },
      toggleOpen() {
        self.state.openEmp = !self.state.openEmp;
        self.render();
      },
      setQuery(q) {
        self.state.qEmp = q || "";
        const box = document.getElementById("ofc-emp-list");
        if (box) {
          box.innerHTML = MlEmpresaFilter.listHtml({
            id: "ofc-emp",
            items: self.empresas(),
            selectedIds: self.state.companyId ? [self.state.companyId] : [],
            query: self.state.qEmp,
            single: true
          });
        }
      },
      toggleId(id, on) {
        self.state.companyId = on ? String(id) : "";
        self.state.openEmp = false;
        self.state.qEmp = "";
        self.state.ccAberto = "";
        const pack = self.pacote(self.state.companyId, false);
        const nums = pack ? Object.keys(pack.versoes || {}).map(Number).filter((n) => n > 1) : [];
        self.state.versao = nums.length ? (Number(pack.atual) || nums[nums.length - 1]) : 1;
        self._imposto = null;
        self.render();
        if (self.state.companyId) self.carregarNuvem(self.state.companyId);
      },
      selectAll() {},
      selectNone() {}
    });
  },

  setPeriodo(campo, valor) {
    const d = this.parseIso(valor);
    if (!d || d < new Date(2027, 0, 1)) return;
    this.state[campo] = this.iso(d);
    const de = this.parseIso(this.state.de);
    const ate = this.parseIso(this.state.ate);
    if (de && ate && de > ate) {
      if (campo === "de") this.state.ate = this.state.de;
      else this.state.de = this.state.ate;
    }
    this.render();
  },

  setVersao(n) {
    this.state.versao = Number(n) || 1;
    this.state.ccAberto = "";
    this.render();
  },

  novaVersao() {
    const emp = this.state.companyId;
    if (!emp) return;
    const pack = this.pacote(emp, true);
    const nums = Object.keys(pack.versoes || {}).map(Number);
    const origem = Math.max(this.state.versao, 2);
    const nova = (nums.length ? Math.max.apply(null, nums) : 1) + 1;
    const edits = {};
    const fatias = {};
    this.linhasEmpresa(emp).forEach((l) => {
      const key = this.chave(l);
      const m = this.mesesDe(origem, l);
      const mudou = m.some((v, i) => Math.abs(v - this.num(l.m[i])) > 0.004);
      if (mudou) edits[key] = m.slice();
      if (this.ehReceitaPartida(l.conta, l.nome)) fatias[key] = this.fatiasDe(origem, l);
    });
    pack.versoes[String(nova)] = { edits: edits, fatias: fatias, criadaEm: new Date().toISOString() };
    pack.atual = nova;
    pack.savedAt = Date.now();
    this.state.versao = nova;
    this.persistir();
    this.render();
  },

  excluirVersao() {
    const emp = this.state.companyId;
    const n = Number(this.state.versao);
    if (!emp || n <= 1) return;
    const pack = this.pacote(emp, false);
    if (!pack || !pack.versoes || !pack.versoes[String(n)]) return;
    const ok = window.confirm("Excluir a " + this.rotuloVersao(n) + "? O ajuste desta versão sai da tela.");
    if (!ok) return;
    delete pack.versoes[String(n)];
    const rest = Object.keys(pack.versoes).map(Number).filter((x) => x > 1);
    const menores = rest.filter((x) => x < n);
    const destino = menores.length ? Math.max.apply(null, menores) : (rest.length ? Math.min.apply(null, rest) : 1);
    pack.atual = destino;
    pack.savedAt = Date.now();
    this.state.versao = destino;
    this.state.ccAberto = "";
    this.persistir();
    this.render();
  },

  abrir(cc) {
    this.state.ccAberto = String(cc);
    this.state.abertos = {};
    this.render();
  },

  fechar() {
    this.state.ccAberto = "";
    this.render();
  },

  toggleGrupo(id) {
    this.state.abertos[id] = !this.state.abertos[id];
    const corpo = document.getElementById("ofc-corpo");
    const top = corpo ? corpo.scrollTop : 0;
    this.render();
    const novo = document.getElementById("ofc-corpo");
    if (novo) novo.scrollTop = top;
  },

  gravarMes(cc, conta, i, bruto) {
    if (!this.mesEditavel(i)) return;
    const linha = this.linhasEmpresa(this.state.companyId).find((l) => l.cc === cc && l.conta === conta);
    if (!linha || this.ehImposto(linha.conta, linha.nome) || this.ehDistribuicao(linha.conta, linha.nome)) return;
    const doc = this.docVersao(this.state.versao, true);
    const key = this.chave(linha);
    const atual = this.mesesDe(this.state.versao, linha).slice();
    const antes = atual[i];
    atual[i] = this.parseValor(bruto);
    doc.edits[key] = atual;
    if (this.ehReceitaPartida(linha.conta, linha.nome)) {
      const f = this.fatiasDe(this.state.versao, linha);
      const delta = atual[i] - antes;
      const servico = String(linha.conta).replace(/\D/g, "") !== "1020106" && String(linha.conta).indexOf("1.02") === 0;
      if (servico) f.serv[i] = this.num(f.serv[i]) + delta;
      else f.cart[i] = this.num(f.cart[i]) + delta;
      doc.fatias[key] = f;
    }
    const pack = this.pacote(this.state.companyId, true);
    pack.atual = this.state.versao;
    pack.savedAt = Date.now();
    this.persistir();
    this.render();
  },

  gravarFatia(cc, conta, tipo, i, bruto) {
    if (!this.mesEditavel(i)) return;
    if (["cart", "vend", "ant", "serv"].indexOf(tipo) < 0) return;
    const linha = this.linhasEmpresa(this.state.companyId).find((l) => l.cc === cc && l.conta === conta);
    if (!linha) return;
    const doc = this.docVersao(this.state.versao, true);
    const key = this.chave(linha);
    const f = this.fatiasDe(this.state.versao, linha);
    f[tipo][i] = this.parseValor(bruto);
    doc.fatias[key] = {
      cart: f.cart.slice(),
      vend: f.vend.slice(),
      ant: f.ant.slice(),
      serv: f.serv.slice()
    };
    const total = this.mesesDe(this.state.versao, linha).slice();
    total[i] = this.num(f.cart[i]) + this.num(f.vend[i]) + this.num(f.ant[i]) + this.num(f.serv[i]);
    doc.edits[key] = total;
    const pack = this.pacote(this.state.companyId, true);
    pack.atual = this.state.versao;
    pack.savedAt = Date.now();
    this.persistir();
    this.render();
  },

  celula(valor, editavel, onchange) {
    if (!editavel) return `<td class="is-right ofc-lock">${this.dinheiro(valor)}</td>`;
    return `<td class="is-right"><input class="ofc-inp" inputmode="decimal" value="${this.esc(this.dinheiro(valor))}" onchange="${onchange}"></td>`;
  },

  modalHtml() {
    const cc = this.state.ccAberto;
    const linhas = this.linhasEmpresa(this.state.companyId).filter((l) => l.cc === cc);
    const nome = (linhas[0] && linhas[0].ccNome) || cc;
    const meses = this.mesesVisiveis();
    const dist = this.distribuicaoPorCentro(this.state.companyId, this.state.versao);
    const grupos = this.grupos();
    const byId = {};
    grupos.forEach((g) => { byId[g.id] = g; });
    const contasPorGrupo = new Map();
    const soltas = [];
    linhas.forEach((l) => {
      const gid = this.grupoDe(l.conta, l.nome);
      if (gid && byId[gid]) {
        if (!contasPorGrupo.has(gid)) contasPorGrupo.set(gid, []);
        contasPorGrupo.get(gid).push(l);
      } else soltas.push(l);
    });
    const vivos = new Set();
    contasPorGrupo.forEach((_, gid) => {
      let cur = gid;
      while (cur && byId[cur]) {
        vivos.add(cur);
        cur = byId[cur].parentId;
      }
    });
    const head = `<tr><th class="ofc-nome">Conta</th>${meses.map((i) => `<th class="is-right">${this.MESES[i]}</th>`).join("")}<th class="is-right">Total</th></tr>`;
    const linhasHtml = [];
    const geradoVisto = new Set();
    const walk = (parent) => {
      grupos.filter((g) => (g.parentId || null) === parent && vivos.has(g.id)).forEach((g) => {
        const aberto = !!this.state.abertos[g.id];
        const soma = this.z();
        const acumular = (nodeId) => {
          (contasPorGrupo.get(nodeId) || []).forEach((l) => {
            const vals = this.ehDistribuicao(l.conta, l.nome)
              ? (l.m || this.z())
              : ((this._impostoAtivo && this.ehImposto(l.conta, l.nome)) ? this.impostoMeses(l) : this.mesesDe(this.state.versao, l));
            const gid = this.grupoDe(l.conta, l.nome);
            vals.forEach((v, i) => { soma[i] += this.sinal(gid, l.conta, l.nome, v); });
          });
          grupos.filter((ch) => ch.parentId === nodeId).forEach((ch) => acumular(ch.id));
        };
        acumular(g.id);
        const ico = `<i data-lucide="${aberto ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i>`;
        linhasHtml.push(`<tr class="ofc-grupo ofc-${g.type === "resultado" ? "res" : "n1"}" onclick="OrcamentoForecastApp.toggleGrupo('${g.id}')"><td class="ofc-nome">${ico} ${this.esc(g.name)}</td>${meses.map((i) => `<td class="is-right">${this.dinheiro(soma[i])}</td>`).join("")}<td class="is-right">${this.dinheiro(this.somaPeriodo(soma))}</td></tr>`);
        if (!aberto) return;
        walk(g.id);
        (contasPorGrupo.get(g.id) || []).forEach((l) => linhasHtml.push(this.contaHtml(l, meses, dist, geradoVisto)));
      });
    };
    walk(null);
    soltas.forEach((l) => linhasHtml.push(this.contaHtml(l, meses, dist, geradoVisto)));
    const geradoCc = dist.gerado.get(cc);
    const blocoDist = geradoCc ? `<p class="ofc-nota">A linha gerada é a parte deste centro no resultado da empresa, depois das entradas, dos impostos recalculados e das saídas. O valor orçado na importação aparece na conta, e não entra de novo nesse saldo.</p>` : "";
    return `<div class="ofc-modal" role="dialog" aria-modal="true">
      <div class="ofc-painel">
        <header class="ofc-head">
          <strong>${this.esc(cc + " - " + nome)}</strong>
          <button type="button" class="btn btn-fechar" onclick="OrcamentoForecastApp.fechar()">Fechar</button>
        </header>
        <div class="ofc-corpo" id="ofc-corpo">
          ${blocoDist}
          <div class="cc-scroll">
            <table class="cc-table ofc-sheet"><thead>${head}</thead><tbody>${linhasHtml.join("")}</tbody></table>
          </div>
        </div>
      </div>
    </div>`;
  },

  impostoMeses(linha) {
    const tipo = typeof OrcEst !== "undefined" ? OrcEst.tipoApurado({ conta: linha.conta, cn: linha.nome }) : "";
    const pagar = this._imposto && this._imposto.pagar;
    if (tipo && pagar && pagar[tipo]) return pagar[tipo].slice(0, 12);
    return this.mesesDe(this.state.versao, linha);
  },

  contaHtml(l, meses, dist, geradoVisto) {
    const distLinha = this.ehDistribuicao(l.conta, l.nome);
    const imposto = this.ehImposto(l.conta, l.nome);
    const recalculado = imposto && !!this._impostoAtivo;
    const vals = recalculado ? this.impostoMeses(l) : (distLinha ? (l.m || this.z()) : this.mesesDe(this.state.versao, l));
    const cls = imposto ? "ofc-imposto" : (distLinha ? "ofc-dist" : "ofc-conta");
    const tag = recalculado ? " · recalculado" : (distLinha ? " · orçado na importação" : "");
    const nomeConta = this.esc(l.conta + " " + l.nome) + tag;
    const fatiaAberta = !!this.state.abertos["conta:" + l.conta + ":" + l.cc];
    const abre = (!distLinha && !imposto && this.ehReceitaPartida(l.conta, l.nome))
      ? `<button type="button" class="ofc-abre" title="Abrir carteira, vendas, antecipação e serviço" onclick="OrcamentoForecastApp.toggleGrupo('conta:${l.conta}:${l.cc}')"><i data-lucide="${fatiaAberta ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i></button> `
      : "";
    let html = `<tr class="${cls}"><td class="ofc-nome" title="${this.esc(l.conta + " " + l.nome)}">${abre}${nomeConta}</td>${meses.map((i) => {
      if (imposto || distLinha || !this.mesEditavel(i)) return `<td class="is-right ofc-lock">${this.dinheiro(vals[i])}</td>`;
      return `<td class="is-right"><input class="ofc-inp" inputmode="decimal" value="${this.esc(this.dinheiro(vals[i]))}" onchange="OrcamentoForecastApp.gravarMes('${l.cc}','${l.conta}',${i},this.value)"></td>`;
    }).join("")}<td class="is-right">${this.dinheiro(this.somaPeriodo(vals))}</td></tr>`;
    if (distLinha && geradoVisto && !geradoVisto.has(l.cc)) {
      geradoVisto.add(l.cc);
      const ger = dist.gerado.get(l.cc) || this.z();
      html += `<tr class="ofc-gerado"><td class="ofc-nome">Gerado nesta versão</td>${meses.map((i) => `<td class="is-right">${this.dinheiro(ger[i])}</td>`).join("")}<td class="is-right">${this.dinheiro(this.somaPeriodo(ger))}</td></tr>`;
    }
    if (!distLinha && !imposto && this.ehReceitaPartida(l.conta, l.nome) && fatiaAberta) {
      const f = this.fatiasDe(this.state.versao, l);
      [["cart", "Carteira"], ["vend", "Novas vendas"], ["ant", "Antecipação"], ["serv", "Serviço"]].forEach((par) => {
        html += `<tr class="ofc-fatia"><td class="ofc-nome">${par[1]}</td>${meses.map((i) => {
          if (!this.mesEditavel(i)) return `<td class="is-right ofc-lock">${this.dinheiro(f[par[0]][i])}</td>`;
          return `<td class="is-right"><input class="ofc-inp" inputmode="decimal" value="${this.esc(this.dinheiro(f[par[0]][i]))}" onchange="OrcamentoForecastApp.gravarFatia('${l.cc}','${l.conta}','${par[0]}',${i},this.value)"></td>`;
        }).join("")}<td class="is-right">${this.dinheiro(this.somaPeriodo(f[par[0]]))}</td></tr>`;
      });
    }
    return html;
  },

  css() {
    return `
      .ofc-lead { margin: 0 0 14px; color: #475569; font-size: 0.9rem; line-height: 1.45; max-width: 980px; }
      .ofc-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 14px; position: relative; z-index: 40; }
      .ofc-data { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; font-weight: 700; color: #64748b; }
      .ofc-data input { height: 36px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 10px; font: inherit; color: #0f172a; background: #fff; }
      .ofc-versoes { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .ofc-ver { border: 1px solid #cbd5e1; background: #fff; color: #334155; border-radius: 999px; padding: 6px 12px; font-size: 0.78rem; cursor: pointer; }
      .ofc-ver.is-on { background: #105436; color: #fff; border-color: #105436; }
      .ofc-nova { height: 36px; }
      .ofc-excluir { height: 36px; border: 1px solid #b91c1c; background: #fff; color: #b91c1c; border-radius: 8px; padding: 0 12px; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
      .ofc-excluir:hover { background: #fef2f2; }
      .ofc-kpis { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
      .ofc-kpis div { background: #fff; border: 1px solid #e2e8f0; border-top: 3px solid #105436; border-radius: 10px; padding: 8px 12px; min-width: 180px; }
      .ofc-kpis span { display: block; font-size: 0.72rem; color: #64748b; font-weight: 700; }
      .ofc-kpis strong { font-size: 1.05rem; color: #0f172a; }
      .ofc-nota { margin: 0 0 12px; color: #64748b; font-size: 0.78rem; line-height: 1.4; max-width: 980px; }
      .ofc-vazio { padding: 28px; color: #64748b; }
      .ofc-table td.is-right, .ofc-table th.is-right, .ofc-sheet td.is-right, .ofc-sheet th.is-right { text-align: right; }
      .ofc-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, .45); z-index: 13000; display: flex; align-items: stretch; justify-content: stretch; padding: 0; }
      .ofc-painel { background: #fff; width: 100%; height: 100%; max-height: 100%; border-radius: 0; display: flex; flex-direction: column; box-shadow: none; }
      .ofc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #e2e8f0; flex: none; background: #fff; }
      .ofc-head strong { font-size: 1rem; color: #0f172a; min-width: 0; }
      .ofc-corpo { overflow: auto; padding: 12px 18px 18px; flex: 1; min-height: 0; }
      .ofc-corpo .cc-scroll { max-height: none; overflow: visible; border: 0; }
      .ofc-sheet { width: max-content; min-width: 100%; table-layout: auto; border-collapse: separate; border-spacing: 0; }
      .ofc-sheet td, .ofc-sheet th { white-space: nowrap; overflow: visible; text-overflow: clip; }
      .ofc-sheet th.ofc-nome, .ofc-sheet td.ofc-nome { position: sticky; left: 0; z-index: 2; min-width: 360px; width: 420px; max-width: 480px; white-space: normal; text-align: left; line-height: 1.35; background: #fff; box-shadow: 8px 0 8px -8px rgba(15, 23, 42, .35); }
      .ofc-sheet thead th { position: sticky; top: 0; z-index: 3; background: #105436; color: #fff; }
      .ofc-sheet thead th.ofc-nome { z-index: 5; left: 0; background: #105436; }
      .ofc-grupo { cursor: pointer; font-weight: 700; }
      .ofc-grupo.ofc-n1 td { background: #0c3d28; color: #fff; }
      .ofc-grupo.ofc-res td { background: #e7f6ee; color: #105436; }
      .ofc-fatia td:first-child { padding-left: 28px; color: #475569; }
      .ofc-lock { color: #64748b; }
      .ofc-imposto td { background: #f8fafc; }
      .ofc-gerado td { background: #ecfdf3; color: #105436; font-weight: 700; }
      .ofc-grupo.ofc-n1 td.ofc-nome { background: #0c3d28; }
      .ofc-grupo.ofc-res td.ofc-nome { background: #e7f6ee; }
      .ofc-imposto td.ofc-nome { background: #f8fafc; }
      .ofc-gerado td.ofc-nome { background: #ecfdf3; }
      .ofc-inp { width: 112px; height: 32px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: right; padding: 0 8px; font: inherit; font-size: 0.82rem; }
      .ofc-abre { border: 0; background: transparent; padding: 0 4px 0 0; cursor: pointer; color: #105436; vertical-align: middle; }
    `;
  }
};

window.OrcamentoForecastApp = OrcamentoForecastApp;
