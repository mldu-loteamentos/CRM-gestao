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
  SOLTOS: { "14703": 1, "14704": 1, "14304": 1, "14305": 1 },
  dfcLinhas: [],
  dfcLendo: false,
  dfcErro: "",

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
    this.render();
    if (this.aba === "posicao" && !this.rows.length && !this.loading) this.refresh();
    if (!this._nuvemPedida) {
      this._nuvemPedida = true;
      this.carregarNuvem();
    }
  },

  setAba(id) {
    const prox = id || "entradas";
    if (prox !== this.aba) this.outrosAberto = false;
    this.aba = prox;
    this.render();
    if (this.aba === "posicao" && !this.dates.length && !this.loading) this.refresh();
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
    try {
      this.forecast = JSON.parse(localStorage.getItem("rc_forecast_v1") || "null");
    } catch (e) {
      this.forecast = null;
    }
  },

  /** Relatório "Orçamento Empresarial Agrupado" do Sienge, por centro de custo, mensal. Guarda só as contas analíticas (tipo R). */
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
      if (!cc || !meses.length || !/^\d+(\.\d+)*$/.test(c0)) return;
      if (tipoCol >= 0 && txt(r[tipoCol]).toUpperCase() !== "R") return;
      const bag = contas[cc.id] || (contas[cc.id] = {});
      nomes[cc.id] = cc.nome;
      const conta = bag[c0] || (bag[c0] = { nome: txt(r[1]), meses: {} });
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

  async subirForecast(input) {
    const file = input && input.files ? input.files[0] : null;
    if (!file) return;
    if (typeof XLSX === "undefined") {
      this.error = "A biblioteca de Excel não carregou. Atualize a página.";
      this.render();
      return;
    }
    this.lendo = true;
    this.error = "";
    this.render();
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const f = this.lerForecast(wb);
      const ccs = Object.keys(f.contas);
      if (!ccs.length) throw new Error("Não reconheci o forecast em " + file.name + ". Use o relatório Orçamento Empresarial Agrupado por centro de custo, com periodicidade mensal.");
      const yms = new Set();
      ccs.forEach((id) => Object.keys(f.contas[id]).forEach((c) => Object.keys(f.contas[id][c].meses).forEach((ym) => yms.add(ym))));
      this.forecast = { arquivo: file.name, em: new Date().toISOString(), meses: Array.from(yms).sort(), contas: f.contas, nomes: f.nomes };
      try {
        localStorage.setItem("rc_forecast_v1", JSON.stringify(this.forecast));
      } catch (e) {
        this.error = "O forecast foi lido, mas não coube no navegador para ficar salvo. Ele vale até fechar a página.";
      }
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.lendo = false;
    if (input) input.value = "";
    this.render();
  },

  removerForecast() {
    this.forecast = null;
    try { localStorage.removeItem("rc_forecast_v1"); } catch (e) {}
    this.render();
  },

  /** Forecast das entradas por mês do ano: contas do relatório passadas pela visão DFC (01 + 09.01), no % Moura Leite quando agrupado. */
  forecastEntradas(ano) {
    const f = this.forecast;
    const out = {};
    if (!f || !f.contas) return out;
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
    const aceita = this.noAceito("entradas");
    Object.keys(f.contas).forEach((cc) => {
      const fator = this.agrupar ? this.pctMl(cc) : 1;
      Object.keys(f.contas[cc]).forEach((code) => {
        let entra;
        if (mapa) {
          const node = this.noDaConta(FC, mapa, code);
          entra = !!(node && aceita(node.id));
        } else {
          entra = /^1\.0[123](\.|$)/.test(code);
        }
        if (!entra) return;
        const sinal = code.charAt(0) === "2" ? -1 : 1;
        const meses = f.contas[cc][code].meses || {};
        Object.keys(meses).forEach((ym) => {
          if (Number(ym.slice(0, 4)) !== Number(ano)) return;
          const mm = Number(ym.slice(5, 7));
          out[mm] = (out[mm] || 0) + sinal * (Number(meses[ym]) || 0) * fator;
        });
      });
    });
    return out;
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
    const id = String(ccId || "").replace(/\D/g, "");
    if (!id) return 0;
    let found = 0;
    Object.keys(this.anos || {}).forEach((y) => {
      const a = this.anos[y];
      if (!a || !a.arquivos) return;
      Object.keys(a.arquivos).forEach((nome) => {
        const arq = a.arquivos[nome];
        if (!arq) return;
        const tem = (arq.entradas && arq.entradas[id]) || (arq.contasPorCc && arq.contasPorCc[id]);
        if (!tem) return;
        const emp = Number(arq.empresa) || this.empresaId(nome);
        if (emp) found = emp;
      });
    });
    return found;
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
      ["ARACARI SPE", 6],
      ["TERRA DO ARACARI", 3],
      ["TERRAS DE ITU", 4],
      ["VERCELLINO", 13],
      ["PIRAPITINGUI", 14],
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
      { id: "obras", nome: "OBRAS", codigos: ["04.03"], filhos: /^04\.03\./, nodes: ["g_04_03"], destaque: true },
      { id: "repasses", nome: "REPASSES TERRENISTAS", codigos: ["04.01"], filhos: /^04\.01\./, nodes: ["g_04_01"], destaque: true },
      { id: "pessoal", nome: "PESSOAL", codigos: ["05.04"], filhos: /^05\.04\./, nodes: ["g_05_04"], destaque: true },
      { id: "impostos", nome: "IMPOSTOS", codigos: ["02"], filhos: /^02\./, nodes: ["g_02_01", "g_02_02"], destaque: true },
      { id: "administrativas", nome: "ADMINISTRATIVAS", codigos: ["05.03"], filhos: /^05\.03\./, nodes: ["g_05_03"], destaque: true },
      { id: "cancelamentos", nome: "CANCELAMENTOS DE VENDAS", codigos: ["01.04"], filhos: /^01\.04\./, nodes: ["g_01_04"], destaque: true },
      { id: "aquisicao", nome: "AQUISIÇÃO DE NOVAS ÁREAS", codigos: ["04.05"], filhos: /^04\.05\./, nodes: ["g_04_05"], destaque: true },
      { id: "dividendos", nome: "DIVIDENDOS E APORTES", codigos: ["11.01", "11.02"], filhos: /^11\.0[12]\./, pai: "11", nodes: ["g_11_01", "g_11_02"] },
      { id: "aportes", nome: "APORTES", codigos: ["11.03"], filhos: /^11\.03\./, nodes: ["g_11_03"] },
      { id: "marketing", nome: "MARKETING", codigos: ["05.02"], filhos: /^05\.02\./, nodes: ["g_05_02"] },
      { id: "projetos", nome: "PROJETOS E APROVAÇÕES", codigos: ["04.02"], filhos: /^04\.02\./, nodes: ["g_04_02"] },
      { id: "naoop", nome: "DESPESAS NAO OPERACIONAIS", codigos: ["05.06"], filhos: /^05\.06\./, nodes: ["g_05_06"] },
      { id: "comerciais", nome: "DESPESAS COMERCIAIS", codigos: ["05.01"], filhos: /^05\.01\./, nodes: ["g_05_01"] },
      { id: "estoque", nome: "DESPESAS COM ESTOQUE", codigos: ["05.05"], filhos: /^05\.05\./, nodes: ["g_05_05"] },
      { id: "financeiras", nome: "DESPESAS FINANCEIRAS", codigos: ["09.02"], filhos: /^09\.02\./, nodes: ["g_09_02"] },
      { id: "capex", nome: "CAPEX", codigos: ["07"], filhos: /^07\./, nodes: ["g_07"] },
      { id: "donativos", nome: "DONATIVOS E CONTRIBUIÇÕES", codigos: ["05.07"], filhos: /^05\.07\./, nodes: ["g_05_07"] },
      { id: "custoadm", nome: "CUSTO ADM DE EMPREENDIMENTOS", codigos: ["04.04"], filhos: /^04\.04\./, nodes: ["g_04_04"] },
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
    if (!node && plano && typeof plano.suggestGroup === "function") {
      const gid = plano.suggestGroup({ id: linha.code, name: linha.nome || "" });
      if (gid) node = this.noPorId(gid);
    }
    if (!node && plano && typeof plano.lookupDfcByCode === "function") {
      const gid = plano.lookupDfcByCode(linha.code);
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
      (l.months || []).forEach((m) => {
        const cel = porCodigo[cod].months[m.ym] || { ym: m.ym, orc: 0, real: 0 };
        cel.orc += sinal(m.orc);
        cel.real += sinal(m.real);
        porCodigo[cod].months[m.ym] = cel;
      });
    });
    const out = Object.keys(porCodigo).map((c) => ({
      code: c,
      nome: porCodigo[c].nome,
      months: Object.keys(porCodigo[c].months).map((ym) => porCodigo[c].months[ym])
    }));
    return { linhas: out, fora: fora };
  },

  aplicarBlocos(nomeArquivo, blocos) {
    const fora = [];
    const prontos = (blocos || []).map((b) => {
      const conv = this.paraVisao(b.linhas);
      (conv.fora || []).forEach((item) => { if (fora.indexOf(item) < 0) fora.push(item); });
      return { id: b.id, nome: b.nome, linhas: conv.linhas };
    }).filter((b) => b.linhas.length);
    if (!prontos.length) throw new Error("Nenhuma conta de " + nomeArquivo + " entrou na visão DFC.");
    const porAno = {};
    const slot = (ano) => {
      if (!porAno[ano]) porAno[ano] = { entradas: {}, contas: {}, contasPorCc: {} };
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
    return { entradas: entradas, contas: contas, contasPorCc: contasPorCc };
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
    const sid = String(id || "").trim();
    const nk = FC.normAccountKey(sid);
    const dotted = FC.formatAccountCode(sid);
    const nid = mapa.accToNode[sid] || (nk && mapa.accToNode[nk]) || (dotted && mapa.accToNode[dotted]) || "";
    return nid ? mapa.nodes[nid] : null;
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
    this.montarVista();
    this._dfcKey = "";
    this._dfcPedido = "";
    this.render();
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
    const qtdArq = [atual, antN].reduce((s, y) => {
      const a = y ? this.anoDados(y) : null;
      return s + (a ? Object.keys(a.arquivos || {}).length : 0);
    }, 0) + (this.forecast ? 1 : 0);
    const fcMeses = this.forecast && Array.isArray(this.forecast.meses) && this.forecast.meses.length
      ? this.forecast.meses.map((ym) => (this.MESES[Number(ym.slice(5, 7)) - 1] || "") + "/" + ym.slice(0, 4))
      : [];
    const fcPeriodo = fcMeses.length ? (fcMeses.length > 1 ? fcMeses[0] + " a " + fcMeses[fcMeses.length - 1] : fcMeses[0]) : "";
    const chipForecast = this.forecast
      ? `<span class="rcx-arq" title="${caixaEsc(this.forecast.arquivo || "")}">${caixaEsc(this.forecast.arquivo || "forecast")}${fcPeriodo ? " · " + caixaEsc(fcPeriodo) : ""} <button type="button" onclick="ResultadoCaixaApp.removerForecast()">tirar</button></span>`
      : `<span class="rcx-muted">Nenhum forecast. Use Subir forecast na aba Entradas.</span>`;
    const agrupa = this.agrupar ? " Com “% Moura Leite”, cada valor está no percentual da Moura Leite cadastrado na empresa." : "";
    const mesNomeFaixa = nomesMes[(Number(this.mes) || 1) - 1] || "";
    const base = "Orçado e realizado de " + (atual || "—") + " vêm do arquivo enviado para " + mesNomeFaixa + ". A coluna do ano anterior é o realizado do arquivo de " + (antN || "o ano anterior") + ", o mesmo em todos os meses.";
    const nota = lado === "entradas"
      ? base + " Livia, Livia I e Livia II aparecem como Central Parque. Empreendimentos com o mesmo nome ganham a sigla da cidade. MLDU aparece como Corporativo. Os quatro maiores desvios positivos e os quatro negativos do acumulado ficam à vista; o restante abre ao clicar em Outros."
        + " No gráfico de linhas, a linha do ano atual é o realizado até o mês escolhido e o Forecast segue com a projeção do relatório de forecast até dezembro, pelas mesmas contas da visão DFC (Receitas e receitas financeiras)." + agrupa
      : base + " As saídas seguem as contas do DFC e aparecem como saída. Gastar acima do orçado fica em vermelho. As contas de fora da lista principal abrem em Outros." + agrupa;
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
          ${lado === "entradas" ? `<label class="rcx-arq-btn rcx-fc-btn" title="Relatório Orçamento Empresarial Agrupado por centro de custo, mensal">
            <i data-lucide="trending-up"></i> ${this.forecast ? "Trocar forecast" : "Subir forecast"}
            <input type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange="ResultadoCaixaApp.subirForecast(this)">
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

  /** Cartões do mês, do acumulado e do ano anterior, acima da tabela. */
  resumoHtml(total, totalA, saida) {
    const atual = this.anoAtual();
    const antN = atual > 1900 ? atual - 1 : 0;
    const mesNome = this.MESES[(Number(this.mes) || 1) - 1] || "";
    const unidade = this.escala === "milhoes" ? "R$ mi" : "R$";
    const varTxt = (real, ref) => {
      const v = real - ref;
      const ruim = saida ? v > 0.5 : v < -0.5;
      const bom = saida ? v < -0.5 : v > 0.5;
      const p = this.pct(real, ref);
      const pTxt = p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
      return `<span class="rcx-kpi-var ${ruim ? "is-neg" : (bom ? "is-pos" : "")}">${v > 0.5 ? "+" : ""}${this.fmt(v)} · ${pTxt}</span>`;
    };
    const card = (rotulo, valor, sub) => `<div class="rcx-kpi">
      <span class="rcx-kpi-label">${rotulo}</span>
      <strong>${this.fmt(valor)} <small>${unidade}</small></strong>
      <div class="rcx-kpi-sub">${sub}</div>
    </div>`;
    return `<div class="rcx-kpis">
      ${card(`Realizado em ${mesNome}/${atual || ""}`, total.real, `Orçado ${this.fmt(total.orc)} ${varTxt(total.real, total.orc)}`)}
      ${card(`Acumulado até ${mesNome}/${atual || ""}`, totalA.real, `Orçado ${this.fmt(totalA.orc)} ${varTxt(totalA.real, totalA.orc)}`)}
      ${card(`Acumulado ${antN || "ano anterior"}`, totalA.ant, this.dfcLendo ? "Carregando…" : `${atual || "Atual"} × ${antN || "anterior"} ${varTxt(totalA.real, totalA.ant)}`)}
    </div>`;
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
      <div class="rcx-graf-tit">${caixaEsc(mesNome.toUpperCase())}/${atual || ""}</div>
      <div class="rcx-graf-area">
        ${barras.map((b) => {
          const h = b.espera ? 0 : Math.max(0, b.valor) / maior * 100;
          return `<div class="rcx-graf-col ${b.cls}">
            <span class="rcx-graf-val">${b.espera ? "…" : this.fmt(b.valor)}</span>
            <div class="rcx-graf-bar" style="height:calc((100% - 22px) * ${(h / 100).toFixed(4)})"></div>
          </div>`;
        }).join("")}
      </div>
      <div class="rcx-graf-eixo">${barras.map((b) => `<span>${caixaEsc(b.rotulo)}</span>`).join("")}</div>
    </div>`;
  },

  /** Totais do ano em colunas empilhadas: a parte escura vai de janeiro até o mês escolhido e a clara segue até dezembro. */
  graficoTotaisHtml() {
    const s = this.serieEntradas();
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
      <div class="rcx-graf-tit">TOTAIS/${ano || ""}</div>
      <div class="rcx-graf-area rcx-tot-area">
        ${colunas.map((c) => `<div class="rcx-graf-col ${c.cls}">
          <span class="rcx-graf-val">${this.fmt(c.total)}${c.marca ? " *" : ""}</span>
          <div class="rcx-tot-pilha" style="height:calc((100% - 22px) * ${(c.total / maior).toFixed(4)})" title="${caixaEsc(c.rotulo)}: ${this.fmt(c.escuro)} até ${mesCurto} + ${this.fmt(c.claro)} até dezembro">
            ${pedaco(c.claro, c.total, "is-claro")}${pedaco(c.escuro, c.total, "is-escuro")}
          </div>
        </div>`).join("")}
      </div>
      <div class="rcx-graf-eixo">${colunas.map((c) => `<span>${caixaEsc(c.rotulo)}</span>`).join("")}</div>
      <div class="rcx-tot-nota">${caixaEsc(nota)}</div>
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
      if (!this.forecast) return null;
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

  passoEixo(bruto) {
    if (!(bruto > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(bruto)));
    const n = bruto / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  },

  graficoLinhasHtml() {
    const s = this.serieEntradas();
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
      grade.push(`<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="rcx-ln-grade"></line><text x="${L - 6}" y="${yy}" class="rcx-ln-eixo-y">${eixoTxt(t)}</text>`);
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
      <svg viewBox="0 0 ${W} ${H}" class="rcx-ln-svg" role="img" aria-label="Entradas por mês: ano anterior, orçado, realizado e forecast">
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
      + `<div class="rcx-topo">${this.graficoMesHtml(total)}${this.graficoLinhasHtml()}${this.graficoTotaisHtml()}</div>`
      + this.gradeHtml("Produto", corpo, total, totalA, false);
  },

  saidasHtml() {
    const ano = this.anoAtual();
    if (this.semContas(ano)) {
      return `<p class="rcx-vazio">O arquivo que já estava salvo não guarda as contas. Suba de novo os Excel — pode escolher vários de uma vez — para montar Obras, Repasses, Pessoal e as demais.</p>`;
    }
    const pack = this.linhasSaida();
    const vivo = (r) => ["mensal", "acum"].some((b) => ["ant", "orc", "real"].some((k) => Math.abs(r[b][k]) > 0.5));
    const porAcumReal = (a, b) => b.acum.real - a.acum.real || a.nome.localeCompare(b.nome, "pt");
    const destaque = pack.rows.filter((r) => r.destaque).sort(porAcumReal);
    const miudos = pack.rows.filter((r) => !r.destaque && vivo(r)).sort(porAcumReal);
    let corpo = this.secaoHtml("list", "Principais contas") + destaque.map((r) => this.linhaPronta(r, "", "", "", true)).join("");
    if (miudos.length) {
      const soma = { nome: "Outros", mensal: this.somaBloco(miudos, "mensal"), acum: this.somaBloco(miudos, "acum") };
      corpo += this.linhaPronta(soma, "rcx-outros", this.outrosNome(miudos.length), "ResultadoCaixaApp.toggleOutros()", true);
      if (this.outrosAberto) corpo += miudos.map((r) => this.linhaPronta(r, "rcx-filho", "", "", true)).join("");
    }
    const todos = destaque.concat(miudos);
    const total = this.somaBloco(todos, "mensal");
    const totalA = this.somaBloco(todos, "acum");
    return this.resumoHtml(total, totalA, true) + this.gradeHtml("Conta", corpo, total, totalA, true, true);
  },

  async refresh() {
    this.loading = true;
    this.error = "";
    this.render();
    try {
      this.dates = await CaixaPosicaoStore.listDates();
      this.rows = await CaixaPosicaoStore.loadDate(this.date);
      this.compare = this.compareDate ? await CaixaPosicaoStore.loadDate(this.compareDate) : [];
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.loading = false;
    this.render();
  },

  async gravarHoje() {
    this.saving = true;
    this.error = "";
    this.render();
    try {
      const units = await CaixaPosicaoStore.loadEstoqueUnits();
      const today = (window.EstoqueComercialApp && typeof EstoqueComercialApp.todayStr === "function")
        ? EstoqueComercialApp.todayStr()
        : new Date().toISOString().slice(0, 10);
      await CaixaPosicaoStore.saveFromUnits(units, today);
      this.date = today;
      await this.refresh();
    } catch (e) {
      this.error = e.message || String(e);
      this.saving = false;
      this.render();
    }
  },

  sum(list, k) {
    return (list || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  },

  posicaoHtml() {
    const rec = this.sum(this.rows, "rec");
    const ven = this.sum(this.rows, "ven");
    const av = this.sum(this.rows, "av");
    const vp = this.sum(this.rows, "vp");
    const rec2 = this.sum(this.compare, "rec");
    const ven2 = this.sum(this.compare, "ven");
    const av2 = this.sum(this.compare, "av");
    const vp2 = this.sum(this.compare, "vp");
    const dateOpts = this.dates.map((d) => `<option value="${d}" ${d === this.compareDate ? "selected" : ""}>${caixaFmtDate(d)}</option>`).join("");
    const body = this.rows.slice(0, 400).map((r) => `
      <tr>
        <td>${caixaEsc(r.cc)} / ${caixaEsc(r.un)}</td>
        <td>${caixaEsc(r.nome || "—")}</td>
        <td>${caixaEsc(r.cpf || "—")}</td>
        <td style="text-align:right;">${caixaMoney(r.rec)}</td>
        <td style="text-align:right;">${caixaMoney(r.ven)}</td>
        <td style="text-align:right;">${caixaMoney(r.av)}</td>
        <td style="text-align:right;">${caixaMoney(r.vp)}</td>
        <td style="text-align:right;">${r.pmp} d</td>
      </tr>`).join("");
    return `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
        <label style="font-size:0.75rem;font-weight:700;color:#475569;">Posição
          <input type="date" value="${this.date}" onchange="ResultadoCaixaApp.date=this.value;ResultadoCaixaApp.refresh()"
            style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
        </label>
        <label style="font-size:0.75rem;font-weight:700;color:#475569;">Comparar com
          <select onchange="ResultadoCaixaApp.compareDate=this.value;ResultadoCaixaApp.refresh()"
            style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            <option value="">Nenhuma</option>${dateOpts}
          </select>
        </label>
        <button class="btn btn-primary" onclick="ResultadoCaixaApp.gravarHoje()" ${this.saving ? "disabled" : ""}>${this.saving ? "Gravando…" : "Gravar posição de hoje"}</button>
      </div>
      <p class="rcx-nota">Posição diária gravada: unidade, cliente, recebido, vencido, a vencer e valor presente.</p>
      ${this.error && this.aba === "posicao" ? `<div class="rcx-erro">${caixaEsc(this.error)}</div>` : ""}
      <div class="est-stock-kpis" style="margin-bottom:12px;">
        <div class="est-fin-card is-ok"><label>Recebido</label><strong>${caixaMoney(rec)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(rec2)}</small>` : ""}</div>
        <div class="est-fin-card is-warn"><label>Vencido</label><strong>${caixaMoney(ven)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(ven2)}</small>` : ""}</div>
        <div class="est-fin-card"><label>A vencer / a pagar</label><strong>${caixaMoney(av)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(av2)}</small>` : ""}</div>
        <div class="est-fin-card"><label>Valor presente</label><strong>${caixaMoney(vp)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(vp2)}</small>` : ""}</div>
      </div>
      ${this.loading ? `<p style="color:#64748b;">Carregando posição…</p>` : `
      <div class="table-container crm-scroll-table" style="max-height:52vh;background:#fff;border-radius:8px;">
        <table class="custom-table">
          <thead><tr>
            <th>Unidade</th><th>Cliente</th><th>CPF</th>
            <th>Recebido</th><th>Vencido</th><th>A vencer</th><th>Valor presente</th><th>PMP 3m</th>
          </tr></thead>
          <tbody>${body || `<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">Sem posição nesta data.</td></tr>`}</tbody>
        </table>
      </div>
      ${this.rows.length > 400 ? `<p style="font-size:0.8rem;color:#64748b;">Exibindo 400 de ${this.rows.length} contratos.</p>` : ""}`}
    `;
  },

  render() {
    const root = document.getElementById("resultado-caixa-root");
    if (!root) return;
    const aba = this.aba || "entradas";
    const tab = (id, label, icon) => `<button type="button" role="tab" aria-selected="${aba === id}" class="ml-tab${aba === id ? " is-active" : ""}" onclick="ResultadoCaixaApp.setAba('${id}')"><i data-lucide="${icon}"></i> ${label}</button>`;
    let corpo = "";
    try {
      corpo = aba === "posicao" ? this.posicaoHtml() : this.orcamentoHtml(aba);
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
          ${tab("posicao", "Posição", "scale")}
        </div>
        ${corpo}
      </div>`;
    if (window.lucide) lucide.createIcons();
    if (this.dfcLendo || this.lendo || this.loading) this.iniciarCarga(false);
    else this.pararCarga();
  }
};

window.ResultadoCaixaApp = ResultadoCaixaApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "resultado-caixa") ResultadoCaixaApp.init();
});
