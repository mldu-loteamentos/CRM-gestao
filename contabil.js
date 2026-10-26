/* Contábil · DRE e Balanço patrimonial a partir do balancete de verificação do Sienge. */
const ContabilApp = {
  state: {
    companies: [],
    selecionadas: [],
    empAberto: false,
    empBusca: "",
    de: "",
    ate: "",
    aba: "dre",
    carregando: false,
    progresso: 0,
    erro: "",
    avisos: [],
    linhas: [],
    arvore: [],
    abertos: {},
    buscou: false,
    dreVisao: "ano",
    serie: null,
    loadMsg: ""
  },

  esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  norm(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  },

  money(v) {
    const n = Number(v) || 0;
    const abs = Math.abs(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return n < -0.004 ? "(" + abs + ")" : abs;
  },

  mesAtual() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  },

  fimDoMes(ym) {
    const p = String(ym || "").split("-");
    const y = Number(p[0]);
    const m = Number(p[1]);
    if (!y || !m) return "";
    const dia = new Date(y, m, 0).getDate();
    return y + "-" + String(m).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 && p[0] ? p[2] + "/" + p[1] + "/" + p[0] : "";
  },

  init() {
    if (!this.state.de) this.state.de = this.mesAtual();
    if (!this.state.ate) this.state.ate = this.mesAtual();
    this.render();
    if (!this.state.companies.length) this.carregarEmpresas();
  },

  async carregarEmpresas() {
    try {
      const api = window.SiengeApiService;
      const res = api && api.getCompanies ? await api.getCompanies() : [];
      const lista = Array.isArray(res) ? res : ((res && res.results) || []);
      this.state.companies = lista.map((c) => ({
        id: String(c.id != null ? c.id : c.companyId),
        nome: String(c.tradeName || c.name || c.companyName || "").trim()
      })).filter((c) => c.id && c.id !== "undefined");
    } catch (e) {
      this.state.erro = "Não consegui carregar as empresas do Sienge.";
    }
    this.render();
  },

  itensEmpresa() {
    return this.state.companies.map((c) => ({ id: c.id, label: c.id + " - " + this.norm(c.nome) }));
  },

  empresasEscolhidas() {
    const ids = this.state.selecionadas.map(String);
    return this.state.companies.filter((c) => ids.includes(String(c.id)));
  },

  setMes(qual, valor) {
    this.state[qual === "ate" ? "ate" : "de"] = String(valor || "").slice(0, 7);
  },

  setAba(id) {
    this.state.aba = id === "balanco" ? "balanco" : "dre";
    this.render();
  },

  setVisao(id) {
    this.state.dreVisao = id === "comp" ? "comp" : "ano";
    this.render();
  },

  nomeMes(m) {
    return ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m)] || "";
  },

  chaveMes(ano, mes) {
    return Number(ano) + "-" + String(mes).padStart(2, "0");
  },

  mesesAte(ym) {
    const p = String(ym || "").split("-");
    const ano = Number(p[0]);
    const mes = Number(p[1]);
    if (!ano || !mes) return { ano: 0, meses: [] };
    const meses = [];
    for (let m = 1; m <= mes; m++) meses.push(m);
    return { ano: ano, meses: meses };
  },

  trimestresDo(meses) {
    const defs = [
      { nome: "1º tri", meses: [1, 2, 3] },
      { nome: "2º tri", meses: [4, 5, 6] },
      { nome: "3º tri", meses: [7, 8, 9] },
      { nome: "4º tri", meses: [10, 11, 12] }
    ];
    return defs.map((t) => ({ nome: t.nome, meses: t.meses.filter((m) => meses.indexOf(m) >= 0) })).filter((t) => t.meses.length);
  },

  toggleConta(codigo) {
    const k = String(codigo || "");
    if (k.indexOf("dre-") === 0) this.state.abertos[k] = this.state.abertos[k] === false;
    else this.state.abertos[k] = !this.state.abertos[k];
    this.render();
  },

  paintEmpresas() {
    const box = document.getElementById("ctb-emp-box");
    if (!box || !window.MlEmpresaFilter) return;
    box.innerHTML = MlEmpresaFilter.html({
      id: "ctb-emp",
      label: "Empresas",
      items: this.itensEmpresa(),
      selectedIds: this.state.selecionadas,
      open: this.state.empAberto,
      query: this.state.empBusca,
      emptyMeansAll: false
    });
    MlEmpresaFilter.bind("ctb-emp", {
      toggleOpen: () => {
        this.state.empAberto = !this.state.empAberto;
        this.paintEmpresas();
      },
      setQuery: (q) => {
        this.state.empBusca = q || "";
        const list = document.getElementById("ctb-emp-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: "ctb-emp",
            items: this.itensEmpresa(),
            selectedIds: this.state.selecionadas,
            query: this.state.empBusca
          });
        }
      },
      toggleId: (id, on) => {
        const sid = String(id);
        if (on) {
          if (!this.state.selecionadas.includes(sid)) this.state.selecionadas.push(sid);
        } else {
          this.state.selecionadas = this.state.selecionadas.filter((x) => x !== sid);
        }
        this.paintEmpresas();
      },
      selectAll: () => {
        this.state.selecionadas = this.state.companies.map((c) => String(c.id));
        this.paintEmpresas();
      },
      selectNone: () => {
        this.state.selecionadas = [];
        this.paintEmpresas();
      }
    });
    if (window.lucide) lucide.createIcons();
  },

  sinal(valor, tipo) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return 0;
    const t = String(tipo || "").trim().toUpperCase();
    if (t.indexOf("C") === 0) return -Math.abs(n);
    if (t.indexOf("D") === 0) return Math.abs(n);
    return n;
  },

  num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },

  lerLinha(raw) {
    if (!raw || typeof raw !== "object") return null;
    const conta = raw.account && typeof raw.account === "object" ? raw.account : null;
    const candidatos = [
      raw.accountCode, raw.accountNumber, raw.code,
      typeof raw.account === "string" ? raw.account : "",
      conta && (conta.code || conta.accountCode || conta.number),
      raw.accountId, conta && conta.id
    ];
    let codigo = "";
    candidatos.forEach((c) => {
      const s = String(c == null ? "" : c).trim();
      if (!s || codigo) return;
      if (s.indexOf(".") >= 0) codigo = s;
    });
    if (!codigo) {
      candidatos.some((c) => {
        const s = String(c == null ? "" : c).trim();
        if (!s) return false;
        codigo = s;
        return true;
      });
    }
    const nome = String(
      raw.accountName || (conta && (conta.name || conta.description || conta.accountName)) || raw.name || raw.description || ""
    ).trim();
    if (!codigo && !nome) return null;
    const deb = this.num(raw.debitBalance != null ? raw.debitBalance : raw.debit);
    const cred = this.num(raw.creditBalance != null ? raw.creditBalance : raw.credit);
    const movimento = Math.round((deb - cred) * 100) / 100;
    let saldo = null;
    if (raw.balance != null && raw.balance !== "") saldo = this.sinal(raw.balance, raw.balanceType);
    else if (raw.balanceCarriedForward != null && raw.balanceCarriedForward !== "") saldo = this.sinal(raw.balanceCarriedForward, raw.balanceCarriedForwardType || raw.balanceType);
    const ant = (raw.previousBalance != null && raw.previousBalance !== "") ? this.sinal(raw.previousBalance, raw.previousBalanceType) : null;
    if (saldo == null) saldo = Math.round(((ant || 0) + movimento) * 100) / 100;
    return { codigo: codigo || nome, nome: nome || codigo, deb: deb, cred: cred, movimento: movimento, saldo: saldo };
  },

  juntar(listas) {
    const mapa = new Map();
    (listas || []).forEach((lista) => {
      (lista || []).forEach((raw) => {
        const linha = this.lerLinha(raw);
        if (!linha) return;
        const atual = mapa.get(linha.codigo);
        if (!atual) {
          mapa.set(linha.codigo, linha);
          return;
        }
        atual.deb = Math.round((atual.deb + linha.deb) * 100) / 100;
        atual.cred = Math.round((atual.cred + linha.cred) * 100) / 100;
        atual.movimento = Math.round((atual.deb - atual.cred) * 100) / 100;
        atual.saldo = Math.round((atual.saldo + linha.saldo) * 100) / 100;
        if (linha.nome && linha.nome.length > atual.nome.length) atual.nome = linha.nome;
      });
    });
    return [...mapa.values()];
  },

  paiDe(codigo) {
    const p = String(codigo || "").split(".");
    if (p.length < 2) return "";
    return p.slice(0, -1).join(".");
  },

  compararCodigo(a, b) {
    const pa = String(a || "").split(".");
    const pb = String(b || "").split(".");
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      if (pa[i] == null) return -1;
      if (pb[i] == null) return 1;
      const na = Number(pa[i]);
      const nb = Number(pb[i]);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      const cmp = String(pa[i]).localeCompare(String(pb[i]), "pt-BR", { numeric: true });
      if (cmp) return cmp;
    }
    return 0;
  },

  montarArvore(linhas) {
    const nos = new Map();
    (linhas || []).forEach((l) => {
      nos.set(l.codigo, {
        codigo: l.codigo, nome: l.nome, veioDaApi: true,
        saldo: l.saldo, movimento: l.movimento, filhos: [], classe: "", valor: 0
      });
    });
    [...nos.keys()].forEach((codigo) => {
      let pai = this.paiDe(codigo);
      while (pai) {
        if (!nos.has(pai)) {
          nos.set(pai, { codigo: pai, nome: pai, veioDaApi: false, saldo: 0, movimento: 0, filhos: [], classe: "", valor: 0 });
        }
        pai = this.paiDe(pai);
      }
    });
    const raizes = [];
    nos.forEach((no) => {
      const pai = this.paiDe(no.codigo);
      const dono = pai && nos.get(pai);
      if (dono) dono.filhos.push(no);
      else raizes.push(no);
    });
    const ord = (lista) => {
      lista.sort((a, b) => this.compararCodigo(a.codigo, b.codigo));
      lista.forEach((n) => ord(n.filhos));
    };
    ord(raizes);
    return raizes;
  },

  classePeloNome(nome) {
    const n = this.norm(nome);
    if (!n) return "";
    if (/PATRIMON/.test(n)) return "pl";
    if (/\bATIVO\b/.test(n)) return "ativo";
    if (/\bPASSIVO\b/.test(n)) return "passivo";
    if (/DEDUC/.test(n)) return "deducao";
    if (/RECEITA/.test(n)) return "receita";
    if (/\bCUSTO/.test(n)) return "custo";
    if (/DESPESA/.test(n)) return "despesa";
    if (/RESULTADO/.test(n)) return "resultado";
    return "";
  },

  classePeloCodigo(codigo) {
    const seg = String(codigo || "").split(".")[0].replace(/\D/g, "");
    if (seg === "1") return "ativo";
    if (seg === "2") return "passivo";
    if (seg && "3456789".indexOf(seg) >= 0) return "resultado";
    return "";
  },

  exibir(classe, saldo, movimento) {
    if (classe === "ativo") return saldo;
    if (classe === "passivo" || classe === "pl") return -saldo;
    if (classe === "receita" || classe === "deducao" || classe === "custo" || classe === "despesa" || classe === "resultado") return -movimento;
    return 0;
  },

  classificar(raizes) {
    const marcar = (no, herdada) => {
      if (!no.veioDaApi) {
        no.filhos.forEach((f) => marcar(f, herdada));
        const classes = [...new Set(no.filhos.map((f) => f.classe).filter(Boolean))];
        no.classe = classes.length === 1 ? classes[0] : (herdada || this.classePeloCodigo(no.codigo) || "");
        no.valor = 0;
        return;
      }
      const nome = this.norm(no.nome);
      const misto = /PASSIVO/.test(nome) && /PATRIMON/.test(nome);
      let classe = herdada;
      if (misto) classe = "";
      else classe = this.classePeloNome(no.nome) || herdada || this.classePeloCodigo(no.codigo);
      no.classe = classe || "";
      no.filhos.forEach((f) => marcar(f, no.classe));
      no.valor = this.exibir(no.classe, no.saldo, no.movimento);
    };
    (raizes || []).forEach((n) => marcar(n, ""));
    return raizes;
  },

  /* Soma só as contas analíticas da classe. A conta pai já traz o mesmo saldo, então não entra de novo. */
  valorNaClasse(no, classe) {
    if (!no) return 0;
    if (!no.filhos.length) return no.classe === classe ? (Number(no.valor) || 0) : 0;
    return Math.round(no.filhos.reduce((s, f) => s + this.valorNaClasse(f, classe), 0) * 100) / 100;
  },

  entradas(raizes, classe) {
    const out = [];
    const walk = (no) => {
      if (no.classe === classe) {
        out.push(no);
        return;
      }
      no.filhos.forEach(walk);
    };
    (raizes || []).forEach(walk);
    return out;
  },

  somaClasse(raizes, classe) {
    return Math.round((raizes || []).reduce((s, n) => s + this.valorNaClasse(n, classe), 0) * 100) / 100;
  },

  abrirPadrao(raizes) {
    const abertos = {};
    const walk = (no, nivel) => {
      if (no.filhos.length && nivel < 2) abertos[no.codigo] = true;
      no.filhos.forEach((f) => walk(f, nivel + 1));
    };
    (raizes || []).forEach((n) => walk(n, 1));
    return abertos;
  },

  temClasse(no, classe) {
    if (no.classe === classe) return true;
    return no.filhos.some((f) => this.temClasse(f, classe));
  },

  htmlConta(no, nivel, classe) {
    const valor = this.valorNaClasse(no, classe);
    const neg = valor < -0.004 ? " ctb-neg" : "";
    const temFilho = no.filhos && no.filhos.length;
    const aberto = !!this.state.abertos[no.codigo];
    const icone = temFilho ? (aberto ? "chevron-down" : "chevron-right") : "";
    const botao = temFilho
      ? `<button type="button" class="ctb-abre" onclick="ContabilApp.toggleConta('${this.esc(no.codigo)}')"><i data-lucide="${icone}"></i></button>`
      : `<span class="ctb-abre"></span>`;
    return `<tr>
      <td style="padding-left:${12 + nivel * 16}px">${botao}<span class="ctb-cod">${this.esc(no.codigo)}</span> ${this.esc(no.nome)}</td>
      <td class="ctb-num${neg}">${this.money(valor)}</td>
    </tr>`;
  },

  htmlGrupo(raizes, classe, titulo) {
    const nos = this.entradas(raizes, classe).filter((n) => Math.abs(this.valorNaClasse(n, classe)) > 0.004);
    if (!nos.length) return "";
    const linhas = [];
    const walk = (no, nivel) => {
      linhas.push(this.htmlConta(no, nivel, classe));
      if (no.filhos.length && this.state.abertos[no.codigo]) {
        no.filhos.forEach((f) => {
          if (f.classe === classe || this.temClasse(f, classe)) walk(f, nivel + 1);
        });
      }
    };
    nos.forEach((n) => walk(n, 0));
    const total = this.somaClasse(raizes, classe);
    return `<tr class="ctb-grupo"><td colspan="2">${this.esc(titulo)}</td></tr>${linhas.join("")}
      <tr class="ctb-sub"><td>Total ${this.esc(titulo)}</td><td class="ctb-num${total < -0.004 ? " ctb-neg" : ""}">${this.money(total)}</td></tr>`;
  },

  htmlSubtotal(rotulo, valor, forte) {
    const neg = valor < -0.004 ? " ctb-neg" : "";
    return `<tr class="${forte ? "ctb-total" : "ctb-sub"}"><td>${this.esc(rotulo)}</td><td class="ctb-num${neg}">${this.money(valor)}</td></tr>`;
  },

  /* 3.01.01.01.001 e 3.1.01.01.001 viram o mesmo 3.1.1.1.1. */
  dreNorm(codigo) {
    const s = String(codigo || "").trim();
    const partes = s.indexOf(".") >= 0
      ? s.split(".").filter(Boolean)
      : (() => {
          const d = s.replace(/\D/g, "");
          if (!d) return [];
          const out = [d.charAt(0)];
          let i = 1;
          while (i < d.length) {
            const resto = d.length - i;
            if (resto <= 3) { out.push(d.slice(i)); break; }
            out.push(d.slice(i, i + 2));
            i += 2;
          }
          return out;
        })();
    return partes.map((p) => {
      const n = parseInt(p, 10);
      return Number.isFinite(n) ? String(n) : String(p);
    }).join(".");
  },

  dreCasa(codigo, prefixo) {
    const n = this.dreNorm(codigo);
    const p = this.dreNorm(prefixo);
    if (!n || !p) return false;
    return n === p || n.indexOf(p + ".") === 0;
  },

  /* Grupos do DRE da Moura Leite. O código manda; o nome só cobre conta sem esse código. */
  grupoDre(no) {
    const c = no && no.codigo;
    if (this.dreCasa(c, "4.1.2.2.1")) return "dga";
    if (this.dreCasa(c, "4.1.2.1")) return "recFin";
    if (this.dreCasa(c, "4.1.2.2")) return "despFin";
    if (this.dreCasa(c, "4.1.3")) return "equiv";
    if (this.dreCasa(c, "4.1.1.3")) return "vendas";
    if (this.dreCasa(c, "4.1.1")) return "dga";
    if (this.dreCasa(c, "4.3.1") || this.dreCasa(c, "4.3.2")) return "imposto";
    if (this.dreCasa(c, "3.1.1.1")) return "bruta";
    if (this.dreCasa(c, "3.1.1.2")) return "deducao";
    if (this.dreCasa(c, "3.1.1.3")) return "custo";
    const nome = this.norm(no && no.nome);
    if (/IRPJ|CONTRIB\.?\s*SOCIAL|\bCSLL\b/.test(nome)) return "imposto";
    if (/PARTICIP/.test(nome)) return "equiv";
    if (/TARIFA/.test(nome) && /BANC/.test(nome)) return "dga";
    if (/RENDIMENT|JUROS ATIVOS|VARIACAO MONETARIA ATIVA|DESCONTOS OBTIDOS/.test(nome)) return "recFin";
    if (/\bIOF\b|VARIACAO MONETARIA PASSIVA|DESCONTO CONCEDIDO/.test(nome) && !/CONTRATO/.test(nome)) return "despFin";
    if (/PROPAGANDA|COMISS|STAND DE VENDAS|\bEVENTOS\b/.test(nome)) return "vendas";
    if (/CUSTO DOS IMOVEIS|OBRA DE CONTRAPARTIDA/.test(nome)) return "custo";
    if (/DISTRAT|DESCONTO CONCEDIDO CONTRATO|ISS S\/|PIS |COFINS|RET S\//.test(nome)) return "deducao";
    if (/VENDA DE IMOVEIS|PRESTACAO DE SERVICO|ALUGUE/.test(nome)) return "bruta";
    return "demais";
  },

  folhasDre(raizes) {
    const out = [];
    const walk = (no) => {
      if (no.filhos && no.filhos.length) {
        no.filhos.forEach(walk);
        return;
      }
      if (!no.veioDaApi) return;
      if (no.classe === "ativo" || no.classe === "passivo" || no.classe === "pl") return;
      const seg = String(no.codigo || "").replace(/\D/g, "").charAt(0);
      if (seg === "1" || seg === "2") return;
      out.push(no);
    };
    (raizes || []).forEach(walk);
    return out;
  },

  somarItens(lista) {
    return Math.round((lista || []).reduce((s, it) => s + (Number(it.valor) || 0), 0) * 100) / 100;
  },

  /* Monta os grupos e os subtotais na ordem do demonstrativo. */
  montarDre(raizes) {
    const baldes = { bruta: [], deducao: [], custo: [], vendas: [], dga: [], equiv: [], recFin: [], despFin: [], imposto: [], demais: [] };
    this.folhasDre(raizes).forEach((no) => {
      const valor = Math.round((-Number(no.movimento) || 0) * 100) / 100;
      if (Math.abs(valor) < 0.005) return;
      const g = this.grupoDre(no);
      (baldes[g] || baldes.demais).push({ codigo: no.codigo, nome: no.nome, valor: valor });
    });
    Object.keys(baldes).forEach((k) => baldes[k].sort((a, b) => this.compararCodigo(a.codigo, b.codigo)));
    const bruta = this.somarItens(baldes.bruta);
    const deducao = this.somarItens(baldes.deducao);
    const liquida = Math.round((bruta + deducao) * 100) / 100;
    const custo = this.somarItens(baldes.custo);
    const bruto = Math.round((liquida + custo) * 100) / 100;
    const vendas = this.somarItens(baldes.vendas);
    const dga = this.somarItens(baldes.dga);
    const despesas = Math.round((vendas + dga) * 100) / 100;
    const antes = Math.round((bruto + despesas) * 100) / 100;
    const equiv = this.somarItens(baldes.equiv);
    const recFin = this.somarItens(baldes.recFin);
    const despFin = this.somarItens(baldes.despFin);
    const financeiro = Math.round((recFin + despFin) * 100) / 100;
    const lair = Math.round((antes + equiv + financeiro) * 100) / 100;
    const imposto = this.somarItens(baldes.imposto);
    const demais = this.somarItens(baldes.demais);
    const liquido = Math.round((lair + imposto + demais) * 100) / 100;
    const metade = Math.round(liquido * 50) / 100;
    return {
      baldes: baldes,
      bruta: bruta, deducao: deducao, liquida: liquida, custo: custo, bruto: bruto,
      vendas: vendas, dga: dga, despesas: despesas, antes: antes, equiv: equiv,
      recFin: recFin, despFin: despFin, financeiro: financeiro, lair: lair,
      imposto: imposto, demais: demais, liquido: liquido, metade: metade
    };
  },

  dreAberto(id) {
    return this.state.abertos[id] !== false;
  },

  variacao(anterior, atual) {
    const a = Number(anterior) || 0;
    const b = Number(atual) || 0;
    if (Math.abs(a) < 0.005) return null;
    return Math.round(((b - a) / Math.abs(a)) * 1000) / 10;
  },

  fmtPct(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  },

  fmtDre(v) {
    const n = Number(v) || 0;
    if (Math.abs(n) < 0.005) return "—";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  totaisPor(contas, ler) {
    const baldes = { bruta: [], deducao: [], custo: [], vendas: [], dga: [], equiv: [], recFin: [], despFin: [], imposto: [], demais: [] };
    (contas || []).forEach((c) => {
      const valor = Math.round((Number(ler(c)) || 0) * 100) / 100;
      (baldes[c.grupo] || baldes.demais).push(valor);
    });
    const soma = (k) => Math.round((baldes[k] || []).reduce((s, n) => s + n, 0) * 100) / 100;
    const bruta = soma("bruta");
    const deducao = soma("deducao");
    const liquida = Math.round((bruta + deducao) * 100) / 100;
    const custo = soma("custo");
    const bruto = Math.round((liquida + custo) * 100) / 100;
    const vendas = soma("vendas");
    const dga = soma("dga");
    const despesas = Math.round((vendas + dga) * 100) / 100;
    const antes = Math.round((bruto + despesas) * 100) / 100;
    const equiv = soma("equiv");
    const recFin = soma("recFin");
    const despFin = soma("despFin");
    const financeiro = Math.round((recFin + despFin) * 100) / 100;
    const lair = Math.round((antes + equiv + financeiro) * 100) / 100;
    const imposto = soma("imposto");
    const demais = soma("demais");
    const liquido = Math.round((lair + imposto + demais) * 100) / 100;
    return {
      bruta: bruta, deducao: deducao, liquida: liquida, custo: custo, bruto: bruto,
      vendas: vendas, dga: dga, despesas: despesas, antes: antes, equiv: equiv,
      recFin: recFin, despFin: despFin, financeiro: financeiro, lair: lair,
      imposto: imposto, demais: demais, liquido: liquido, metade: Math.round(liquido * 50) / 100
    };
  },

  cacheTotais(col) {
    if (col._totais) return col._totais;
    const ler = col.tipo === "pct" ? col.atu : col.ler;
    col._totais = this.totaisPor(this.state.serie.contas, ler);
    if (col.tipo === "pct") col._totaisAnt = this.totaisPor(this.state.serie.contas, col.ant);
    return col._totais;
  },

  valorLinha(col, chave, conta) {
    if (col.tipo === "pct") {
      if (conta) return this.variacao(col.ant(conta), col.atu(conta));
      this.cacheTotais(col);
      return this.variacao(col._totaisAnt[chave], col._totais[chave]);
    }
    if (conta) return col.ler(conta);
    return this.cacheTotais(col)[chave];
  },

  somaChaves(conta, ano, meses) {
    return Math.round((meses || []).reduce((s, m) => s + (Number(conta.por[this.chaveMes(ano, m)]) || 0), 0) * 100) / 100;
  },

  colunasDre() {
    const s = this.state.serie;
    if (!s) return [];
    const ano = s.ano;
    const ant = ano - 1;
    const meses = s.meses;
    if (this.state.dreVisao !== "comp") {
      const cols = meses.map((m) => ({
        grupo: this.nomeMes(m),
        titulo: this.nomeMes(m),
        tipo: "val",
        ler: (c) => Number(c.por[this.chaveMes(ano, m)]) || 0
      }));
      cols.push({
        grupo: "Total",
        titulo: "Total",
        tipo: "val",
        forte: true,
        ler: (c) => this.somaChaves(c, ano, meses)
      });
      return cols;
    }
    const cols = [];
    const pushTrio = (grupo, lerAnt, lerAtu, forte) => {
      cols.push({ grupo: grupo, titulo: String(ant), tipo: "val", forte: !!forte, ler: lerAnt, sep: true });
      cols.push({ grupo: grupo, titulo: String(ano), tipo: "val", forte: !!forte, ler: lerAtu });
      cols.push({ grupo: grupo, titulo: "%", tipo: "pct", forte: !!forte, ant: lerAnt, atu: lerAtu });
    };
    meses.forEach((m) => {
      pushTrio(
        this.nomeMes(m),
        (c) => Number(c.por[this.chaveMes(ant, m)]) || 0,
        (c) => Number(c.por[this.chaveMes(ano, m)]) || 0,
        false
      );
    });
    pushTrio("Total", (c) => this.somaChaves(c, ant, meses), (c) => this.somaChaves(c, ano, meses), true);
    this.trimestresDo(meses).forEach((t) => {
      pushTrio(t.nome, (c) => this.somaChaves(c, ant, t.meses), (c) => this.somaChaves(c, ano, t.meses), false);
    });
    return cols;
  },

  celulaDre(valor, col) {
    const sep = col.sep ? " orc-dfc-sep" : "";
    if (col.tipo === "pct") {
      const n = valor;
      const cor = n == null ? "" : (n < -0.05 ? " orc-dfc-neg" : (n > 0.05 ? " is-pos" : ""));
      return `<td class="orc-dfc-vcol${sep}${cor}">${this.fmtPct(n)}</td>`;
    }
    const n = Number(valor) || 0;
    const neg = n < -0.005 ? " orc-dfc-neg" : "";
    return `<td class="${(sep + neg).trim()}">${this.fmtDre(n)}</td>`;
  },

  dreLinhaCols(nivel, nome, pegar, opts) {
    const o = opts || {};
    const cols = o.cols || [];
    const cls = o.cls || "";
    const ico = o.id
      ? `<i data-lucide="${this.dreAberto(o.id) ? "chevron-down" : "chevron-right"}"></i>`
      : `<i class="orc-dfc-no"></i>`;
    const click = o.id ? ` onclick="ContabilApp.toggleConta('${this.esc(o.id)}')"` : "";
    const tds = cols.map((col) => this.celulaDre(pegar(col), col)).join("");
    return `<tr class="${cls}"${click}>
      <td style="padding-left:${8 + nivel * 16}px">${ico}<span>${this.esc(nome)}</span></td>
      ${tds}
    </tr>`;
  },

  cabecalhoDre(cols) {
    if (this.state.dreVisao !== "comp") {
      return `<tr><th>Conta</th>${cols.map((c) => `<th class="${c.forte ? "is-alt" : ""}">${this.esc(c.titulo)}</th>`).join("")}</tr>`;
    }
    const grupos = [];
    cols.forEach((c) => {
      const ult = grupos[grupos.length - 1];
      if (!ult || ult.nome !== c.grupo) grupos.push({ nome: c.grupo, n: 1, sep: !!c.sep });
      else ult.n += 1;
    });
    const h1 = grupos.map((g) => `<th colspan="${g.n}" class="orc-dfc-mes${g.sep ? " orc-dfc-sep" : ""}">${this.esc(g.nome)}</th>`).join("");
    const h2 = cols.map((c) => `<th class="${c.sep ? "orc-dfc-sep" : ""}">${this.esc(c.titulo)}</th>`).join("");
    return `<tr><th rowspan="2">Conta</th>${h1}</tr><tr>${h2}</tr>`;
  },

  dreLinha(nivel, nome, valor, opts) {
    const o = opts || {};
    const cls = o.cls || "";
    const neg = valor < -0.005 ? " orc-dfc-neg" : "";
    const ico = o.id
      ? `<i data-lucide="${this.dreAberto(o.id) ? "chevron-down" : "chevron-right"}"></i>`
      : `<i class="orc-dfc-no"></i>`;
    const click = o.id ? ` onclick="ContabilApp.toggleConta('${this.esc(o.id)}')"` : "";
    const texto = Math.abs(valor) < 0.005 ? "—" : valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<tr class="${cls}"${click}>
      <td style="padding-left:${8 + nivel * 16}px">${ico}<span>${this.esc(nome)}</span></td>
      <td class="${neg.trim()}">${texto}</td>
    </tr>`;
  },

  dreContas(lista, nivel, paiId) {
    if (!this.dreAberto(paiId)) return "";
    return (lista || []).map((it) => this.dreLinha(nivel, (it.codigo ? it.codigo + " " : "") + (it.nome || ""), it.valor, { cls: "orc-dfc-acc" })).join("");
  },

  htmlDreSerie() {
    const serie = this.state.serie;
    const cols = this.colunasDre();
    cols.forEach((c) => { c._totais = null; c._totaisAnt = null; });
    const contas = (serie.contas || []).filter((c) => cols.some((col) => {
      if (col.tipo === "pct") return false;
      return Math.abs(Number(col.ler(c)) || 0) > 0.004;
    })).sort((a, b) => this.compararCodigo(a.codigo, b.codigo));
    const doGrupo = (g) => contas.filter((c) => c.grupo === g);
    const linha = (nivel, nome, chave, opts) => this.dreLinhaCols(nivel, nome, (col) => this.valorLinha(col, chave), Object.assign({ cols: cols }, opts || {}));
    const contasHtml = (lista, nivel, pai) => {
      if (!this.dreAberto(pai)) return "";
      return lista.map((c) => this.dreLinhaCols(nivel, (c.codigo ? c.codigo + " " : "") + (c.nome || ""), (col) => this.valorLinha(col, "", c), { cols: cols, cls: "orc-dfc-acc" })).join("");
    };
    const vendas = doGrupo("vendas");
    const dga = doGrupo("dga");
    const demais = doGrupo("demais");
    const linhas = [
      linha(0, "Receita operacional bruta", "bruta", { id: "dre-bruta", cls: "orc-dfc-n1" }),
      contasHtml(doGrupo("bruta"), 1, "dre-bruta"),
      linha(0, "(-) Deduções da receita", "deducao", { id: "dre-ded", cls: "orc-dfc-saida" }),
      contasHtml(doGrupo("deducao"), 1, "dre-ded"),
      linha(0, "Receita operacional líquida", "liquida", { cls: "orc-dfc-formula" }),
      linha(0, "Custo das unidades vendidas", "custo", { id: "dre-custo", cls: "orc-dfc-saida" }),
      contasHtml(doGrupo("custo"), 1, "dre-custo"),
      linha(0, "Lucro bruto", "bruto", { cls: "orc-dfc-formula" }),
      linha(0, "Despesas e outras receitas", "despesas", { id: "dre-desp", cls: "orc-dfc-saida-forte" }),
      this.dreAberto("dre-desp") ? linha(1, "Despesas com vendas", "vendas", { id: "dre-vendas", cls: "orc-dfc-saida" }) : "",
      this.dreAberto("dre-desp") ? contasHtml(vendas, 2, "dre-vendas") : "",
      this.dreAberto("dre-desp") ? linha(1, "Despesas gerais e administrativas", "dga", { id: "dre-dga", cls: "orc-dfc-saida" }) : "",
      this.dreAberto("dre-desp") ? contasHtml(dga, 2, "dre-dga") : "",
      linha(0, "Resultado antes das despesas financeiras e impostos", "antes", { cls: "orc-dfc-formula" }),
      linha(0, "Equivalência patrimonial", "equiv", { id: "dre-equiv", cls: "orc-dfc-n1" }),
      contasHtml(doGrupo("equiv"), 1, "dre-equiv"),
      linha(0, "Resultado financeiro", "financeiro", { id: "dre-fin", cls: "orc-dfc-n1" }),
      this.dreAberto("dre-fin") ? linha(1, "Receitas financeiras", "recFin", { id: "dre-recfin", cls: "orc-dfc-n1" }) : "",
      this.dreAberto("dre-fin") ? contasHtml(doGrupo("recFin"), 2, "dre-recfin") : "",
      this.dreAberto("dre-fin") ? linha(1, "Despesas financeiras", "despFin", { id: "dre-despfin", cls: "orc-dfc-saida" }) : "",
      this.dreAberto("dre-fin") ? contasHtml(doGrupo("despFin"), 2, "dre-despfin") : "",
      linha(0, "Lucro antes do imposto de renda e da contribuição social", "lair", { cls: "orc-dfc-formula" }),
      linha(0, "Imposto de renda e contribuição social", "imposto", { id: "dre-ir", cls: "orc-dfc-saida" }),
      contasHtml(doGrupo("imposto"), 1, "dre-ir"),
      demais.length ? linha(0, "Demais contas de resultado", "demais", { id: "dre-demais", cls: "orc-dfc-n1" }) : "",
      demais.length ? contasHtml(demais, 1, "dre-demais") : "",
      linha(0, "Lucro líquido (prejuízo) do exercício", "liquido", { cls: "orc-dfc-fcf" }),
      linha(0, "50% Eq. MLDU", "metade", { cls: "orc-dfc-formula" })
    ].join("");
    const cmp = this.state.dreVisao === "comp" ? " orc-dfc-cmp" : "";
    return `<div class="orc-dfc-scroll"><table class="orc-dfc-table ctb-dre${cmp}">
      <thead>${this.cabecalhoDre(cols)}</thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
  },

  htmlDre(raizes) {
    if (this.state.serie && this.state.serie.contas) return this.htmlDreSerie();
    const d = this.montarDre(raizes);
    const b = d.baldes;
    const linhas = [
      this.dreLinha(0, "Receita operacional bruta", d.bruta, { id: "dre-bruta", cls: "orc-dfc-n1" }),
      this.dreContas(b.bruta, 1, "dre-bruta"),
      this.dreLinha(0, "(-) Deduções da receita", d.deducao, { id: "dre-ded", cls: "orc-dfc-saida" }),
      this.dreContas(b.deducao, 1, "dre-ded"),
      this.dreLinha(0, "Receita operacional líquida", d.liquida, { cls: "orc-dfc-formula" }),
      this.dreLinha(0, "Custo das unidades vendidas", d.custo, { id: "dre-custo", cls: "orc-dfc-saida" }),
      this.dreContas(b.custo, 1, "dre-custo"),
      this.dreLinha(0, "Lucro bruto", d.bruto, { cls: "orc-dfc-formula" }),
      this.dreLinha(0, "Despesas e outras receitas", d.despesas, { id: "dre-desp", cls: "orc-dfc-saida-forte" }),
      this.dreAberto("dre-desp") ? this.dreLinha(1, "Despesas com vendas", d.vendas, { id: "dre-vendas", cls: "orc-dfc-saida" }) : "",
      this.dreAberto("dre-desp") ? this.dreContas(b.vendas, 2, "dre-vendas") : "",
      this.dreAberto("dre-desp") ? this.dreLinha(1, "Despesas gerais e administrativas", d.dga, { id: "dre-dga", cls: "orc-dfc-saida" }) : "",
      this.dreAberto("dre-desp") ? this.dreContas(b.dga, 2, "dre-dga") : "",
      this.dreLinha(0, "Resultado antes das despesas financeiras e impostos", d.antes, { cls: "orc-dfc-formula" }),
      this.dreLinha(0, "Equivalência patrimonial", d.equiv, { id: "dre-equiv", cls: "orc-dfc-n1" }),
      this.dreContas(b.equiv, 1, "dre-equiv"),
      this.dreLinha(0, "Resultado financeiro", d.financeiro, { id: "dre-fin", cls: "orc-dfc-n1" }),
      this.dreAberto("dre-fin") ? this.dreLinha(1, "Receitas financeiras", d.recFin, { id: "dre-recfin", cls: "orc-dfc-n1" }) : "",
      this.dreAberto("dre-fin") ? this.dreContas(b.recFin, 2, "dre-recfin") : "",
      this.dreAberto("dre-fin") ? this.dreLinha(1, "Despesas financeiras", d.despFin, { id: "dre-despfin", cls: "orc-dfc-saida" }) : "",
      this.dreAberto("dre-fin") ? this.dreContas(b.despFin, 2, "dre-despfin") : "",
      this.dreLinha(0, "Lucro antes do imposto de renda e da contribuição social", d.lair, { cls: "orc-dfc-formula" }),
      this.dreLinha(0, "Imposto de renda e contribuição social", d.imposto, { id: "dre-ir", cls: "orc-dfc-saida" }),
      this.dreContas(b.imposto, 1, "dre-ir"),
      b.demais.length ? this.dreLinha(0, "Demais contas de resultado", d.demais, { id: "dre-demais", cls: "orc-dfc-n1" }) : "",
      b.demais.length ? this.dreContas(b.demais, 1, "dre-demais") : "",
      this.dreLinha(0, "Lucro líquido (prejuízo) do exercício", d.liquido, { cls: "orc-dfc-fcf" }),
      this.dreLinha(0, "50% Eq. MLDU", d.metade, { cls: "orc-dfc-formula" })
    ].join("");
    return `<div class="orc-dfc-scroll"><table class="orc-dfc-table ctb-dre">
      <thead><tr><th>Conta</th><th>Valor</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
  },

  htmlBalanco(raizes) {
    const ativo = this.somaClasse(raizes, "ativo");
    const passivo = this.somaClasse(raizes, "passivo");
    const pl = this.somaClasse(raizes, "pl");
    const direito = Math.round((passivo + pl) * 100) / 100;
    const dif = Math.round((ativo - direito) * 100) / 100;
    const corpo = [
      this.htmlGrupo(raizes, "ativo", "Ativo"),
      this.htmlSubtotal("Total do ativo", ativo, true),
      this.htmlGrupo(raizes, "passivo", "Passivo"),
      this.htmlGrupo(raizes, "pl", "Patrimônio líquido"),
      this.htmlSubtotal("Total do passivo e do patrimônio líquido", direito, true)
    ].join("");
    const aviso = Math.abs(dif) > 0.05
      ? `<p class="ctb-dif">Ativo e passivo diferem em ${this.money(dif)}. O balancete desta consulta só traz contas com movimento no período.</p>`
      : `<p class="ctb-ok">Ativo e passivo fecham em ${this.money(ativo)}.</p>`;
    return this.htmlTabela("Saldo no fim do período", corpo) + aviso;
  },

  htmlTabela(coluna, corpo) {
    return `<table class="ctb-table">
      <thead><tr><th>Conta</th><th class="ctb-num">${this.esc(coluna)}</th></tr></thead>
      <tbody>${corpo}</tbody>
    </table>`;
  },

  montarSerie(janela, porMes) {
    const mapa = new Map();
    Object.keys(porMes || {}).forEach((chave) => {
      const arvore = this.classificar(this.montarArvore(this.juntar(porMes[chave])));
      this.folhasDre(arvore).forEach((no) => {
        const valor = Math.round((-Number(no.movimento) || 0) * 100) / 100;
        const id = this.dreNorm(no.codigo) || String(no.codigo);
        let item = mapa.get(id);
        if (!item) {
          item = { id: id, codigo: no.codigo, nome: no.nome, grupo: this.grupoDre(no), por: {} };
          mapa.set(id, item);
        }
        item.por[chave] = Math.round(((item.por[chave] || 0) + valor) * 100) / 100;
        if ((no.nome || "").length > (item.nome || "").length) item.nome = no.nome;
        if (String(no.codigo || "").length > String(item.codigo || "").length) item.codigo = no.codigo;
      });
    });
    return { ano: janela.ano, meses: (janela.meses || []).slice(), contas: [...mapa.values()] };
  },

  async buscar() {
    const s = this.state;
    if (s.carregando) return;
    const empresas = this.empresasEscolhidas();
    if (!empresas.length) {
      s.erro = "Escolha ao menos uma empresa.";
      s.buscou = false;
      this.render();
      return;
    }
    let de = s.de;
    let ate = s.ate;
    if (!de || !ate) {
      s.erro = "Informe o período.";
      this.render();
      return;
    }
    if (de > ate) { const t = de; de = ate; ate = t; s.de = de; s.ate = ate; }
    const ini = de + "-01";
    const fim = this.fimDoMes(ate);
    const api = window.SiengeApiService;
    if (!api || typeof api.getTrialBalanceContabil !== "function") {
      s.erro = "A consulta do balancete não está disponível. Atualize a página com Ctrl+F5.";
      this.render();
      return;
    }
    const janela = this.mesesAte(ate);
    s.carregando = true;
    s.erro = "";
    s.avisos = [];
    s.progresso = 8;
    s.buscou = true;
    s.loadMsg = janela.meses.length
      ? ("Lendo o realizado de janeiro a " + this.nomeMes(janela.meses[janela.meses.length - 1]) + " de " + janela.ano + " e de " + (janela.ano - 1) + "…")
      : "Lendo o balancete…";
    this.render();
    const tarefas = [{ tipo: "balanco", ini: ini, fim: fim, rotulo: "balanço" }];
    janela.meses.forEach((m) => {
      [janela.ano, janela.ano - 1].forEach((y) => {
        const ym = this.chaveMes(y, m);
        tarefas.push({ tipo: "mes", chave: ym, ini: ym + "-01", fim: this.fimDoMes(ym), rotulo: this.nomeMes(m) + "/" + y });
      });
    });
    const fila = [];
    empresas.forEach((emp) => tarefas.forEach((t) => fila.push({ emp: emp, t: t })));
    const listas = [];
    const porMes = {};
    const avisos = [];
    let feitas = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < fila.length) {
        const item = fila[cursor++];
        const emp = item.emp;
        const t = item.t;
        try {
          const lista = await api.getTrialBalanceContabil(emp.id, t.ini, t.fim);
          if (t.tipo === "balanco") listas.push(lista || []);
          else {
            if (!porMes[t.chave]) porMes[t.chave] = [];
            porMes[t.chave].push(lista || []);
          }
        } catch (e) {
          avisos.push("Empresa " + emp.id + ", " + t.rotulo + ": " + ((e && e.message) || "o Sienge não respondeu o balancete."));
        }
        feitas += 1;
        s.progresso = Math.round(8 + (feitas / Math.max(fila.length, 1)) * 88);
        this.render();
      }
    };
    const conc = Math.min(3, fila.length || 1);
    const trabalhos = [];
    for (let i = 0; i < conc; i++) trabalhos.push(worker());
    await Promise.all(trabalhos);
    s.linhas = this.juntar(listas);
    s.arvore = this.classificar(this.montarArvore(s.linhas));
    s.abertos = this.abrirPadrao(s.arvore);
    s.serie = this.montarSerie(janela, porMes);
    s.avisos = avisos;
    s.carregando = false;
    s.loadMsg = "";
    s.progresso = 100;
    if (!s.linhas.length && !avisos.length) s.erro = "O balancete não devolveu contas com movimento nesse período.";
    this.render();
  },

  render() {
    const root = document.getElementById("contabil-root");
    if (!root) return;
    const s = this.state;
    const aba = s.aba === "balanco" ? "balanco" : "dre";
    const ini = s.de ? s.de + "-01" : "";
    const fim = this.fimDoMes(s.ate);
    const periodo = ini && fim ? `${this.dataBr(ini)} a ${this.dataBr(fim)}` : "";
    const abas = `<div class="ml-tabs ctb-tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${aba === "dre"}" class="ml-tab ${aba === "dre" ? "is-active" : ""}" onclick="ContabilApp.setAba('dre')"><i data-lucide="trending-up"></i> DRE</button>
      <button type="button" role="tab" aria-selected="${aba === "balanco"}" class="ml-tab ${aba === "balanco" ? "is-active" : ""}" onclick="ContabilApp.setAba('balanco')"><i data-lucide="landmark"></i> Balanço patrimonial</button>
    </div>`;
    let corpo = "";
    if (s.carregando) {
      corpo = `<div class="ml-load">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-status-text">${this.esc(s.loadMsg || "Lendo o balancete…")}</div>
        <div class="ml-load-track"><div class="loading-progress-bar" style="width:${Math.max(8, s.progresso)}%"></div></div>
      </div>`;
    } else if (s.erro && !s.linhas.length) {
      corpo = `<p class="ctb-erro">${this.esc(s.erro)}</p>`;
    } else if (!s.buscou) {
      corpo = `<p class="ctb-nota">Escolha a empresa e o período. A consulta lê o balancete de verificação do Sienge.</p>`;
    } else {
      const demo = aba === "balanco" ? this.htmlBalanco(s.arvore) : this.htmlDre(s.arvore);
      const avisos = s.avisos.length ? `<p class="ctb-erro">${s.avisos.map((a) => this.esc(a)).join("<br>")}</p>` : "";
      const serie = s.serie;
      const fimMes = serie && serie.meses && serie.meses.length ? this.nomeMes(serie.meses[serie.meses.length - 1]) : "";
      const notaDre = aba !== "dre"
        ? " O balanço usa o saldo no fim do período."
        : (serie && fimMes
          ? (s.dreVisao === "comp"
            ? ` Janeiro a ${fimMes} de ${serie.ano - 1} e de ${serie.ano}. Cada mês traz os dois anos e a variação. O total vem em seguida, e os trimestres somam só os meses desse intervalo.`
            : ` Janeiro a ${fimMes} de ${serie.ano}. Cada grupo abre nas contas analíticas.`)
          : " O DRE soma o movimento do período nos grupos do demonstrativo. Conta sem valor fica fora da lista.");
      const visao = aba === "dre" && serie ? `<div class="ml-tabs ctb-visao" role="tablist">
        <button type="button" role="tab" aria-selected="${s.dreVisao !== "comp"}" class="ml-tab ${s.dreVisao !== "comp" ? "is-active" : ""}" onclick="ContabilApp.setVisao('ano')"><i data-lucide="calendar-range"></i> Ano atual</button>
        <button type="button" role="tab" aria-selected="${s.dreVisao === "comp"}" class="ml-tab ${s.dreVisao === "comp" ? "is-active" : ""}" onclick="ContabilApp.setVisao('comp')"><i data-lucide="git-compare"></i> Comparar com o ano anterior</button>
      </div>` : "";
      corpo = `${avisos}${visao}<p class="ctb-nota">${aba === "dre" && serie && fimMes ? this.esc(notaDre.trim()) : this.esc(periodo) + ". Entram as contas com movimento." + notaDre}</p>${demo}`;
    }
    root.innerHTML = `<style>
      #contabil-root .ctb-toolbar { display:flex; flex-wrap:wrap; gap:12px 16px; align-items:flex-end; margin:4px 0 8px; }
      #contabil-root .ctb-tabs { margin:8px 0 12px; }
      #contabil-root .ctb-visao { margin:0 0 10px; }
      #contabil-root .ctb-dre tbody tr:not(.orc-dfc-fcf) > td.is-pos { color:#15803d; }
      #contabil-root .ctb-dre tbody tr.orc-dfc-fcf > td.is-pos { color:#bbf7d0; }
      #contabil-root .ctb-buscar { height:38px; padding:0 16px; border:0; border-radius:8px; background:#105436; color:#fff; font-weight:700; cursor:pointer; }
      #contabil-root .ctb-buscar:disabled { opacity:0.6; cursor:wait; }
      #contabil-root .ctb-nota { color:#64748b; font-size:0.84rem; margin:0 0 12px; }
      #contabil-root .ctb-erro { color:#b91c1c; font-size:0.84rem; margin:0 0 12px; }
      #contabil-root .ctb-ok { color:#105436; font-size:0.84rem; font-weight:700; margin:10px 0 0; }
      #contabil-root .ctb-dif { color:#9a3412; font-size:0.84rem; margin:10px 0 0; }
      #contabil-root .ctb-table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; }
      #contabil-root .ctb-table th { text-align:left; font-size:0.72rem; letter-spacing:0.04em; text-transform:uppercase; color:#64748b; padding:10px 12px; border-bottom:1px solid #e2e8f0; }
      #contabil-root .ctb-table td { padding:7px 12px; border-bottom:1px solid #f1f5f9; color:#0f172a; }
      #contabil-root .ctb-num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; width:180px; }
      #contabil-root .ctb-neg { color:#b91c1c; }
      #contabil-root .ctb-cod { color:#64748b; font-variant-numeric:tabular-nums; margin-right:6px; }
      #contabil-root .ctb-grupo td { background:#f8fafc; font-weight:800; color:#105436; padding-top:12px; }
      #contabil-root .ctb-sub td { font-weight:700; background:#f8fafc; }
      #contabil-root .ctb-total td { font-weight:800; background:#f0fdf4; color:#105436; }
      #contabil-root .ctb-abre { width:18px; height:18px; border:0; background:transparent; color:#64748b; padding:0; margin-right:4px; cursor:pointer; vertical-align:middle; }
      #contabil-root .ctb-abre i, #contabil-root .ctb-abre svg { width:14px; height:14px; }
      #contabil-root .ctb-dre { width:100%; min-width:720px; }
      #contabil-root .ctb-dre th:first-child, #contabil-root .ctb-dre td:first-child { min-width:320px; max-width:none; }
      #contabil-root .orc-dfc-scroll { max-height:calc(100vh - 240px); }
    </style>
    <div class="ctb-toolbar">
      <div id="ctb-emp-box"></div>
      <div class="ml-comp-slot">
        <label class="ml-comp-label" for="ctb-de">De</label>
        <input type="month" id="ctb-de" class="ml-comp-input" value="${this.esc(s.de)}" onchange="ContabilApp.setMes('de', this.value)">
      </div>
      <div class="ml-comp-slot">
        <label class="ml-comp-label" for="ctb-ate">Até</label>
        <input type="month" id="ctb-ate" class="ml-comp-input" value="${this.esc(s.ate)}" onchange="ContabilApp.setMes('ate', this.value)">
      </div>
      <button type="button" class="ctb-buscar" ${s.carregando ? "disabled" : ""} onclick="ContabilApp.buscar()">Buscar</button>
    </div>
    ${abas}
    ${corpo}`;
    this.paintEmpresas();
  }
};

window.ContabilApp = ContabilApp;
