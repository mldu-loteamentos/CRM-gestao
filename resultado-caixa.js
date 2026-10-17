const ResultadoCaixaApp = {
  aba: "entradas",
  mes: 0,
  date: "",
  compareDate: "",
  loading: false,
  saving: false,
  error: "",
  rows: [],
  compare: [],
  dates: [],
  anos: {},
  acervo: { anterior: {}, meses: {} },
  lendo: false,
  escala: "milhoes",
  agrupar: true,
  outrosAberto: false,
  arqsAberto: false,
  forecast: null,
  forecasts: {},
  SOLTOS: { "14703": 1, "14704": 1, "14304": 1, "14305": 1 },
  dfcLinhas: [],
  dfcLendo: false,
  dfcErro: "",
  mlAbertos: {},
  mlFatia: "",
  mlDados: null,
  mlLendo: false,
  mlErro: "",
  _mlSel: null,

  FRASES_CARGA: ["Analisando resultados", "Cruzando informações", "Consolidando empresas"],

  fraseCarga() {
    const p = Number(this._cargaPct) || 0;
    const i = p < 34 ? 0 : p < 68 ? 1 : 2;
    return this.FRASES_CARGA[i];
  },

  iniciarCarga(reiniciar) {
    if (reiniciar) this._cargaPct = 8;
    if (this._cargaTimer) return;
    if (!this._cargaPct) this._cargaPct = 8;
    this._cargaTimer = setInterval(() => {
      if (!this.dfcLendo && !this.lendo && !this.loading) {
        this.pararCarga();
        return;
      }
      const p = Number(this._cargaPct) || 8;
      this._cargaPct = Math.min(92, p + (p < 40 ? 5 : p < 70 ? 2.4 : 0.7));
      const txt = document.getElementById("rcx-load-text");
      const bar = document.getElementById("rcx-load-bar");
      if (txt) txt.textContent = this.fraseCarga();
      if (bar) bar.style.width = this._cargaPct + "%";
    }, 420);
  },

  pararCarga() {
    if (this._cargaTimer) clearInterval(this._cargaTimer);
    this._cargaTimer = null;
  },

  loaderHtml() {
    const pct = Math.max(8, Math.min(92, Number(this._cargaPct) || 8));
    return `<div class="ml-load" role="status" aria-live="polite">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-status-text" id="rcx-load-text">${this.fraseCarga()}</div>
      <div class="ml-load-track"><div class="loading-progress-bar" id="rcx-load-bar" style="width:${pct}%"></div></div>
    </div>`;
  },
  MESES: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],

  init() {
    if (!this.date) this.date = new Date().toISOString().slice(0, 10);
    if (!this._ok) {
      this._ok = true;
      if (!this.mes) this.mes = new Date().getMonth() + 1;
      this.lerLocal();
      this.montarVista();
    }
    if (this.aba === "posicao") this.aba = "entradas";
    this.render();
    if (!this._nuvemPedida) {
      this._nuvemPedida = true;
      this.carregarNuvem();
    }
  },

  setAba(id) {
    const prox = id || "entradas";
    if (prox !== this.aba) this.outrosAberto = false;
    this.aba = prox === "posicao" ? "entradas" : prox;
    this.render();
    if (this.aba === "caixa") this.carregarMl();
    if (window.lucide) lucide.createIcons();
  },

  lerLocal() {
    this.acervo = { anterior: {}, meses: {} };
    let novo = null;
    try { novo = JSON.parse(localStorage.getItem("rc_orc_v2") || "null"); } catch (e) { novo = null; }
    if (novo && (novo.anterior || novo.meses)) {
      this.acervo.anterior = novo.anterior || {};
      this.acervo.meses = novo.meses || {};
    } else {
      try {
        const legado = JSON.parse(localStorage.getItem("rc_orc_v1") || "null");
        if (legado && typeof legado === "object") this.migrarLegado(legado);
      } catch (e) {}
    }
    this.forecasts = {};
    try {
      const salvo = JSON.parse(localStorage.getItem("rc_forecast_comp") || "null");
      if (salvo && typeof salvo === "object") this.forecasts = salvo;
    } catch (e) {
      this.forecasts = {};
    }
    this.normalizarForecastsMemoria();
    this.aplicarForecastVista();
  },

  /** Relatório "Orçamento Empresarial Agrupado" do Sienge, por centro de custo, mensal. Guarda só as contas analíticas (tipo R). A empresa 1 detalha o plano um nível abaixo (2.02.02.04.03); o valor continua na conta do DFC. */
  lerForecast(wb) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    const mesRe = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\/(\d{4})$/i;
    const mesNum = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
    const txt = (v) => String(v == null ? "" : v).trim();
    const contas = {};
    const nomes = {};
    let cc = null;
    let meses = [];
    let tipoCol = -1;
    grid.forEach((row) => {
      const r = row || [];
      const c0 = txt(r[0]);
      if (/^centro de custo$/i.test(c0)) {
        cc = null;
        meses = [];
        r.slice(1).forEach((c) => {
          const m = txt(c).match(/^(\d{4,6})\s*-\s*(.+)$/);
          if (m && !cc) cc = { id: m[1], nome: txt(c) };
        });
        return;
      }
      if (/^c[oó]digo$/i.test(c0)) {
        meses = [];
        tipoCol = -1;
        r.forEach((c, col) => {
          const s = txt(c);
          const m = s.toLowerCase().match(mesRe);
          if (m) meses.push({ col, ym: m[2] + "-" + String(mesNum[m[1]]).padStart(2, "0") });
          if (/^tipo$/i.test(s)) tipoCol = col;
        });
        return;
      }
      const code = c0.replace(/\s/g, "");
      if (!cc || !meses.length || !/^\d+(\.\d+)*$/.test(code)) return;
      if (tipoCol >= 0 && txt(r[tipoCol]).toUpperCase() !== "R") return;
      const bag = contas[cc.id] || (contas[cc.id] = {});
      nomes[cc.id] = cc.nome;
      const conta = bag[code] || (bag[code] = { nome: txt(r[1]), meses: {} });
      meses.forEach((m) => {
        const v = Number(r[m.col]) || 0;
        if (v) conta.meses[m.ym] = (conta.meses[m.ym] || 0) + v;
      });
    });
    Object.keys(contas).forEach((id) => {
      const codes = Object.keys(contas[id]);
      codes.forEach((c) => { if (codes.some((o) => o !== c && o.startsWith(c + "."))) delete contas[id][c]; });
    });
    return { contas, nomes };
  },

  juntarForecast(dest, f) {
    Object.keys((f && f.contas) || {}).forEach((cc) => {
      const bag = dest.contas[cc] || (dest.contas[cc] = {});
      if (f.nomes && f.nomes[cc]) dest.nomes[cc] = f.nomes[cc];
      Object.keys(f.contas[cc] || {}).forEach((code) => {
        const de = f.contas[cc][code] || {};
        const para = bag[code] || (bag[code] = { nome: de.nome || "", meses: {} });
        if (de.nome) para.nome = de.nome;
        Object.keys(de.meses || {}).forEach((ym) => {
          para.meses[ym] = (Number(para.meses[ym]) || 0) + (Number(de.meses[ym]) || 0);
        });
      });
    });
  },

  async subirForecast(input) {
    const files = input && input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    if (typeof XLSX === "undefined") {
      this.error = "A biblioteca de Excel não carregou. Atualize a página.";
      this.render();
      return;
    }
    this.lendo = true;
    this.error = "";
    this.aviso = "";
    this.render();
    try {
      const lidos = [];
      const falhas = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
          const f = this.lerForecast(wb);
          if (!Object.keys(f.contas || {}).length) {
            falhas.push(file.name);
            continue;
          }
          lidos.push({ nome: file.name, empresa: this.empresaId(file.name) || 0, contas: f.contas, nomes: f.nomes || {} });
        } catch (e) {
          falhas.push(file.name);
        }
      }
      if (!lidos.length) throw new Error("Não reconheci o forecast. Use o relatório Orçamento Empresarial Agrupado por centro de custo, com periodicidade mensal.");
      const seguintes = this.mesesSeguintes();
      const nomesMes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      const sel = Number(this.mes) || 1;
      const ano = this.anoAtual();
      if (!seguintes.length) {
        throw new Error("Dezembro fecha o ano: o realizado já vai até o fim. Escolha o mês até onde o realizado entra e suba o forecast dos meses seguintes.");
      }
      const em = new Date().toISOString();
      const planos = [];
      lidos.forEach((arq) => {
        seguintes.forEach((ym) => {
          const fatia = this.recortarForecast(arq.contas, ym);
          if (!Object.keys(fatia).length) return;
          planos.push({ ym: ym, nome: arq.nome, empresa: arq.empresa, rotulo: this.nomeEmpresaArquivo(arq.nome), contas: fatia, nomes: arq.nomes });
        });
      });
      if (!planos.length) {
        const de = nomesMes[sel] || seguintes[0];
        throw new Error("O mês escolhido é o realizado acumulado até " + (nomesMes[sel - 1] || "") + "/" + ano + ". O forecast precisa dos meses seguintes, de " + de + " a dezembro/" + ano + ".");
      }
      const substituir = {};
      lidos.forEach((arq) => {
        substituir[arq.nome] = 1;
        if (!arq.empresa) return;
        Object.keys(this.forecasts || {}).forEach((ym) => {
          const por = (this.forecasts[ym] && this.forecasts[ym].porArquivo) || {};
          Object.keys(por).forEach((nome) => {
            const emp = Number(por[nome].empresa) || this.empresaId(nome) || this.empresaId(por[nome].rotulo);
            if (emp && emp === arq.empresa) substituir[nome] = 1;
          });
        });
      });
      seguintes.forEach((ym) => {
        const doc = this.garantirForecast(ym);
        Object.keys(substituir).forEach((nome) => { delete doc.porArquivo[nome]; });
      });
      const mesesGravados = {};
      planos.forEach((p) => {
        const doc = this.garantirForecast(p.ym);
        doc.em = em;
        doc.porArquivo[p.nome] = { rotulo: p.rotulo, empresa: p.empresa || 0, contas: p.contas, nomes: p.nomes, em: em };
        mesesGravados[p.ym] = 1;
      });
      seguintes.forEach((ym) => {
        const doc = this.forecasts[ym];
        if (doc && doc.porArquivo && !Object.keys(doc.porArquivo).length) {
          delete this.forecasts[ym];
          this.apagarForecastNuvem(ym);
        }
      });
      const gravados = Object.keys(mesesGravados).map((ym) => ({ ym: ym, doc: this.forecasts[ym] }));
      this.aplicarForecastVista();
      if (falhas.length) this.aviso = "Não reconheci " + falhas.length + " arquivo(s): " + falhas.join(", ") + ".";
      this.gravarForecastLocal();
      try {
        for (let i = 0; i < gravados.length; i++) await this.salvarForecastNuvem(gravados[i].ym, gravados[i].doc);
      } catch (err) {
        this.aviso = ((this.aviso ? this.aviso + " " : "") + "O forecast ficou neste navegador, mas a nuvem não guardou: " + ((err && err.message) || err)).trim();
      }
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.lendo = false;
    if (input) input.value = "";
    this.render();
  },

  removerForecast() {
    Object.keys(this.forecasts || {}).forEach((ym) => {
      delete this.forecasts[ym];
      this.apagarForecastNuvem(ym);
    });
    this.aplicarForecastVista();
    this.gravarForecastLocal();
    this.render();
  },

  removerForecastArquivo(chave) {
    let nome = chave;
    try { nome = decodeURIComponent(chave); } catch (e) {}
    Object.keys(this.forecasts || {}).forEach((ym) => {
      const doc = this.forecasts[ym];
      if (!doc || !doc.porArquivo || !doc.porArquivo[nome]) return;
      delete doc.porArquivo[nome];
      if (!Object.keys(doc.porArquivo).length) {
        delete this.forecasts[ym];
        this.apagarForecastNuvem(ym);
      } else {
        this.salvarForecastNuvem(ym, doc);
      }
    });
    this.aplicarForecastVista();
    this.gravarForecastLocal();
    this.render();
  },

  garantirForecast(ym) {
    const doc = this.forecasts[ym] || (this.forecasts[ym] = { em: "", porArquivo: {} });
    if (!doc.porArquivo || typeof doc.porArquivo !== "object" || Array.isArray(doc.porArquivo)) {
      doc.porArquivo = this.partirForecast(doc);
    }
    return doc;
  },

  /** Separa um forecast antigo (contas juntas) em um arquivo por empresa. */
  partirForecast(doc) {
    const contas = (doc && doc.contas) || {};
    const nomesCc = (doc && doc.nomes) || {};
    const nomesArquivo = Array.isArray(doc && doc.arquivos) ? doc.arquivos.filter(Boolean) : [];
    if (doc && doc.porArquivo && typeof doc.porArquivo === "object" && !Array.isArray(doc.porArquivo) && Object.keys(doc.porArquivo).length) {
      return doc.porArquivo;
    }
    const porEmp = {};
    const solto = { contas: {}, nomes: {} };
    Object.keys(contas).forEach((cc) => {
      const emp = this.empresaDoCentro(cc, nomesCc[cc]);
      const dest = emp ? (porEmp[emp] || (porEmp[emp] = { contas: {}, nomes: {} })) : solto;
      dest.contas[cc] = contas[cc];
      if (nomesCc[cc]) dest.nomes[cc] = nomesCc[cc];
    });
    const por = {};
    const usados = {};
    const listaNomes = nomesArquivo.length ? nomesArquivo : ["forecast"];
    listaNomes.forEach((nome) => {
      const emp = this.empresaId(nome);
      if (!emp || !porEmp[emp] || usados[emp]) return;
      usados[emp] = nome;
      por[nome] = {
        rotulo: this.nomeEmpresaArquivo(nome),
        empresa: emp,
        contas: porEmp[emp].contas,
        nomes: porEmp[emp].nomes,
        em: (doc && doc.em) || ""
      };
    });
    Object.keys(porEmp).forEach((emp) => {
      if (usados[emp]) return;
      const nome = "empresa-" + emp;
      por[nome] = {
        rotulo: "Empresa " + emp,
        empresa: Number(emp),
        contas: porEmp[emp].contas,
        nomes: porEmp[emp].nomes,
        em: (doc && doc.em) || ""
      };
    });
    if (Object.keys(solto.contas).length) {
      const jaTem = Object.keys(por).length;
      const unico = !jaTem && nomesArquivo.length === 1;
      const nome = jaTem ? "sem-empresa" : (unico ? (nomesArquivo[0] || "forecast") : "forecast");
      por[nome] = {
        rotulo: jaTem ? "Sem empresa" : (unico ? this.nomeEmpresaArquivo(nome) : "Forecast"),
        empresa: unico ? (this.empresaId(nome) || 0) : 0,
        contas: solto.contas,
        nomes: solto.nomes,
        em: (doc && doc.em) || ""
      };
    }
    if (!Object.keys(por).length && Object.keys(contas).length) {
      const nome = nomesArquivo[0] || "forecast";
      por[nome] = { rotulo: this.nomeEmpresaArquivo(nome), empresa: this.empresaId(nome) || 0, contas: contas, nomes: nomesCc, em: (doc && doc.em) || "" };
    }
    return por;
  },

  normalizarForecastsMemoria() {
    Object.keys(this.forecasts || {}).forEach((ym) => {
      const doc = this.forecasts[ym];
      if (!doc) return;
      if (!doc.porArquivo || Array.isArray(doc.porArquivo) || !Object.keys(doc.porArquivo).length) {
        doc.porArquivo = this.partirForecast(doc);
      }
      Object.keys(doc.porArquivo).forEach((nome) => {
        const arq = doc.porArquivo[nome];
        if (!arq) return;
        if (!arq.rotulo) arq.rotulo = this.nomeEmpresaArquivo(nome);
        if (!arq.empresa) arq.empresa = this.empresaId(nome) || this.empresaId(arq.rotulo) || 0;
      });
    });
  },

  competenciaAtual() {
    return this.chaveMes(this.anoAtual(), this.mes);
  },

  /** Meses depois do escolhido, até dezembro. O mês da tela é realizado; o forecast começa no seguinte. */
  mesesSeguintes() {
    const ano = this.anoAtual();
    const sel = Number(this.mes) || 1;
    const out = [];
    for (let m = sel + 1; m <= 12; m++) out.push(this.chaveMes(ano, m));
    return out;
  },

  recortarForecast(contas, chave) {
    const out = {};
    Object.keys(contas || {}).forEach((cc) => {
      Object.keys(contas[cc] || {}).forEach((code) => {
        const de = contas[cc][code] || {};
        const v = Number((de.meses || {})[chave]) || 0;
        if (!v) return;
        const bag = out[cc] || (out[cc] = {});
        bag[code] = { nome: de.nome || "", meses: { [chave]: v } };
      });
    });
    return out;
  },

  aplicarForecastVista() {
    const contas = {};
    const nomes = {};
    const arquivos = [];
    const meses = [];
    let em = "";
    this.mesesSeguintes().forEach((ym) => {
      const fatia = this.contasMesForecast(ym);
      if (!fatia) return;
      const doc = this.forecasts[ym] || {};
      meses.push(ym);
      if (doc.em && doc.em > em) em = doc.em;
      Object.keys(doc.porArquivo || {}).forEach((nome) => { if (arquivos.indexOf(nome) < 0) arquivos.push(nome); });
      this.juntarForecast({ contas: contas, nomes: nomes }, fatia);
    });
    if (!meses.length) {
      this.forecast = null;
      return;
    }
    this.forecast = {
      arquivo: arquivos.join(", "),
      arquivos: arquivos,
      em: em,
      meses: meses,
      contas: contas,
      nomes: nomes
    };
  },

  gravarForecastLocal() {
    try { localStorage.setItem("rc_forecast_comp", JSON.stringify(this.forecasts || {})); } catch (e) {}
  },

  docForecast(ym) {
    return "fc-" + ym;
  },

  async salvarForecastNuvem(ym, doc) {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || !doc) return false;
    const por = doc.porArquivo || {};
    const nomes = {};
    const contas = {};
    Object.keys(por).forEach((nome) => this.juntarForecast({ contas: contas, nomes: nomes }, por[nome]));
    await fx.setDoc(fx.doc(db, "resultado_caixa", this.docForecast(ym)), {
      tipo: "forecast",
      slot: "fc-" + ym,
      competencia: ym,
      arquivos: Object.keys(por),
      nomes: nomes,
      contas: contas,
      porArquivo: por,
      em: doc.em || new Date().toISOString()
    });
    return true;
  },

  apagarForecastNuvem(ym) {
    this.apagarNuvem(this.docForecast(ym));
  },

  async carregarForecasts() {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db) return;
    try {
      const snap = await fx.getDocs(fx.collection(db, "resultado_caixa"));
      const nuvem = {};
      const semParte = {};
      snap.forEach((docSnap) => {
        const id = docSnap.id || "";
        const x = docSnap.data() || {};
        if (x.tipo !== "forecast" && id.indexOf("fc-") !== 0) return;
        const ym = String(x.competencia || id.replace(/^fc-/, ""));
        if (!/^\d{4}-\d{2}$/.test(ym)) return;
        const jaPartido = x.porArquivo && typeof x.porArquivo === "object" && !Array.isArray(x.porArquivo) && Object.keys(x.porArquivo).length;
        if (!jaPartido) semParte[ym] = 1;
        nuvem[ym] = {
          arquivos: x.arquivos || [],
          em: x.em || "",
          contas: x.contas || {},
          nomes: x.nomes || {},
          porArquivo: jaPartido ? x.porArquivo : null
        };
      });
      if (Object.keys(nuvem).length) {
        this.forecasts = nuvem;
        this.normalizarForecastsMemoria();
        this.gravarForecastLocal();
        Object.keys(semParte).forEach((ym) => {
          const doc = this.forecasts[ym];
          if (doc && doc.porArquivo && Object.keys(doc.porArquivo).length) this.salvarForecastNuvem(ym, doc);
        });
      }
      this.aplicarForecastVista();
    } catch (e) {}
  },

  empresaDoForecast(cc, nome) {
    const peloArquivo = this.empresaDoCc(cc);
    if (peloArquivo) return peloArquivo;
    return this.empresaId(nome || "");
  },

  /* Bases de PIS/COFINS e lucro presumido de uma competência, por empresa, a partir do forecast daquele mês. */
  contasMesForecast(ym) {
    const doc = this.forecasts && this.forecasts[ym];
    if (!doc) return null;
    const contas = {};
    const nomes = {};
    const por = doc.porArquivo;
    if (por && typeof por === "object" && !Array.isArray(por) && Object.keys(por).length) {
      Object.keys(por).forEach((nome) => this.juntarForecast({ contas: contas, nomes: nomes }, por[nome]));
    } else if (doc.contas) {
      this.juntarForecast({ contas: contas, nomes: nomes }, doc);
    }
    return Object.keys(contas).length ? { contas: contas, nomes: nomes } : null;
  },

  basesForecast(ym) {
    const doc = this.forecasts && this.forecasts[ym];
    if (!doc) return null;
    const est = typeof OrcEst !== "undefined" ? OrcEst : null;
    if (!est) return null;
    const cfg = est.taxConfig();
    const lista = [];
    const por = doc.porArquivo;
    if (por && typeof por === "object" && !Array.isArray(por) && Object.keys(por).length) {
      Object.keys(por).forEach((nome) => lista.push(Object.assign({ nome: nome }, por[nome])));
    } else if (doc.contas) {
      lista.push({ nome: "", empresa: 0, contas: doc.contas, nomes: doc.nomes || {} });
    }
    const porEmp = {};
    lista.forEach((arq) => {
      const empArq = Number(arq.empresa) || this.empresaId(arq.nome) || this.empresaId(arq.rotulo) || 0;
      Object.keys(arq.contas || {}).forEach((cc) => {
        const emp = empArq || this.empresaDoCentro(cc, (arq.nomes || {})[cc]);
        if (!emp) return;
        const row = porEmp[emp] || (porEmp[emp] = { vendas: 0, servicos: 0, financeiras: 0 });
        Object.keys(arq.contas[cc] || {}).forEach((code) => {
          const info = arq.contas[cc][code] || {};
          const valor = Number((info.meses || {})[ym]) || 0;
          if (!valor) return;
          const cl = est.classe({ conta: code, cn: info.nome || "" }, cfg);
          if (!cl) return;
          let s = est.sinal(est.grupoEfetivo ? est.grupoEfetivo(code, info.nome || "") : est.grupo(code, info.nome || ""), code, info.nome || "", valor);
          if (cl.red && s > 0) s = -Math.abs(s);
          row[cl.bucket] += s;
        });
      });
    });
    return Object.keys(porEmp).length ? porEmp : null;
  },

  /** Forecast do ano pelas contas da visão DFC do lado (entradas ou saídas), no % Moura Leite quando agrupado. */
  forecastLado(ano, lado) {
    const out = {};
    for (let m = 1; m <= 12; m++) {
      const chave = Number(ano) + "-" + String(m).padStart(2, "0");
      const f = this.contasMesForecast(chave);
      if (!f || !f.contas) continue;
      const parcial = this.somarForecastMes(f, ano, lado, chave);
      if (parcial != null) out[m] = parcial;
    }
    return out;
  },

  somarForecastMes(f, ano, lado, chave) {
    const FC = window.FluxoCaixaApp;
    let mapa = null;
    try {
      if (FC && typeof FC.visao === "function") {
        mapa = this.mapaDfc(FC);
        if (!Object.keys(mapa.accToNode).length) mapa = null;
      }
    } catch (e) {
      mapa = null;
    }
    const aceita = this.noAceito(lado);
    const ajuste = lado === "saidas" ? -1 : 1;
    let total = 0;
    let algum = false;
    Object.keys(f.contas).forEach((cc) => {
      const fator = this.agrupar ? this.pctMl(cc) : 1;
      Object.keys(f.contas[cc]).forEach((code) => {
        let entra;
        if (mapa) {
          const node = this.noDaLinha(FC, mapa, { code: code, nome: (f.contas[cc][code] && f.contas[cc][code].nome) || "" });
          entra = !!(node && aceita(node.id));
        } else if (lado === "saidas") {
          entra = /^2\./.test(code);
        } else {
          entra = /^1\.0[123](\.|$)/.test(code);
        }
        if (!entra) return;
        const sinal = code.charAt(0) === "2" ? -1 : 1;
        const v = Number((f.contas[cc][code].meses || {})[chave]) || 0;
        if (!v || Number(chave.slice(0, 4)) !== Number(ano)) return;
        algum = true;
        total += ajuste * sinal * v * fator;
      });
    });
    return algum ? total : null;
  },

  forecastEntradas(ano) {
    return this.forecastLado(ano, "entradas");
  },

  gravarLocal() {
    try {
      localStorage.setItem("rc_orc_v2", JSON.stringify(this.acervo || { anterior: {}, meses: {} }));
    } catch (e) {
      if (!this._nuvemOk) this.error = "Não coube no navegador guardar o orçamento. Ele fica na nuvem quando o envio concluir.";
    }
  },

  anoBase() {
    const ys = [];
    Object.keys((this.acervo && this.acervo.meses) || {}).forEach((k) => {
      const y = Number(String(k).slice(0, 4));
      if (y > 1900) ys.push(y);
    });
    Object.keys((this.acervo && this.acervo.anterior) || {}).forEach((k) => {
      const y = Number(k);
      if (y > 1900) ys.push(y + 1);
    });
    if (ys.length) return Math.max.apply(null, ys);
    return new Date().getFullYear();
  },

  anoAtual() {
    return this.anoBase();
  },

  chaveMes(ano, mes) {
    const y = Number(ano) || this.anoBase();
    const m = Number(mes != null ? mes : this.mes) || 1;
    return y + "-" + String(m).padStart(2, "0");
  },

  migrarLegado(anos) {
    const base = new Date().getFullYear();
    const mes = String(Number(this.mes) || (new Date().getMonth() + 1)).padStart(2, "0");
    Object.keys(anos || {}).forEach((y) => {
      const ano = Number(y);
      const arquivos = (anos[y] && anos[y].arquivos) || {};
      if (!ano || !Object.keys(arquivos).length) return;
      if (ano < base) this.acervo.anterior[String(ano)] = { arquivos: arquivos };
      else this.acervo.meses[ano + "-" + mes] = { arquivos: arquivos };
    });
  },

  temAcervo() {
    const ant = this.acervo && this.acervo.anterior;
    const mes = this.acervo && this.acervo.meses;
    const cheio = (bag) => Object.keys(bag || {}).some((k) => Object.keys((bag[k] && bag[k].arquivos) || {}).length);
    return cheio(ant) || cheio(mes);
  },

  montarVista() {
    const ano = this.anoBase();
    const vista = {};
    const ant = this.acervo && this.acervo.anterior && this.acervo.anterior[String(ano - 1)];
    if (ant && ant.arquivos && Object.keys(ant.arquivos).length) vista[String(ano - 1)] = ant;
    const cur = this.acervo && this.acervo.meses && this.acervo.meses[this.chaveMes(ano)];
    if (cur && cur.arquivos && Object.keys(cur.arquivos).length) vista[String(ano)] = cur;
    this.anos = vista;
  },

  slotDoAno(ano) {
    const y = Number(ano);
    const base = this.anoBase();
    if (y && y < base) return { tipo: "anterior", chave: String(y), id: "ant-" + y };
    const chave = this.chaveMes(y || base);
    return { tipo: "mes", chave: chave, id: chave };
  },

  pegarSlot(slot) {
    if (!this.acervo) this.acervo = { anterior: {}, meses: {} };
    if (slot.tipo === "anterior") {
      if (!this.acervo.anterior[slot.chave]) this.acervo.anterior[slot.chave] = { arquivos: {} };
      return this.acervo.anterior[slot.chave];
    }
    if (!this.acervo.meses[slot.chave]) this.acervo.meses[slot.chave] = { arquivos: {} };
    return this.acervo.meses[slot.chave];
  },

  grupoCc(id) {
    const s = String(id || "").replace(/\D/g, "");
    if (this.SOLTOS && this.SOLTOS[s]) return s;
    if (s.length >= 5) return s.slice(0, 3) + "00";
    return s;
  },

  SIGLAS: {
    BOTUCATU: "BTU",
    AVARE: "AVR",
    TAGUAI: "TAG",
    ITATINGA: "ITA",
    "CERQUEIRA CESAR": "CCS",
    PARDINHO: "PAR",
    PIRAJU: "PRJ",
    FARTURA: "FAR",
    ARACARIGUAMA: "ARA",
    BOITUVA: "BOI"
  },

  rotulo(id, nome, solto) {
    const partes = String(nome || "").split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    let cidade = "";
    let n = nome || id;
    if (partes.length >= 2 && /^\d+$/.test(partes[0])) {
      if (partes.length >= 3) {
        cidade = partes[1];
        n = partes.slice(2).join(" - ");
      } else {
        n = partes.slice(1).join(" - ");
      }
    }
    n = String(n || "").replace(/\s+MLDU$/i, "").trim();
    if (!solto) n = n.replace(/\s*-\s*PARCERIA\b.*$/i, "").trim();
    return { nome: this.nomeVisao(n || id), cidade };
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9()]+/g, " ").trim();
  },

  nomeVisao(nome) {
    const f = this.fold(nome);
    if (f === "MLDU" || f === "CORPORATIVO") return "CORPORATIVO";
    if (/^LIVIA( I{1,3}| [123])?$/.test(f)) return "CENTRAL PARQUE";
    return String(nome || "").trim();
  },

  siglaCidade(cidade) {
    const f = this.fold(cidade);
    if (!f) return "";
    if (this.SIGLAS[f]) return this.SIGLAS[f];
    const palavras = f.split(" ").filter(Boolean);
    if (palavras.length >= 2) return palavras.map((w) => w.charAt(0)).join("").slice(0, 3);
    return f.slice(0, 3);
  },

  distinguirCidades(rows) {
    const porNome = {};
    rows.forEach((r) => {
      const k = this.fold(r.nome);
      if (!porNome[k]) porNome[k] = {};
      const cid = this.fold(r.cidade);
      if (cid) porNome[k][cid] = r.cidade;
    });
    rows.forEach((r) => {
      const cidades = Object.keys(porNome[this.fold(r.nome)] || {});
      if (cidades.length > 1 && r.cidade) r.nome = r.nome + " (" + this.siglaCidade(r.cidade) + ")";
    });
    return rows;
  },

  empresasCustom() {
    try {
      if (typeof EmpresasState !== "undefined" && EmpresasState.customFields) return EmpresasState.customFields;
      return JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
    } catch (e) { return {}; }
  },

  parceriasSalvas() {
    const PP = window.ParametrizacaoParceiroApp;
    if (PP && Array.isArray(PP.items) && PP.items.length) return PP.items;
    try { return JSON.parse(localStorage.getItem("crm_parcerias_v1") || "[]") || []; }
    catch (e) { return []; }
  },

  /* Sociedade sem percentual na empresa: usa a fatia dos sócios Moura Leite / MLDU. */
  pctSocioMoura(empId) {
    const id = String(empId || "");
    if (!id) return 0;
    let melhor = 0;
    this.parceriasSalvas().forEach((p) => {
      if (!p || String(p.companyId) !== id || String(p.kind || "") !== "sociedade") return;
      const vistos = {};
      let pct = 0;
      const pessoas = (p.socios || []).concat(p.creditor ? [p.creditor] : []);
      pessoas.forEach((s) => {
        if (!s) return;
        const chave = String(s.id || s.name || "");
        if (chave && vistos[chave]) return;
        if (chave) vistos[chave] = 1;
        const n = this.fold(s.name || s.nome || "");
        if (n.indexOf("MOURA") < 0 && n.indexOf("MLDU") < 0) return;
        const v = Number(s.sharePct);
        if (v > 0) pct += v;
      });
      if (pct > melhor) melhor = pct;
    });
    if (!(melhor > 0)) return 0;
    return melhor > 1 ? Math.min(melhor, 100) / 100 : melhor;
  },

  pctEmpresaId(empId) {
    if (!this.agrupar) return 1;
    const id = Number(empId) || 0;
    if (!id) return 1;
    const custom = this.empresasCustom();
    const cfg = custom[id] || custom[String(id)] || {};
    const bruto = cfg.percentual_mldu;
    const pct = typeof bruto === "string" ? Number(String(bruto).replace(/\s/g, "").replace(",", ".")) : Number(bruto);
    if (pct > 0 && pct <= 100) return pct / 100;
    const socio = this.pctSocioMoura(id);
    if (socio > 0) return socio;
    return 1;
  },

  empresaDoCc(ccId) {
    return this.empresaDoCentro(ccId, "");
  },

  /** Empresa do centro de custo: cadastro, arquivo da competência que já tem esse centro, ou o nome. */
  empresaDoCentro(ccId, nomeCc) {
    const id = String(ccId || "").replace(/\D/g, "");
    if (!id && !nomeCc) return 0;
    const app = window.AppState;
    const listas = app ? [app.cachedCostCenters, app.costCenters] : [];
    for (let i = 0; i < listas.length; i++) {
      const lista = listas[i];
      if (!Array.isArray(lista)) continue;
      const hit = lista.find((c) => c && String(c.id || "").replace(/\D/g, "") === id);
      const emp = hit ? (Number(hit.idCompany || hit.companyId) || 0) : 0;
      if (emp) return emp;
    }
    const bolsas = [];
    Object.keys((this.acervo && this.acervo.meses) || {}).forEach((k) => bolsas.push(this.acervo.meses[k]));
    Object.keys((this.acervo && this.acervo.anterior) || {}).forEach((k) => bolsas.push(this.acervo.anterior[k]));
    Object.keys(this.anos || {}).forEach((y) => bolsas.push(this.anos[y]));
    for (let i = 0; i < bolsas.length; i++) {
      const arquivos = (bolsas[i] && bolsas[i].arquivos) || {};
      const nomes = Object.keys(arquivos);
      for (let j = 0; j < nomes.length; j++) {
        const arq = arquivos[nomes[j]];
        if (!arq) continue;
        const tem = (arq.entradas && arq.entradas[id]) || (arq.contasPorCc && arq.contasPorCc[id]);
        if (!tem) continue;
        const emp = Number(arq.empresa) || this.empresaId(nomes[j]);
        if (emp) return emp;
      }
    }
    return this.empresaId(nomeCc || "");
  },

  /** Percentual da Moura Leite da empresa dona do arquivo (1 sem agrupar). */
  pctArquivo(arq, nome) {
    if (!this.agrupar) return 1;
    const emp = Number(arq && arq.empresa) || this.empresaId(nome);
    return emp ? this.pctEmpresaId(emp) : 1;
  },

  /** Valor do centro de custo somando arquivo por arquivo, cada um no percentual da sua empresa. */
  valorAgrupado(lado, ano, ccId, mes, campo, ate) {
    if (!this.agrupar) return this.valor(lado, ano, ccId, mes, campo, ate);
    const a = this.anoDados(ano);
    if (!a) return 0;
    const fim = Number(mes);
    const ini = ate ? 1 : fim;
    let s = 0;
    Object.keys(a.arquivos || {}).forEach((nome) => {
      const arq = a.arquivos[nome];
      const bag = arq && arq[lado] && arq[lado][ccId];
      if (!bag) return;
      let v = 0;
      for (let m = ini; m <= fim; m++) {
        const cel = (bag.meses || {})[String(m)];
        if (cel) v += Number(cel[campo]) || 0;
      }
      if (v) s += v * this.pctArquivo(arq, nome);
    });
    return s;
  },

  pctMl(id) {
    if (!this.agrupar) return 1;
    const emp = this.empresaDoCc(id);
    if (!emp) return 1;
    return this.pctEmpresaId(emp);
  },

  normCode(v) {
    return String(v == null ? "" : v).trim().replace(/\s+/g, "");
  },

  nomeEmpresaArquivo(nome) {
    let base = String(nome || "").replace(/\.(xlsx|xlsm)$/i, "").trim();
    base = base.replace(/^\d+\s*-\s*\d{4}_/i, "");
    base = base.replace(/^\d+\s*[ªa°º]?\s*vers[aã]o_/i, "");
    return base.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  },

  catalogoEmpresas() {
    const map = {};
    const add = (id, nome) => {
      const n = Number(id);
      if (!n || !nome) return;
      if (!map[n]) map[n] = [];
      map[n].push(String(nome));
    };
    try {
      const raw = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}");
      Object.keys(raw || {}).forEach((k) => {
        const item = raw[k];
        if (item && item.company_id != null) add(item.company_id, item.nome_usual);
      });
    } catch (e) {}
    const lista = (window.AppState && AppState.companies) || [];
    lista.forEach((c) => {
      if (!c) return;
      add(c.id, c.name);
      add(c.id, c.tradeName);
    });
    return map;
  },

  empresaId(nomeArquivo) {
    const rot = this.fold(this.nomeEmpresaArquivo(nomeArquivo));
    if (!rot) return 0;
    const aliases = [
      ["ELLENCO", 12],
      ["TERRA DO ARACARI", 3],
      ["ARACARI SPE", 6],
      ["TERRAS DE ITU", 4],
      ["VERCELLINO", 13],
      ["PIRAPITINGUI", 14],
      ["JARDIM DOS IPES", 36],
      ["JARDIM IPES", 36],
      ["TAGUAI", 36],
      ["NOVO HORIZONTE", 32],
      ["CHACARA", 2],
      ["RAMOS", 28],
      ["MLDU", 1],
      ["ITATINGA", 32],
      ["MLES", 5]
    ];
    for (let i = 0; i < aliases.length; i++) {
      if (rot.indexOf(this.fold(aliases[i][0])) >= 0) return aliases[i][1];
    }
    const cat = this.catalogoEmpresas();
    const alvo = rot.split(" ").filter((t) => t.length > 2);
    let best = 0;
    let bestScore = 0;
    Object.keys(cat).forEach((id) => {
      (cat[id] || []).forEach((n) => {
        const f = this.fold(n);
        if (!f) return;
        if (f === rot) { best = Number(id); bestScore = 100; return; }
        const toks = f.split(" ").filter((t) => t.length > 2);
        let score = 0;
        alvo.forEach((t) => { if (toks.indexOf(t) >= 0) score += 1; });
        if (rot.indexOf(f) >= 0 || f.indexOf(rot) >= 0) score += 3;
        if (score > bestScore) { bestScore = score; best = Number(id); }
      });
    });
    return bestScore >= 2 ? best : 0;
  },

  garantirAno(ano) {
    const k = String(ano);
    if (!this.anos[k]) this.anos[k] = { arquivos: {} };
    const a = this.anos[k];
    if (!a.arquivos) {
      const nome = a.file || ("planilha " + ano);
      a.arquivos = {};
      a.arquivos[nome] = {
        empresa: this.empresaId(nome),
        rotulo: this.nomeEmpresaArquivo(nome),
        entradas: a.entradas || {},
        contas: null
      };
      delete a.file;
      delete a.entradas;
      delete a.saidas;
    }
    return a;
  },

  anoDados(ano) {
    if (!this.anos[String(ano)]) return null;
    return this.garantirAno(ano);
  },

  empresasUsadas() {
    const ids = new Set();
    const faltou = [];
    Object.keys(this.anos || {}).forEach((y) => {
      const a = this.anoDados(y);
      if (!a) return;
      Object.keys(a.arquivos || {}).forEach((nome) => {
        const arq = a.arquivos[nome] || {};
        let id = Number(arq.empresa) || 0;
        if (!id) {
          id = this.empresaId(nome);
          if (id) arq.empresa = id;
        }
        const rotulo = arq.rotulo || this.nomeEmpresaArquivo(nome);
        if (id) ids.add(id);
        else if (faltou.indexOf(rotulo || nome) < 0) faltou.push(rotulo || nome);
      });
    });
    return { ids: Array.from(ids).sort((x, y) => x - y), faltou: faltou };
  },

  nomesEmpresas() {
    const uso = this.empresasUsadas();
    if (!uso.ids.length) return "";
    const cat = this.catalogoEmpresas();
    return uso.ids.map((id) => {
      const nomes = cat[id] || [];
      return nomes[0] || ("Empresa " + id);
    }).join(", ");
  },

  contasSaida() {
    return [
      { id: "obras", nome: "OBRAS", codigos: ["04.03"], filhos: /^04\.03\./, nodes: ["g_04_03"] },
      { id: "repasses", nome: "REPASSES TERRENISTAS", codigos: ["04.01"], filhos: /^04\.01\./, nodes: ["g_04_01"] },
      { id: "pessoal", nome: "PESSOAL", codigos: ["05.04"], filhos: /^05\.04\./, nodes: ["g_05_04"] },
      { id: "administrativas", nome: "ADMINISTRATIVAS", codigos: ["05.03"], filhos: /^05\.03\./, nodes: ["g_05_03"] },
      { id: "marketing", nome: "MARKETING", codigos: ["05.02"], filhos: /^05\.02\./, nodes: ["g_05_02"] },
      { id: "cancelamentos", nome: "CANCELAMENTOS DE VENDAS", codigos: ["01.04"], filhos: /^01\.04\./, nodes: ["g_01_04"] },
      { id: "aquisicao", nome: "AQUISIÇÃO DE NOVAS ÁREAS", codigos: ["04.05"], filhos: /^04\.05\./, nodes: ["g_04_05"] },
      { id: "projetos", nome: "PROJETOS E APROVAÇÕES", codigos: ["04.02"], filhos: /^04\.02\./, nodes: ["g_04_02"] },
      { id: "impostos", nome: "IMPOSTOS", codigos: ["02"], filhos: /^02\./, nodes: ["g_02_01", "g_02_02"] },
      { id: "comerciais", nome: "DESPESAS COMERCIAIS", codigos: ["05.01"], filhos: /^05\.01\./, nodes: ["g_05_01"] },
      { id: "naoop", nome: "DESPESAS NAO OPERACIONAIS", codigos: ["05.06"], filhos: /^05\.06\./, nodes: ["g_05_06"] },
      { id: "estoque", nome: "DESPESAS COM ESTOQUE", codigos: ["05.05"], filhos: /^05\.05\./, nodes: ["g_05_05"] },
      { id: "custoadm", nome: "CUSTO ADM DE EMPREENDIMENTOS", codigos: ["04.04"], filhos: /^04\.04\./, nodes: ["g_04_04"] },
      { id: "financeiras", nome: "DESPESAS FINANCEIRAS", codigos: ["09.02"], filhos: /^09\.02\./, nodes: ["g_09_02"] },
      { id: "donativos", nome: "DONATIVOS E CONTRIBUIÇÕES", codigos: ["05.07"], filhos: /^05\.07\./, nodes: ["g_05_07"] },
      { id: "capex", nome: "CAPEX", codigos: ["07"], filhos: /^07\./, nodes: ["g_07"] },
      { id: "adiantamento", nome: "ADIANTAMENTO A FORNECEDORES", codigos: ["05.08"], filhos: /^05\.08\./, nodes: ["g_05_08"] },
      { id: "manutencao", nome: "DESPESAS COM MANUTENÇÃO DE EMPREENDIMENTO", codigos: ["05.11"], filhos: /^05\.11\./, nodes: ["g_05_11"] },
      { id: "retencoes", nome: "RETENÇÕES", codigos: ["05.09"], filhos: /^05\.09\./, nodes: ["g_05_09"] },
      { id: "outrosmov", nome: "OUTROS MOVIMENTOS", codigos: ["05.10"], filhos: /^05\.10\./, nodes: ["g_05_10"] }
    ];
  },

  casaNo(nodeId, def) {
    const s = String(nodeId || "");
    return (def.nodes || []).some((n) => s === n || s.startsWith(n + "_"));
  },

  grupos(lado) {
    if (lado === "entradas") {
      return [
        { pai: "01", filhos: /^01\.\d+$/ },
        { pai: "09.01", filhos: null }
      ];
    }
    return [
      { pai: "02", filhos: /^02\.\d+$/ },
      { pai: "04", filhos: /^04\.\d+$/ },
      { pai: "05", filhos: /^05\.\d+$/ },
      { pai: "07", filhos: /^07(\.\d+)?$/ },
      { pai: "09.02", filhos: null },
      { pai: "09.05", filhos: null }
    ];
  },

  somarLinhas(linhas, lado) {
    const acc = {};
    this.grupos(lado).forEach((g) => {
      const pai = linhas.filter((l) => l.code === g.pai);
      const fonte = pai.length ? pai : (g.filhos ? linhas.filter((l) => g.filhos.test(l.code)) : []);
      fonte.forEach((l) => {
        (l.months || []).forEach((m) => {
          if (!acc[m.ym]) acc[m.ym] = { o: 0, r: 0 };
          acc[m.ym].o += Number(m.orc) || 0;
          acc[m.ym].r += Number(m.real) || 0;
        });
      });
    });
    return acc;
  },

  lerPlanilha(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    const blocos = [];
    const mesRe = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/(\d{4})$/i;
    const mesNum = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
    for (let i = 0; i < grid.length; i++) {
      const row = grid[i] || [];
      const texto = row.map((c) => String(c == null ? "" : c)).join(" ");
      if (!/centro de custo/i.test(texto)) continue;
      let cc = null;
      row.forEach((c) => {
        const s = String(c == null ? "" : c).trim();
        const m = s.match(/^(\d{4,6})\s*-\s*(.+)$/);
        if (m) cc = { id: m[1], nome: s };
      });
      if (!cc) continue;
      let head = -1;
      for (let j = i + 1; j < Math.min(i + 12, grid.length); j++) {
        const r = grid[j] || [];
        if (r.some((c) => mesRe.test(String(c == null ? "" : c).trim()))) { head = j; break; }
      }
      if (head < 0) continue;
      const labels = grid[head + 1] || [];
      const meses = this.mesesDoCabecalho(grid[head], labels, mesRe, mesNum);
      let tipoCol = -1;
      labels.forEach((c, col) => {
        if (/^tipo$/i.test(String(c == null ? "" : c).trim())) tipoCol = col;
      });
      const linhas = [];
      for (let j = head + 2; j < grid.length; j++) {
        const r = grid[j] || [];
        const code = this.normCode(r[0]);
        if (!code) {
          if (j > head + 3) break;
          continue;
        }
        if (/^(agrupar|diferen|super)/i.test(code)) break;
        if (!/^\d/.test(code)) continue;
        linhas.push({
          code,
          nome: String(r[1] == null ? "" : r[1]).trim(),
          tipo: tipoCol >= 0 ? String(r[tipoCol] == null ? "" : r[tipoCol]).trim().toUpperCase() : "",
          months: meses.map((mes) => ({
            ym: mes.ym,
            orc: Number(r[mes.colOrc]) || 0,
            real: Number(r[mes.colReal]) || 0
          }))
        });
      }
      blocos.push({ id: cc.id, nome: cc.nome, linhas });
    }
    return blocos;
  },

  mesesDoCabecalho(head, labels, mesRe, mesNum) {
    const nomes = [];
    (head || []).forEach((c, col) => {
      const bruto = String(c == null ? "" : c).trim();
      if (/total/i.test(bruto)) return;
      const m = bruto.toLowerCase().match(mesRe);
      if (!m) return;
      const mm = mesNum[m[1].slice(0, 3)];
      nomes.push({ ym: m[2] + "-" + String(mm).padStart(2, "0"), col: col });
    });
    const pares = [];
    const labs = labels || [];
    for (let k = 0; k < labs.length; k++) {
      const s = String(labs[k] == null ? "" : labs[k]).trim();
      if (!/^or[cç]ado$/i.test(s)) continue;
      let realCol = -1;
      for (let j = k + 1; j < Math.min(labs.length, k + 6); j++) {
        const t = String(labs[j] == null ? "" : labs[j]).trim();
        if (/^or[cç]ado$/i.test(t)) break;
        if (/realizado/i.test(t)) { realCol = j; break; }
      }
      if (realCol >= 0) pares.push({ colOrc: k, colReal: realCol });
    }
    if (pares.length && pares.length >= nomes.length && nomes.length) {
      return nomes.map((m, i) => ({ ym: m.ym, colOrc: pares[i].colOrc, colReal: pares[i].colReal }));
    }
    return nomes.map((m) => {
      let realCol = m.col;
      for (let k = m.col; k < m.col + 6 && k < labs.length; k++) {
        if (/realizado/i.test(String(labs[k] == null ? "" : labs[k]))) { realCol = k; break; }
      }
      return { ym: m.ym, colOrc: m.col, colReal: realCol };
    });
  },

  ehAnalitico(linhas) {
    return (linhas || []).some((l) => {
      const seg = String(l.code || "").split(".")[0];
      return seg.length === 1 && /^\d$/.test(seg);
    });
  },

  noPorId(gid) {
    const FC = window.FluxoCaixaApp;
    let groups = [];
    try { groups = ((FC && FC.visao && FC.visao()) || {}).groups || []; } catch (e) { groups = []; }
    return (groups || []).find((g) => g.id === gid) || null;
  },

  noDaLinha(FC, mapa, linha) {
    let node = null;
    if (mapa && FC && typeof this.noDaConta === "function") node = this.noDaConta(FC, mapa, linha.code);
    const plano = (typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null);
    if (!node && plano && typeof plano.lookupDfcByCode === "function") {
      const gid = plano.lookupDfcByCode(linha.code);
      if (gid) node = this.noPorId(gid);
    }
    if (!node && plano && typeof plano.suggestGroup === "function") {
      const gid = plano.suggestGroup({ id: linha.code, name: linha.nome || "" });
      if (gid) node = this.noPorId(gid);
    }
    return node;
  },

  codigoVisao(node) {
    if (!node) return "";
    const m = String(node.name || "").match(/^(\d{2}(?:\.\d{2})*)\b/);
    if (m) return m[1];
    const id = String(node.id || "");
    const p = id.match(/^g_(\d{2})(?:_(\d{2}))?(?:_(\d{2}))?/);
    if (!p) return "";
    return [p[1], p[2], p[3]].filter(Boolean).join(".");
  },

  codigoPlano(code) {
    const bruto = String(code || "").trim().replace(/\s/g, "");
    const FC = window.FluxoCaixaApp;
    if (!bruto || !FC || typeof FC.formatAccountCode !== "function") return bruto;
    try {
      return FC.formatAccountCode(bruto) || bruto;
    } catch (e) {
      return bruto;
    }
  },

  ehContaFinanceira(code) {
    return /^\d\.\d{2}(\.\d{2})*$/.test(this.codigoPlano(code));
  },

  folhasAnaliticas(linhas) {
    const comTipo = (linhas || []).some((l) => l.tipo);
    if (comTipo) return (linhas || []).filter((l) => l.tipo === "R");
    return (linhas || []).filter((l) => !(linhas || []).some((o) => o.code !== l.code && String(o.code).indexOf(l.code + ".") === 0));
  },

  async mapaPronto() {
    const FC = window.FluxoCaixaApp;
    if (!FC || typeof FC.visao !== "function") return null;
    let mapa = null;
    try { mapa = this.mapaDfc(FC); } catch (e) { mapa = null; }
    if (mapa && Object.keys(mapa.accToNode || {}).length) return mapa;
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    const plano = (typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null);
    if (!fx || !db || !fx.getDoc || !plano) return mapa;
    try {
      const snap = await fx.getDoc(fx.doc(db, "config", "global"));
      const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (!exists) return mapa;
      const raw = (snap.data() || {}).crm_plano_visoes_v2;
      if (!raw) return mapa;
      const visoes = JSON.parse(raw);
      if (!Array.isArray(visoes) || !visoes.length) return mapa;
      const prev = plano.visoes;
      plano.visoes = visoes;
      let novo = null;
      try { novo = this.mapaDfc(FC); } catch (e) { novo = null; }
      if (!novo || !Object.keys(novo.accToNode || {}).length) plano.visoes = prev;
      return novo || mapa;
    } catch (e) {
      return mapa;
    }
  },

  paraVisao(linhas) {
    if (!this.ehAnalitico(linhas)) return { linhas: linhas || [], fora: [] };
    const folhas = this.folhasAnaliticas(linhas);
    const FC = window.FluxoCaixaApp;
    let mapa = this._mapa || null;
    if (!mapa) {
      try {
        if (FC && typeof FC.visao === "function") mapa = this.mapaDfc(FC);
      } catch (e) {
        mapa = null;
      }
    }
    const plano = (typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null);
    const temMapa = !!(mapa && Object.keys(mapa.accToNode || {}).length);
    const temPrefixo = !!(plano && typeof plano.suggestGroup === "function");
    if (!temMapa && !temPrefixo) {
      throw new Error("A visão DFC ainda não tem as contas financeiras. Abra o Fluxo de Caixa uma vez para carregar o plano e suba o arquivo de novo.");
    }
    const fora = [];
    const porCodigo = {};
    const planos = [];
    folhas.forEach((l) => {
      const node = this.noDaLinha(FC, mapa, l);
      const cod = this.codigoVisao(node);
      const temValor = (l.months || []).some((m) => Math.abs(Number(m.orc) || 0) > 0.5 || Math.abs(Number(m.real) || 0) > 0.5);
      if (!cod) {
        if (temValor && fora.indexOf(l.code) < 0) fora.push(l.code + (l.nome ? " " + l.nome : ""));
        return;
      }
      if (!temValor) return;
      if (!porCodigo[cod]) porCodigo[cod] = { code: cod, nome: node.name || cod, months: {} };
      const sinal = (valor) => {
        const n = Number(valor) || 0;
        if (!n || !FC || typeof FC.signedAmount !== "function") return n;
        return FC.signedAmount(node, l.code, l.nome || "", n, "", "", null);
      };
      const mesesPlano = [];
      (l.months || []).forEach((m) => {
        const cel = porCodigo[cod].months[m.ym] || { ym: m.ym, orc: 0, real: 0 };
        const orc = sinal(m.orc);
        const real = sinal(m.real);
        cel.orc += orc;
        cel.real += real;
        porCodigo[cod].months[m.ym] = cel;
        if (Math.abs(orc) > 0.005 || Math.abs(real) > 0.005) mesesPlano.push({ ym: m.ym, orc: orc, real: real });
      });
      if (mesesPlano.length && this.ehContaFinanceira(l.code)) {
        planos.push({ code: this.codigoPlano(l.code), nome: l.nome || "", nodeId: node.id, months: mesesPlano });
      }
    });
    const out = Object.keys(porCodigo).map((c) => ({
      code: c,
      nome: porCodigo[c].nome,
      months: Object.keys(porCodigo[c].months).map((ym) => porCodigo[c].months[ym])
    }));
    return { linhas: out, fora: fora, planos: planos };
  },

  aplicarBlocos(nomeArquivo, blocos) {
    const fora = [];
    const prontos = (blocos || []).map((b) => {
      const conv = this.paraVisao(b.linhas);
      (conv.fora || []).forEach((item) => { if (fora.indexOf(item) < 0) fora.push(item); });
      return { id: b.id, nome: b.nome, linhas: conv.linhas, planos: conv.planos || [] };
    }).filter((b) => b.linhas.length);
    if (!prontos.length) throw new Error("Nenhuma conta de " + nomeArquivo + " entrou na visão DFC.");
    const porAno = {};
    const slot = (ano) => {
      if (!porAno[ano]) porAno[ano] = { entradas: {}, contas: {}, contasPorCc: {}, planosPorCc: {} };
      return porAno[ano];
    };
    prontos.forEach((b) => {
      const mapa = this.somarLinhas(b.linhas, "entradas");
      Object.keys(mapa).forEach((ym) => {
        const ano = ym.slice(0, 4);
        const mm = String(Number(ym.slice(5, 7)));
        const bag = slot(ano).entradas;
        if (!bag[b.id]) bag[b.id] = { nome: b.nome, meses: {} };
        const cel = bag[b.id].meses[mm] || { o: 0, r: 0 };
        cel.o += mapa[ym].o;
        cel.r += mapa[ym].r;
        bag[b.id].meses[mm] = cel;
      });
      b.linhas.forEach((l) => {
        (l.months || []).forEach((m) => {
          const ano = m.ym.slice(0, 4);
          const mm = String(Number(m.ym.slice(5, 7)));
          const contas = slot(ano).contas;
          if (!contas[l.code]) contas[l.code] = { nome: l.nome || l.code, meses: {} };
          const cel = contas[l.code].meses[mm] || { o: 0, r: 0 };
          cel.o += Number(m.orc) || 0;
          cel.r += Number(m.real) || 0;
          contas[l.code].meses[mm] = cel;
          const dono = slot(ano).contasPorCc;
          if (!dono[b.id]) dono[b.id] = { nome: b.nome, contas: {} };
          if (!dono[b.id].contas[l.code]) dono[b.id].contas[l.code] = { nome: l.nome || l.code, meses: {} };
          const celCc = dono[b.id].contas[l.code].meses[mm] || { o: 0, r: 0 };
          celCc.o += Number(m.orc) || 0;
          celCc.r += Number(m.real) || 0;
          dono[b.id].contas[l.code].meses[mm] = celCc;
        });
      });
      (b.planos || []).forEach((p) => {
        (p.months || []).forEach((m) => {
          const ano = m.ym.slice(0, 4);
          const mm = String(Number(m.ym.slice(5, 7)));
          const dono = slot(ano).planosPorCc;
          if (!dono[b.id]) dono[b.id] = { nome: b.nome, contas: {} };
          if (!dono[b.id].contas[p.code]) dono[b.id].contas[p.code] = { nome: p.nome || p.code, node: p.nodeId || "", meses: {} };
          const cel = dono[b.id].contas[p.code].meses[mm] || { o: 0, r: 0 };
          cel.o += Number(m.orc) || 0;
          cel.r += Number(m.real) || 0;
          dono[b.id].contas[p.code].meses[mm] = cel;
        });
      });
    });
    const empresa = this.empresaId(nomeArquivo);
    const rotulo = this.nomeEmpresaArquivo(nomeArquivo);
    Object.keys(porAno).forEach((ano) => {
      const destino = this.slotDoAno(ano);
      const atual = this.pegarSlot(destino);
      const docId = this.docCaixa(destino.id, empresa, nomeArquivo);
      Object.keys(atual.arquivos || {}).forEach((nome) => {
        const outro = atual.arquivos[nome];
        if (nome !== nomeArquivo && empresa && Number(outro && outro.empresa) === empresa) {
          if (outro && outro._doc && outro._doc !== docId) this.apagarNuvem(outro._doc);
          delete atual.arquivos[nome];
        }
      });
      atual.arquivos[nomeArquivo] = {
        empresa: empresa,
        rotulo: rotulo,
        entradas: porAno[ano].entradas,
        contas: porAno[ano].contas,
        contasPorCc: porAno[ano].contasPorCc,
        planosPorCc: porAno[ano].planosPorCc,
        _pendente: true,
        _slot: destino.id,
        _doc: docId
      };
    });
    this._dfcKey = "";
    this._dfcPedido = "";
    this._fora = fora;
    this.montarVista();
    this.gravarLocal();
  },

  async subir(input) {
    const files = input && input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    if (typeof XLSX === "undefined") {
      this.error = "A biblioteca de Excel não carregou. Atualize a página.";
      this.render();
      return;
    }
    this.lendo = true;
    this.error = "";
    this.aviso = "";
    this.render();
    try {
      this._mapa = await this.mapaPronto();
      for (let i = 0; i < files.length; i++) {
        const buf = await files[i].arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const blocos = this.lerPlanilha(wb);
        if (!blocos.length) throw new Error("Não reconheci centros de custo em " + files[i].name + ". Use o comparativo orçado × realizado por centro de custo.");
        this.aplicarBlocos(files[i].name, blocos);
      }
      const fora = this._fora || [];
      if (fora.length) {
        const amostra = fora.slice(0, 6).join(", ");
        this.aviso = fora.length + " contas com valor ficaram de fora da visão DFC: " + amostra + (fora.length > 6 ? "…" : ".");
      } else {
        this.aviso = "";
      }
      await this.enviarPendentes();
    } catch (e) {
      this.error = e.message || String(e);
    }
    this._mapa = null;
    this.lendo = false;
    if (input) input.value = "";
    this.render();
  },

  removerAno(ano) {
    const y = Number(ano);
    const base = this.anoBase();
    if (y === base) {
      const chave = this.chaveMes(base);
      const bag = this.acervo.meses[chave];
      Object.keys((bag && bag.arquivos) || {}).forEach((nome) => {
        const arq = bag.arquivos[nome];
        this.apagarNuvem(arq && arq._doc);
      });
      delete this.acervo.meses[chave];
    } else if (this.acervo.anterior[String(y)]) {
      const bag = this.acervo.anterior[String(y)];
      Object.keys(bag.arquivos || {}).forEach((nome) => this.apagarNuvem(bag.arquivos[nome] && bag.arquivos[nome]._doc));
      delete this.acervo.anterior[String(y)];
    }
    this._dfcKey = "";
    this._dfcPedido = "";
    this.montarVista();
    this.gravarLocal();
    this.render();
  },

  removerArquivo(ano, chave) {
    let nome = chave;
    try { nome = decodeURIComponent(chave); } catch (e) {}
    const y = Number(ano);
    const base = this.anoBase();
    const bolsa = y === base ? (this.acervo.meses[this.chaveMes(base)] || null) : (this.acervo.anterior[String(y)] || null);
    if (!bolsa || !bolsa.arquivos || !bolsa.arquivos[nome]) {
      this.removerAno(ano);
      return;
    }
    const docId = bolsa.arquivos[nome]._doc;
    delete bolsa.arquivos[nome];
    if (!Object.keys(bolsa.arquivos).length) {
      if (y === base) delete this.acervo.meses[this.chaveMes(base)];
      else delete this.acervo.anterior[String(y)];
    }
    this.apagarNuvem(docId);
    this._dfcKey = "";
    this._dfcPedido = "";
    this.montarVista();
    this.gravarLocal();
    this.render();
  },

  docCaixa(slot, empresa, nome) {
    const emp = Number(empresa) || 0;
    const base = emp ? String(emp) : String(nome || "arq").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 48);
    return String(slot || "slot") + "_" + base;
  },

  enxugarMeses(meses) {
    const out = {};
    Object.keys(meses || {}).forEach((mm) => {
      const cel = meses[mm] || {};
      if (Math.abs(Number(cel.o) || 0) < 0.005 && Math.abs(Number(cel.r) || 0) < 0.005) return;
      out[mm] = { o: Number(cel.o) || 0, r: Number(cel.r) || 0 };
    });
    return out;
  },

  enxugarArq(arq) {
    const entradas = {};
    Object.keys(arq.entradas || {}).forEach((id) => {
      const meses = this.enxugarMeses(arq.entradas[id].meses);
      if (Object.keys(meses).length) entradas[id] = { nome: arq.entradas[id].nome || "", meses: meses };
    });
    const contas = {};
    Object.keys(arq.contas || {}).forEach((code) => {
      const meses = this.enxugarMeses(arq.contas[code].meses);
      if (Object.keys(meses).length) contas[code] = { nome: arq.contas[code].nome || code, meses: meses };
    });
    const contasPorCc = {};
    Object.keys(arq.contasPorCc || {}).forEach((id) => {
      const dono = arq.contasPorCc[id] || {};
      const bag = {};
      Object.keys(dono.contas || {}).forEach((code) => {
        const meses = this.enxugarMeses(dono.contas[code].meses);
        if (Object.keys(meses).length) bag[code] = { nome: dono.contas[code].nome || code, meses: meses };
      });
      if (Object.keys(bag).length) contasPorCc[id] = { nome: dono.nome || "", contas: bag };
    });
    const planosPorCc = {};
    Object.keys(arq.planosPorCc || {}).forEach((id) => {
      const dono = arq.planosPorCc[id] || {};
      const bag = {};
      Object.keys(dono.contas || {}).forEach((code) => {
        const meses = this.enxugarMeses(dono.contas[code].meses);
        if (Object.keys(meses).length) bag[code] = { nome: dono.contas[code].nome || code, node: dono.contas[code].node || "", meses: meses };
      });
      if (Object.keys(bag).length) planosPorCc[id] = { nome: dono.nome || "", contas: bag };
    });
    return { entradas: entradas, contas: contas, contasPorCc: contasPorCc, planosPorCc: planosPorCc };
  },

  empacotarPlanos(planosPorCc) {
    const out = {};
    Object.keys(planosPorCc || {}).forEach((id) => {
      const dono = planosPorCc[id] || {};
      const contas = {};
      Object.keys(dono.contas || {}).forEach((code) => {
        const info = dono.contas[code] || {};
        const meses = {};
        Object.keys(info.meses || {}).forEach((mm) => {
          const o = Math.round((Number(info.meses[mm].o) || 0) * 100) / 100;
          if (Math.abs(o) >= 0.005) meses[mm] = o;
        });
        if (Object.keys(meses).length) contas[code] = { nome: info.nome || "", node: info.node || "", meses: meses };
      });
      if (Object.keys(contas).length) out[id] = { nome: dono.nome || "", contas: contas };
    });
    try { return JSON.stringify(out); } catch (e) { return ""; }
  },

  abrirPlanos(texto) {
    let cru = null;
    try { cru = JSON.parse(texto || ""); } catch (e) { cru = null; }
    const out = {};
    Object.keys(cru || {}).forEach((id) => {
      const dono = cru[id] || {};
      const contas = {};
      Object.keys(dono.contas || {}).forEach((code) => {
        const info = dono.contas[code] || {};
        const meses = {};
        Object.keys(info.meses || {}).forEach((mm) => {
          const o = Number(info.meses[mm]) || 0;
          if (Math.abs(o) >= 0.005) meses[mm] = { o: o, r: 0 };
        });
        if (Object.keys(meses).length) contas[code] = { nome: info.nome || code, node: info.node || "", meses: meses };
      });
      if (Object.keys(contas).length) out[id] = { nome: dono.nome || "", contas: contas };
    });
    return out;
  },

  async salvarArquivoNuvem(slot, nome, arq) {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || !arq) return false;
    const id = arq._doc || this.docCaixa(slot, arq.empresa, nome);
    const limpo = this.enxugarArq(arq);
    await fx.setDoc(fx.doc(db, "resultado_caixa", id), {
      slot: slot,
      nome: nome,
      empresa: Number(arq.empresa) || 0,
      rotulo: arq.rotulo || "",
      entradas: limpo.entradas,
      contas: limpo.contas,
      contasPorCc: limpo.contasPorCc,
      planosJson: this.empacotarPlanos(limpo.planosPorCc),
      em: new Date().toISOString()
    });
    arq._doc = id;
    arq._pendente = false;
    this._nuvemOk = true;
    return true;
  },

  async enviarPendentes() {
    const tarefas = [];
    const visitar = (slot, bag) => {
      Object.keys((bag && bag.arquivos) || {}).forEach((nome) => {
        const arq = bag.arquivos[nome];
        if (arq && arq._pendente) tarefas.push(this.salvarArquivoNuvem(arq._slot || slot, nome, arq));
      });
    };
    Object.keys(this.acervo.anterior || {}).forEach((ano) => visitar("ant-" + ano, this.acervo.anterior[ano]));
    Object.keys(this.acervo.meses || {}).forEach((chave) => visitar(chave, this.acervo.meses[chave]));
    if (!tarefas.length) return;
    this._nuvemToken = (this._nuvemToken || 0) + 1;
    try {
      await Promise.all(tarefas);
      this.gravarLocal();
    } catch (e) {
      this.error = "O arquivo entrou na tela, mas não ficou salvo na nuvem: " + ((e && e.message) || e);
    }
  },

  async enviarAcervo() {
    const tarefas = [];
    const visitar = (slot, bag) => {
      Object.keys((bag && bag.arquivos) || {}).forEach((nome) => {
        const arq = bag.arquivos[nome];
        if (arq) tarefas.push(this.salvarArquivoNuvem(slot, nome, arq));
      });
    };
    Object.keys(this.acervo.anterior || {}).forEach((ano) => visitar("ant-" + ano, this.acervo.anterior[ano]));
    Object.keys(this.acervo.meses || {}).forEach((chave) => visitar(chave, this.acervo.meses[chave]));
    if (!tarefas.length) return;
    this._nuvemToken = (this._nuvemToken || 0) + 1;
    await Promise.all(tarefas);
    this.gravarLocal();
  },

  apagarNuvem(docId) {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!docId || !fx || !db) return;
    this._nuvemToken = (this._nuvemToken || 0) + 1;
    fx.deleteDoc(fx.doc(db, "resultado_caixa", docId)).catch(() => {});
  },

  aplicarDoc(acervo, id, x) {
    const nome = x.nome || id;
    const arq = {
      empresa: Number(x.empresa) || 0,
      rotulo: x.rotulo || "",
      entradas: x.entradas || {},
      contas: x.contas || {},
      contasPorCc: x.contasPorCc || {},
      planosPorCc: (x.planosPorCc && Object.keys(x.planosPorCc).length) ? x.planosPorCc : this.abrirPlanos(x.planosJson),
      _doc: id,
      _slot: x.slot || ""
    };
    const slot = String(x.slot || "");
    if (slot.indexOf("ant-") === 0) {
      const ano = slot.slice(4);
      if (!acervo.anterior[ano]) acervo.anterior[ano] = { arquivos: {} };
      acervo.anterior[ano].arquivos[nome] = arq;
      return;
    }
    if (/^\d{4}-\d{2}$/.test(slot)) {
      if (!acervo.meses[slot]) acervo.meses[slot] = { arquivos: {} };
      acervo.meses[slot].arquivos[nome] = arq;
    }
  },

  async carregarNuvem() {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db) return;
    const token = this._nuvemToken || 0;
    const vazio = !this.temAcervo();
    if (vazio) {
      this.lendo = true;
      this.render();
    }
    try {
      const snap = await fx.getDocs(fx.collection(db, "resultado_caixa"));
      if ((this._nuvemToken || 0) !== token) return;
      if (snap.empty) {
        if (this.temAcervo()) await this.enviarAcervo();
        this.lendo = false;
        if ((this._nuvemToken || 0) === token) this.render();
        return;
      }
      const acervo = { anterior: {}, meses: {} };
      snap.forEach((docSnap) => this.aplicarDoc(acervo, docSnap.id, docSnap.data() || {}));
      if ((this._nuvemToken || 0) !== token) return;
      this.acervo = acervo;
      this._nuvemOk = true;
      this.montarVista();
      this.gravarLocal();
      await this.carregarForecasts();
    } catch (e) {
      if (!this.temAcervo()) this.error = "Não consegui ler os arquivos salvos: " + ((e && e.message) || e);
    }
    this.lendo = false;
    if ((this._nuvemToken || 0) === token) this.render();
  },

  bagLado(ano, lado) {
    const a = this.anoDados(ano);
    const out = {};
    if (!a) return out;
    Object.keys(a.arquivos || {}).forEach((nome) => {
      const bag = (a.arquivos[nome] && a.arquivos[nome][lado]) || {};
      Object.keys(bag).forEach((id) => {
        if (!out[id]) out[id] = { nome: bag[id].nome, meses: {} };
        const meses = bag[id].meses || {};
        Object.keys(meses).forEach((mm) => {
          const cel = out[id].meses[mm] || { o: 0, r: 0 };
          cel.o += Number(meses[mm].o) || 0;
          cel.r += Number(meses[mm].r) || 0;
          out[id].meses[mm] = cel;
        });
      });
    });
    return out;
  },

  valor(lado, ano, ccId, mes, campo, ate) {
    const bag = this.bagLado(ano, lado)[ccId];
    if (!bag) return 0;
    let s = 0;
    const fim = ate ? Number(mes) : Number(mes);
    const ini = ate ? 1 : fim;
    for (let m = ini; m <= fim; m++) {
      const cel = bag.meses[String(m)];
      if (cel) s += Number(cel[campo]) || 0;
    }
    return s;
  },

  noAceito(lado) {
    return (id) => {
      const s = String(id || "");
      if (lado === "entradas") return s === "g_01" || s.startsWith("g_01_") || s === "g_09_01" || s.startsWith("g_09_01_");
      return this.contasSaida().some((def) => this.casaNo(s, def));
    };
  },

  mapaDfc(FC) {
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

  noDaConta(FC, mapa, id) {
    const achar = (code) => {
      if (!code) return null;
      const nk = FC.normAccountKey(code);
      const dotted = FC.formatAccountCode(code);
      const nid = mapa.accToNode[code] || (nk && mapa.accToNode[nk]) || (dotted && mapa.accToNode[dotted]) || "";
      return nid && mapa.nodes[nid] ? mapa.nodes[nid] : null;
    };
    let sid = String(id || "").trim().replace(/\s/g, "");
    const original = sid;
    const visto = {};
    while (sid && !visto[sid]) {
      visto[sid] = true;
      const node = achar(sid);
      if (node) return node;
      const partes = sid.split(".").filter(Boolean);
      if (partes.length <= 2) break;
      sid = partes.slice(0, -1).join(".");
    }
    const plano = (typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null);
    if (original && plano && typeof plano.lookupDfcByCode === "function") {
      const gid = plano.lookupDfcByCode(original);
      if (gid) {
        const node = this.noPorId(gid);
        if (node) return node;
      }
    }
    return null;
  },

  nomeCc(id, nomeApi) {
    const direto = String(nomeApi || "").trim();
    if (direto) return direto;
    try {
      const lista = JSON.parse(localStorage.getItem("crm_cost_centers_data") || "[]");
      const hit = Array.isArray(lista) && lista.find((c) => c && String(c.id) === String(id));
      if (hit && hit.name) return String(id) + " - " + hit.name;
    } catch (e) {}
    return String(id || "");
  },

  async lerDfc(ano, mesFim, lado) {
    const FC = window.FluxoCaixaApp;
    const uso = this.empresasUsadas();
    const ids = uso.ids;
    if (!ids.length) return [];
    const start = ano + "-01-01";
    const last = new Date(ano, mesFim, 0).getDate();
    const end = ano + "-" + String(mesFim).padStart(2, "0") + "-" + String(last).padStart(2, "0");
    const chunks = await Promise.all(ids.map(async (id) => {
      try {
        const data = await SiengeApiService.getBankMovements(start, end, { selectionType: "M", companyId: id });
        return (data || []).map((m) => Object.assign({}, m, { companyId: m.companyId || id }));
      } catch (e) {
        return [];
      }
    }));
    let movements = chunks.reduce((acc, list) => acc.concat(list), []);
    if (typeof window.siengeDedupeBankMovements === "function") movements = siengeDedupeBankMovements(movements || []);
    const aceitos = {};
    ids.forEach((id) => { aceitos[id] = 1; });
    movements = (movements || []).filter((m) => {
      const d = FC.cashDate(m);
      return d && d >= start && d <= end && aceitos[Number(m.companyId)];
    });
    const mapa = this.mapaDfc(FC);
    const aceita = this.noAceito(lado);
    const out = [];
    movements.forEach((mov) => {
      const mm = Number(String(FC.movMonth(mov) || "").slice(5, 7));
      if (!mm || mm > mesFim) return;
      FC.allocate(mov, 1).forEach((a) => {
        const node = this.noDaConta(FC, mapa, a.categoryId);
        if (!node || !aceita(node.id)) return;
        const valor = FC.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov);
        if (!valor) return;
        const ccId = String(a.costCenterId || "").replace(/\D/g, "");
        const nome = this.nomeCc(ccId, a.costCenterName);
        out.push({ ccId, nome, mes: mm, valor, node: node.id, empresa: Number(mov.companyId) || 0 });
      });
    });
    return out;
  },

  garantirDfc(lado) {
    const ano = this.anoAtual();
    if (!ano || !window.FluxoCaixaApp || !window.SiengeApiService) return;
    const uso = this.empresasUsadas();
    const key = (ano - 1) + "|" + (Number(this.mes) || 1) + "|" + lado + "|" + uso.ids.join(",");
    if (this._dfcKey === key || this._dfcPedido === key) return;
    this._dfcPedido = key;
    this.pedirDfc(lado, key);
  },

  async pedirDfc(lado, key) {
    const token = (this._dfcToken || 0) + 1;
    this._dfcToken = token;
    this.dfcLendo = true;
    this.dfcErro = "";
    this.iniciarCarga(true);
    this.render();
    try {
      const ant = this.anoAtual() - 1;
      const linhas = await this.lerDfc(ant, Number(this.mes) || 1, lado);
      if (this._dfcToken !== token) return;
      this.dfcLinhas = linhas;
      this._dfcKey = key;
    } catch (e) {
      if (this._dfcToken !== token) return;
      this.dfcLinhas = [];
      this.dfcErro = "Não consegui ler o ano anterior no DFC: " + ((e && e.message) || e);
      this._dfcKey = key;
    }
    this.dfcLendo = false;
    this.pararCarga();
    const bar = document.getElementById("rcx-load-bar");
    const txt = document.getElementById("rcx-load-text");
    if (bar) bar.style.width = "100%";
    if (txt) txt.textContent = "Consolidando empresas";
    if (this._dfcToken === token) {
      setTimeout(() => { if (this._dfcToken === token) this.render(); }, 280);
    }
  },

  aplicarDfc(rows, mes) {
    const porId = {};
    const porNome = {};
    rows.forEach((r) => {
      porNome[this.fold(r.nome)] = r;
      (r.ids || []).forEach((id) => {
        const limpo = String(id).replace(/\D/g, "");
        porId[limpo] = r;
        porId[this.grupoCc(limpo)] = r;
      });
    });
    const extra = {};
    (this.dfcLinhas || []).forEach((l) => {
      const id = String(l.ccId || "");
      let row = porId[id] || porId[this.grupoCc(id)] || porNome[this.fold(l.nome)];
      if (!row) {
        const bruto = this.rotulo(id, l.nome || id, false);
        const chave = this.fold(bruto.nome) + "|" + this.fold(bruto.cidade);
        row = extra[chave];
        if (!row) {
          row = extra[chave] = {
            key: "dfc-" + chave,
            nome: bruto.nome,
            cidade: bruto.cidade,
            ids: id ? [id] : [],
            mensal: { ant: 0, orc: 0, real: 0 },
            acum: { ant: 0, orc: 0, real: 0 }
          };
          porNome[this.fold(bruto.nome)] = row;
        }
      }
      const fator = l.empresa ? this.pctEmpresaId(l.empresa) : this.pctMl(id);
      if (l.mes === mes) row.mensal.ant += l.valor * fator;
      if (l.mes >= 1 && l.mes <= mes) row.acum.ant += l.valor * fator;
    });
    return rows.concat(Object.values(extra)).filter((r) => {
      const z = (b) => Math.abs(b.ant) + Math.abs(b.orc) + Math.abs(b.real);
      return z(r.mensal) + z(r.acum) > 0.5;
    });
  },

  linhasTabela(lado) {
    const ano = this.anoAtual();
    const ant = ano - 1;
    const mes = Number(this.mes) || 1;
    const fontes = [];
    [ano, ant].forEach((y) => {
      const bag = this.bagLado(y, lado);
      Object.keys(bag).forEach((id) => fontes.push({ id, nome: bag[id].nome || id }));
    });
    const grupos = {};
    fontes.forEach((f) => {
      const key = this.grupoCc(f.id);
      if (!grupos[key]) grupos[key] = { key, nome: "", solto: !!(this.SOLTOS && this.SOLTOS[key]), ids: [] };
      const g = grupos[key];
      g.ids.push(f.id);
      if (f.id === key || !g.nome) g.nome = f.nome;
    });
    const base = Object.keys(grupos).map((key) => {
      const g = grupos[key];
      const uniq = [...new Set(g.ids)];
      const rot = this.rotulo(key, g.nome, g.solto);
      const soma = (y, campo, ate) => uniq.reduce((s, id) => s + this.valorAgrupado(lado, y, id, mes, campo, ate), 0);
      const rec = (ate) => ({ ant: soma(ant, "r", ate), orc: soma(ano, "o", ate), real: soma(ano, "r", ate) });
      return { key, nome: rot.nome, cidade: rot.cidade, ids: uniq, mensal: rec(false), acum: rec(true) };
    });
    const distintos = this.distinguirCidades(base);
    const fundidos = {};
    distintos.forEach((r) => {
      const nome = r.nome;
      const g = fundidos[this.fold(nome)];
      if (!g) { fundidos[this.fold(nome)] = r; return; }
      g.ids = g.ids.concat(r.ids);
      ["mensal", "acum"].forEach((b) => ["ant", "orc", "real"].forEach((k) => { g[b][k] += r[b][k]; }));
    });
    return { ano, ant, rows: Object.values(fundidos) };
  },

  destacar(rows) {
    const variacao = (r) => r.acum.real - r.acum.orc;
    const pos = rows.filter((r) => variacao(r) > 0.5).sort((a, b) => variacao(b) - variacao(a)).slice(0, 4);
    const neg = rows.filter((r) => variacao(r) < -0.5).sort((a, b) => variacao(a) - variacao(b)).slice(0, 4)
      .sort((a, b) => variacao(b) - variacao(a));
    const escolhidos = new Set(pos.concat(neg));
    const outros = rows.filter((r) => !escolhidos.has(r)).sort((a, b) => Math.abs(variacao(b)) - Math.abs(variacao(a)) || a.nome.localeCompare(b.nome, "pt"));
    return { pos, neg, outros };
  },

  fmt(n) {
    let v = Number(n) || 0;
    if (this.escala === "milhoes") v = v / 1000000;
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  setEscala(id) {
    this.escala = id === "milhoes" ? "milhoes" : "real";
    this.render();
  },

  setMes(v) {
    this.mes = Number(v) || 1;
    this.aplicarForecastVista();
    this.montarVista();
    this._dfcKey = "";
    this._dfcPedido = "";
    this.render();
    if (this.aba === "caixa") this.carregarMl();
  },

  toggleOutros() {
    this.outrosAberto = !this.outrosAberto;
    this.render();
  },

  toggleAgrupar() {
    this.agrupar = !this.agrupar;
    this.render();
  },

  setAgrupar(v) {
    this.agrupar = !!v;
    this.render();
  },

  toggleArqs() {
    this.arqsAberto = !this.arqsAberto;
    this.render();
  },

  pct(real, orc) {
    if (Math.abs(orc) < 0.5) return Math.abs(real) < 0.5 ? 0 : (real > 0 ? 100 : -100);
    return ((real - orc) / Math.abs(orc)) * 100;
  },

  celVar(real, orc, saida) {
    const v = real - orc;
    const ruim = saida ? v > 0.5 : v < -0.5;
    const bom = saida ? v < -0.5 : v > 0.5;
    const cls = ruim ? "is-neg" : (bom ? "is-pos" : "");
    const p = this.pct(real, orc);
    const pTxt = p == null ? "—" : (p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%");
    return `<td class="rcx-num ${cls}">${this.fmt(v)}</td><td class="rcx-num ${cls}">${pTxt}</td>`;
  },

  blocoNums(b, saida) {
    const ant = this.dfcLendo ? "…" : this.fmt(b.ant);
    return `<td class="rcx-num rcx-sep rcx-ant">${ant}</td><td class="rcx-num">${this.fmt(b.orc)}</td><td class="rcx-num rcx-real">${this.fmt(b.real)}</td>${this.celVar(b.real, b.orc, saida)}`;
  },

  somaBloco(lista, qual) {
    const t = { ant: 0, orc: 0, real: 0 };
    lista.forEach((r) => ["ant", "orc", "real"].forEach((k) => { t[k] += r[qual][k]; }));
    return t;
  },

  chipsForecast() {
    const mapa = new Map();
    Object.keys(this.forecasts || {}).forEach((ym) => {
      const por = (this.forecasts[ym] && this.forecasts[ym].porArquivo) || {};
      Object.keys(por).forEach((nome) => {
        if (!mapa.has(nome)) {
          const arq = por[nome] || {};
          mapa.set(nome, { rotulo: arq.rotulo || this.nomeEmpresaArquivo(nome) || nome, meses: [] });
        }
        mapa.get(nome).meses.push(ym);
      });
    });
    if (!mapa.size) return `<span class="rcx-muted">Nenhum forecast.</span>`;
    return Array.from(mapa.entries()).sort((a, b) => String(a[1].rotulo).localeCompare(String(b[1].rotulo), "pt")).map(([nome, info]) => {
      const meses = info.meses.slice().sort();
      const faixa = meses.map((ym) => (this.MESES[Number(ym.slice(5, 7)) - 1] || ym) + "/" + ym.slice(0, 4));
      const periodo = faixa.length > 1 ? (faixa[0] + " a " + faixa[faixa.length - 1]) : (faixa[0] || "");
      const chave = encodeURIComponent(nome);
      return `<span class="rcx-arq" title="${caixaEsc(nome)}">${caixaEsc(info.rotulo)}${periodo ? " · " + caixaEsc(periodo) : ""} <button type="button" onclick="ResultadoCaixaApp.removerForecastArquivo('${chave}')">tirar</button></span>`;
    }).join("");
  },

  chipsDoAno(y) {
    const a = this.anoDados(y);
    const arquivos = (a && a.arquivos) || {};
    return Object.keys(arquivos).map((nome) => {
      const rotulo = arquivos[nome].rotulo || this.nomeEmpresaArquivo(nome) || nome;
      const chave = encodeURIComponent(nome);
      return `<span class="rcx-arq" title="${caixaEsc(nome)}">${caixaEsc(rotulo)} <button type="button" onclick="ResultadoCaixaApp.removerArquivo('${y}','${chave}')">tirar</button></span>`;
    }).join("");
  },

  faltaCentroNasSaidas() {
    if (!this.agrupar) return false;
    const anos = [this.anoAtual(), this.anoAtual() - 1];
    return anos.some((y) => {
      const a = this.anoDados(y);
      if (!a) return false;
      return Object.keys(a.arquivos || {}).some((n) => {
        const arq = a.arquivos[n];
        return arq && arq.contas && !(arq.contasPorCc && Object.keys(arq.contasPorCc).length);
      });
    });
  },

  faixaHtml(lado) {
    const anos = Object.keys(this.anos || {}).sort();
    const nomesMes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const mesOpts = nomesMes.map((n, i) => `<option value="${i + 1}" ${Number(this.mes) === i + 1 ? "selected" : ""}>${n}</option>`).join("");
    const realOn = this.escala !== "milhoes";
    const atual = this.anoAtual();
    const antN = atual > 1900 ? atual - 1 : 0;
    const chipsAtual = atual ? this.chipsDoAno(atual) : "";
    const chipsAnt = antN ? this.chipsDoAno(antN) : "";
    const nomesFc = {};
    Object.keys(this.forecasts || {}).forEach((ym) => {
      Object.keys((this.forecasts[ym] && this.forecasts[ym].porArquivo) || {}).forEach((nome) => { nomesFc[nome] = 1; });
    });
    const qtdArq = [atual, antN].reduce((s, y) => {
      const a = y ? this.anoDados(y) : null;
      return s + (a ? Object.keys(a.arquivos || {}).length : 0);
    }, 0) + Object.keys(nomesFc).length;
    const chipForecast = this.chipsForecast();
    const agrupa = this.agrupar ? " Com “% Moura Leite”, cada valor está no percentual da Moura Leite cadastrado na empresa." : "";
    const mesNomeFaixa = nomesMes[(Number(this.mes) || 1) - 1] || "";
    const base = "Orçado e realizado de " + (atual || "—") + " vêm do arquivo enviado para " + mesNomeFaixa + ". A coluna do ano anterior é o realizado do arquivo de " + (antN || "o ano anterior") + ", o mesmo em todos os meses.";
    const nota = lado === "entradas"
      ? base + " Livia, Livia I e Livia II aparecem como Central Parque. Empreendimentos com o mesmo nome ganham a sigla da cidade. MLDU aparece como Corporativo. Os quatro maiores desvios positivos e os quatro negativos do acumulado ficam à vista; o restante abre ao clicar em Outros."
        + " No gráfico de linhas, a linha do ano atual é o realizado até o mês escolhido. Cada mês seguinte, até dezembro, usa o forecast enviado nesta tela, pelas mesmas contas da visão DFC (Receitas e receitas financeiras)." + agrupa
      : base + " As saídas são as contas da visão DFC, na ordem do cadastro: Obras, Repasses terrenistas, Pessoal, Administrativas, Marketing e as demais até Outros movimentos. Gastar acima do orçado fica em vermelho."
        + " No gráfico de linhas, a linha do ano atual é o realizado até o mês escolhido. Cada mês seguinte, até dezembro, usa o forecast enviado nesta tela, pelas mesmas contas da visão DFC das saídas." + agrupa;
    const avisoRateio = lado === "saidas" && this.faltaCentroNasSaidas()
      ? `<div class="rcx-erro">Para aplicar o % Moura Leite nas saídas destes arquivos, suba o Excel de novo. O arquivo que já estava salvo não guarda o centro de custo de cada conta.</div>`
      : "";
    const avisoAnt = chipsAtual && !chipsAnt
      ? `<div class="rcx-aviso">Nenhum arquivo de ${antN} ainda. A coluna do ano anterior fica zerada até você subir essa competência. Ela vale para todos os meses.</div>`
      : "";
    const outrosMeses = Object.keys((this.acervo && this.acervo.meses) || {}).some((k) => k !== this.chaveMes(atual) && Object.keys((((this.acervo.meses || {})[k] || {}).arquivos) || {}).length);
    const avisoMes = atual && !chipsAtual && (chipsAnt || outrosMeses)
      ? `<div class="rcx-aviso">Nenhum arquivo de ${mesNomeFaixa}/${atual}. Suba o comparativo desta competência. O de ${antN || "o ano anterior"} permanece salvo.</div>`
      : "";
    const seg = (on, txt, click, title) => `<button type="button" class="${on ? "is-on" : ""}" onclick="${click}"${title ? ` title="${title}"` : ""}>${txt}</button>`;
    return `
      <div class="cc-toolbar rcx-toolbar">
        <label class="rcx-field">
          <span class="ml-emp-filter-label">Mês</span>
          <select class="rcx-select" onchange="ResultadoCaixaApp.setMes(this.value)">${mesOpts}</select>
        </label>
        <div class="rcx-field">
          <span class="ml-emp-filter-label">Valores em</span>
          <div class="rcx-escala">
            ${seg(realOn, "R$", "ResultadoCaixaApp.setEscala('real')")}
            ${seg(!realOn, "R$ milhões", "ResultadoCaixaApp.setEscala('milhoes')")}
          </div>
        </div>
        <div class="rcx-field">
          <span class="ml-emp-filter-label">Participação</span>
          <div class="rcx-escala">
            ${seg(!this.agrupar, "100%", "ResultadoCaixaApp.setAgrupar(false)", "Valores cheios dos arquivos")}
            ${seg(this.agrupar, "% Moura Leite", "ResultadoCaixaApp.setAgrupar(true)", "Aplica o percentual da Moura Leite cadastrado na empresa")}
          </div>
        </div>
        <div class="cc-toolbar-actions">
          <button type="button" class="rcx-arq-btn${this.arqsAberto ? " is-on" : ""}" onclick="ResultadoCaixaApp.toggleArqs()">
            <i data-lucide="files"></i> Arquivos <span class="ml-tab-count">${qtdArq}</span>
            <i data-lucide="${this.arqsAberto ? "chevron-up" : "chevron-down"}"></i>
          </button>
          ${lado === "entradas" || lado === "saidas" ? `<label class="rcx-arq-btn rcx-fc-btn" title="Pode escolher vários relatórios de uma vez. Orçamento Empresarial Agrupado por centro de custo, mensal. O mês escolhido é o realizado; o arquivo entra como forecast dos meses seguintes, até dezembro.">
            <i data-lucide="trending-up"></i> ${this.forecast ? "Trocar forecast" : "Subir forecast"}
            <input type="file" multiple accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange="ResultadoCaixaApp.subirForecast(this)">
          </label>` : ""}
          <label class="rcx-file">
            <i data-lucide="upload"></i> Subir orçamento
            <input type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple onchange="ResultadoCaixaApp.subir(this)">
          </label>
        </div>
      </div>
      ${this.arqsAberto ? `<div class="rcx-arqs-box">
        <div class="rcx-arqs-col">
          <span class="rcx-arqs-label">Competência atual${atual ? " · " + mesNomeFaixa + "/" + atual : ""}</span>
          <div class="rcx-arqs">${chipsAtual || `<span class="rcx-muted">Nenhum arquivo desta competência.</span>`}</div>
        </div>
        <div class="rcx-arqs-col">
          <span class="rcx-arqs-label">Ano anterior${antN ? " · " + antN : ""}</span>
          <div class="rcx-arqs">${chipsAnt || `<span class="rcx-muted">Nenhum arquivo desta competência.</span>`}</div>
        </div>
        <div class="rcx-arqs-col">
          <span class="rcx-arqs-label">Forecast</span>
          <div class="rcx-arqs">${chipForecast}</div>
        </div>
      </div>` : ""}
      ${this.error ? `<div class="rcx-erro">${caixaEsc(this.error)}</div>` : ""}
      ${this.aviso ? `<div class="rcx-aviso">${caixaEsc(this.aviso)}</div>` : ""}
      ${avisoRateio}
      ${avisoMes}
      ${avisoAnt}
      ${this.dfcErro ? `<div class="rcx-erro">${caixaEsc(this.dfcErro)}</div>` : ""}
      ${anos.length ? `<details class="rcx-ajuda"><summary><i data-lucide="info"></i> Como ler esta tabela</summary><p>${nota}</p></details>` : `<p class="rcx-vazio">Suba o comparativo orçado × realizado por centro de custo. Pode ser o arquivo analítico das contas financeiras: ele entra na visão DFC. O de ${antN || "o ano anterior"} fica salvo para todos os meses. O de ${atual || "o ano corrente"} vale só para o mês selecionado.</p>`}
    `;
  },

  /** Barras do mês selecionado: realizado do ano anterior, orçado e realizado do ano atual. */
  graficoMesHtml(total) {
    const atual = this.anoAtual();
    const antN = atual > 1900 ? atual - 1 : 0;
    const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const mesNome = nomes[(Number(this.mes) || 1) - 1] || "";
    const barras = [
      { cls: "is-ant", rotulo: antN ? String(antN) : "Ano ant.", valor: total.ant, espera: this.dfcLendo },
      { cls: "is-orc", rotulo: "Orçado", valor: total.orc },
      { cls: "is-real", rotulo: atual ? String(atual) : "Atual", valor: total.real }
    ];
    const maior = Math.max(...barras.map((b) => (b.espera ? 0 : Math.max(0, b.valor))), 1);
    return `<div class="rcx-graf">
      <div class="rcx-graf-tit">${caixaEsc(mesNome.toUpperCase())}</div>
      <div class="rcx-graf-area">
        ${barras.map((b) => {
          const h = b.espera ? 0 : Math.max(0, b.valor) / maior * 100;
          return `<div class="rcx-graf-col ${b.cls}">
            <span class="rcx-graf-val">${b.espera ? "…" : this.fmt(b.valor)}</span>
            <div class="rcx-graf-track"><div class="rcx-graf-bar" style="height:${h.toFixed(2)}%"></div></div>
          </div>`;
        }).join("")}
      </div>
      <div class="rcx-graf-eixo">${barras.map((b) => `<span>${caixaEsc(b.rotulo)}</span>`).join("")}</div>
    </div>`;
  },

  /** Totais do ano em colunas empilhadas: a parte escura vai de janeiro até o mês escolhido e a clara segue até dezembro. */
  graficoTotaisHtml(lado) {
    const s = lado === "saidas" ? this.serieSaidas() : this.serieEntradas();
    const ano = this.anoAtual();
    const antN = ano > 1900 ? ano - 1 : 0;
    const sel = Number(this.mes) || 1;
    const soma = (serie, de, ate) => serie.slice(de - 1, ate).reduce((t, v) => t + (Number(v) || 0), 0);
    const colunas = [
      { cls: "is-ant", rotulo: antN ? String(antN) : "Ano ant.", escuro: soma(s.ant, 1, sel), claro: soma(s.ant, sel + 1, 12) },
      { cls: "is-orc", rotulo: "Orçado", escuro: soma(s.orc, 1, sel), claro: soma(s.orc, sel + 1, 12) },
      { cls: "is-fc", rotulo: "Forecast", escuro: soma(s.real, 1, sel), claro: sel < 12 ? soma(s.forecast, sel + 1, 12) : 0, marca: sel < 12 && (!this.forecast || s.semForecast.length) }
    ];
    colunas.forEach((c) => {
      c.escuro = Math.max(0, c.escuro);
      c.claro = Math.max(0, c.claro);
      c.total = c.escuro + c.claro;
    });
    const maior = Math.max(...colunas.map((c) => c.total), 1);
    const pedaco = (valor, total, cls) => {
      if (!(valor > 0)) return "";
      const p = valor / total;
      return `<div class="rcx-tot-seg ${cls}" style="flex:${p.toFixed(4)} 1 0"${p >= 0.14 ? "" : " data-curto"}><span>${this.fmt(valor)}</span></div>`;
    };
    const mesCurto = (this.MESES[sel - 1] || "").toLowerCase();
    const proximo = sel < 12 ? (this.MESES[sel] || "").toLowerCase() : "";
    let nota = sel < 12
      ? `Escuro: jan a ${mesCurto} (realizado ${antN || "anterior"}, orçado e realizado ${ano || ""}). Claro: ${proximo} a dez (realizado ${antN || "anterior"}, orçado e previsão do forecast).`
      : `Ano fechado em dezembro: as colunas mostram só o acumulado.`;
    if (sel < 12 && !this.forecast) nota += " * Sem forecast: suba o relatório para preencher a parte clara.";
    else if (sel < 12 && s.semForecast.length) nota += ` * O forecast não tem ${s.semForecast.map((m) => (this.MESES[m - 1] || "").toLowerCase()).join(", ")}: nesses meses entra o orçado.`;
    return `<div class="rcx-graf rcx-tot">
      <div class="rcx-graf-tit">TOTAIS</div>
      <div class="rcx-graf-area rcx-tot-area">
        ${colunas.map((c) => `<div class="rcx-graf-col ${c.cls}">
          <span class="rcx-graf-val">${this.fmt(c.total)}${c.marca ? " *" : ""}</span>
          <div class="rcx-graf-track"><div class="rcx-tot-pilha" style="height:${(c.total / maior * 100).toFixed(2)}%" title="${caixaEsc(c.rotulo)}: ${this.fmt(c.escuro)} até ${mesCurto} + ${this.fmt(c.claro)} até dezembro">
            ${pedaco(c.claro, c.total, "is-claro")}${pedaco(c.escuro, c.total, "is-escuro")}
          </div></div>
        </div>`).join("")}
      </div>
      <div class="rcx-graf-eixo">${colunas.map((c) => `<span>${caixaEsc(c.rotulo)}</span>`).join("")}</div>
      <div class="rcx-tot-tip" role="tooltip">${caixaEsc(nota)}</div>
    </div>`;
  },

  /** Séries mensais das entradas (12 meses): ano anterior, orçado, realizado até o mês e forecast dali em diante. */
  serieEntradas() {
    const ano = this.anoAtual();
    const ant = ano - 1;
    const sel = Number(this.mes) || 1;
    const bagAno = this.bagLado(ano, "entradas");
    const bagAnt = this.bagLado(ant, "entradas");
    const tem = (bag, m) => Object.keys(bag).some((id) => (bag[id].meses || {})[String(m)]);
    const soma = (y, bag, m, campo) => Object.keys(bag).reduce((s, id) => s + this.valorAgrupado("entradas", y, id, m, campo, false), 0);
    const fc = this.forecastEntradas(ano);
    const meses = Array.from({ length: 12 }, (_, i) => i + 1);
    const real = meses.map((m) => (m <= sel && tem(bagAno, m) ? soma(ano, bagAno, m, "r") : null));
    const orc = meses.map((m) => (tem(bagAno, m) ? soma(ano, bagAno, m, "o") : null));
    const semForecast = [];
    const forecast = meses.map((m, i) => {
      if (m <= sel) return real[i];
      if (fc[m] != null) return fc[m];
      const algum = meses.some((mm) => mm > sel && fc[mm] != null);
      if (!algum) return null;
      semForecast.push(m);
      return orc[i];
    });
    return {
      ant: meses.map((m) => (tem(bagAnt, m) ? soma(ant, bagAnt, m, "r") : null)),
      orc,
      real,
      forecast,
      semForecast
    };
  },

  temMesConta(ano, m) {
    const a = this.anoDados(ano);
    if (!a) return false;
    const chave = String(m);
    return Object.keys(a.arquivos || {}).some((nome) => {
      const arq = a.arquivos[nome] || {};
      const listas = [];
      if (arq.contasPorCc && Object.keys(arq.contasPorCc).length) {
        Object.keys(arq.contasPorCc).forEach((id) => listas.push((arq.contasPorCc[id] || {}).contas || {}));
      } else if (arq.contas) listas.push(arq.contas);
      return listas.some((contas) => Object.keys(contas).some((code) => {
        const meses = (contas[code] && contas[code].meses) || {};
        return !!meses[chave];
      }));
    });
  },

  /** Séries mensais das saídas, no mesmo desenho das entradas: realizado até o mês e forecast até dezembro. */
  serieSaidas() {
    const ano = this.anoAtual();
    const ant = ano - 1;
    const sel = Number(this.mes) || 1;
    const defs = this.contasSaida();
    const soma = (y, m, campo) => defs.reduce((s, def) => s + this.somaSaidaDef(y, def, m, campo, false), 0);
    const fc = this.forecastLado(ano, "saidas");
    const meses = Array.from({ length: 12 }, (_, i) => i + 1);
    const real = meses.map((m) => (m <= sel && this.temMesConta(ano, m) ? soma(ano, m, "r") : null));
    const orc = meses.map((m) => (this.temMesConta(ano, m) ? soma(ano, m, "o") : null));
    const semForecast = [];
    const forecast = meses.map((m, i) => {
      if (m <= sel) return real[i];
      if (fc[m] != null) return fc[m];
      const algum = meses.some((mm) => mm > sel && fc[mm] != null);
      if (!algum) return null;
      semForecast.push(m);
      return orc[i];
    });
    return {
      ant: meses.map((m) => (this.temMesConta(ant, m) ? soma(ant, m, "r") : null)),
      orc,
      real,
      forecast,
      semForecast
    };
  },

  passoEixo(bruto) {
    if (!(bruto > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(bruto)));
    const n = bruto / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  },

  graficoLinhasHtml(lado) {
    const s = lado === "saidas" ? this.serieSaidas() : this.serieEntradas();
    const ano = this.anoAtual();
    const antN = ano > 1900 ? ano - 1 : 0;
    const sel = Number(this.mes) || 1;
    const milhoes = this.escala === "milhoes";
    const div = milhoes ? 1000000 : 1;
    const valores = [].concat(s.ant, s.orc, s.real, s.forecast).filter((v) => v != null).map((v) => v / div);
    const maxV = Math.max(0, ...valores);
    const minV = Math.min(0, ...valores);
    const passo = this.passoEixo((maxV - minV) / 6);
    const topo = Math.max(passo, Math.ceil(maxV / passo) * passo);
    const base = Math.floor(minV / passo) * passo;
    const W = 640, H = 240, L = milhoes ? 48 : 64, R = 10, T = 10, B = 28;
    const x = (m) => L + (m - 0.5) * (W - L - R) / 12;
    const y = (v) => T + (topo - v / div) / (topo - base) * (H - T - B);
    const eixoTxt = (t) => milhoes
      ? t.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : (Math.abs(t) >= 1000000 ? (t / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : (t / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil");
    const caminho = (serie) => {
      let d = "";
      let aberto = false;
      serie.forEach((v, i) => {
        if (v == null) { aberto = false; return; }
        d += (aberto ? " L" : " M") + x(i + 1).toFixed(1) + " " + y(v).toFixed(1);
        aberto = true;
      });
      return d.trim();
    };
    const grade = [];
    for (let t = base, i = 0; t <= topo + passo / 1000 && i < 30; t += passo, i++) {
      const yy = y(t * div).toFixed(1);
      grade.push(`<text x="${L - 6}" y="${yy}" class="rcx-ln-eixo-y">${eixoTxt(t)}</text>`);
    }
    const letras = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
    const series = [
      { k: "ant", cls: "is-ant", nome: antN ? String(antN) : "Ano anterior" },
      { k: "orc", cls: "is-orc", nome: "Orçado" },
      { k: "forecast", cls: "is-fc", nome: "Forecast" },
      { k: "real", cls: "is-real", nome: ano ? String(ano) : "Realizado" }
    ];
    const pontos = series.map((se) => s[se.k].map((v, i) => (v == null || (se.k === "forecast" && i + 1 <= sel)) ? ""
      : `<circle cx="${x(i + 1).toFixed(1)}" cy="${y(v).toFixed(1)}" r="7" class="rcx-ln-hit"><title>${se.nome} · ${this.MESES[i]}: ${this.fmt(v)}</title></circle>`).join("")).join("");
    const legenda = series.filter((se) => s[se.k].some((v) => v != null)).map((se) => `<span class="rcx-ln-leg ${se.cls}"><i></i>${caixaEsc(se.nome)}</span>`).join("");
    const nomesMes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    let nota = "";
    if (!this.forecast) nota = "Suba o forecast para projetar os meses seguintes até dezembro.";
    else if (s.semForecast.length) nota = `O forecast não tem ${s.semForecast.map((m) => nomesMes[m - 1]).join(", ")}: nesses meses a linha usa o orçado.`;
    return `<div class="rcx-linhas">
      <div class="rcx-graf-tit">EVOLUÇÃO MENSAL/${ano || ""}</div>
      <svg viewBox="0 0 ${W} ${H}" class="rcx-ln-svg" role="img" aria-label="${lado === "saidas" ? "Saídas" : "Entradas"} por mês: ano anterior, orçado, realizado e forecast">
        ${grade.join("")}
        <line x1="${x(sel).toFixed(1)}" x2="${x(sel).toFixed(1)}" y1="${T}" y2="${H - B}" class="rcx-ln-sel"></line>
        ${letras.map((l, i) => `<text x="${x(i + 1).toFixed(1)}" y="${H - 8}" class="rcx-ln-eixo-x${i + 1 === sel ? " is-sel" : ""}">${l}</text>`).join("")}
        ${series.map((se) => `<path d="${caminho(s[se.k])}" class="rcx-ln ${se.cls}"></path>`).join("")}
        ${pontos}
      </svg>
      <div class="rcx-ln-legenda">${legenda}</div>
      ${nota ? `<div class="rcx-ln-nota">${caixaEsc(nota)}</div>` : ""}
    </div>`;
  },

  gradeHtml(rotulo, body, total, totalA, saida, ordemAcumReal) {
    if (!body) return "";
    const atual = this.anoAtual();
    const antH = atual > 1900 ? String(atual - 1) : "Ano ant.";
    const mesNome = this.MESES[(Number(this.mes) || 1) - 1] || "";
    const seta = `<i data-lucide="arrow-down" class="rcx-ordem"></i>`;
    const sub = (acum) => `<th class="rcx-sep">${caixaEsc(antH)}</th><th>Orçado</th>${acum && ordemAcumReal
      ? `<th class="rcx-th-ordem" title="Ordenado do maior para o menor pelo realizado acumulado">${seta} Real</th>`
      : "<th>Real</th>"}<th>Var.</th><th>Var. %</th>`;
    return `<div class="rcx-scroll">
      <table class="rcx-grid">
        <colgroup><col class="rcx-c-nome">${"<col>".repeat(10)}</colgroup>
        <thead>
          <tr class="rcx-h1">
            <th rowspan="2" class="rcx-h-nome">${caixaEsc(rotulo)}</th>
            <th colspan="5" class="rcx-sep">Mensal · ${mesNome}/${atual || ""}</th>
            <th colspan="5" class="rcx-sep">Acumulado · Jan a ${mesNome}</th>
          </tr>
          <tr class="rcx-h2">${sub(false)}${sub(true)}</tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot><tr>
          <td class="rcx-nome">Total</td>
          ${this.blocoNums(total, saida)}
          ${this.blocoNums(totalA, saida)}
        </tr></tfoot>
      </table>
    </div>`;
  },

  secaoHtml(icone, texto, cls) {
    return `<tr class="rcx-secao ${cls || ""}"><td colspan="11"><i data-lucide="${icone}"></i> ${texto}</td></tr>`;
  },

  outrosNome(qtd) {
    return `<i data-lucide="${this.outrosAberto ? "chevron-down" : "chevron-right"}"></i> Outros <span class="rcx-qtd">${qtd}</span>`;
  },

  linhaPronta(r, cls, nomeHtml, click, saida) {
    return `<tr class="${cls || ""}"${click ? ` onclick="${click}"` : ""}>
      <td class="rcx-nome" title="${caixaEsc(r.nome)}">${nomeHtml || caixaEsc(r.nome)}</td>
      ${this.blocoNums(r.mensal, saida)}
      ${this.blocoNums(r.acum, saida)}
    </tr>`;
  },

  somaCodigos(contas, def, mes, campo, ate) {
    const tem = (def.codigos || []).filter((c) => contas[c]);
    let codes = tem;
    if (!codes.length && def.filhos) codes = Object.keys(contas).filter((c) => def.filhos.test(c));
    if (!codes.length && def.pai && contas[def.pai]) codes = [def.pai];
    let s = 0;
    const fim = Number(mes);
    const ini = ate ? 1 : fim;
    codes.forEach((code) => {
      const bag = contas[code];
      if (!bag || !bag.meses) return;
      for (let m = ini; m <= fim; m++) {
        const cel = bag.meses[String(m)];
        if (cel) s += Number(cel[campo]) || 0;
      }
    });
    return s;
  },

  semContas(ano) {
    const a = this.anoDados(ano);
    if (!a) return false;
    const nomes = Object.keys(a.arquivos || {});
    if (!nomes.length) return false;
    return nomes.every((n) => !a.arquivos[n].contas);
  },

  somaSaidaDef(ano, def, mes, campo, ate) {
    const a = this.anoDados(ano);
    if (!a) return 0;
    let s = 0;
    Object.keys(a.arquivos || {}).forEach((nome) => {
      const arq = a.arquivos[nome] || {};
      const pct = this.pctArquivo(arq, nome);
      const porCc = arq.contasPorCc;
      if (porCc && Object.keys(porCc).length) {
        Object.keys(porCc).forEach((ccId) => {
          s += this.somaCodigos(porCc[ccId].contas || {}, def, mes, campo, ate) * pct;
        });
      } else if (arq.contas) {
        s += this.somaCodigos(arq.contas, def, mes, campo, ate) * pct;
      }
    });
    return -s;
  },

  linhasSaida() {
    const ano = this.anoAtual();
    const ant = ano - 1;
    const mes = Number(this.mes) || 1;
    const rows = this.contasSaida().map((def) => {
      const valor = (y, campo, ate) => this.somaSaidaDef(y, def, mes, campo, ate);
      return {
        key: def.id,
        nome: def.nome,
        destaque: !!def.destaque,
        def: def,
        mensal: { ant: valor(ant, "r", false), orc: valor(ano, "o", false), real: valor(ano, "r", false) },
        acum: { ant: valor(ant, "r", true), orc: valor(ano, "o", true), real: valor(ano, "r", true) }
      };
    });
    return { ano, ant, rows };
  },

  aplicarDfcContas(rows, mes) {
    (this.dfcLinhas || []).forEach((l) => {
      const id = String(l.node || "");
      let row = null;
      for (let i = 0; i < rows.length; i++) {
        if (this.casaNo(id, rows[i].def)) { row = rows[i]; break; }
      }
      if (!row) return;
      const v = -(Number(l.valor) || 0);
      if (l.mes === mes) row.mensal.ant += v;
      if (l.mes >= 1 && l.mes <= mes) row.acum.ant += v;
    });
  },

  orcamentoHtml(lado) {
    const faixa = this.faixaHtml(lado);
    if (this.lendo) return faixa + this.loaderHtml();
    if (!Object.keys(this.anos || {}).length) return faixa;
    if (lado === "saidas") return faixa + this.saidasHtml();
    const pack = this.linhasTabela(lado);
    if (!pack.rows.length) return faixa + `<p class="rcx-vazio">Nenhum valor nesse mês para os grupos desta aba.</p>`;
    const vista = this.destacar(pack.rows);
    const linha = (r, cls) => this.linhaPronta(r, cls || "", "", "", false);
    let corpo = "";
    if (vista.pos.length) corpo += this.secaoHtml("trending-up", "Acima do orçado no acumulado", "is-pos") + vista.pos.map((r) => linha(r)).join("");
    if (vista.neg.length) corpo += this.secaoHtml("trending-down", "Abaixo do orçado no acumulado", "is-neg") + vista.neg.map((r) => linha(r)).join("");
    if (vista.outros.length) {
      const soma = { nome: "Outros", mensal: this.somaBloco(vista.outros, "mensal"), acum: this.somaBloco(vista.outros, "acum") };
      corpo += this.linhaPronta(soma, "rcx-outros", this.outrosNome(vista.outros.length), "ResultadoCaixaApp.toggleOutros()", false);
      if (this.outrosAberto) corpo += vista.outros.map((r) => linha(r, "rcx-filho")).join("");
    }
    const total = this.somaBloco(pack.rows, "mensal");
    const totalA = this.somaBloco(pack.rows, "acum");
    return faixa
      + `<div class="rcx-topo">${this.graficoMesHtml(total)}${this.graficoLinhasHtml("entradas")}${this.graficoTotaisHtml("entradas")}</div>`
      + this.gradeHtml("Produto", corpo, total, totalA, false);
  },

  saidasHtml() {
    const ano = this.anoAtual();
    if (this.semContas(ano)) {
      return `<p class="rcx-vazio">O arquivo que já estava salvo não guarda as contas. Suba de novo os Excel — pode escolher vários de uma vez — para montar Obras, Repasses, Pessoal e as demais.</p>`;
    }
    const pack = this.linhasSaida();
    const vivo = (r) => ["mensal", "acum"].some((b) => ["ant", "orc", "real"].some((k) => Math.abs(r[b][k]) > 0.5));
    const todos = pack.rows.filter(vivo);
    const corpo = todos.map((r) => this.linhaPronta(r, "", "", "", true)).join("");
    const total = this.somaBloco(todos, "mensal");
    const totalA = this.somaBloco(todos, "acum");
    return `<div class="rcx-topo">${this.graficoMesHtml(total)}${this.graficoLinhasHtml("saidas")}${this.graficoTotaisHtml("saidas")}</div>`
      + this.gradeHtml("Conta", corpo, total, totalA, true, true);
  },

  arquivoMl() {
    const ano = String(this.anoBase());
    const meses = (this.acervo && this.acervo.meses) || {};
    const chaves = Object.keys(meses).filter((k) => k.indexOf(ano + "-") === 0).sort();
    const pref = this.chaveMes(ano);
    const ordem = chaves.filter((k) => k === pref).concat(chaves.filter((k) => k !== pref).reverse());
    for (let i = 0; i < ordem.length; i++) {
      const arquivos = (meses[ordem[i]] && meses[ordem[i]].arquivos) || {};
      const nomes = Object.keys(arquivos);
      for (let j = 0; j < nomes.length; j++) {
        const arq = arquivos[nomes[j]];
        if (Number(arq && arq.empresa) === 1) return arq;
      }
    }
    return null;
  },

  bagMes() {
    const meses = [];
    for (let i = 0; i < 12; i++) meses.push({ o: 0, r: 0, f: 0 });
    return meses;
  },

  somaMeses(dest, src) {
    for (let i = 0; i < 12; i++) {
      dest[i].o += Number(src[i].o) || 0;
      dest[i].r += Number(src[i].r) || 0;
      dest[i].f += Number(src[i].f) || 0;
    }
  },

  juntarNo(dest, src) {
    this.somaMeses(dest.meses, src.meses);
    Object.keys(src.ccs || {}).forEach((id) => {
      const de = src.ccs[id];
      const para = dest.ccs[id] || (dest.ccs[id] = { nome: de.nome || id, meses: this.bagMes() });
      if (de.nome) para.nome = de.nome;
      this.somaMeses(para.meses, de.meses);
    });
  },

  porCodigoVisao(groups) {
    const map = {};
    (groups || []).forEach((g) => {
      const cod = this.codigoVisao(g);
      if (cod && !map[cod]) map[cod] = g;
    });
    return map;
  },

  somarGuardado(node, meses, campo) {
    Object.keys(meses || {}).forEach((mm) => {
      const i = Number(mm) - 1;
      if (i < 0 || i > 11) return;
      node.meses[i][campo] += Number(meses[mm].o) || 0;
    });
  },

  async carregarMl(forcar) {
    const ano = this.anoBase();
    const mes = Number(this.mes) || 1;
    const arq = this.arquivoMl();
    const key = [ano, mes, (arq && arq._doc) || "", (this.forecast && this.forecast.em) || ""].join("|");
    if (!forcar && this.mlDados && this.mlDados.key === key) return;
    const token = (this._mlToken || 0) + 1;
    this._mlToken = token;
    this.mlLendo = true;
    this.mlErro = "";
    this.render();
    try {
      const dados = await this.lerCaixaMl(ano, mes, arq);
      if (this._mlToken !== token) return;
      dados.key = key;
      this.mlDados = dados;
      if (!this._mlExpand) {
        (dados.linhas || []).forEach((n) => { if (n.level === 0 && n.hasKids) this.mlAbertos[n.id] = true; });
        this._mlExpand = true;
      }
    } catch (e) {
      if (this._mlToken !== token) return;
      this.mlErro = (e && e.message) || String(e);
    }
    this.mlLendo = false;
    if (this._mlToken === token && this.aba === "caixa") this.render();
  },

  async lerCaixaMl(ano, mes, arq) {
    const FC = window.FluxoCaixaApp;
    if (!FC || typeof FC.visao !== "function" || typeof FC.allocate !== "function") {
      throw new Error("A visão do DFC não está disponível nesta tela.");
    }
    const groups = (FC.visao().groups || []).slice();
    const byId = {};
    groups.forEach((g) => {
      byId[g.id] = { id: g.id, nome: g.name || g.id, tipo: g.type || "", parentId: g.parentId || "", meses: this.bagMes(), ccs: {}, planos: {} };
    });
    const porCod = this.porCodigoVisao(groups);
    const porCc = (node, ccId, nome) => {
      const id = String(ccId || "—");
      const bag = node.ccs[id] || (node.ccs[id] = { nome: nome || id, meses: this.bagMes() });
      if (nome) bag.nome = nome;
      return bag;
    };
    const planoDe = (node, code, nome) => {
      const key = this.codigoPlano(code);
      if (!node || !this.ehContaFinanceira(key)) return null;
      const bag = node.planos[key] || (node.planos[key] = { code: key, nome: nome || key, meses: this.bagMes(), ccs: {} });
      if (nome && nome !== key) bag.nome = nome;
      return bag;
    };
    const ccDoPlano = (plano, ccId, nome) => {
      if (!plano) return null;
      const id = String(ccId || "—").replace(/\D/g, "") || String(ccId || "—");
      const bag = plano.ccs[id] || (plano.ccs[id] = { nome: nome || id, meses: this.bagMes() });
      if (nome) bag.nome = nome;
      return bag;
    };
    if (arq && arq.contas) {
      Object.keys(arq.contas).forEach((code) => {
        const g = porCod[code];
        if (!g || !byId[g.id] || g.type === "formula") return;
        this.somarGuardado(byId[g.id], arq.contas[code].meses, "o");
      });
      Object.keys(arq.contasPorCc || {}).forEach((cc) => {
        const bloco = arq.contasPorCc[cc] || {};
        Object.keys(bloco.contas || {}).forEach((code) => {
          const g = porCod[code];
          if (!g || !byId[g.id] || g.type === "formula") return;
          const bag = porCc(byId[g.id], cc, bloco.nome);
          Object.keys(bloco.contas[code].meses || {}).forEach((mm) => {
            const i = Number(mm) - 1;
            if (i >= 0 && i < 12) bag.meses[i].o += Number(bloco.contas[code].meses[mm].o) || 0;
          });
        });
      });
    }
    Object.keys((arq && arq.planosPorCc) || {}).forEach((cc) => {
      const bloco = arq.planosPorCc[cc] || {};
      Object.keys(bloco.contas || {}).forEach((code) => {
        const info = bloco.contas[code] || {};
        const alvo = info.node && byId[info.node];
        if (!alvo || alvo.tipo === "formula") return;
        const plano = planoDe(alvo, code, info.nome);
        const ccBag = ccDoPlano(plano, cc, bloco.nome);
        Object.keys(info.meses || {}).forEach((mm) => {
          const i = Number(mm) - 1;
          if (i < 0 || i > 11) return;
          const o = Number(info.meses[mm].o) || 0;
          if (plano) plano.meses[i].o += o;
          if (ccBag) ccBag.meses[i].o += o;
        });
      });
    });
    const ccMl = new Set(Object.keys((arq && arq.contasPorCc) || {}));
    const mapa = await this.mapaPronto();
    const forecastsAno = Object.keys(this.forecasts || {}).filter((ym) => Number(ym.slice(0, 4)) === Number(ano)).map((ym) => this.forecasts[ym]);
    forecastsAno.forEach((fcDoc) => {
      if (!fcDoc || !fcDoc.contas) return;
      Object.keys(fcDoc.contas).forEach((cc) => {
        if (ccMl.size && !ccMl.has(String(cc))) return;
        const nomeCc = (fcDoc.nomes && fcDoc.nomes[cc]) || cc;
        Object.keys(fcDoc.contas[cc] || {}).forEach((code) => {
          const conta = fcDoc.contas[cc][code];
          const node = this.noDaLinha(FC, mapa, { code: code, nome: conta.nome || "" });
          if (!node || !byId[node.id]) return;
          const plano = planoDe(byId[node.id], code, conta.nome || "");
          const bag = porCc(byId[node.id], cc, nomeCc);
          const ccPlano = ccDoPlano(plano, cc, nomeCc);
          Object.keys(conta.meses || {}).forEach((ym) => {
            if (Number(ym.slice(0, 4)) !== Number(ano)) return;
            const i = Number(ym.slice(5, 7)) - 1;
            if (i < 0 || i > 11) return;
            let valor = Number(conta.meses[ym]) || 0;
            if (valor && typeof FC.signedAmount === "function") {
              valor = FC.signedAmount(node, code, conta.nome || "", valor, "", "", null);
            }
            byId[node.id].meses[i].f += valor;
            bag.meses[i].f += valor;
            if (plano) plano.meses[i].f += valor;
            if (ccPlano) ccPlano.meses[i].f += valor;
          });
        });
      });
    });
    const fimMes = new Date(ano, mes, 0).getDate();
    const start = ano + "-01-01";
    const end = ano + "-" + String(mes).padStart(2, "0") + "-" + String(fimMes).padStart(2, "0");
    let movimentos = [];
    let contas = [];
    if (window.SiengeApiService && typeof SiengeApiService.getBankMovements === "function") {
      let movs = await SiengeApiService.getBankMovements(start, end, { selectionType: "M", companyId: 1 });
      movs = movs || [];
      if (typeof window.siengeDedupeBankMovements === "function") movs = siengeDedupeBankMovements(movs);
      movs.forEach((mov) => {
        const d = FC.cashDate(mov);
        if (!d || d < start || d > end || Number(mov.companyId || 1) !== 1) return;
        const ym = d.slice(0, 7);
        const mi = Number(ym.slice(5, 7)) - 1;
        FC.allocate(mov, 1).forEach((a) => {
          if (a.month && String(a.month).slice(0, 7) !== ym) return;
          const node = this.noDaLinha(FC, mapa, { code: a.categoryId, nome: a.categoryName || "" });
          if (!node || !byId[node.id]) return;
          const signed = FC.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov);
          if (!signed || mi < 0) return;
          const plano = planoDe(byId[node.id], a.categoryId, a.categoryName || "");
          const ccPlano = ccDoPlano(plano, a.costCenterId, a.costCenterName);
          byId[node.id].meses[mi].r += signed;
          porCc(byId[node.id], a.costCenterId, a.costCenterName).meses[mi].r += signed;
          if (plano) plano.meses[mi].r += signed;
          if (ccPlano) ccPlano.meses[mi].r += signed;
        });
        const valor = this.sinalMovimento(mov);
        if (!valor) return;
        movimentos.push({
          conta: String(mov.accountNumber || mov.account || "").trim(),
          mes: mi + 1,
          valor: valor
        });
      });
    }
    if (window.SiengeApiService && typeof SiengeApiService.getCheckingAccounts === "function") {
      const res = await SiengeApiService.getCheckingAccounts(1, { allStatuses: true });
      const bals = typeof SiengeApiService.getAccountBalances === "function"
        ? await SiengeApiService.getAccountBalances(start, { companyId: 1, showLast: true })
        : [];
      const abertura = {};
      (bals || []).forEach((b) => {
        const num = String(b.accountNumber || b.number || "").trim();
        const dt = String(b.balanceDate || "").slice(0, 10);
        if (!num || (dt && dt > start)) return;
        const valor = this.valorSaldo(b);
        if (valor == null) return;
        const prev = abertura[num];
        if (!prev || (dt && dt >= prev.dt)) abertura[num] = { valor: valor, dt: dt || start };
      });
      contas = ((res && res.results) || []).map((raw) => {
        const type = raw && raw.accountType;
        const typeId = String((type && typeof type === "object" ? type.id : raw.accountTypeId) || "").trim().toUpperCase();
        const desc = String((type && typeof type === "object" ? (type.description || type.name) : type) || "");
        const invest = typeId === "I" || typeId === "A" || /invest|aplic/i.test(desc);
        if (invest) return null;
        const numero = String(raw.accountNumber || raw.number || "").trim();
        if (!numero) return null;
        const ab = abertura[numero];
        return {
          numero: numero,
          nome: String(raw.accountName || raw.name || numero).trim(),
          abertura: ab ? ab.valor : 0,
          desdeInicio: !!(ab && (!ab.dt || ab.dt <= start))
        };
      }).filter(Boolean);
    }
    const depthOf = (g) => {
      let d = 0;
      let cur = g;
      while (cur && cur.parentId && byId[cur.parentId]) { d += 1; cur = byId[cur.parentId]; }
      return d;
    };
    groups.filter((g) => g.type !== "formula").sort((a, b) => depthOf(b) - depthOf(a)).forEach((g) => {
      groups.filter((c) => c.parentId === g.id && c.type !== "formula").forEach((ch) => {
        if (byId[g.id] && byId[ch.id]) this.juntarNo(byId[g.id], byId[ch.id]);
      });
    });
    const aplicar = (id, partes) => {
      if (!byId[id]) return;
      byId[id].meses = this.bagMes();
      byId[id].ccs = {};
      partes.forEach((pid) => { if (byId[pid]) this.juntarNo(byId[id], byId[pid]); });
    };
    aplicar("g_03", ["g_04", "g_05"]);
    aplicar("g_06", ["g_01", "g_02", "g_03"]);
    aplicar("g_08", ["g_06", "g_07"]);
    aplicar("g_10", ["g_08", "g_09"]);
    aplicar("g_12", ["g_10", "g_11"]);
    const linhas = [];
    const walk = (node, level) => {
      const filhos = groups.filter((g) => g.parentId === node.id);
      const item = byId[node.id];
      if (!item) return;
      const vivo = (meses) => (meses || []).some((m) => Math.abs(m.o) > 0.5 || Math.abs(m.r) > 0.5 || Math.abs(m.f) > 0.5);
      const planos = Object.keys(item.planos || {}).map((k) => {
        const p = item.planos[k];
        const ccs = Object.keys(p.ccs || {}).map((id) => ({ id: id, nome: p.ccs[id].nome || id, meses: p.ccs[id].meses }))
          .filter((c) => vivo(c.meses))
          .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt"));
        return { code: p.code, nome: p.nome || p.code, meses: p.meses, ccs: ccs };
      }).filter((p) => vivo(p.meses) || p.ccs.length)
        .sort((a, b) => String(a.code).localeCompare(String(b.code), "pt", { numeric: true }));
      linhas.push({ id: item.id, nome: item.nome, tipo: item.tipo, level: level, hasKids: filhos.length > 0, planos: filhos.length ? [] : planos, meses: item.meses, ccs: item.ccs });
      filhos.forEach((ch) => walk(ch, level + 1));
    };
    groups.filter((g) => !g.parentId).forEach((g) => walk(g, 0));
    const padrao = contas.filter((c) => c.desdeInicio).map((c) => c.numero);
    return { ano: ano, mes: mes, linhas: linhas, contas: contas, movimentos: movimentos, padrao: padrao, temArquivo: !!arq, temForecast: !!(this.forecast && this.forecast.contas) };
  },

  sinalMovimento(m) {
    const CD = window.CaixaDiarioApp;
    if (CD && typeof CD.valorMov === "function") return CD.valorMov(m);
    const raw = Number(m.bankMovementAmount) || 0;
    const tipo = String(m.bankMovementOperationType || m.operationType || "").toUpperCase();
    if (/^(S|D)$/.test(tipo) || /DEBIT|SAIDA/.test(tipo)) return -Math.abs(raw);
    if (/^(E|C)$/.test(tipo) || /CREDIT|ENTRADA/.test(tipo)) return Math.abs(raw);
    return raw;
  },

  valorSaldo(b) {
    const list = [b.amount, b.balance, b.balanceAmount, b.currentBalance, b.lastBalance, b.lastBalanceAmount, b.availableAmount, b.availableBalance, b.value];
    for (let i = 0; i < list.length; i++) {
      const n = Number(list[i]);
      if (Number.isFinite(n)) return n;
    }
    return null;
  },

  contaCorrenteMl(c) {
    const nome = this.fold(((c && c.nome) || "") + " " + ((c && c.numero) || ""));
    if (/MUTUO|JUDICIAL|BLOQUEIO|BLOQ|CHEQUE|EMISSAO|TRANSITOR|REAPROP|ADIANTAMENTO/.test(nome)) return false;
    return /\bC C\b|CONTA CORRENTE/.test(nome);
  },

  mlSelecionadas(dados) {
    if (!this._mlSel) {
      try { this._mlSel = JSON.parse(localStorage.getItem("rc_ml_contas_v2") || "null"); } catch (e) { this._mlSel = null; }
    }
    if (Array.isArray(this._mlSel)) return this._mlSel;
    const base = (dados && dados.contas) || [];
    const cc = base.filter((c) => this.contaCorrenteMl(c)).map((c) => c.numero);
    return cc.length ? cc : ((dados && dados.padrao) || []);
  },

  toggleContaMl(num, on) {
    const set = new Set(this.mlSelecionadas(this.mlDados));
    if (on) set.add(String(num));
    else set.delete(String(num));
    this._mlSel = Array.from(set);
    try { localStorage.setItem("rc_ml_contas_v2", JSON.stringify(this._mlSel)); } catch (e) {}
    this.render();
  },

  toggleNoMl(id) {
    this.mlAbertos[id] = !this.mlAbertos[id];
    this.render();
  },

  toggleFatia(id) {
    this.mlFatia = this.mlFatia === id ? "" : id;
    this.render();
  },

  mlVisivel(linha) {
    if (!linha) return false;
    if (linha.tipo === "formula" || linha.level === 0) return true;
    return (linha.meses || []).some((m) => Math.abs(m.o) > 0.5 || Math.abs(m.r) > 0.5 || Math.abs(m.f) > 0.5);
  },

  mlNum(v) {
    const n = Number(v) || 0;
    const x = this.escala === "milhoes" ? n / 1000000 : n;
    return x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  mlPct(o, b) {
    if (Math.abs(o) < 0.5) return "—";
    return ((b - o) / Math.abs(o) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  },

  fatiaMl(meses, id, sel) {
    if (id === "acum") {
      let o = 0;
      let b = 0;
      for (let i = 0; i < sel - 1; i++) { o += meses[i].o; b += meses[i].r; }
      return { a: o, b: b, futuro: false };
    }
    const i = Number(id) - 1;
    if (i < 0 || i > 11) return { a: 0, b: 0, futuro: false };
    if (i + 1 > sel) return { a: meses[i].o, b: meses[i].f, futuro: true };
    return { a: meses[i].o, b: meses[i].r, futuro: false };
  },

  totaisMl(meses, sel) {
    let oAno = 0;
    let real = 0;
    let com = 0;
    for (let i = 0; i < 12; i++) {
      oAno += meses[i].o;
      if (i + 1 <= sel) { real += meses[i].r; com += meses[i].r; }
      else com += meses[i].f;
    }
    return { oAno: oAno, real: real, com: com };
  },

  caixaHtml() {
    const ano = this.anoBase();
    const sel = Number(this.mes) || 1;
    const mesOpts = this.MESES.map((nome, i) => `<option value="${i + 1}"${i + 1 === sel ? " selected" : ""}>${nome}</option>`).join("");
    const realOn = this.escala !== "milhoes";
    const seg = (on, rotulo, acao) => `<button type="button" class="${on ? "is-on" : ""}" onclick="${acao}">${rotulo}</button>`;
    const barra = `<div class="rcx-toolbar">
      <label class="rcx-field">Competência
        <select class="rcx-select" onchange="ResultadoCaixaApp.setMes(this.value)">${mesOpts}</select>
        <span class="rcx-ml-ano">${ano}</span>
      </label>
      <div class="rcx-escala" role="group">
        ${seg(realOn, "R$", "ResultadoCaixaApp.setEscala('real')")}
        ${seg(!realOn, "R$ milhões", "ResultadoCaixaApp.setEscala('milhoes')")}
      </div>
      <button type="button" class="rcx-arq-btn" onclick="ResultadoCaixaApp.carregarMl(true)">Atualizar</button>
    </div>
    <p class="rcx-ajuda">Moura Leite, exercício ${ano}. Até ${this.MESES[sel - 1]} o realizado sai da API. O acumulado anterior compara o orçado dos relatórios com esse realizado. Os meses seguintes comparam o orçado com o forecast.</p>`;
    if (this.mlLendo) return barra + this.loaderHtml();
    if (this.mlErro) return barra + `<div class="rcx-erro">${caixaEsc(this.mlErro)}</div>`;
    const dados = this.mlDados;
    if (!dados) return barra;
    const avisos = [];
    if (!dados.temArquivo) avisos.push("Ainda não há relatório orçado da Moura Leite neste exercício.");
    if (sel < 12 && !dados.temForecast) avisos.push("Sem forecast: os meses seguintes ficam só com o orçado.");
    const cols = [];
    if (sel > 1) cols.push({ id: "acum", nome: "Acumulado jan–" + this.MESES[sel - 2].toLowerCase(), futuro: false });
    cols.push({ id: String(sel), nome: this.MESES[sel - 1], futuro: false });
    for (let m = sel + 1; m <= 12; m++) cols.push({ id: String(m), nome: this.MESES[m - 1], futuro: true });
    const tom = (c) => c.futuro ? " is-futuro" : "";
    const head1 = cols.map((c, i) => `<th colspan="${c.futuro ? 2 : 4}" class="rcx-ml-grupo${tom(c)}${i ? " is-sep" : ""}"><button type="button" class="rcx-ml-abre${this.mlFatia === c.id ? " is-on" : ""}" onclick="ResultadoCaixaApp.toggleFatia('${c.id}')">${caixaEsc(c.nome)}</button></th>`).join("");
    const head2 = cols.map((c, i) => {
      const sep = i ? " is-sep" : "";
      const cor = tom(c);
      return c.futuro
        ? `<th class="${sep}${cor}">Orçado</th><th class="${cor}">Forecast</th>`
        : `<th class="${sep}${cor}">Orçado</th><th class="${cor}">Realizado</th><th class="${cor}">Var. %</th><th class="${cor}">Var. R$</th>`;
    }).join("");
    const cel = (v, cls) => `<td class="${cls || ""}">${this.mlNum(v)}</td>`;
    const bloco = (meses) => {
      const pedacos = cols.map((c, i) => {
        const f = this.fatiaMl(meses, c.id, sel);
        const sep = i ? "is-sep" : "";
        if (c.futuro) return cel(f.a, sep) + cel(f.b, "is-fc");
        const neg = (f.b - f.a) < -0.5 ? "is-neg" : "";
        return cel(f.a, sep) + cel(f.b) + `<td>${this.mlPct(f.a, f.b)}</td>` + cel(f.b - f.a, neg);
      }).join("");
      const t = this.totaisMl(meses, sel);
      return pedacos + cel(t.oAno, "is-tot is-sep") + cel(t.real, "is-tot") + cel(t.com, "is-tot");
    };
    const abertos = this.mlAbertos || {};
    const linhas = [];
    let ocultar = -1;
    (dados.linhas || []).forEach((linha) => {
      if (ocultar >= 0 && linha.level > ocultar) return;
      ocultar = -1;
      if (!this.mlVisivel(linha)) return;
      const aberto = !!abertos[linha.id];
      const temPlano = !linha.hasKids && (linha.planos || []).length > 0;
      if (linha.hasKids && !aberto) ocultar = linha.level;
      const nome = (linha.hasKids || temPlano)
        ? `<button type="button" class="rcx-ml-no" onclick="ResultadoCaixaApp.toggleNoMl('${linha.id}')">${aberto ? "▾" : "▸"} ${caixaEsc(linha.nome)}</button>`
        : `<span class="rcx-ml-no">${caixaEsc(linha.nome)}</span>`;
      linhas.push(`<tr class="is-n${linha.level}${linha.tipo === "formula" ? " is-formula" : ""}"><th>${nome}</th>${bloco(linha.meses)}</tr>`);
      if (!(aberto && temPlano)) return;
      (linha.planos || []).forEach((p) => {
        const pid = linha.id + "||" + p.code;
        const pAberto = !!abertos[pid];
        const temCc = (p.ccs || []).length > 0;
        const rotulo = p.code + (p.nome && p.nome !== p.code ? " - " + p.nome : "");
        const nomeP = temCc
          ? `<button type="button" class="rcx-ml-no" onclick="ResultadoCaixaApp.toggleNoMl('${pid}')">${pAberto ? "▾" : "▸"} ${caixaEsc(rotulo)}</button>`
          : `<span class="rcx-ml-no">${caixaEsc(rotulo)}</span>`;
        linhas.push(`<tr class="is-plano"><th>${nomeP}</th>${bloco(p.meses)}</tr>`);
        if (!pAberto) return;
        (p.ccs || []).forEach((cc) => {
          const bruto = String(cc.nome || "").trim();
          const rotuloCc = !bruto || bruto === cc.id ? cc.id : (bruto.indexOf(String(cc.id)) === 0 ? bruto : cc.id + " — " + bruto);
          linhas.push(`<tr class="is-cc"><th><span class="rcx-ml-no">${caixaEsc(rotuloCc)}</span></th>${bloco(cc.meses)}</tr>`);
        });
      });
    });
    const span = cols.reduce((s, c) => s + (c.futuro ? 2 : 4), 0) + 4;
    let painel = "";
    if (this.mlFatia) {
      const col = cols.find((c) => c.id === this.mlFatia);
      const mapa = {};
      (dados.linhas || []).filter((l) => l.tipo !== "formula" && !l.hasKids).forEach((l) => {
        Object.keys(l.ccs || {}).forEach((id) => {
          const cc = l.ccs[id];
          const alvo = mapa[id] || (mapa[id] = { nome: cc.nome || id, meses: this.bagMes() });
          this.somaMeses(alvo.meses, cc.meses);
        });
      });
      const corpoCc = Object.keys(mapa).map((id) => ({ id: id, nome: mapa[id].nome, fatia: this.fatiaMl(mapa[id].meses, this.mlFatia, sel) }))
        .filter((r) => Math.abs(r.fatia.a) > 0.5 || Math.abs(r.fatia.b) > 0.5)
        .sort((a, b) => Math.abs(b.fatia.b) - Math.abs(a.fatia.b))
        .map((r) => `<tr><td>${caixaEsc(r.id)} ${caixaEsc(r.nome)}</td>${cel(r.fatia.a)}${cel(r.fatia.b)}<td>${this.mlPct(r.fatia.a, r.fatia.b)}</td>${cel(r.fatia.b - r.fatia.a, (r.fatia.b - r.fatia.a) < -0.5 ? "is-neg" : "")}</tr>`)
        .join("");
      painel = `<h3 class="rcx-ml-tit">${caixaEsc(col ? col.nome : "")} por centro de custo</h3>
        <div class="rcx-ml-scroll"><table class="rcx-ml">
          <thead><tr><th>Centro de custo</th><th>${col && col.futuro ? "Orçado" : "Orçado"}</th><th>${col && col.futuro ? "Forecast" : "Realizado"}</th><th>Var. %</th><th>Var. R$</th></tr></thead>
          <tbody>${corpoCc || `<tr><td colspan="5">Nenhum centro de custo com valor neste período.</td></tr>`}</tbody>
        </table></div>`;
    }
    const escolhidas = new Set(this.mlSelecionadas(dados).map(String));
    const contasOrd = (dados.contas || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt"));
    const checks = contasOrd.map((c) => {
      const on = escolhidas.has(String(c.numero));
      const ruim = !this.contaCorrenteMl(c);
      return `<label class="rcx-ml-conta${ruim ? " is-fora" : ""}"><input type="checkbox" ${on ? "checked" : ""} onchange="ResultadoCaixaApp.toggleContaMl('${caixaEsc(c.numero)}', this.checked)"> <b>${caixaEsc(c.numero)}</b> ${caixaEsc(c.nome)}</label>`;
    }).join("");
    const contasSel = (dados.contas || []).filter((c) => escolhidas.has(String(c.numero)));
    const abertura = contasSel.reduce((s, c) => s + (Number(c.abertura) || 0), 0);
    const varOrc = (dados.linhas || []).find((l) => l.id === "g_12");
    const celS = (v) => cel(v, Number(v) < -0.5 ? "is-neg" : "");
    const snaps = [];
    let iniO = abertura;
    let iniR = abertura;
    for (let m = 1; m <= sel; m++) {
      const o = varOrc && varOrc.meses ? (Number(varOrc.meses[m - 1].o) || 0) : 0;
      const r = (dados.movimentos || []).filter((mv) => mv.mes === m && escolhidas.has(String(mv.conta))).reduce((s, mv) => s + mv.valor, 0);
      const fimO = iniO + o;
      const fimR = iniR + r;
      snaps.push({ nome: this.MESES[m - 1], iniO: iniO, iniR: iniR, fimO: fimO, fimR: fimR, varO: fimO - iniO, varR: fimR - iniR });
      iniO = fimO;
      iniR = fimR;
    }
    const atual = snaps[snaps.length - 1] || { iniO: abertura, iniR: abertura, fimO: abertura, fimR: abertura, varO: 0, varR: 0, nome: "" };
    const par = (a, b) => celS(a) + celS(b);
    const trilha = snaps.map((s) => `<th colspan="2">${s.nome}</th>`).join("");
    const trilhaSub = snaps.map(() => `<th>Orçado</th><th>Realizado</th>`).join("");
    const linhaSnap = (rotulo, chaveO, chaveR) => `<tr class="is-formula"><th>${rotulo}</th>${snaps.map((s) => par(s[chaveO], s[chaveR])).join("")}</tr>`;
    const caixaContas = `<h3 class="rcx-ml-tit">Variação de caixa · ${caixaEsc(atual.nome)}/${ano}</h3>
      <div class="rcx-ml-scroll"><table class="rcx-ml rcx-ml-var">
        <thead><tr><th></th><th>Orçado</th><th>Realizado</th></tr></thead>
        <tbody>
          <tr class="is-formula"><th>Saldo inicial</th>${par(atual.iniO, atual.iniR)}</tr>
          <tr class="is-formula"><th>Saldo final</th>${par(atual.fimO, atual.fimR)}</tr>
          <tr class="is-formula"><th>Variação</th>${par(atual.varO, atual.varR)}</tr>
        </tbody>
      </table></div>
      <p class="rcx-ajuda">Variação = saldo final − saldo inicial. O saldo inicial de janeiro é o caixa das contas correntes em 01/01. O orçado soma a linha 12 do DFC. O realizado soma o extrato das contas marcadas.</p>
      <div class="rcx-ml-scroll"><table class="rcx-ml">
        <thead><tr><th>Mês</th>${trilha}</tr><tr><th></th>${trilhaSub}</tr></thead>
        <tbody>
          ${linhaSnap("Saldo inicial", "iniO", "iniR")}
          ${linhaSnap("Saldo final", "fimO", "fimR")}
          ${linhaSnap("Variação", "varO", "varR")}
        </tbody>
      </table></div>
      <details class="rcx-ml-contas">
        <summary>Contas correntes do saldo <span class="rcx-qtd">${contasSel.length}</span></summary>
        <div class="rcx-ml-checks">${checks || `<span class="rcx-muted">Nenhuma conta corrente da empresa 1 voltou da API.</span>`}</div>
      </details>`;
    return `${barra}
      ${avisos.map((t) => `<div class="rcx-aviso">${caixaEsc(t)}</div>`).join("")}
      <div class="rcx-ml-scroll"><table class="rcx-ml">
        <thead>
          <tr><th>Conta</th>${head1}<th colspan="3" class="rcx-ml-grupo is-ano is-sep">Total do ano</th></tr>
          <tr><th></th>${head2}<th class="is-sep is-ano">Orçado</th><th class="is-ano">Realizado</th><th class="is-ano">Com forecast</th></tr>
        </thead>
        <tbody>${linhas.join("") || `<tr><td colspan="${span}">Sem linhas da visão DFC.</td></tr>`}</tbody>
      </table></div>
      ${painel}
      ${caixaContas}`;
  },

  render() {
    const root = document.getElementById("resultado-caixa-root");
    if (!root) return;
    const aba = this.aba || "entradas";
    const tab = (id, label, icon) => `<button type="button" role="tab" aria-selected="${aba === id}" class="ml-tab${aba === id ? " is-active" : ""}" onclick="ResultadoCaixaApp.setAba('${id}')"><i data-lucide="${icon}"></i> ${label}</button>`;
    let corpo = "";
    try {
      corpo = aba === "caixa" ? this.caixaHtml() : this.orcamentoHtml(aba);
    } catch (e) {
      console.error("[Resultado de caixa]", e);
      const msg = String((e && e.message) || e || "erro ao montar a tela");
      corpo = `<div class="rcx-erro">${msg.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]))}</div>`;
    }
    root.innerHTML = `
      <div class="rcx-page">
        <div class="ml-tabs rcx-tabs" role="tablist">
          ${tab("entradas", "Entradas", "trending-up")}
          ${tab("saidas", "Saídas", "trending-down")}
          ${tab("caixa", "Caixa ML", "landmark")}
        </div>
        ${corpo}
      </div>`;
    if (window.lucide) lucide.createIcons();
    if (this.dfcLendo || this.lendo || this.loading || this.mlLendo) this.iniciarCarga(false);
    else this.pararCarga();
  }
};

window.ResultadoCaixaApp = ResultadoCaixaApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "resultado-caixa") ResultadoCaixaApp.init();
});
