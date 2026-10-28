/* Financeiro · Contas a pagar · Gerar Pagamento
   Agrupa títulos a pagar (sem previsões) em lotes.
   Título com centro de custo de parceiro sai pela conta de parceria do CC. */
const GerarPagamentoApp = {
  state: {
    loading: false,
    error: "",
    companies: [],
    costCenters: [],
    customFields: {},
    started: false,
    startDate: "",
    endDate: "",
    consultando: false,
    consultado: false,
    erroTitulos: "",
    progresso: "",
    progressoPct: 0,
    progressoInicio: 0,
    titulos: [],
    previsoesIgnoradas: 0,
    filtro: "todos",
    visao: "lotes",
    abaLotes: "gerar",
    abaEmpresa: "",
    sel: {},
    selInit: {},
    lotes: [],
    loteSienge: {},
    formaSienge: {},
    pagInfo: {},
    selManual: {},
    validacao: { feitos: 0, total: 0, rodando: false },
    gerandoLote: "",
    roboLote: "",
    lotesAbertos: {},
    dataBaixa: {},
    diaRetro: "",
    retroTodos: false,
    credores: {},
    antecipadoOk: {},
    beneficiarioOk: {},
    roboMsg: "",
    roboLigando: false,
    gen: 0,
    conferencia: { lotes: {}, padroes: {} }
  },

  LOTES_COLLECTION: "pagamento_lotes",
  LOTES_LOCAL: "crm_pagamento_lotes",
  CONFERENCIA_LOCAL: "crm_gp_conferencia",
  ROBO_URL: "http://127.0.0.1:7788",
  ROBO_TOKEN_KEY: "gp_robo_token",

  FILTROS: [
    { id: "todos", label: "Todos" },
    { id: "ok", label: "Pago na conta de parceria" },
    { id: "outra", label: "Pago em outra conta" },
    { id: "aberto", label: "Em aberto" }
  ],

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  pct(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 && p[0] ? p[2] + "/" + p[1] + "/" + p[0] : "—";
  },

  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  shiftIso(iso, dias) {
    const p = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return "";
    const d = new Date(p + "T12:00:00");
    d.setDate(d.getDate() + dias);
    return this.iso(d);
  },

  /** Dia seguinte, se for dia útil. Na sexta, sábado, domingo e segunda. No fim de semana, até a segunda.
   *  No antepenúltimo dia útil, o período já vai do dia seguinte até o último dia do mês, sábado e domingo inclusos. */
  periodoPadrao(base) {
    const d = base ? new Date(String(base).slice(0, 10) + "T12:00:00") : new Date();
    const fechamento = this.janelaFechamento(d);
    if (fechamento) return { start: fechamento.start, end: fechamento.end };
    const hoje = this.iso(d);
    const dow = d.getDay();
    if (dow === 5) return { start: this.shiftIso(hoje, 1), end: this.shiftIso(hoje, 3) };
    if (dow === 6) return { start: hoje, end: this.shiftIso(hoje, 2) };
    if (dow === 0) return { start: hoje, end: this.shiftIso(hoje, 1) };
    const amanha = this.shiftIso(hoje, 1);
    return { start: amanha, end: amanha };
  },

  /** Antepenúltimo dia útil e o pagamento do dia seguinte até o último dia corrido do mês. */
  janelaFechamento(base) {
    const d = base ? new Date(base) : new Date();
    const ano = d.getFullYear();
    const mes = d.getMonth();
    const dia = d.getDate();
    const ultimo = new Date(ano, mes + 1, 0).getDate();
    const uteis = [];
    for (let i = 1; i <= ultimo; i++) {
      const dow = new Date(ano, mes, i, 12).getDay();
      if (dow !== 0 && dow !== 6) uteis.push(i);
    }
    if (uteis.length < 3 || dia < uteis[uteis.length - 3]) return null;
    const isoDia = (n) => ano + "-" + String(mes + 1).padStart(2, "0") + "-" + String(n).padStart(2, "0");
    return {
      ante: isoDia(uteis[uteis.length - 3]),
      start: isoDia(uteis[uteis.length - 2]),
      end: isoDia(ultimo)
    };
  },

  ehAnalistaPagadoria(user) {
    const n = String((user && (user.profile_name || user.profile || user.role)) || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return n.includes("ANALISTA") && n.includes("PAGADORIA") && /\b(I|II|1|2)\b/.test(n);
  },

  avisoFechamento() {
    const u = window.AppState && window.AppState.currentUser;
    if (!this.ehAnalistaPagadoria(u)) return;
    const janela = this.janelaFechamento(new Date());
    const hoje = this.iso(new Date());
    if (!janela || hoje !== janela.ante) return;
    const chave = "crm_pagadoria_fechamento_" + String(u.email || u.name || "op") + "_" + hoje;
    try { if (localStorage.getItem(chave) === "ciente") return; } catch (e) {}
    if (document.getElementById("gp-fechamento-aviso")) return;
    const ini = this.dataBr(janela.start);
    const fim = this.dataBr(janela.end);
    const pagar = Number(String(janela.start).slice(8, 10));
    const overlay = document.createElement("div");
    overlay.id = "gp-fechamento-aviso";
    overlay.setAttribute("role", "alertdialog");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483002;display:flex;align-items:center;justify-content:center;background:rgba(12,41,29,0.55);padding:16px;";
    overlay.innerHTML = `<div style="background:#fff;border-radius:12px;width:100%;max-width:460px;box-shadow:0 18px 40px rgba(0,0,0,0.22);border:1px solid rgba(16,84,54,0.12);padding:22px 22px 18px;font-family:inherit;">
      <div style="font-size:0.95rem;font-weight:800;color:#105436;margin-bottom:10px;">Moura Leite Loteamentos</div>
      <div style="font-size:0.92rem;color:#1e293b;line-height:1.45;">Hoje deverão ser feitos os lotes do dia ${ini} ao dia ${fim} para pagar dia ${pagar}. Sábado e domingo entram no período, para o fechamento dos parceiros ficar pago até o último dia.</div>
      <div style="display:flex;justify-content:flex-end;margin-top:18px;">
        <button type="button" id="gp-fechamento-ciente" style="padding:8px 16px;border-radius:8px;border:0;background:#105436;color:#fff;font-weight:800;cursor:pointer;">Ciente</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const fechar = () => {
      try { localStorage.setItem(chave, "ciente"); } catch (e) {}
      overlay.remove();
    };
    overlay.querySelector("#gp-fechamento-ciente").addEventListener("click", fechar);
  },

  /** Sábado e domingo entram no lote da segunda: a baixa no banco é no dia útil. */
  diaDoLote(iso) {
    const s = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dow = new Date(s + "T12:00:00").getDay();
    if (dow === 6) return this.shiftIso(s, 2);
    if (dow === 0) return this.shiftIso(s, 1);
    return s;
  },

  fimDeSemana(iso) {
    const s = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const dow = new Date(s + "T12:00:00").getDay();
    return dow === 0 || dow === 6;
  },

  dataBaixaDoGrupo(g) {
    const escolhida = String((this.state.dataBaixa && this.state.dataBaixa[g.key]) || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(escolhida) ? escolhida : (g.dia || "");
  },

  setDataBaixa(key, iso) {
    this.state.dataBaixa[key] = String(iso || "").slice(0, 10);
  },

  numConta(v) {
    return String(v == null ? "" : v).replace(/\D/g, "").replace(/^0+/, "");
  },

  customOf(id) {
    const map = this.state.customFields || {};
    return map[id] || map[String(id)] || {};
  },

  contaParceriaDe(cc) {
    const c = cc ? this.customOf(cc.id).conta_parceria : null;
    return c && (c.id || c.numero) ? c : null;
  },

  /* Conta cadastrada no centro, mesmo quando o objeto do centro não está na lista carregada. */
  contaDoCentro(id) {
    const direta = this.contaParceriaDe(this.ccDe(id));
    if (direta) return direta;
    const c = this.customOf(id).conta_parceria;
    return c && (c.id || c.numero) ? c : null;
  },

  /* 99391-6 é a conta final da empresa 1. No cadastro ela também aparece como 1-6. */
  ehContaFinal(conta) {
    if (!conta) return false;
    const bruto = String(conta.numero || conta.id || "").replace(/\s/g, "").toUpperCase();
    if (bruto === "1-6" || bruto === "16") return true;
    const n = this.numConta(bruto);
    return n === this.CONTA_FINAL_NUM || n === "0993916";
  },

  /* Conta final da empresa 1. A guia única sai inteira por ela. */
  CONTA_FINAL_NUM: "993916",

  contaFinalEmpresa1() {
    const campos = this.state.customFields || {};
    const ids = Object.keys(campos);
    for (let i = 0; i < ids.length; i++) {
      const c = campos[ids[i]] && campos[ids[i]].conta_parceria;
      if (c && this.numConta(c.numero || c.id) === this.CONTA_FINAL_NUM) return c;
    }
    return { id: "99391-6", numero: "99391-6", nome: "Conta final empresa 1", banco: "341", agencia: "0223" };
  },

  listaPt(itens) {
    const lista = (itens || []).filter(Boolean);
    if (lista.length <= 1) return lista[0] || "";
    return lista.slice(0, -1).join(", ") + " e " + lista[lista.length - 1];
  },

  /*
   * Onde o documento inteiro é pago, e se alguma parte precisa ser transferida.
   * Parceria completa (empreendedor + parceiro, como 13900/13901): o título sai inteiro
   * na conta do centro do parceiro, sem transferência. Não usa a conta final 1-6 / 99391-6.
   * Título que mistura outro centro (outra conta) com um par que tem rateio padrão:
   * o documento sai na conta desse outro centro e transfere o total do par
   * (empreendedor + parceiro) para a conta do parceiro.
   * Só o centro do empreendedor, sem o do parceiro: transfere só se o plano financeiro
   * exige rateio na prestação de contas.
   */
  destinoDocumento(linhas) {
    const base = linhas && linhas[0];
    if (!base) return null;
    const empresa = String(base.companyId || "");
    if (empresa && empresa !== "1") return null;
    if (linhas.some((r) => this.contaPagamentoDistratoNovo(r) || this.contaPagamentoRepasse(r))) return null;
    const ccs = (base.ccsTitulo && base.ccsTitulo.length)
      ? base.ccsTitulo
      : linhas.map((r) => ({ id: r.ccId, nome: r.ccNome, rateio: 0, planos: [] }));
    if (ccs.length < 2) return null;
    const pagar = Number(base.tituloAPagar) || 0;
    const valorDe = (c) => {
      const row = linhas.find((r) => String(r.ccId) === String(c.id));
      if (row && Number(row.aPagar) > 0.009) return Number(row.aPagar);
      const rateio = Number(c.rateio) || 0;
      return pagar * (rateio / 100);
    };
    const grupos = {};
    ccs.forEach((c) => {
      const valor = valorDe(c);
      if (valor <= 0.009 && !linhas.some((r) => String(r.ccId) === String(c.id))) return;
      const nome = c.nome || ((this.ccDe(c.id) || {}).name) || "";
      const ob = this.obra(c.id);
      const g = grupos[ob] || (grupos[ob] = { obra: ob, linhas: [] });
      g.linhas.push({
        id: String(c.id),
        nome,
        valor,
        parceria: this.ccDeParceriaPeloNome(c.id, nome),
        conta: this.contaDoCentro(c.id),
        planos: c.planos || []
      });
    });
    const pares = [];
    const soEmpreendedor = [];
    const outros = [];
    Object.keys(grupos).forEach((ob) => {
      const g = grupos[ob];
      const parcNome = g.linhas.find((l) => l.parceria);
      const parcId = g.linhas.find((l) => l.id === ob + "01" && g.linhas.some((x) => x.id === ob + "00"));
      const parc = parcNome || parcId;
      const bases = g.linhas.filter((l) => !parc || l.id !== parc.id);
      const valor = Math.round(g.linhas.reduce((t, l) => t + l.valor, 0) * 100) / 100;
      const listaCc = g.linhas.map((l) => ({ id: l.id, nome: l.nome }));
      if (parc && bases.length) {
        pares.push({ obra: ob, valor, conta: parc.conta || this.contaDoCentro(parc.id), ccs: listaCc });
        return;
      }
      if (!parc && bases.length) {
        const cad = this.parDoObra(bases[0].id, base.companyId);
        const parNome = cad && this.ccDeParceriaPeloNome(cad.parc.id, cad.parc.name) ? cad : null;
        const planos = g.linhas.reduce((acc, l) => acc.concat(l.planos || []), []);
        const exige = parNome ? this.planoExigeRateio(g.linhas.map((l) => l.id).concat([String(parNome.parc.id)]), planos) : "";
        const item = { obra: ob, valor, linhas: g.linhas, ccs: listaCc, cad: parNome, exige };
        if (parNome) soEmpreendedor.push(item);
        else outros.push(item);
        return;
      }
      outros.push({ obra: ob, valor, linhas: g.linhas, ccs: listaCc, cad: null, exige: "" });
    });
    if (!pares.length && !soEmpreendedor.some((x) => x.exige)) return null;
    const comConta = (lista) => lista.filter((x) => (x.linhas || []).some((l) => this.chaveConta(l.conta)));
    const pagadores = comConta(outros);
    if (pares.length && !pagadores.length) {
      const comContaParc = pares.filter((p) => this.chaveConta(p.conta));
      const preferidos = comContaParc.filter((p) => !this.ehContaFinal(p.conta));
      const conta = this.contaMaior(preferidos.length ? preferidos : comContaParc, (p) => p.conta);
      if (!conta) return { conta: null, faltaContaParceiro: true, acertos: [] };
      const deKey = this.chaveConta(conta);
      const numeroDe = (c) => (c && (c.numero || c.id)) || "";
      const acertos = [];
      pares.forEach((p) => {
        const paraKey = this.chaveConta(p.conta);
        if (!paraKey || paraKey === deKey || this.ehContaFinal(p.conta)) return;
        acertos.push({
          de: conta,
          para: p.conta,
          deNumero: numeroDe(conta),
          paraNumero: numeroDe(p.conta),
          valor: p.valor,
          ccs: p.ccs
        });
      });
      return { conta, acertos };
    }
    if (!pagadores.length) return null;
    const contaPag = this.contaMaior(pagadores.reduce((acc, o) => acc.concat(o.linhas), []), (l) => l.conta);
    if (!contaPag) return null;
    const deKey = this.chaveConta(contaPag);
    const numeroDe = (c) => (c && (c.numero || c.id)) || "";
    const acertos = [];
    const push = (para, valor, ccsDoAcerto) => {
      if (!para || valor <= 0.009) return;
      const paraKey = this.chaveConta(para);
      if (!paraKey || paraKey === deKey) return;
      acertos.push({
        de: contaPag,
        para,
        deNumero: numeroDe(contaPag),
        paraNumero: numeroDe(para),
        valor: Math.round(valor * 100) / 100,
        ccs: ccsDoAcerto
      });
    };
    pares.forEach((p) => push(p.conta, p.valor, p.ccs));
    soEmpreendedor.forEach((o) => {
      if (!o.exige || !o.cad) return;
      push(this.contaParceriaDe(o.cad.parc), o.valor, o.ccs);
    });
    if (!pares.length && !acertos.length) return null;
    return { conta: contaPag, acertos };
  },

  chaveConta(conta) {
    if (!conta) return "";
    return this.numConta(conta.numero || conta.id) || String(conta.id || "");
  },

  contaMaior(lista, pega) {
    const mapa = new Map();
    (lista || []).forEach((x) => {
      const c = pega(x);
      const k = this.chaveConta(c);
      if (!k) return;
      const g = mapa.get(k) || { conta: c, valor: 0 };
      g.valor += Number(x.valor) || 0;
      mapa.set(k, g);
    });
    let melhor = null;
    mapa.forEach((g) => { if (!melhor || g.valor > melhor.valor) melhor = g; });
    return melhor ? melhor.conta : null;
  },

  transferenciasDe(itens) {
    const paraFinal = (this.contaFinalEmpresa1().numero) || "99391-6";
    const mapa = new Map();
    (itens || []).forEach((it) => {
      (it.acertos || []).forEach((a) => {
        const deNumero = a.deNumero || (a.conta && (a.conta.numero || a.conta.id)) || "";
        const paraNumero = a.paraNumero || paraFinal;
        const k = (this.numConta(deNumero) || deNumero) + ">" + (this.numConta(paraNumero) || paraNumero);
        if (!deNumero || !paraNumero) return;
        const g = mapa.get(k) || { deNumero, deLabel: this.contaLabel(a.de || a.conta), paraNumero, valor: 0, ccs: [], titulos: [] };
        g.valor = Math.round((g.valor + (Number(a.valor) || 0)) * 100) / 100;
        (a.ccs || []).forEach((c) => {
          if (!g.ccs.some((x) => x.id === String(c.id))) g.ccs.push({ id: String(c.id), nome: c.nome || "" });
        });
        const tit = String(it.titulo || "");
        if (tit && !g.titulos.includes(tit)) g.titulos.push(tit);
        mapa.set(k, g);
      });
    });
    return [...mapa.values()];
  },

  textoTransferencias(lista) {
    if (!lista || !lista.length) return "";
    return "\n\nTransferência entre contas. O documento entra inteiro na conta do lote e este valor pertence à outra conta:\n" + lista.map((a) => {
      const ccs = this.listaPt((a.ccs || []).map((c) => c.id));
      const tits = (a.titulos || []).length ? ` Título(s) ${a.titulos.join(", ")}.` : "";
      return `• Da conta ${a.deNumero} para a conta ${a.paraNumero}: ${this.money(a.valor)}, centros de custo ${ccs}.${tits}`;
    }).join("\n");
  },

  transferenciasHtml(lista) {
    if (!lista || !lista.length) return "";
    const itens = lista.map((a) => {
      const ccs = this.listaPt((a.ccs || []).map((c) => c.id));
      const tits = (a.titulos || []).length ? ` Títulos ${this.esc(a.titulos.join(", "))}.` : "";
      return `<li>Transferir <strong>${this.money(a.valor)}</strong> da conta <strong>${this.esc(a.deNumero)}</strong> para a conta <strong>${this.esc(a.paraNumero)}</strong>, referente aos centros de custo ${this.esc(ccs)}.${tits} Esse valor entrou no pagamento desta conta e pertence à conta de destino.</li>`;
    }).join("");
    return `<div class="gp-acerto" role="alert"><strong>Transferência entre contas</strong><span>O documento entra inteiro neste lote. Transfira o valor dos centros que têm rateio de parceria.</span><ul>${itens}</ul></div>`;
  },

  /** CC Corporativo não segue a regra de parceria, mesmo com "parceiro/parceria" no nome. */
  ehCorporativo(id) {
    return String(this.customOf(id).tipo_cc || "") === "Corporativo";
  },

  isParceiro(cc) {
    if (cc && !this.ehCorporativo(cc.id) && /parce(ir|ri)/i.test(String(cc.name || ""))) return true;
    return !!this.contaParceriaDe(cc);
  },

  companyIdOf(cc) {
    return cc && (cc.idCompany != null ? cc.idCompany : cc.companyId);
  },

  contaCurta(c) {
    if (!c) return "Conta";
    const num = String(c.numero || c.id || "").trim();
    const nome = String(c.nome || "");
    const banco = /ita[uú]/i.test(nome) ? "Itaú" : (/bradesco/i.test(nome) ? "Bradesco" : (/santander/i.test(nome) ? "Santander" : (/caixa/i.test(nome) ? "Caixa" : (/banco do brasil|\bbb\b/i.test(nome) ? "BB" : ""))));
    const curta = [num ? "C/C " + num : "", banco].filter(Boolean).join(" · ");
    return curta || this.contaLabel(c);
  },

  contaLabel(c) {
    if (window.CentrosCustoApp && typeof CentrosCustoApp.contaLabel === "function") {
      return CentrosCustoApp.contaLabel(c);
    }
    if (!c) return "";
    return [c.banco ? "Banco " + c.banco : "", c.agencia ? "Ag. " + c.agencia : "", c.numero ? "C/C " + c.numero : "", c.nome || ""]
      .filter(Boolean).join(" · ");
  },

  /* Título com CC de parceiro paga na conta de parceria cadastrada no centro de custo. */
  resolverContaPagamento(input) {
    const ccId = input && (input.costCenterId != null ? input.costCenterId : input.ccId);
    const cc = this.state.costCenters.find((c) => String(c.id) === String(ccId))
      || (input && input.costCenter) || null;
    if (!cc) {
      return { origem: "padrao", parceiro: false, conta: null, ok: true, motivo: "" };
    }
    const parceiro = this.isParceiro(cc);
    if (!parceiro) {
      return { origem: "padrao", parceiro: false, cc: cc, conta: null, ok: true, motivo: "" };
    }
    const conta = this.contaParceriaDe(cc);
    if (!conta) {
      return {
        origem: "parceria",
        parceiro: true,
        cc: cc,
        conta: null,
        ok: false,
        motivo: "Centro de custo de parceiro sem conta de parceria cadastrada."
      };
    }
    return { origem: "parceria", parceiro: true, cc: cc, conta: conta, ok: true, motivo: "" };
  },

  /* Centros com título em aberto neste período e sem conta de parceria vinculada. */
  centrosSemContaComTitulo() {
    const vistos = new Map();
    (this.state.titulos || []).forEach((r) => {
      if (!r || r.pago || !(Number(r.aPagar) > 0.009)) return;
      if (r.esperada || this.contaParceriaDe(this.ccDe(r.ccId))) return;
      let id = String(r.ccId || "");
      let nome = r.ccNome || "";
      const par = this.parDoObra(id, this.companyIdOf(this.ccDe(id)) || r.companyId);
      if (par && String(par.base.id) === id && this.ehRepasse(r)) {
        id = String(par.parc.id);
        nome = par.parc.name || nome;
      }
      if (!id) return;
      if (!vistos.has(id)) vistos.set(id, { id, nome, titulos: new Set(), valor: 0 });
      const g = vistos.get(id);
      const chave = this.chaveTitulo(r.titulo, r.parcela);
      if (g.titulos.has(chave)) return;
      g.titulos.add(chave);
      g.valor += Number(r.aPagar) || 0;
    });
    return [...vistos.values()].sort((a, b) => Number(a.id) - Number(b.id));
  },

  alertaSemContaHtml() {
    if (!this.state.consultado || this.state.consultando) return "";
    const lista = this.centrosSemContaComTitulo();
    if (!lista.length) return "";
    const n = lista.length;
    const linhas = lista.map((c) => {
      const q = c.titulos.size;
      return `<li><b>${this.esc(c.id)}</b> ${this.esc(c.nome)} · ${q} título${q === 1 ? "" : "s"} · ${this.money(c.valor)}</li>`;
    }).join("");
    return `<div class="gp-alerta-conta" role="alert">
      <strong>${n} centro${n === 1 ? "" : "s"} de custo com título a pagar sem conta vinculada.</strong>
      <span>Esses títulos ficam de fora do lote até cadastrar a conta de parceria.</span>
      <ul>${linhas}</ul>
    </div>`;
  },

  parceiros() {
    return this.state.costCenters
      .filter((cc) => this.isParceiro(cc))
      .slice()
      .sort((a, b) => {
        const ea = Number(this.companyIdOf(a) || 0) - Number(this.companyIdOf(b) || 0);
        if (ea) return ea;
        return Number(a.id) - Number(b.id);
      });
  },

  init() {
    const padrao = this.periodoPadrao();
    this.state.startDate = padrao.start;
    this.state.endDate = padrao.end;
    const aplicarConferencia = () => {
      if (this.state.titulos && this.state.titulos.length) this.paintTitulos();
    };
    this.carregarConferencia().then(aplicarConferencia);
    if (this.state.started && this.state.costCenters.length) {
      this.recarregarCustom();
      this.render();
      this.sincronizarContas().then(() => {
        this.recarregarCustom();
        if (this.state.titulos && this.state.titulos.length) this.reclassificar();
        this.render();
      });
      return;
    }
    this.load();
  },

  recarregarCustom() {
    let custom = {};
    try {
      const raw = localStorage.getItem("crm_centros_custo_custom") || "{}";
      custom = (typeof window.parseCentrosCustoCustomMap === "function")
        ? window.parseCentrosCustoCustomMap(raw)
        : (JSON.parse(raw) || {});
    } catch (e) {
      custom = {};
    }
    if (window.CentrosCustoState && CentrosCustoState.customFields && Object.keys(CentrosCustoState.customFields).length) {
      custom = Object.assign({}, custom, CentrosCustoState.customFields);
    }
    const remoto = window._contasParceriaRemotas || {};
    Object.keys(remoto).forEach((id) => {
      const r = remoto[id] || {};
      const rec = custom[id] = Object.assign({ cc_id: id }, custom[id] || {});
      if (Number(r.updatedAt || 0) >= Number(rec.conta_parceria_at || 0)) {
        rec.conta_parceria = r.conta || null;
        rec.conta_parceria_at = Number(r.updatedAt) || 0;
      }
    });
    this.state.customFields = custom;
  },

  async sincronizarContas() {
    if (typeof window.carregarContasParceriaFirebase !== "function") return;
    try {
      await window.carregarContasParceriaFirebase();
    } catch (e) {
      console.warn("[Gerar Pagamento] contas de parceria", e);
    }
  },

  ccDe(id) {
    return this.state.costCenters.find((c) => String(c.id) === String(id)) || null;
  },

  /* Conta e situação são recalculadas na hora, para refletir a conta cadastrada depois da busca. */
  reclassificar() {
    this.state.titulos.forEach((r) => {
      const distrato = this.contaPagamentoDistratoNovo(r);
      const repasse = distrato ? null : this.contaPagamentoRepasse(r);
      const esperada = distrato || repasse || this.contaParceriaDe(this.ccDe(r.ccId));
      const alvo = esperada ? this.numConta(esperada.numero || esperada.id) : "";
      r.esperada = esperada;
      const parRepasse = repasse ? this.parDoObra(r.ccId, this.companyIdOf(this.ccDe(r.ccId)) || r.companyId) : null;
      r.contaOrigemCc = parRepasse ? String(parRepasse.parc.id) : "";
      if (!r.contas.length) r.status = r.pago ? "pago-sem-conta" : "aberto";
      else if (!alvo) r.status = "sem-conta";
      else r.status = r.contas.every((c) => this.numConta(c) === alvo) ? "ok" : "outra";
    });
  },

  async load() {
    this.state.loading = true;
    this.state.error = "";
    this.render();
    try {
      const [ccs, companies] = await Promise.all([
        SiengeApiService.getCostCenters ? SiengeApiService.getCostCenters() : Promise.resolve([]),
        SiengeApiService.getCompanies ? SiengeApiService.getCompanies() : Promise.resolve([])
      ]);
      this.state.costCenters = Array.isArray(ccs) ? ccs : ((ccs && ccs.results) || []);
      this.state.companies = Array.isArray(companies) ? companies : ((companies && companies.results) || []);
      await this.sincronizarContas();
      this.recarregarCustom();
      this.state.started = true;
      await this.carregarConferencia();
    } catch (e) {
      console.error("[Gerar Pagamento]", e);
      this.state.error = (e && e.message) ? e.message : "Não consegui carregar os centros de custo.";
    }
    this.state.loading = false;
    this.render();
  },

  abrirCentrosCusto() {
    if (window.CentrosCustoState) CentrosCustoState.somenteParceiros = true;
    if (typeof switchTab === "function") switchTab("centros-custo", "Gestão de Centros de Custo");
  },

  onField(key, value) {
    this.state[key] = value;
  },

  setFiltro(id) {
    this.state.filtro = this.state.filtro === id && id !== "todos" ? "todos" : id;
    this.paintTitulos();
  },

  pintarProgresso() {
    const s = this.state;
    const frases = this.FRASES_CARGA;
    const pct = Math.max(0, Math.min(0.999, s.progressoPct || 0));
    s.progresso = frases[Math.min(frases.length - 1, Math.floor(pct * frases.length))];
    const el = document.getElementById("gp-progresso");
    if (el) el.textContent = s.progresso || "";
    const bar = document.getElementById("gp-progresso-barra");
    if (bar) bar.style.width = Math.max(2, Math.min(99, Math.round(pct * 100))) + "%";
  },

  FRASES_CARGA: ["Buscando títulos", "Checando lotes", "Conferindo boletos", "Analisando notas", "Conferindo rateios"],

  /* Círculo, frase da etapa e barra. Sem contagem de títulos e sem tempo decorrido. */
  carregandoHtml() {
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:400px;margin:0 auto;padding:40px 0;color:var(--color-text-muted);">
        <div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <span id="gp-progresso" class="loading-status-text" style="font-weight:500;">${this.esc(this.state.progresso)}</span>
        <div style="width:100%;background:#e2e8f0;border-radius:8px;height:10px;overflow:hidden;margin-top:5px;">
          <div id="gp-progresso-barra" class="loading-progress-bar" style="width:${Math.max(2, Math.round((this.state.progressoPct || 0) * 100))}%;height:100%;background:#10b981;transition:width 0.4s linear;"></div>
        </div>
      </div>`;
  },

  /* Lê no Sienge os títulos a pagar dos CCs de parceiro no período e confere a conta usada no pagamento. */
  async consultarTitulos() {
    const s = this.state;
    if (!s.startDate || !s.endDate) {
      alert("Informe o período.");
      return;
    }
    if (s.startDate > s.endDate) {
      alert("A data inicial não pode ser maior que a final.");
      return;
    }
    const base = window.ComprasControleApp || window.ComprasPrevisoesApp;
    if (!base || typeof base.outcomeRange !== "function") {
      alert("O módulo de contas a pagar não está disponível.");
      return;
    }
    await this.sincronizarContas();
    this.recarregarCustom();
    const parceiros = this.parceiros();
    if (!parceiros.length) {
      alert("Nenhum centro de custo de parceiro encontrado. Cadastre a conta de parceria em Centros de Custo.");
      return;
    }
    const gen = (s.gen += 1);
    s.consultando = true;
    s.consultado = true;
    s.erroTitulos = "";
    s.progressoPct = 0;
    this.pintarProgresso();
    s.titulos = [];
    s.previsoesIgnoradas = 0;
    s.sel = {};
    s.selInit = {};
    s.selManual = {};
    s.loteSienge = {};
    s.formaSienge = {};
    s.pagInfo = {};
    s.credores = {};
    s.diaRetro = "";
    s.retroTodos = false;
    s.validacao = { feitos: 0, total: 0, rodando: false, falhas: 0, limite: false };
    this.render();

    const api = Object.create(base);
    api.outcomeEndpoint = (start, end, companyId) => "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=true&withBankMovements=true"
      + (companyId ? "&companyId=" + encodeURIComponent(companyId) : "");
    api.noteProgress = () => {};

    try {
      const empresas = [...new Set(parceiros.map((cc) => String(this.companyIdOf(cc) || "")).filter(Boolean))];
      const alvos = empresas.length ? empresas : [""];
      const faixasPeriodo = typeof siengeSplitDateRange === "function"
        ? siengeSplitDateRange(s.startDate, s.endDate)
        : [{ start: s.startDate, end: s.endDate }];
      const retroFim = this.shiftIso(s.startDate, -1);
      const retroIni = this.shiftIso(s.startDate, -120);
      const faixasRetro = retroIni && retroFim && retroIni <= retroFim
        ? (typeof siengeSplitDateRange === "function" ? siengeSplitDateRange(retroIni, retroFim) : [{ start: retroIni, end: retroFim }])
        : [];
      const faixas = faixasRetro.concat(faixasPeriodo);
      const bills = [];
      let passo = 0;
      const total = faixas.length * alvos.length;
      for (const faixa of faixas) {
        for (const emp of alvos) {
          if (gen !== s.gen) return;
          passo += 1;
          s.progressoPct = (passo / Math.max(1, total)) * 0.4;
          this.pintarProgresso();
          const parte = await api.outcomeRange(faixa.start, faixa.end, emp);
          if (Array.isArray(parte)) bills.push.apply(bills, parte);
        }
      }
      if (gen !== s.gen) return;
      this.montarTitulos(base, bills, parceiros);
      s.progressoPct = 0.45;
      this.pintarProgresso();
      await this.carregarLotes();
      s.progressoPct = 0.55;
      this.pintarProgresso();
      await this.carregarLotesSienge(gen);
      if (window.DocumentosSiengeApp) {
        try { await DocumentosSiengeApp.garantirLista(false); } catch (e) { console.warn("[Gerar Pagamento] documentos do Sienge", e); }
      }
    } catch (e) {
      if (gen !== s.gen) return;
      console.error("[Gerar Pagamento] títulos", e);
      s.erroTitulos = (e && e.message) ? e.message : "Falha ao buscar os títulos a pagar no Sienge.";
    }
    if (gen !== s.gen) return;
    s.consultando = false;
    s.progresso = "";
    this.render();
    if (!s.erroTitulos) this.validarPagamentos(gen);
  },

  montarTitulos(app, bills, parceiros) {
    const ccMap = {};
    parceiros.forEach((cc) => { ccMap[String(cc.id)] = cc; });
    const vistos = {};
    const linhas = [];
    let previsoes = 0;
    const lista = (x) => (Array.isArray(x) ? x : (x ? [x] : []));
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const docId = app.docCode(bill.documentIdentificationId);
      const docNome = bill.documentIdentificationName || "";
      const todas = lista(bill.paymentsCategories);
      const catsParc = todas.filter((c) => c && c.costCenterId != null && ccMap[String(c.costCenterId)]);
      const repasse = this.ehRepasse({
        docId: String(docId || "").trim(),
        docNome: String(docNome || "").trim(),
        ccsTitulo: [{ planos: todas.filter(Boolean).map((c) => ({
          id: c.financialCategoryId != null ? String(c.financialCategoryId).trim() : "",
          nome: String(c.financialCategoryName || "").trim()
        })) }]
      });
      const catsLot = repasse ? todas.filter((c) => {
        if (!c || c.costCenterId == null || ccMap[String(c.costCenterId)]) return false;
        const par = this.parDoObra(c.costCenterId, bill.companyId);
        return !!(par && String(par.base.id) === String(c.costCenterId));
      }) : [];
      const cats = catsParc.length ? catsParc : catsLot;
      if (!cats.length) return;
      const titulo = String(bill.billId);
      const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
      if (app.ehPrevisao(docId, docNome, bill)) {
        const vencPrev = String(bill.dueDate || "").slice(0, 10);
        const noPeriodo = !this.state.startDate || (vencPrev >= this.state.startDate && vencPrev <= this.state.endDate);
        if (noPeriodo && !vistos["prev|" + titulo + "|" + parcela]) previsoes += 1;
        vistos["prev|" + titulo + "|" + parcela] = true;
        return;
      }
      const movs = [];
      let pago = false;
      lista(bill.payments).forEach((pay) => {
        const bms = lista(pay && pay.bankMovements);
        if (!bms.length) {
          if (app.isPago(bill, pay, null, docId, docNome)) pago = true;
          return;
        }
        bms.forEach((bm) => {
          if (!bm || app.SKIP_OPS[bm.operationName || ""]) return;
          if (app.isSubstituicao(bill, pay, bm, docId, docNome)) return;
          if (app.isPago(bill, pay, bm, docId, docNome)) pago = true;
          const conta = String(bm.accountNumber || "").trim();
          if (conta) movs.push({ conta, data: app.paymentDateOf(bill, pay, bm) });
        });
      });
      const saldo = app.billBalance(bill);
      const original = Number(bill.originalAmount) || 0;
      const ccsTitulo = [];
      lista(bill.paymentsCategories).forEach((c) => {
        if (!c || c.costCenterId == null) return;
        const id = String(c.costCenterId);
        const rate = c.financialCategoryRate != null && Number.isFinite(Number(c.financialCategoryRate)) ? Number(c.financialCategoryRate) : 100;
        const plano = { id: c.financialCategoryId != null ? String(c.financialCategoryId).trim() : "", nome: String(c.financialCategoryName || "").trim() };
        const ja = ccsTitulo.find((x) => x.id === id);
        if (ja) {
          ja.rateio += rate;
          if ((plano.id || plano.nome) && !ja.planos.some((p) => p.id === plano.id && p.nome === plano.nome)) ja.planos.push(plano);
          return;
        }
        const cad = ccMap[id] || this.ccDe(id);
        const nomeCad = String((cad && cad.name) || "").trim();
        const nomeApi = String(c.costCenterName || "").trim();
        const nome = (this.ccDeParceriaPeloNome(id, nomeApi) && !this.ccDeParceriaPeloNome(id, nomeCad)) ? nomeApi : (nomeCad || nomeApi);
        ccsTitulo.push({ id, nome, parceria: !!ccMap[id], rateio: rate, planos: plano.id || plano.nome ? [plano] : [] });
      });
      ccsTitulo.sort((a, b) => Number(a.id) - Number(b.id));
      const tituloAPagar = saldo != null ? Math.max(0, saldo) : (pago ? 0 : original);
      const autorizacao = this.autorizacaoDe(bill);
      cats.forEach((cat) => {
        const cc = ccMap[String(cat.costCenterId)] || this.ccDe(cat.costCenterId);
        if (!cc) return;
        const chave = titulo + "|" + parcela + "|" + cc.id;
        if (vistos[chave]) return;
        vistos[chave] = true;
        const contas = [...new Set(movs.map((m) => m.conta))];
        const rateio = cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) : 100;
        const fat = (Number.isFinite(rateio) ? rateio : 100) / 100;
        const datas = movs.map((m) => m.data).filter(Boolean).sort();
        linhas.push({
          pago,
          aPagar: tituloAPagar * fat,
          tituloAPagar,
          tituloValor: original,
          ccsTitulo,
          titulo,
          parcela,
          credor: String(bill.creditorName || "").trim(),
          credorId: bill.creditorId != null ? String(bill.creditorId) : "",
          companyId: bill.companyId != null ? String(bill.companyId) : String(this.companyIdOf(cc) || ""),
          documento: [docId, bill.documentNumber].filter(Boolean).join(" "),
          docId: String(docId || "").trim(),
          docNome: String(docNome || bill.documentIdentificationName || "").trim(),
          emissao: String(bill.issueDate || "").slice(0, 10),
          vencimento: String(bill.dueDate || "").slice(0, 10),
          pagamento: datas.length ? datas[datas.length - 1] : "",
          valor: original * fat,
          saldo: saldo,
          ccId: String(cc.id),
          ccNome: cc.name || "",
          esperada: null,
          contas,
          autorizacao,
          status: ""
        });
      });
    });
    linhas.sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || "") || Number(a.titulo) - Number(b.titulo) || Number(a.parcela) - Number(b.parcela));
    const ini = String(this.state.startDate || "").slice(0, 10);
    const fim = String(this.state.endDate || "").slice(0, 10);
    const noRecorte = linhas.filter((r) => {
      const v = String(r.vencimento || "").slice(0, 10);
      if (ini && fim && v >= ini && v <= fim) return true;
      return !r.pago && Number(r.aPagar) > 0.009;
    });
    this.state.titulos = noRecorte;
    this.state.previsoesIgnoradas = previsoes;
    if (window.DocumentosSiengeApp) DocumentosSiengeApp.registrarVistos(noRecorte.map((l) => ({ id: l.docId, nome: l.docNome })));
    this.reclassificar();
  },

  /* ---------- lotes a pagar por conta ---------- */
  chaveTitulo(titulo, parcela) {
    return String(titulo) + "|" + String(parcela || "");
  },

  lotesLocal() {
    try {
      const v = JSON.parse(localStorage.getItem(this.LOTES_LOCAL) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  },

  salvarLotesLocal(list) {
    try { localStorage.setItem(this.LOTES_LOCAL, JSON.stringify(list.slice(-300))); } catch (e) {}
  },

  async carregarLotes() {
    let list = null;
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.getDocs) {
      try {
        const snap = await fc.getDocs(fc.collection(window.firebaseDb, this.LOTES_COLLECTION));
        list = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
        this.salvarLotesLocal(list);
      } catch (e) {
        console.warn("[Gerar Pagamento] lotes", e);
        list = null;
      }
    }
    this.state.lotes = (list || this.lotesLocal()).filter((l) => l && !l.cancelado);
    this.state.lotes.forEach((l) => this.auditarLote(l));
  },

  /* Parcelas que já estão em lote/pagamento escritural no Sienge. */
  async carregarLotesSienge(gen) {
    const s = this.state;
    if (typeof window.siengeFetchWithRetry !== "function") return;
    s.loteSiengeLidoEm = Date.now();
    const deLotes = s.lotes.filter((l) => this.loteNoSienge(l)).flatMap((l) => (l.itens || []).map((i) => String(i.titulo)));
    const abertos = [...new Set(s.titulos.filter((r) => !r.pago).map((r) => r.titulo).concat(deLotes))];
    const fila = abertos.slice();
    const totalBills = fila.length;
    let feitos = 0;
    const worker = async () => {
      while (fila.length && gen === s.gen) {
        const billId = fila.shift();
        try {
          const res = await window.siengeFetchWithRetry(`/bills/${encodeURIComponent(billId)}/installments`, 1);
          const parcelas = (res && (res.results || res.data)) || (Array.isArray(res) ? res : []);
          parcelas.forEach((p) => {
            const num = p.installmentId != null ? p.installmentId : p.installmentNumber;
            if (num == null) return;
            s.formaSienge[this.chaveTitulo(billId, num)] = { tipo: String(p.paymentType || ""), tipoId: p.paymentTypeId != null ? String(p.paymentTypeId) : "" };
            if (p.batchNumber != null || p.sentToBank === true) {
              s.loteSienge[this.chaveTitulo(billId, num)] = p.batchNumber != null ? String(p.batchNumber) : "sim";
            }
          });
        } catch (e) {
          // sem a informação, o título continua disponível para lote
        }
        feitos += 1;
        if (gen === s.gen && totalBills) {
          s.progressoPct = 0.55 + (feitos / totalBills) * 0.4;
          this.pintarProgresso();
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (gen === s.gen) await this.conferirLotesExcluidosNoSienge();
  },

  /**
   * Lote que o Integra registrou no Sienge e que o operador excluiu direto no Sienge.
   * O lote inteiro some quando nenhuma parcela continua naquele número.
   * Se só parte saiu, esses títulos saem do lote do Integra e voltam para a busca, para reenvio.
   * sentToBank sem o número do lote não segura o título: o lote daquele número já não existe.
   */
  async conferirLotesExcluidosNoSienge() {
    const s = this.state;
    const lidoEm = s.loteSiengeLidoEm || 0;
    const soltar = (k, numero) => {
      const atual = s.loteSienge[k];
      if (!atual || atual === "sim" || atual === numero) delete s.loteSienge[k];
    };
    const passo = (acao, msg) => ({ acao, por: this.usuarioAtual(), porEmail: this.emailAtual(), em: new Date().toISOString(), ok: true, msg });
    const sumidos = [];
    for (const l of s.lotes) {
      const sg = l.sienge || {};
      if (!this.loteNoSienge(l) || !sg.numero) continue;
      const desde = new Date(sg.geradoEm || l.criadoEm || 0).getTime();
      if (!(desde < lidoEm)) continue;
      const itens = l.itens || [];
      const chaves = itens.map((i) => this.chaveTitulo(i.titulo, i.parcela));
      if (!chaves.length) continue;
      const numero = String(sg.numero);
      const visto = (k) => !!s.formaSienge[k];
      const ainda = (k) => s.loteSienge[k] === numero;
      const saiu = chaves.filter((k) => visto(k) && !ainda(k));
      if (!saiu.length) continue;
      const loteSumiu = chaves.every(visto) && chaves.every((k) => !ainda(k));
      if (loteSumiu) {
        const msg = `O lote nº ${numero} não existe mais no Sienge (excluído direto no Sienge). Os títulos podem ser reenviados.`;
        sg.historico = (sg.historico || []).concat([passo("excluir", msg)]).slice(-30);
        sg.status = "excluido";
        l.cancelado = true;
        l.canceladoEm = new Date().toISOString();
        l.canceladoMotivo = msg;
        chaves.forEach((k) => soltar(k, numero));
        await this.salvarLote(l);
        this.auditarLote(l);
        sumidos.push(l);
        continue;
      }
      const fora = new Set(saiu);
      const lista = itens.filter((i) => fora.has(this.chaveTitulo(i.titulo, i.parcela))).map((i) => `${i.titulo}/${i.parcela || 1}`);
      const resto = itens.filter((i) => !fora.has(this.chaveTitulo(i.titulo, i.parcela)));
      const msg = `Títulos ${lista.join(", ")} saíram do lote nº ${numero} no Sienge e podem ser reenviados.`;
      sg.historico = (sg.historico || []).concat([passo("retirar", msg)]).slice(-30);
      l.itens = resto;
      l.total = Math.round(resto.reduce((t, i) => t + Number(i.valor || 0), 0) * 100) / 100;
      saiu.forEach((k) => soltar(k, numero));
      await this.salvarLote(l);
      this.auditarLote(l);
    }
    if (sumidos.length) {
      const ids = new Set(sumidos.map((l) => l.id));
      s.lotes = s.lotes.filter((l) => !ids.has(l.id));
    }
  },

  /* ---------- forma de pagamento: boleto conferido (código, valor, vencimento, desconto) ---------- */
  lerFormaPagamento(titulo, parcela, tipo) {
    return window.BoletoCheck.lerForma(titulo, parcela, tipo);
  },

  /** Cadastro do credor para conferir o titular da chave PIX: CPF/CNPJ, telefones, e-mails e chaves PIX cadastradas. */
  carregarCredor(id) {
    if (!id) return Promise.resolve({ erro: "título sem código do credor" });
    const cache = this.state.credores;
    if (!cache[id]) {
      const BC = window.BoletoCheck;
      const lista = (res) => (Array.isArray(res) ? res : ((res && (res.results || res.data)) || []));
      cache[id] = (async () => {
        const [cad, pix] = await Promise.all([
          window.siengeFetchWithRetry(`/creditors/${encodeURIComponent(id)}`, 1),
          window.siengeFetchWithRetry(`/creditors/${encodeURIComponent(id)}/pix-informations`, 1).catch(() => null)
        ]);
        if (!cad || typeof cad !== "object") return { erro: "credor não encontrado" };
        const telefones = []
          .concat(lista(cad.phones).map((p) => `${p.ddd || ""}${p.number || ""}`))
          .concat(lista(cad.contacts).map((c) => `${c.ddd || ""}${c.number || ""}`))
          .map((t) => BC.telNorm(t)).filter((t) => t.length >= 10);
        const emails = []
          .concat(lista(cad.otherContactMethods).filter((m) => ["1", "2"].includes(String(m.type))).map((m) => m.address))
          .concat(lista(cad.contacts).map((c) => c.email))
          .map((e) => String(e || "").trim().toLowerCase()).filter((e) => e.includes("@"));
        const chaves = lista(pix).map((p) => {
          const tipo = String(p.type || p.keyPixType || "").trim().toUpperCase();
          const b = p.beneficiary && typeof p.beneficiary === "object" ? p.beneficiary : {};
          const docBenef = BC.digits(p.cpf || p.cnpj || p.beneficiaryCpf || p.beneficiaryCnpj || b.cpf || b.cnpj || b.document || b.cpfCnpj || "");
          return {
            tipo,
            original: String(p.key || p.keyPix || "").trim(),
            chave: BC.chaveNorm(tipo, p.key || p.keyPix),
            doc: docBenef.length === 11 || docBenef.length === 14 ? docBenef : "",
            padrao: String(p.defaultFlag || "").toUpperCase() === "S"
          };
        }).filter((c) => c.tipo && c.chave);
        return { id, nome: cad.name || "", doc: BC.digits(cad.cnpj || cad.cpf), telefones, emails, chaves };
      })().catch((e) => ({ erro: (e && e.message) || "falha na consulta" }));
    }
    return cache[id];
  },

  /**
   * Autorização da parcela no Sienge (bulk com withAuthorizations=true). Vale o authorizationStatus da parcela
   * (S = autorizada, N = não autorizada); sem ele, a parcela está autorizada quando o último da alçada (isLastToAuthorize) autorizou.
   */
  autorizacaoDe(bill) {
    const lista = (Array.isArray(bill && bill.authorizations) ? bill.authorizations : []).filter(Boolean);
    const sim = (v) => v === true || /^(s|sim|y|yes|true|1)$/i.test(String(v == null ? "" : v).trim());
    const nome = (a) => String(a.authorizationUserName || a.authorizationUserId || "").trim();
    const recentes = lista.slice().sort((a, b) => String(b.authorizationDate || "").localeCompare(String(a.authorizationDate || "")));
    const status = String((bill && bill.authorizationStatus) == null ? "" : bill.authorizationStatus).trim().toUpperCase();
    if (status === "S") {
      const quem = recentes.find((a) => sim(a.isLastToAuthorize)) || recentes[0];
      return { ok: true, por: quem ? nome(quem) : "", em: quem ? String(quem.authorizationDate || "").slice(0, 10) : "" };
    }
    if (status === "N" && !lista.length) return { ok: false, motivo: "Título não autorizado no Sienge." };
    const ultima = status === "N" ? null : recentes.find((a) => sim(a.isLastToAuthorize));
    if (ultima) return { ok: true, por: nome(ultima), em: String(ultima.authorizationDate || "").slice(0, 10) };
    if (lista.length) {
      return { ok: false, parcial: true, motivo: `Autorização incompleta no Sienge: autorizado por ${[...new Set(lista.map(nome).filter(Boolean))].join(", ") || "parte da alçada"}, falta o último a autorizar.` };
    }
    return { ok: false, motivo: "Título não autorizado no Sienge." };
  },

  /**
   * Selo da coluna Autorização. Quando o documento exige ciência (cadastro de documentos do Sienge),
   * mostra a ciência antes. A API do Sienge não informa a ciência; ela é dada antes da autorização,
   * então título com autorização (completa ou parcial) já teve ciência.
   */
  autorizacaoSeloHtml(it) {
    if (it.emLote) return `<span class="gp-muted">—</span>`;
    const aut = it.autorizacao || {};
    const doc = it.docId || "";
    const exige = !!doc && typeof window.documentoExigeCiencia === "function" && window.documentoExigeCiencia(doc);
    let ciencia = "";
    if (exige) {
      ciencia = aut.ok || aut.parcial
        ? `<span class="bchk bchk-ok" title="${this.esc(`O documento ${doc} exige ciência antes da autorização. O título já tem autorização no Sienge, então a ciência foi dada.`)}">Ciência ✓</span>`
        : `<span class="bchk bchk-info" title="${this.esc(`O documento ${doc} exige ciência antes da autorização. A API do Sienge não informa se a ciência já foi dada: confira no Sienge.`)}">Ciência ?</span>`;
    }
    const dica = aut.ok
      ? `Autorizado no Sienge por ${aut.por || "—"}${aut.em ? " em " + this.dataBr(aut.em) : ""}`
      : (aut.motivo || "Autorização não verificada no Sienge.");
    const cls = aut.ok ? "bchk-ok" : (aut.parcial ? "bchk-aviso" : "bchk-erro");
    const txt = aut.ok ? "Autorizado ✓" : (aut.parcial ? "Autorização incompleta" : "Não autorizado");
    return `<span class="gp-aut">${ciencia}${ciencia ? `<i data-lucide="chevron-right" class="gp-aut-seta"></i>` : ""}<span class="bchk ${cls}" title="${this.esc(dica)}">${txt}</span></span>`;
  },

  semAutorizacao(it) {
    return !it.emLote && !(it.autorizacao && it.autorizacao.ok);
  },

  textoFalhaConsulta(err) {
    const m = String((err && err.message) || err || "");
    if (/\b429\b/.test(m)) return "O Sienge limitou as consultas (429). Busque os títulos de novo em instantes.";
    return m || "O Sienge não respondeu à consulta da forma de pagamento.";
  },

  /** Conferindo só enquanto a fila deste título ainda está andando. Título fora da fila não fica nesse texto. */
  conferindoAgora(it) {
    const v = this.state.validacao;
    return !!(v && v.rodando && !it.emLote && it.autorizacao && it.autorizacao.ok && !it.pag);
  },

  antecipadoLiberado(it) {
    const chave = it && (it.chave || it);
    return !!(chave && this.state.antecipadoOk && this.state.antecipadoOk[chave]);
  },

  beneficiarioLiberado(it) {
    const chave = it && (it.chave || it);
    return !!(chave && this.state.beneficiarioOk && this.state.beneficiarioOk[chave]);
  },

  /** O aviso de data do boleto, e o de beneficiário, saem do bloqueio depois que o operador libera. */
  avisoQueBloqueia(check, it) {
    const livres = new Set((check && check.avisosLivres) || []);
    return ((check && check.avisos) || []).filter((a) => {
      if (livres.has(a)) return false;
      if (check.antecipado && this.antecipadoLiberado(it) && /pagamento antecipado/i.test(a)) return false;
      if (check.vencimentoPosterior && this.antecipadoLiberado(it) && /boleto vence em/i.test(a)) return false;
      if (check.beneficiarioDivergente && this.beneficiarioLiberado(it) && /benefici[aá]rio do boleto/i.test(a)) return false;
      return true;
    })[0] || "";
  },

  liberarBeneficiario(chave) {
    const k = String(chave || "");
    if (!k) return;
    this.state.beneficiarioOk[k] = true;
    Object.keys(this.state.sel).forEach((sel) => {
      if (sel.endsWith("|" + k)) this.state.sel[sel] = true;
    });
    this.paintTitulos();
  },

  docBeneficiarioPagamento(payment) {
    const d = (payment && payment.data) || {};
    const keys = ["beneficiaryCNPJNumber", "beneficiaryCPFNumber", "boletoBeneficiaryCNPJNumber", "boletoBeneficiaryCPFNumber"];
    for (const k of keys) {
      const n = window.BoletoCheck ? BoletoCheck.digits(d[k]) : String(d[k] || "").replace(/\D/g, "");
      if (n.length === 11 || n.length === 14) return n;
    }
    return "";
  },

  /** Boleto cujo beneficiário não é o prestador da nota: o operador ajusta no Sienge e libera aqui. */
  async alertarBeneficiarioBoleto(check, payment, nota, billId) {
    if (!check || !window.BoletoCheck || !BoletoCheck.ehBoleto(payment)) return;
    if (payment.kind === "boleto-concessionaria" || payment.kind === "boleto-tax") return;
    const prestador = nota && (nota.cnpjPrestador || "");
    const docsNota = new Set(((nota && nota.cnpjs) || []).map((d) => BoletoCheck.digits(d)).filter((d) => d.length >= 11));
    if (prestador) docsNota.add(BoletoCheck.digits(prestador));
    if (!docsNota.size && !(nota && nota.cnpjPrestador)) return;
    let benef = this.docBeneficiarioPagamento(payment);
    if (!benef && window.NotaFiscalCheck && typeof NotaFiscalCheck.cnpjBeneficiarioBoleto === "function") {
      try { benef = await NotaFiscalCheck.cnpjBeneficiarioBoleto(billId); } catch (e) { benef = ""; }
    }
    if (!benef || (benef.length !== 11 && benef.length !== 14)) return;
    const prest = BoletoCheck.digits(prestador);
    const igual = prest ? benef === prest : docsNota.has(benef);
    if (igual) return;
    const msg = `Beneficiário do boleto (${BoletoCheck.docFmt(benef)}) é diferente do prestador da nota. Informe no Sienge que o beneficiário foi alterado e clique em Liberar.`;
    check.avisos = check.avisos || [];
    if (!check.avisos.includes(msg)) check.avisos.push(msg);
    check.beneficiarioDivergente = true;
    if (check.nivel === "ok" || check.nivel === "info" || !check.nivel) {
      check.nivel = "aviso";
      check.resumo = msg;
    }
  },

  liberarAntecipado(chave) {
    const k = String(chave || "");
    if (!k) return;
    this.state.antecipadoOk[k] = true;
    Object.keys(this.state.sel).forEach((sel) => {
      if (sel.endsWith("|" + k)) this.state.sel[sel] = true;
    });
    this.paintTitulos();
  },

  pagSeloDe(it) {
    if (it.emLote || !window.BoletoCheck) return `<span class="gp-muted">—</span>`;
    if (it.pag && it.pag.check) {
      const c = it.pag.check;
      let html = BoletoCheck.seloHtml(c);
      if ((c.antecipado || c.vencimentoPosterior) && c.nivel !== "erro") {
        const dica = c.vencimentoPosterior
          ? "Libera este boleto, que vence depois da parcela, para entrar no lote"
          : "Libera este boleto antecipado para entrar no lote";
        const livre = c.vencimentoPosterior
          ? "Boleto com vencimento posterior liberado para entrar no lote."
          : "Pagamento antecipado liberado para entrar no lote.";
        html += this.antecipadoLiberado(it)
          ? ` <span class="bchk bchk-ok" title="${this.esc(livre)}">Liberado</span>`
          : ` <button type="button" class="gp-liberar" title="${this.esc(dica)}" onclick="event.stopPropagation();GerarPagamentoApp.liberarAntecipado('${this.esc(it.chave)}')">Liberar</button>`;
      }
      if (c.beneficiarioDivergente) {
        html += this.beneficiarioLiberado(it)
          ? ` <span class="bchk bchk-ok" title="Beneficiário do boleto diferente da nota, liberado para entrar no lote.">Liberado</span>`
          : ` <button type="button" class="gp-liberar" title="Confirme no Sienge que o beneficiário foi alterado e libere o título para o lote" onclick="event.stopPropagation();GerarPagamentoApp.liberarBeneficiario('${this.esc(it.chave)}')">Liberar</button>`;
      }
      return html;
    }
    if (this.conferindoAgora(it)) return `<span class="bchk bchk-wait" title="A conferência deste título está em andamento.">Conferindo…</span>`;
    if (this.semAutorizacao(it)) return `<span class="gp-muted" title="A forma de pagamento é conferida depois da autorização no Sienge.">—</span>`;
    return `<span class="bchk bchk-erro" title="A conferência deste título não terminou. Busque os títulos de novo.">Não conferido</span>`;
  },

  fiscalSeloDe(it) {
    if (it.emLote || !window.NotaFiscalCheck) return `<span class="gp-muted">—</span>`;
    if (it.pag && it.pag.fiscal) return NotaFiscalCheck.seloHtml(it.pag.fiscal);
    if (it.pag && it.pag.falha) return `<span class="bchk bchk-erro" title="${this.esc(it.pag.check && it.pag.check.resumo || "A nota não foi conferida porque a consulta ao Sienge falhou.")}">Não conferido</span>`;
    if (it.pag) return `<span class="gp-muted" title="Documento sem retenção de imposto na fonte (NF-e de produto, energia, CT-e ou documento que não é de serviço).">—</span>`;
    if (this.conferindoAgora(it)) return `<span class="bchk bchk-wait" title="A conferência deste título está em andamento.">Conferindo…</span>`;
    return `<span class="gp-muted">—</span>`;
  },

  conferenciaHtml() {
    const v = this.state.validacao || {};
    if (v.rodando) {
      const falha = v.falhas
        ? ` ${v.falhas} já falharam${v.limite ? " porque o Sienge limitou as consultas (429)" : ""}. Esses deixam de aparecer como Conferindo.`
        : "";
      return `<div class="gp-conf" role="status">
        <span class="loading-spinner gp-conf-spin"></span>
        <div><strong>Conferindo pagamentos e notas em segundo plano.</strong> ${v.feitos} de ${v.total}.${falha}</div>
      </div>`;
    }
    if (v.falhas) {
      return `<div class="gp-conf is-erro" role="alert">
        <i data-lucide="alert-triangle" style="width:16px;height:16px;flex:none;"></i>
        <div><strong>${v.falhas} título(s) ficaram sem conferência.</strong> ${v.limite ? "O Sienge limitou as consultas (429). " : ""}Busque os títulos de novo para tentar outra vez. O que está como Não conferido não está mais rodando.</div>
      </div>`;
    }
    return "";
  },

  /** Bloqueio que aponta problema no título (não só a espera da conferência da forma de pagamento). */
  bloqueioVisivel(it) {
    return !!it.bloqueio && !!(it.pag || this.bloqueioRateio(it.rateio) || this.semAutorizacao(it));
  },

  /** Motivo que impede o título de entrar em lote (sem autorização, rateio ou plano financeiro fora do padrão, forma de pagamento não conferida ou divergente). */
  bloqueioLote(it) {
    if (it.emLote) return "";
    if (this.semAutorizacao(it)) return (it.autorizacao && it.autorizacao.motivo) || "Autorização do título não verificada no Sienge.";
    const rateio = this.bloqueioRateio(it.rateio);
    if (rateio) return rateio;
    const p = it.pag;
    if (!p) return "Forma de pagamento ainda não conferida.";
    const c = p.check;
    if (c.nivel === "erro" || c.nivel === "sem") return c.resumo || "Possível divergência na forma de pagamento.";
    if (c.nivel === "aviso") {
      const aviso = this.avisoQueBloqueia(c, it);
      if (aviso) return aviso;
    }
    if (p.fiscal && p.fiscal.nivel === "erro") return "Impostos: " + p.fiscal.resumo;
    return "";
  },

  /** Imposto retido que sai do valor a pagar: só quando o saldo da parcela ainda é o valor bruto do título. */
  retidoDe(it) {
    const f = it.pag && it.pag.fiscal;
    if (!f || !(f.retidoPagamento > 0.009) || !f.bruto) return 0;
    return Math.abs(it.aPagar - f.bruto) <= 0.01 ? f.retidoPagamento : 0;
  },

  valorPagar(it) {
    return Math.round((it.aPagar - this.retidoDe(it)) * 100) / 100;
  },

  resumoTitulo(chave) {
    const rows = this.state.titulos.filter((r) => this.chaveTitulo(r.titulo, r.parcela) === chave);
    if (!rows.length) return null;
    const r0 = rows[0];
    return {
      rows,
      ctx: this.contextoRateio(r0),
      aPagar: r0.tituloAPagar != null ? r0.tituloAPagar : rows.reduce((t, r) => t + (Number(r.aPagar) || 0), 0),
      valor: r0.tituloValor != null ? r0.tituloValor : rows.reduce((t, r) => t + (Number(r.valor) || 0), 0),
      ccs: (r0.ccsTitulo && r0.ccsTitulo.length ? r0.ccsTitulo : rows.map((r) => ({ id: r.ccId, nome: r.ccNome, parceria: true })))
        .slice().sort((a, b) => Number(a.id) - Number(b.id))
    };
  },

  async validarPagamentos(gen) {
    const s = this.state;
    if (typeof window.siengeFetchWithRetry !== "function" || !window.BoletoCheck) return;
    const chaves = [...new Set(s.titulos.filter((r) => !r.pago && r.aPagar > 0.009 && r.autorizacao && r.autorizacao.ok).map((r) => this.chaveTitulo(r.titulo, r.parcela)))]
      .filter((k) => !s.loteSienge[k] && !this.loteIntegraDe(k));
    s.validacao = { feitos: 0, total: chaves.length, rodando: chaves.length > 0, falhas: 0, limite: false };
    if (chaves.length) this.paintTitulos();
    let ultima = 0;
    const fila = chaves.slice();
    const pintar = () => {
      if (Date.now() - ultima < 700) return;
      ultima = Date.now();
      this.paintTitulos();
    };
    const worker = async () => {
      while (fila.length && gen === s.gen) {
        const chave = fila.shift();
        const t = this.resumoTitulo(chave);
        if (!t) {
          s.validacao.feitos += 1;
          pintar();
          continue;
        }
        const r = t.rows[0];
        const forma = s.formaSienge[chave] || {};
        let payment;
        try {
          payment = await this.lerFormaPagamento(r.titulo, r.parcela, forma.tipo);
        } catch (e) {
          if (gen !== s.gen) return;
          const msg = this.textoFalhaConsulta(e);
          s.pagInfo[chave] = { payment: undefined, check: BoletoCheck.checkFalhaConsulta(msg), fiscal: null, tipoSienge: forma.tipo || "", falha: true };
          s.validacao.falhas += 1;
          if (/\b429\b/.test(msg)) s.validacao.limite = true;
          Object.keys(s.sel).forEach((k) => {
            if (k.endsWith("|" + chave)) s.sel[k] = false;
          });
          s.validacao.feitos += 1;
          pintar();
          continue;
        }
        if (gen !== s.gen) return;
        const credor = payment && payment.kind === "pix" ? await this.carregarCredor(r.credorId) : undefined;
        if (gen !== s.gen) return;
        const ctx = { valor: t.aPagar, vencimento: r.vencimento, credor, tipo: forma.tipo || "" };
        let check = BoletoCheck.validar(payment, ctx);
        let fiscal = null;
        const boletoMenor = check.valorBoleto != null && check.valorBoleto > 0 && check.valorBoleto < t.aPagar - 0.01;
        if (window.NotaFiscalCheck && !NotaFiscalCheck.semRetencao(r.docId, r.docNome) && (NotaFiscalCheck.ehServico(r.docId, r.docNome) || boletoMenor)) {
          fiscal = await NotaFiscalCheck.analisar({ billId: r.titulo, credorId: r.credorId, bruto: t.valor }).catch((e) => {
            const msg = this.textoFalhaConsulta(e);
            if (/\b429\b/.test(msg)) s.validacao.limite = true;
            return { nivel: "erro", falhaConsulta: true, resumo: msg, erros: [msg], avisos: [], infos: [] };
          });
          if (gen !== s.gen) return;
          if (fiscal && fiscal.falhaConsulta) s.validacao.falhas += 1;
          if (fiscal && fiscal.retidoPagamento > 0.009) check = BoletoCheck.validar(payment, Object.assign({}, ctx, { retido: fiscal.retidoPagamento }));
        }
        if (gen !== s.gen) return;
        let notaBenef = fiscal && fiscal.nota;
        if (window.BoletoCheck && BoletoCheck.ehBoleto(payment) && payment.kind === "boleto-bancario" && !notaBenef && window.NotaFiscalCheck) {
          notaBenef = await NotaFiscalCheck.lerNota(r.titulo).catch(() => null);
          if (gen !== s.gen) return;
        }
        await this.alertarBeneficiarioBoleto(check, payment, notaBenef, r.titulo);
        if (gen !== s.gen) return;
        s.pagInfo[chave] = { payment, check, fiscal, tipoSienge: forma.tipo || "", falha: !!(check && check.falhaConsulta) || !!(fiscal && fiscal.falhaConsulta) };
        const soAntecipado = (check.antecipado || check.vencimentoPosterior) && check.nivel === "aviso" && !(check.erros || []).length
          && (check.avisos || []).every((a) => /pagamento antecipado|boleto vence em/i.test(a));
        const avisoLivre = check.nivel === "aviso" && !(check.erros || []).length && !this.avisoQueBloqueia(check, { chave });
        if (!soAntecipado && !avisoLivre && ["erro", "aviso", "sem"].includes(check.nivel)) {
          Object.keys(s.sel).forEach((k) => {
            if (k.endsWith("|" + chave)) s.sel[k] = false;
          });
        }
        s.validacao.feitos += 1;
        pintar();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (gen !== s.gen) return;
    this.reconciliarGuiasUnificadas();
    s.validacao.rodando = false;
    this.paintTitulos();
  },

  /** CSLL e IRPJ da mesma empresa saem numa guia só. O código traz a soma, não o valor de cada título. */
  tipoImpostoGuia(r) {
    const blob = [r && r.docId, r && r.docNome, r && r.documento].join(" ").toUpperCase();
    if (/\bCSLL\b/.test(blob)) return "CSLL";
    if (/\bIRPJ\b/.test(blob)) return "IRPJ";
    return "";
  },

  idsGuiaNasNotas(payment) {
    const d = (payment && payment.data) || {};
    const ids = new Set();
    Object.keys(d).forEach((k) => {
      if (typeof d[k] !== "string") return;
      const pedaco = String(d[k]).split(/\d{11,}/)[0];
      const m = pedaco.match(/t[ií]tulos?\s*[:\-]?\s*([^\n]+)/i);
      if (!m) return;
      m[1].split(/\D+/).forEach((n) => {
        if (n.length >= 4 && n.length <= 9) ids.add(n);
      });
    });
    return [...ids];
  },

  titulosAbertosDoId(billId) {
    const id = String(billId || "");
    const vistos = new Set();
    const saida = [];
    this.state.titulos.forEach((r) => {
      if (String(r.titulo) !== id || r.pago || !(r.aPagar > 0.009)) return;
      const chave = this.chaveTitulo(r.titulo, r.parcela);
      if (vistos.has(chave)) return;
      vistos.add(chave);
      const t = this.resumoTitulo(chave);
      if (t) saida.push({ chave, t, r: t.rows[0] });
    });
    return saida;
  },

  aplicarGuiaSomada(membros, valorGuia, fonte) {
    const s = this.state;
    const BC = window.BoletoCheck;
    const partes = membros.map((m) => {
      const imposto = this.tipoImpostoGuia(m.r);
      const nome = imposto ? imposto + ", " : "";
      return `${m.r.titulo} (${nome}${BC.money(m.t.aPagar)})`;
    });
    const info = `Guia unificada de ${BC.money(valorGuia)}. Os títulos ${partes.join(" e ")} somam o valor da guia.`;
    membros.forEach((m) => {
      const atual = s.pagInfo[m.chave];
      const base = (atual && atual.check) || {
        nivel: "ok", forma: "Guia unificada", resumo: "", erros: [], avisos: [], infos: [], desconto: false, linhaFmt: "", valorBoleto: valorGuia, vencBoleto: "", codigo: (fonte && fonte.check && fonte.check.codigo) || ""
      };
      base.erros = (base.erros || []).filter((e) => !/^Valor do boleto\b/.test(e));
      base.infos = (base.infos || []).filter((e) => !/somam o valor da guia/.test(e));
      base.infos.push(info);
      base.forma = "Guia unificada";
      base.guiaSomada = true;
      base.valorBoleto = valorGuia;
      if (fonte && fonte.check && fonte.check.linhaFmt && !base.linhaFmt) base.linhaFmt = fonte.check.linhaFmt;
      if (base.erros.length) base.nivel = "erro";
      else if ((base.avisos || []).length) base.nivel = "aviso";
      else base.nivel = "ok";
      base.resumo = base.erros[0] || (base.avisos || [])[0] || "Guia unificada conferida";
      s.pagInfo[m.chave] = {
        payment: (atual && atual.payment) || (fonte && fonte.info && fonte.info.payment) || null,
        check: base,
        fiscal: atual ? atual.fiscal : null,
        tipoSienge: (atual && atual.tipoSienge) || (fonte && fonte.info && fonte.info.tipoSienge) || "Guia unificada",
        falha: !!(atual && atual.falha)
      };
      if (base.nivel === "ok" || base.nivel === "info") {
        Object.keys(s.sel).forEach((k) => {
          if (k.endsWith("|" + m.chave) && !s.selManual[k]) s.sel[k] = true;
        });
      }
    });
  },

  /** A guia unificada (CSLL + IRPJ, em geral) confere quando a soma dos títulos bate com o código. */
  reconciliarGuiasUnificadas() {
    const s = this.state;
    const candidatos = [];
    const marcados = [];
    Object.keys(s.pagInfo || {}).forEach((chave) => {
      const info = s.pagInfo[chave];
      const t = this.resumoTitulo(chave);
      if (!info || !info.check || !t) return;
      const r = t.rows[0];
      const notas = (info.payment && info.payment.data && info.payment.data.notes) || "";
      const guiaNome = /guia\s*unificada/i.test(info.tipoSienge || "") || /guia\s*unificada/i.test(String(notas)) || /guia\s*unificada/i.test(info.check.forma || "");
      const imposto = this.tipoImpostoGuia(r);
      if (guiaNome && info.check.forma === "Boleto de concessionária") {
        info.check.forma = "Guia unificada";
        if (/^Boleto de concessionária/.test(info.check.resumo || "")) info.check.resumo = info.check.resumo.replace(/^Boleto de concessionária/, "Guia unificada");
      }
      const item = {
        chave, info, t, r, check: info.check, guiaNome, imposto,
        codigo: info.check.codigo || "",
        idsNotas: this.idsGuiaNasNotas(info.payment)
      };
      if (guiaNome) marcados.push(item);
      if (!(guiaNome || imposto) || !(info.check.valorBoleto > 0)) return;
      candidatos.push(item);
    });
    const usados = new Set();
    const somaDe = (lista) => Math.round(lista.reduce((t, m) => t + (Number(m.t.aPagar) || 0), 0) * 100) / 100;
    const bate = (soma, valor) => Math.abs(soma - Number(valor)) <= 0.01;
    candidatos.forEach((c) => {
      if (usados.has(c.chave) || c.idsNotas.length < 2) return;
      const visto = new Set();
      const membros = [];
      c.idsNotas.forEach((id) => {
        this.titulosAbertosDoId(id).forEach((m) => {
          if (visto.has(m.chave)) return;
          visto.add(m.chave);
          membros.push(m);
        });
      });
      if (membros.length < 2) return;
      const soma = somaDe(membros);
      if (!bate(soma, c.check.valorBoleto)) return;
      this.aplicarGuiaSomada(membros, c.check.valorBoleto, c);
      membros.forEach((m) => usados.add(m.chave));
    });
    const porCodigo = {};
    candidatos.forEach((c) => {
      if (usados.has(c.chave) || c.codigo.length < 44) return;
      (porCodigo[c.codigo] = porCodigo[c.codigo] || []).push(c);
    });
    Object.keys(porCodigo).forEach((k) => {
      const grupo = porCodigo[k].filter((c) => !usados.has(c.chave));
      if (grupo.length < 2) return;
      const guia = grupo.some((c) => c.guiaNome);
      const impostos = new Set(grupo.map((c) => c.imposto).filter(Boolean));
      const par = impostos.has("CSLL") && impostos.has("IRPJ");
      if (!guia && !par) return;
      if (!guia && grupo.some((c) => !c.imposto)) return;
      const membros = grupo.map((c) => ({ chave: c.chave, t: c.t, r: c.r }));
      const soma = somaDe(membros);
      if (!bate(soma, grupo[0].check.valorBoleto)) return;
      this.aplicarGuiaSomada(membros, grupo[0].check.valorBoleto, grupo[0]);
      membros.forEach((m) => usados.add(m.chave));
    });
    this.casarGuiasPelaSoma(marcados, usados);
  },

  /** Títulos marcados como guia unificada somam o valor do boleto e entram num pagamento só. */
  casarGuiasPelaSoma(candidatos, usados) {
    const guia = (c) => !!(c && c.guiaNome);
    const dia = (c) => String(c.r.vencimento || "").slice(0, 10);
    const emp = (c) => String(c.r.companyId || "");
    const valorDe = (c) => Math.round((Number(c.t.aPagar) || 0) * 100) / 100;
    const livres = candidatos.filter((c) => guia(c) && !usados.has(c.chave) && valorDe(c) > 0.009);
    const anchors = livres.filter((c) => c.check && c.check.valorBoleto > 0 && Math.abs(valorDe(c) - Number(c.check.valorBoleto)) > 0.01);
    anchors.forEach((anchor) => {
      if (usados.has(anchor.chave)) return;
      const alvo = Number(anchor.check.valorBoleto);
      const pool = livres.filter((c) => {
        if (c.chave === anchor.chave || usados.has(c.chave)) return false;
        if (anchor.codigo && anchor.codigo.length >= 44 && c.codigo && c.codigo.length >= 44) {
          if (c.codigo === anchor.codigo) return true;
          return Math.abs(Number(c.check.valorBoleto) - alvo) <= 0.01 && emp(c) === emp(anchor) && dia(c) === dia(anchor);
        }
        return emp(c) === emp(anchor) && dia(c) === dia(anchor);
      }).slice(0, 8);
      const extra = this.menorSomaGuia(pool, Math.round((alvo - valorDe(anchor)) * 100) / 100, valorDe);
      if (!extra || !extra.length) return;
      const grupo = [anchor].concat(extra);
      const soma = Math.round(grupo.reduce((t, c) => t + valorDe(c), 0) * 100) / 100;
      if (Math.abs(soma - alvo) > 0.01) return;
      const membros = grupo.map((c) => ({ chave: c.chave, t: c.t, r: c.r }));
      this.aplicarGuiaSomada(membros, alvo, anchor);
      membros.forEach((m) => usados.add(m.chave));
    });
  },

  menorSomaGuia(pool, falta, valorDe) {
    if (!(falta > 0.009)) return null;
    const alvo = Math.round(falta * 100) / 100;
    let melhor = null;
    const rec = (i, acc, soma) => {
      if (melhor && acc.length >= melhor.length) return;
      if (acc.length && Math.abs(soma - alvo) <= 0.01) {
        melhor = acc.slice();
        return;
      }
      if (soma > alvo + 0.02 || acc.length >= 4 || i >= pool.length) return;
      for (let j = i; j < pool.length; j++) {
        acc.push(pool[j]);
        rec(j + 1, acc, Math.round((soma + valorDe(pool[j])) * 100) / 100);
        acc.pop();
        if (melhor && melhor.length === 1) return;
      }
    };
    rec(0, [], 0);
    return melhor;
  },

  /** Abre o mesmo resumo do título usado no Contas a Pagar (dados, anexos, forma de pagamento conferida). */
  abrirResumo(chave) {
    const app = window.ComprasControleApp;
    const t = this.resumoTitulo(chave);
    if (!t || !app || typeof app.abrirTituloRow !== "function") return;
    const r = t.rows[0];
    const doc = String(r.documento || "").trim();
    const esp = doc.indexOf(" ");
    const cc = this.ccDe(r.ccId);
    const situacao = r.pago
      ? (r.status === "ok" ? "Pago na conta de parceria" : (r.status === "outra" ? "Pago em outra conta" : "Pago"))
      : (s => s.loteIntegra ? "No lote " + s.loteIntegra.id : (s.loteSienge ? "Já em lote no Sienge" + (s.loteSienge !== "sim" ? " nº " + s.loteSienge : "") : "Em aberto"))({
        loteIntegra: this.loteIntegraDe(chave), loteSienge: this.state.loteSienge[chave] || ""
      });
    app.abrirTituloRow({
      titulo: r.titulo,
      parcela: r.parcela,
      credor: r.credor,
      docId: esp > 0 ? doc.slice(0, esp) : "",
      documento: esp > 0 ? doc.slice(esp + 1) : doc,
      vencimento: r.vencimento,
      saldo: t.aPagar,
      valor: t.valor,
      valorAjustado: t.valor,
      ccId: t.ccs.map((x) => x.id).join(" / "),
      ccNome: t.ccs.length > 1 ? "rateado" : (t.ccs[0] && t.ccs[0].nome) || r.ccNome,
      rateioHtml: this.rateioHtml(this.conferirRateio(t.ccs, t.valor, t.ctx)),
      companyId: cc ? this.companyIdOf(cc) : "",
      natureza: r.pago ? "pago" : "",
      dataPagamento: r.pagamento || "",
      conta: r.contas && r.contas.length ? "C/C " + r.contas.join(", ") : "",
      situacaoTexto: situacao + (r.pago || !r.autorizacao ? ""
        : ((r.docId && typeof window.documentoExigeCiencia === "function" && window.documentoExigeCiencia(r.docId)
          ? (r.autorizacao.ok || r.autorizacao.parcial ? " · ciência dada" : " · exige ciência antes da autorização")
          : "") + (r.autorizacao.ok
          ? ` · autorizado por ${r.autorizacao.por || "—"}${r.autorizacao.em ? " em " + this.dataBr(r.autorizacao.em) : ""}`
          : ` · ${r.autorizacao.parcial ? "autorização incompleta" : "não autorizado"} no Sienge`))),
      pagCheck: this.state.pagInfo[chave] ? this.state.pagInfo[chave].check : null,
      pagPayment: this.state.pagInfo[chave] ? this.state.pagInfo[chave].payment : undefined,
      fiscal: this.state.pagInfo[chave] ? this.state.pagInfo[chave].fiscal : null,
      credorId: r.credorId,
      docNome: r.docNome
    });
  },

  loteNoSienge(l) {
    const st = l && l.sienge && l.sienge.status;
    return st === "gerado" || st === "aprovado";
  },

  temTitulo(l, chave) {
    return (l.itens || []).some((i) => this.chaveTitulo(i.titulo, i.parcela) === chave);
  },

  /* Só o lote confirmado no Sienge prende o título; o que ficou só no Integra não impede gerar de novo. */
  loteIntegraDe(chave) {
    return this.state.lotes.find((l) => this.loteNoSienge(l) && this.temTitulo(l, chave)) || null;
  },

  lotePendenteDe(chave) {
    return this.state.lotes.find((l) => !this.loteNoSienge(l) && this.temTitulo(l, chave)) || null;
  },

  /** Tira os títulos de lotes que não chegaram ao Sienge; lote que fica vazio é apagado. */
  async limparPendentes(chaves) {
    const s = this.state;
    const alvo = new Set(chaves);
    const fc = window.firebaseCollections;
    for (const l of s.lotes.filter((x) => !this.loteNoSienge(x) && (x.itens || []).some((i) => alvo.has(this.chaveTitulo(i.titulo, i.parcela))))) {
      const resto = (l.itens || []).filter((i) => !alvo.has(this.chaveTitulo(i.titulo, i.parcela)));
      if (resto.length) {
        l.itens = resto;
        l.total = Math.round(resto.reduce((t, i) => t + (Number(i.valor) || 0), 0) * 100) / 100;
        await this.salvarLote(l);
        continue;
      }
      s.lotes = s.lotes.filter((x) => x.id !== l.id);
      this.salvarLotesLocal(this.lotesLocal().filter((x) => x.id !== l.id));
      if (window.firebaseDb && fc && fc.deleteDoc) {
        try { await fc.deleteDoc(fc.doc(window.firebaseDb, this.LOTES_COLLECTION, l.id)); } catch (e) { console.warn("[Gerar Pagamento] apagar lote pendente", l.id, e); }
      }
    }
  },

  /* Títulos em aberto agrupados por conta de parceria e dia do lote (um lote por conta por dia).
     Vencimento de sábado ou domingo entra no lote da segunda.
     Título com CC de parceria entra inteiro: valor total e todos os CCs do rateio, inclusive os que não são de parceria.
     Se os CCs de parceria do título forem de contas diferentes, cada conta fica só com a sua parte.
     Parceria completa sai inteira na conta do parceiro, sem transferência.
     Título misturado com outro centro sai na conta desse centro e avisa a transferência do par. */
  gruposLote() {
    const grupos = {};
    const abertosTodos = this.state.titulos.filter((r) => !r.pago && r.aPagar > 0.009);
    const porTitulo = {};
    abertosTodos.forEach((r) => {
      const ch = this.chaveTitulo(r.titulo, r.parcela);
      (porTitulo[ch] = porTitulo[ch] || []).push(r);
    });
    const destinos = {};
    Object.keys(porTitulo).forEach((ch) => {
      const destino = this.destinoDocumento(porTitulo[ch]);
      if (destino) destinos[ch] = destino;
    });
    // CC da obra com conta própria (ex.: 14000 na conta MLDU) só define a conta quando o título não tem CC de parceria.
    const comParceria = new Set(abertosTodos.filter((r) => this.ccDeParceriaPeloNome(r.ccId, r.ccNome)).map((r) => this.chaveTitulo(r.titulo, r.parcela)));
    const abertos = abertosTodos.filter((r) => {
      const ch = this.chaveTitulo(r.titulo, r.parcela);
      if (destinos[ch]) return false;
      return !comParceria.has(ch) || this.ccDeParceriaPeloNome(r.ccId, r.ccNome);
    });
    const contaKeyDe = (r) => (r.esperada ? this.numConta(r.esperada.numero || r.esperada.id) || String(r.esperada.id) : "");
    const contasDoTitulo = {};
    abertos.forEach((r) => {
      const chave = this.chaveTitulo(r.titulo, r.parcela);
      (contasDoTitulo[chave] = contasDoTitulo[chave] || new Set()).add(contaKeyDe(r));
    });
    abertos.forEach((r) => {
      const conta = r.esperada;
      const contaKey = contaKeyDe(r);
      const dia = this.diaDoLote(r.vencimento);
      const key = conta ? contaKey + "@" + (dia || "sem-data") : "__sem";
      if (!grupos[key]) {
        const ccConta = this.ccDe(r.ccId);
        grupos[key] = { key, contaKey, dia: conta ? dia : "", conta, empresaConta: String((ccConta && this.companyIdOf(ccConta)) || ""), itens: {}, ordem: [] };
      }
      const g = grupos[key];
      const chave = this.chaveTitulo(r.titulo, r.parcela);
      const inteiro = contasDoTitulo[chave].size === 1 && r.tituloAPagar != null;
      if (!g.itens[chave]) {
        g.itens[chave] = {
          chave, titulo: r.titulo, parcela: r.parcela, credor: r.credor, credorId: r.credorId, companyId: r.companyId, documento: r.documento,
          vencimento: r.vencimento, valor: 0, aPagar: 0, ccs: [], inteiro, autorizacao: r.autorizacao || null
        };
        g.ordem.push(chave);
        if (inteiro) {
          Object.assign(g.itens[chave], {
            valor: r.tituloValor,
            aPagar: r.tituloAPagar,
            ccs: (r.ccsTitulo || []).map((c) => ({ id: c.id, nome: c.nome, parceria: c.parceria, rateio: c.rateio, planos: c.planos || [] }))
          });
        }
      }
      const it = g.itens[chave];
      if (it.inteiro) return;
      it.valor += r.valor;
      it.aPagar += r.aPagar;
      if (!it.ccs.some((c) => c.id === r.ccId)) it.ccs.push({ id: r.ccId, nome: r.ccNome, parceria: true });
    });
    Object.keys(destinos).forEach((ch) => {
      const d = destinos[ch];
      const r = porTitulo[ch][0];
      const conta = d.conta;
      if (!conta) {
        const key = "__sem";
        if (!grupos[key]) grupos[key] = { key, contaKey: "", dia: "", conta: null, empresaConta: String(r.companyId || ""), itens: {}, ordem: [] };
        const g = grupos[key];
        if (g.itens[ch]) return;
        g.itens[ch] = {
          chave: ch, titulo: r.titulo, parcela: r.parcela, credor: r.credor, credorId: r.credorId, companyId: r.companyId, documento: r.documento,
          vencimento: r.vencimento, valor: r.tituloValor, aPagar: r.tituloAPagar, inteiro: true, autorizacao: r.autorizacao || null,
          guiaUnica: false, acertos: [],
          ccs: (r.ccsTitulo || []).map((c) => ({ id: c.id, nome: c.nome, parceria: c.parceria, rateio: c.rateio, planos: c.planos || [] }))
        };
        g.ordem.push(ch);
        return;
      }
      const contaKey = this.numConta(conta.numero || conta.id) || String(conta.id);
      const dia = this.diaDoLote(r.vencimento);
      const key = contaKey + "@" + (dia || "sem-data");
      if (!grupos[key]) {
        const ccConta = this.ccDe(r.ccId);
        grupos[key] = { key, contaKey, dia: dia || "", conta, empresaConta: String(r.companyId || (ccConta && this.companyIdOf(ccConta)) || ""), itens: {}, ordem: [] };
      }
      const g = grupos[key];
      if (g.itens[ch]) return;
      g.itens[ch] = {
        chave: ch, titulo: r.titulo, parcela: r.parcela, credor: r.credor, credorId: r.credorId, companyId: r.companyId, documento: r.documento,
        vencimento: r.vencimento, valor: r.tituloValor, aPagar: r.tituloAPagar, inteiro: true, autorizacao: r.autorizacao || null,
        guiaUnica: !!(d.acertos && d.acertos.length), acertos: d.acertos || [],
        ccs: (r.ccsTitulo || []).map((c) => ({ id: c.id, nome: c.nome, parceria: c.parceria, rateio: c.rateio, planos: c.planos || [] }))
      };
      g.ordem.push(ch);
    });
    return Object.values(grupos).map((g) => {
      const itens = g.ordem.map((k) => g.itens[k]).sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || "") || Number(a.titulo) - Number(b.titulo));
      itens.forEach((it) => {
        it.ccs.sort((a, b) => Number(a.id) - Number(b.id));
        const t = this.resumoTitulo(it.chave);
        if (t && t.aPagar > 0.009) {
          it.aPagar = t.aPagar;
          it.valor = t.valor;
          if (t.ccs && t.ccs.length) {
            it.ccs = t.ccs.map((c) => ({ id: c.id, nome: c.nome, parceria: !!c.parceria, rateio: c.rateio, planos: c.planos || [] }));
          }
        }
        it.rateio = t ? this.conferirRateio(t.ccs, t.valor, t.ctx) : null;
        this.aplicarAprendizado(it, g.contaKey);
        it.loteIntegra = this.loteIntegraDe(it.chave);
        it.loteSienge = this.state.loteSienge[it.chave] || "";
        it.emLote = !!(it.loteIntegra || it.loteSienge);
        const selKey = g.key + "|" + it.chave;
        if (!this.state.selInit[selKey]) {
          this.state.selInit[selKey] = true;
          this.state.sel[selKey] = g.key !== "__sem" && !it.emLote;
        }
        it.selKey = selKey;
        it.pag = this.state.pagInfo[it.chave] || null;
        it.bloqueio = this.bloqueioLote(it);
        it.marcado = !it.emLote && !it.bloqueio && !!this.state.sel[selKey];
      });
      return { ...g, itens };
    }).sort((a, b) => (a.key === "__sem") - (b.key === "__sem")
      || this.contaLabel(a.conta).localeCompare(this.contaLabel(b.conta))
      || String(a.dia).localeCompare(String(b.dia)));
  },

  lotesDoGrupo(g) {
    const ids = [];
    g.itens.forEach((it) => {
      const nome = it.loteIntegra ? it.loteIntegra.id : (it.loteSienge ? "Sienge" + (it.loteSienge !== "sim" ? " nº " + it.loteSienge : "") : "");
      if (nome && !ids.includes(nome)) ids.push(nome);
    });
    return ids;
  },

  setVisao(v) {
    this.state.visao = v;
    this.paintTitulos();
  },

  toggleItem(selKey) {
    this.state.sel[selKey] = !this.state.sel[selKey];
    this.state.selManual[selKey] = true;
    this.paintTitulos();
  },

  setAbaLotes(v) {
    this.state.abaLotes = v;
    this.paintTitulos();
  },

  /* Empresa dona da conta de parceria. Sem isso, usa a empresa mais frequente nos títulos do lote. */
  empresaDoGrupo(g) {
    const direta = String((g && g.empresaConta) || "").trim();
    if (direta) return direta;
    const pesos = {};
    (g && g.itens || []).forEach((it) => {
      const id = String((it && it.companyId) || "").trim();
      if (id) pesos[id] = (pesos[id] || 0) + 1;
    });
    return Object.keys(pesos).sort((a, b) => pesos[b] - pesos[a] || (Number(a) - Number(b)) || a.localeCompare(b))[0] || "";
  },

  nomeAbaEmpresa(id) {
    const raw = String(id || "").trim();
    if (!raw) return "Sem empresa";
    const n = Number(raw);
    if (Number.isFinite(n) && String(parseInt(raw, 10)) === raw.replace(/^0+(?=\d)/, "")) return "Empresa " + String(parseInt(raw, 10));
    if (Number.isFinite(n) && String(n) === raw) return "Empresa " + n;
    return "Empresa " + raw;
  },

  listaEmpresas(grupos) {
    const mapa = new Map();
    (grupos || []).forEach((g) => {
      const id = this.empresaDoGrupo(g);
      const atual = mapa.get(id) || { id: id, titulos: 0, contas: 0 };
      atual.titulos += (g.itens || []).length;
      atual.contas += 1;
      mapa.set(id, atual);
    });
    return [...mapa.values()].sort((a, b) => {
      if (!a.id) return 1;
      if (!b.id) return -1;
      const na = Number(a.id);
      const nb = Number(b.id);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return String(a.id).localeCompare(String(b.id), "pt-BR");
    });
  },

  garantirAbaEmpresa(grupos) {
    const lista = this.listaEmpresas(grupos);
    if (!lista.length) {
      this.state.abaEmpresa = "";
      return "";
    }
    if (!lista.some((e) => e.id === this.state.abaEmpresa)) this.state.abaEmpresa = lista[0].id;
    return this.state.abaEmpresa;
  },

  filtrarEmpresa(grupos, emp) {
    if (!emp) return grupos || [];
    return (grupos || []).filter((g) => this.empresaDoGrupo(g) === emp);
  },

  conferenciaVazia() {
    return { lotes: {}, padroes: {} };
  },

  conferenciaLocal() {
    try {
      const v = JSON.parse(localStorage.getItem(this.CONFERENCIA_LOCAL) || "null");
      if (!v || typeof v !== "object") return this.conferenciaVazia();
      return { lotes: v.lotes || {}, padroes: v.padroes || {} };
    } catch (e) {
      return this.conferenciaVazia();
    }
  },

  salvarConferenciaLocal(dados) {
    try { localStorage.setItem(this.CONFERENCIA_LOCAL, JSON.stringify(dados)); } catch (e) {}
  },

  juntarConferencia(a, b) {
    const saida = this.conferenciaVazia();
    const fundir = (dest, fonte, somar) => {
      Object.keys(fonte || {}).forEach((k) => {
        const novo = fonte[k];
        if (!novo) return;
        const velho = dest[k];
        if (!velho || String(novo.em || "") >= String(velho.em || "")) {
          dest[k] = Object.assign({}, velho || {}, novo);
          if (somar) dest[k].n = Math.max(Number(velho && velho.n) || 0, Number(novo.n) || 0);
        } else if (somar && velho) {
          velho.n = Math.max(Number(velho.n) || 0, Number(novo.n) || 0);
        }
      });
    };
    fundir(saida.lotes, a && a.lotes, false);
    fundir(saida.lotes, b && b.lotes, false);
    fundir(saida.padroes, a && a.padroes, true);
    fundir(saida.padroes, b && b.padroes, true);
    return saida;
  },

  podarConferencia(dados) {
    const cortar = (mapa, max) => {
      const chaves = Object.keys(mapa || {});
      if (chaves.length <= max) return;
      chaves.sort((a, b) => String((mapa[a] && mapa[a].em) || "").localeCompare(String((mapa[b] && mapa[b].em) || "")));
      chaves.slice(0, chaves.length - max).forEach((k) => { delete mapa[k]; });
    };
    cortar(dados.lotes, 400);
    cortar(dados.padroes, 800);
    return dados;
  },

  async lerConferenciaRemota() {
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.getDoc) return null;
    try {
      const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", "gp_conferencia"));
      const existe = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (!existe) return this.conferenciaVazia();
      const data = snap.data() || {};
      return { lotes: data.lotes || {}, padroes: data.padroes || {} };
    } catch (e) {
      console.warn("[Gerar Pagamento] conferência", e);
      return null;
    }
  },

  async carregarConferencia() {
    const local = this.conferenciaLocal();
    const remoto = await this.lerConferenciaRemota();
    const dados = this.podarConferencia(remoto ? this.juntarConferencia(local, remoto) : local);
    this.state.conferencia = dados;
    this.salvarConferenciaLocal(dados);
  },

  async salvarConferencia() {
    const remoto = await this.lerConferenciaRemota();
    const dados = this.podarConferencia(this.juntarConferencia(remoto, this.state.conferencia));
    this.state.conferencia = dados;
    this.salvarConferenciaLocal(dados);
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc) return;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, "config", "gp_conferencia"), dados, { merge: true });
    } catch (e) {
      console.warn("[Gerar Pagamento] gravar conferência", e);
    }
  },

  /* Conta + centros com o percentual lançado + planos + tipo de documento. É o que o financeiro aceitou. */
  assinaturaClassificacao(it, contaKey) {
    const linhas = [];
    const conf = it && it.rateio;
    if (conf && conf.obras) {
      conf.obras.forEach((o) => (o.linhas || []).forEach((l) => {
        if (!l || l.ausente || l.prestacao) return;
        linhas.push({ id: String(l.id), pct: Math.round((Number(l.pct) || 0) * 10) / 10 });
      }));
    }
    if (!linhas.length && Array.isArray(it && it.ccs)) {
      it.ccs.forEach((c) => linhas.push({ id: String(c.id), pct: Math.round((Number(c.rateio) || 0) * 10) / 10 }));
    }
    linhas.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const planos = [];
    if (Array.isArray(it && it.ccs)) it.ccs.forEach((c) => (c.planos || []).forEach((p) => {
      const id = String((p && (p.id || p.nome)) || "").trim();
      if (id && planos.indexOf(id) < 0) planos.push(id);
    }));
    planos.sort();
    const doc = String((it && it.documento) || "").trim().split(/\s+/)[0].toUpperCase();
    const cc = linhas.map((l) => l.id + ":" + l.pct).join(",");
    if (!cc && !planos.length) return "";
    return [this.numConta(contaKey) || String(contaKey || ""), cc, planos.join(","), doc].join("|");
  },

  assinaturaLote(g) {
    const chaves = (g.itens || []).map((it) => it.chave).sort().join(",");
    return String(g.contaKey || g.key || "") + "@" + String(g.dia || "") + "#" + chaves;
  },

  loteConferido(g) {
    const rec = this.state.conferencia && this.state.conferencia.lotes && this.state.conferencia.lotes[this.assinaturaLote(g)];
    return !!(rec && !rec.off);
  },

  aplicarAprendizado(it, contaKey) {
    const conf = it && it.rateio;
    if (!conf || conf.ok) return;
    const sig = this.assinaturaClassificacao(it, contaKey);
    const padrao = this.state.conferencia && this.state.conferencia.padroes && this.state.conferencia.padroes[sig];
    if (!padrao || padrao.off) return;
    conf.ok = true;
    conf.erroRateio = false;
    conf.erroPlano = false;
    conf.semPadrao = false;
    conf.aprendido = true;
    const quem = padrao.por ? " (" + padrao.por + ")" : "";
    conf.avisos = (conf.avisos || []).concat(["Classificação aceita pelo financeiro" + quem + ". O mesmo padrão deixa de ser tratado como erro."]);
    conf.problemas = [];
    (conf.obras || []).forEach((o) => (o.linhas || []).forEach((l) => {
      l.ok = true;
      l.planoErro = false;
    }));
  },

  marcarConferido(key) {
    const g = this.gruposLote().find((x) => x.key === key);
    if (!g || g.key === "__sem") return;
    const conf = this.state.conferencia || (this.state.conferencia = this.conferenciaVazia());
    conf.lotes = conf.lotes || {};
    conf.padroes = conf.padroes || {};
    const sig = this.assinaturaLote(g);
    const agora = new Date().toISOString();
    const por = this.usuarioAtual();
    if (conf.lotes[sig] && !conf.lotes[sig].off) {
      conf.lotes[sig] = { off: true, em: agora, por, porEmail: this.emailAtual() };
    } else {
      conf.lotes[sig] = { em: agora, por, porEmail: this.emailAtual() };
      g.itens.forEach((it) => {
        const p = this.assinaturaClassificacao(it, g.contaKey);
        if (!p) return;
        const prev = conf.padroes[p] || {};
        conf.padroes[p] = {
          n: (Number(prev.n) || 0) + 1,
          em: agora,
          por,
          conta: g.contaKey || ""
        };
      });
    }
    this.salvarConferencia();
    this.paintTitulos();
  },

  /* Vermelho se algum lote da empresa tem erro. Amarelo enquanto falta o Conferido. Verde quando todos foram aceitos. */
  statusEmpresa(id, grupos) {
    const lista = (grupos || []).filter((g) => this.empresaDoGrupo(g) === id);
    if (!lista.length) return "";
    if (lista.some((g) => g.key === "__sem" || (g.itens || []).some((it) => this.bloqueioVisivel(it)))) return "erro";
    if (lista.some((g) => !this.loteConferido(g))) return "pendente";
    return "ok";
  },

  abasEmpresaHtml(grupos, gruposStatus) {
    const lista = this.listaEmpresas(grupos);
    const ativa = this.garantirAbaEmpresa(grupos);
    if (lista.length < 1) return "";
    const base = gruposStatus || grupos;
    return `<div class="ml-tabs gp-abas-empresa" role="tablist">
      ${lista.map((e) => {
        const cad = (this.state.companies || []).find((c) => String(c.id) === String(e.id));
        const fantasia = cad && (cad.tradeName || cad.name) ? " · " + (cad.tradeName || cad.name) : "";
        const st = this.statusEmpresa(e.id, base);
        const frase = st === "erro" ? "Tem lote com erro." : (st === "ok" ? "Classificação conferida." : (st === "pendente" ? "Falta marcar Conferido." : ""));
        const dica = this.nomeAbaEmpresa(e.id) + fantasia + " · " + e.contas + " conta(s) de parceria · " + e.titulos + " título(s)" + (frase ? " " + frase : "");
        const icone = st === "erro" ? "circle-x" : (st === "ok" ? "circle-check" : (st === "pendente" ? "circle-alert" : ""));
        const cls = st === "erro" ? " gp-tab-erro" : (st === "ok" ? " gp-tab-ok" : (st === "pendente" ? " gp-tab-pend" : ""));
        const selo = icone ? `<i data-lucide="${icone}" class="gp-tab-selo"></i>` : "";
        return `<button type="button" role="tab" aria-selected="${ativa === e.id}" class="ml-tab${cls} ${ativa === e.id ? "is-active" : ""}" title="${this.esc(dica)}" onclick="GerarPagamentoApp.setAbaEmpresa('${this.esc(e.id)}')"><i data-lucide="building-2"></i> ${this.esc(this.nomeAbaEmpresa(e.id))} ${selo} <span class="ml-tab-count">${e.titulos}</span></button>`;
      }).join("")}
    </div>`;
  },

  setAbaEmpresa(id) {
    this.state.abaEmpresa = String(id == null ? "" : id);
    this.paintTitulos();
  },

  /** Abre (ou fecha) os lotes pendentes de um dia anterior ao período buscado. */
  setDiaRetro(dia) {
    this.state.diaRetro = this.state.diaRetro === dia ? "" : String(dia || "");
    this.state.abaLotes = "gerar";
    this.paintTitulos();
  },

  toggleRetroTodos() {
    this.state.retroTodos = !this.state.retroTodos;
    this.paintTitulos();
  },

  noPeriodoBuscado(dia) {
    const s = this.state;
    return !s.startDate || !s.endDate || (dia >= s.startDate && dia <= s.endDate);
  },

  /** Mantém o grupo quando o dia do lote passa no filtro. Sábado e domingo acompanhados da segunda entram junto.
      O grupo sem conta mistura dias, então filtra pelo vencimento de cada título. */
  recortarGrupos(grupos, filtroDia) {
    return grupos.map((g) => {
      const peloGrupo = g.key !== "__sem" && filtroDia(g.dia);
      return {
        ...g,
        itens: g.itens.filter((it) => peloGrupo || filtroDia(String(it.vencimento || "").slice(0, 10)))
      };
    }).filter((g) => g.itens.length);
  },

  /** Dias antes do período com títulos ainda fora de lote: { dia, titulos, total, divergentes }, do mais recente ao mais antigo. */
  diasRetroPendentes(aGerarTodos) {
    const ini = this.state.startDate;
    if (!ini) return [];
    const dias = {};
    aGerarTodos.forEach((g) => g.itens.forEach((it) => {
      const dia = g.key === "__sem" ? String(it.vencimento || "").slice(0, 10) : g.dia;
      if (!dia || dia >= ini) return;
      const d = dias[dia] || (dias[dia] = { dia, chaves: new Set(), total: 0, divergentes: 0 });
      if (d.chaves.has(it.chave)) return;
      d.chaves.add(it.chave);
      d.total += this.valorPagar(it);
      if (this.bloqueioVisivel(it)) d.divergentes += 1;
    }));
    return Object.values(dias)
      .map((d) => ({ dia: d.dia, titulos: d.chaves.size, total: d.total, divergentes: d.divergentes }))
      .sort((a, b) => b.dia.localeCompare(a.dia));
  },

  retroAlertaHtml(dias) {
    const s = this.state;
    if (!dias.length) return "";
    const LIMITE = 6;
    const visiveis = s.retroTodos ? dias : dias.slice(0, LIMITE);
    const nTitulos = dias.reduce((t, d) => t + d.titulos, 0);
    const chips = visiveis.map((d) => `<button type="button" class="gp-retro-dia${s.diaRetro === d.dia ? " is-on" : ""}${d.divergentes ? " has-bad" : ""}"
        onclick="GerarPagamentoApp.setDiaRetro('${this.esc(d.dia)}')" title="${this.esc(`${d.titulos} título(s) · ${this.money(d.total)}${d.divergentes ? ` · ${d.divergentes} com divergência` : ""}`)}">
        <i data-lucide="calendar" style="width:13px;height:13px;"></i> ${this.dataBr(d.dia)} <b>${d.titulos}</b>
      </button>`).join("");
    const mais = dias.length > LIMITE
      ? `<button type="button" class="gp-retro-mais" onclick="GerarPagamentoApp.toggleRetroTodos()">${s.retroTodos ? "Mostrar menos" : `+${dias.length - LIMITE} dia(s)`}</button>`
      : "";
    return `<div class="gp-retro" role="alert">
      <i data-lucide="alert-triangle" class="gp-retro-ic"></i>
      <div class="gp-retro-corpo">
        <div class="gp-retro-txt"><strong>Há lotes de dias anteriores para analisar.</strong>
          ${nTitulos} título(s) com vencimento antes de ${this.dataBr(s.startDate)} ainda não entraram em lote. Clique no dia para ver os lotes.</div>
        <div class="gp-retro-dias">${chips}${mais}</div>
      </div>
    </div>`;
  },

  toggleLote(key) {
    const abertos = this.state.lotesAbertos;
    if (abertos[key]) delete abertos[key];
    else abertos[key] = true;
    this.paintTitulos();
  },

  toggleGrupo(key, marcar) {
    const g = this.gruposLote().find((x) => x.key === key);
    if (!g) return;
    g.itens.forEach((it) => {
      if (it.emLote || it.bloqueio) return;
      this.state.sel[it.selKey] = !!marcar;
    });
    this.paintTitulos();
  },

  /** Lotes a gerar do período, de todas as empresas (ou do dia anterior aberto). */
  gruposDoPeriodo() {
    const grupos = this.gruposLote();
    const noPeriodo = (dia) => this.noPeriodoBuscado(dia);
    const aGerarTodos = grupos.map((g) => ({ ...g, itens: g.itens.filter((it) => !it.emLote) })).filter((g) => g.itens.length);
    return this.state.diaRetro
      ? this.recortarGrupos(aGerarTodos, (dia) => dia === this.state.diaRetro)
      : this.recortarGrupos(aGerarTodos, noPeriodo);
  },

  /** Lotes da aba A gerar que estão na tela (período buscado, ou o dia anterior aberto). */
  gruposVisiveis() {
    const lista = this.gruposDoPeriodo();
    const emp = String(this.state.abaEmpresa || "");
    if (!emp) return lista;
    const daEmp = this.filtrarEmpresa(lista, emp);
    return daEmp.length ? daEmp : lista;
  },

  marcarLotes(marcar) {
    this.gruposVisiveis().forEach((g) => {
      g.itens.forEach((it) => {
        if (it.emLote || it.bloqueio) return;
        this.state.sel[it.selKey] = !!marcar;
        this.state.selManual[it.selKey] = true;
      });
    });
    this.paintTitulos();
  },

  lotesPendentesSienge() {
    return (this.state.lotes || []).filter((l) => {
      const st = (l.sienge && l.sienge.status) || "pendente";
      return !l.sienge || st === "pendente" || st === "erro" || st === "gerado";
    });
  },

  async gerarLotesMarcados() {
    if (this.state.gerandoLote || this.state.roboLote) return;
    const grupos = this.gruposDoPeriodo().filter((g) => g.key !== "__sem" && g.conta && g.itens.some((it) => it.marcado && !it.emLote && !it.bloqueio));
    if (!grupos.length) {
      const pendentes = this.lotesPendentesSienge();
      if (pendentes.length) {
        const pergunta = `Há ${pendentes.length} lote(s) salvos no Integra que ainda não fecharam no Sienge. Enviar e autorizar agora?`;
        const okPend = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(pergunta) : confirm(pergunta);
        if (okPend) await this.enviarFila(pendentes);
        return;
      }
      alert("Marque títulos livres em ao menos um lote.");
      return;
    }
    const baixaRuim = grupos.find((g) => {
      const baixa = this.dataBaixaDoGrupo(g);
      return !/^\d{4}-\d{2}-\d{2}$/.test(baixa) || this.fimDeSemana(baixa);
    });
    if (baixaRuim) {
      alert("A data da baixa de " + this.nomeAbaEmpresa(this.empresaDoGrupo(baixaRuim)) + " não é dia útil. Ajuste antes de gerar os lotes.");
      return;
    }
    const okConf = await this.confirmarFila(grupos);
    if (!okConf) return;
    const lotes = [];
    for (let i = 0; i < grupos.length; i++) {
      const lote = await this.gerarLote(grupos[i].key, { silencioso: true, semEnvio: true, seq: i + 1 });
      if (lote && lote.id) lotes.push(lote);
    }
    if (!lotes.length) {
      alert("Não há título livre para gerar.");
      return;
    }
    await this.enviarFila(lotes);
  },

  confirmarFila(grupos) {
    const totalGeral = grupos.reduce((t, g) => t + g.itens.filter((it) => it.marcado && !it.emLote && !it.bloqueio).reduce((s, it) => s + this.valorPagar(it), 0), 0);
    const titulos = grupos.reduce((t, g) => t + g.itens.filter((it) => it.marcado && !it.emLote && !it.bloqueio).length, 0);
    const porEmp = new Map();
    grupos.forEach((g) => {
      const id = this.empresaDoGrupo(g);
      const lista = porEmp.get(id) || [];
      lista.push(g);
      porEmp.set(id, lista);
    });
    const empresas = [...porEmp.keys()].sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
    const baixas = [...new Set(grupos.map((g) => this.dataBaixaDoGrupo(g)))];
    const quando = baixas.length === 1 ? "Baixa em " + this.dataBr(baixas[0]) + "." : "";
    const blocos = empresas.map((id) => {
      const cad = (this.state.companies || []).find((c) => String(c.id) === String(id));
      const fantasia = cad && (cad.tradeName || cad.name) ? " · " + String(cad.tradeName || cad.name).split(" ").slice(0, 3).join(" ") : "";
      const linhas = porEmp.get(id).map((g) => {
        const n = g.itens.filter((it) => it.marcado && !it.emLote && !it.bloqueio).length;
        const total = g.itens.filter((it) => it.marcado && !it.emLote && !it.bloqueio).reduce((s, it) => s + this.valorPagar(it), 0);
        const dia = baixas.length === 1 ? "" : " · " + this.dataBr(g.dia);
        return `<div class="gp-fila-linha"><span>${this.esc(this.contaCurta(g.conta))}${dia}</span><span>${n} título(s)</span><strong>${this.money(total)}</strong></div>`;
      }).join("");
      return `<section class="gp-fila-emp"><h4>${this.esc(this.nomeAbaEmpresa(id) + fantasia)}</h4>${linhas}</section>`;
    }).join("");
    return new Promise((resolve) => {
      const antigo = document.getElementById("gp-fila-conf");
      if (antigo) antigo.remove();
      const overlay = document.createElement("div");
      overlay.id = "gp-fila-conf";
      overlay.innerHTML = `
        <div class="gp-fila-box" role="dialog" aria-modal="true" aria-labelledby="gp-fila-tit">
          <h3 id="gp-fila-tit">${grupos.length} lote(s) · ${empresas.length} empresa(s)</h3>
          <p>${titulos} título(s) · ${this.money(totalGeral)}${quando ? " · " + this.esc(quando) : ""}</p>
          <div class="gp-fila-lista">${blocos}</div>
          <p class="gp-fila-nota">O robô cria, autoriza e gera o arquivo de todos esses lotes antes de sair do Sienge.</p>
          <div class="gp-fila-acoes">
            <button type="button" class="btn btn-cancel" data-no>Cancelar</button>
            <button type="button" class="btn btn-primary" data-ok>Gerar lotes</button>
          </div>
        </div>`;
      const fechar = (ok) => { overlay.remove(); resolve(ok); };
      overlay.querySelector("[data-ok]").addEventListener("click", () => fechar(true));
      overlay.querySelector("[data-no]").addEventListener("click", () => fechar(false));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(false); });
      document.body.appendChild(overlay);
    });
  },

  async roboTemFila() {
    try {
      const resp = await fetch(this.ROBO_URL + "/status", { method: "GET" });
      const r = await resp.json().catch(() => ({}));
      return !!(r && r.fila);
    } catch (e) {
      return false;
    }
  },

  async enviarFila(lotes) {
    const s = this.state;
    s.gerandoLote = "fila";
    s.roboLote = "fila";
    s.roboMsg = `O robô está no Sienge com ${lotes.length} lote(s). Depois de salvar um, começa o seguinte.`;
    this.paintTitulos();
    this.pintarRoboMsg();
    lotes.forEach((l) => this.completarLote(l));
    if (await this.roboTemFila()) {
      const r = await this.roboChamar("/lotes/fila", { lotes });
      if (r.offline || r.cancelado) {
        s.gerandoLote = "";
        s.roboLote = "";
        s.roboMsg = "";
        this.paintTitulos();
        this.pintarRoboMsg();
        alert(`Os lotes ficaram salvos no Integra, mas ainda não foram criados no Sienge.\n\n${r.erro}` + (r.offline ? "\nClique em Ligar robô no topo desta tela." : ""));
        return;
      }
      if (!(r.erro && /desconhecido/i.test(String(r.erro)))) {
        s.gerandoLote = "";
        s.roboLote = "";
        s.roboMsg = "";
        const lista = Array.isArray(r.resultados) ? r.resultados : [];
        for (const item of lista) {
          const lote = s.lotes.find((l) => l.id === item.id);
          if (!lote) continue;
          if (item.ok) {
            await this.registrarSienge(lote, "gerar", { ok: true, numeroSienge: item.numeroSienge }, { status: "gerado", numero: item.numeroSienge || "", geradoEm: new Date().toISOString(), geradoPor: this.usuarioAtual(), erro: "" });
            await this.registrarSienge(lote, "aprovar", { ok: true, numeroSienge: item.numeroSienge }, { status: "aprovado", aprovadoEm: new Date().toISOString(), aprovadoPor: this.usuarioAtual(), arquivo: item.arquivo || "", erro: "" });
          } else if (item.numeroSienge) {
            await this.registrarSienge(lote, "gerar", { ok: true, numeroSienge: item.numeroSienge }, { status: "gerado", numero: item.numeroSienge, geradoEm: new Date().toISOString(), geradoPor: this.usuarioAtual(), erro: "" });
            await this.registrarSienge(lote, "aprovar", { ok: false, erro: item.erro || "Falha ao autorizar." }, { erro: item.erro || "Falha ao autorizar." });
          } else {
            await this.registrarSienge(lote, "gerar", { ok: false, erro: item.erro || "Falha no robô." }, { status: "erro", erro: item.erro || "Falha no robô." });
          }
        }
        this.paintTitulos();
        this.pintarRoboMsg();
        const falhas = lista.filter((x) => !x.ok);
        if (!lista.length && r.erro) alert(r.erro);
        else if (falhas.length) alert("Estes lotes não fecharam no Sienge. Os outros da fila seguiram na mesma sessão.\n\n" + falhas.map((f) => "• " + (f.numeroSienge ? "nº " + f.numeroSienge + " · " : "") + (f.erro || "falha")).join("\n"));
        return;
      }
    }
    await this.enviarFilaUmAUm(lotes);
  },

  /** Gera, autoriza e já pede o próximo lote, sem fechar o Sienge no meio. */
  async enviarFilaUmAUm(lotes) {
    const s = this.state;
    const falhas = [];
    let ok = 0;
    s.gerandoLote = "fila";
    for (let i = 0; i < lotes.length; i++) {
      const lote = lotes[i];
      s.roboLote = "";
      s.roboMsg = `Gerando lote ${i + 1} de ${lotes.length} no Sienge…`;
      this.paintTitulos();
      this.pintarRoboMsg();
      const passou = await this.enviarAoSienge(lote.id);
      if (passou) ok++;
      else falhas.push(lote.id);
    }
    s.gerandoLote = "";
    s.roboLote = "";
    s.roboMsg = "";
    this.paintTitulos();
    this.pintarRoboMsg();
    if (falhas.length) {
      alert(`${ok} lote(s) gerado(s). Estes não fecharam no Sienge:\n\n` + falhas.map((id) => "• " + id).join("\n"));
    }
  },

  async gerarLote(key, opts) {
    const s = this.state;
    const silencioso = !!(opts && opts.silencioso);
    let g = this.gruposLote().find((x) => x.key === key);
    if (!g || !g.conta || s.gerandoLote) return false;
    const baixa = this.dataBaixaDoGrupo(g);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(baixa)) {
      alert("Informe a data da baixa. O robô preenche essa data no campo Data da baixa do Sienge.");
      return false;
    }
    if (this.fimDeSemana(baixa)) {
      alert("A data da baixa cai no fim de semana. Informe a segunda-feira (ou outro dia útil): o banco não baixa no sábado nem no domingo.");
      return false;
    }
    if (!g.itens.some((it) => it.marcado && !this.bloqueioLote(it))) {
      if (!silencioso) {
        alert(g.itens.every((it) => it.emLote) ? "Todos os títulos deste dia já estão em lote."
          : (g.itens.some((it) => !it.emLote && !it.bloqueio) ? "Marque ao menos um título para gerar o lote." : "Nenhum título deste dia pode entrar em lote agora. Os divergentes continuam na lista até a correção."));
      }
      return false;
    }
    s.gerandoLote = key;
    this.paintTitulos();
    // Relê os lotes antes de gravar: outro usuário pode ter gerado lote com estes títulos.
    await this.carregarLotes();
    g = this.gruposLote().find((x) => x.key === key);
    const itens = g ? g.itens.filter((it) => it.marcado && !it.emLote && !this.bloqueioLote(it)) : [];
    if (!itens.length) {
      s.gerandoLote = "";
      this.paintTitulos();
      if (!silencioso) alert("Não há título livre para este lote. Os divergentes ficam de fora e podem ser enviados depois da correção.");
      return false;
    }
    const total = itens.reduce((t, it) => t + this.valorPagar(it), 0);
    const fora = g.itens.filter((it) => it.bloqueio);
    const alerta = fora.length
      ? `\n\n${fora.length} título(s) deste dia ficam fora por bloqueio:\n` + fora.slice(0, 8).map((it) => `• ${it.titulo}/${it.parcela || 1} ${it.credor}: ${it.bloqueio}`).join("\n") + (fora.length > 8 ? `\n• e mais ${fora.length - 8}` : "")
      : "";
    const transferencias = this.transferenciasDe(itens);
    if (!silencioso) {
      const pergunta = `Gerar e autorizar o lote do dia ${this.dataBr(g.dia)} com ${itens.length} título(s), total de ${this.money(total)}, pela conta ${this.contaLabel(g.conta)}?\n\nData da baixa no banco: ${this.dataBr(baixa)}. O robô cria o lote no Sienge, grava a autorização e gera o arquivo de contas a pagar, no mesmo passo.${alerta}${this.textoTransferencias(transferencias)}`;
      const okConf = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(pergunta) : confirm(pergunta);
      if (!okConf) {
        s.gerandoLote = "";
        this.paintTitulos();
        return false;
      }
    }
    await this.limparPendentes(itens.map((it) => it.chave));
    const agora = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const seq = opts && opts.seq != null ? "-" + String(opts.seq) : "";
    const id = "L" + agora.getFullYear() + pad(agora.getMonth() + 1) + pad(agora.getDate()) + "-" + pad(agora.getHours()) + pad(agora.getMinutes()) + pad(agora.getSeconds())
      + "-" + String(g.contaKey || "").replace(/[^\w]/g, "").slice(-6) + "-" + String(g.dia || "").replace(/-/g, "").slice(4) + seq;
    const usuario = this.usuarioAtual();
    const lote = JSON.parse(JSON.stringify({
      id,
      criadoEm: agora.toISOString(),
      criadoPor: usuario,
      criadoPorEmail: this.emailAtual(),
      contaKey: g.contaKey,
      dia: g.dia,
      dataBaixa: baixa,
      conta: g.conta,
      empresaConta: g.empresaConta || "",
      total: Math.round(total * 100) / 100,
      ...(transferencias.length ? { transferencias } : {}),
      itens: itens.map((it) => ({
        titulo: it.titulo, parcela: it.parcela, credor: it.credor, credorId: it.credorId || "", companyId: it.companyId || "", documento: it.documento,
        vencimento: it.vencimento, valor: this.valorPagar(it),
        ...(this.retidoDe(it) ? { valorBruto: Math.round(it.aPagar * 100) / 100, impostosRetidos: this.retidoDe(it) } : {}),
        impostos: it.pag && it.pag.fiscal ? it.pag.fiscal.resumo : "",
        ccs: it.ccs.map((c) => c.id + " - " + c.nome).join(" / "),
        forma: it.pag ? it.pag.check.forma : "",
        linhaDigitavel: it.pag ? it.pag.check.linhaFmt || "" : "",
        conferencia: it.pag ? it.pag.check.resumo : "Não conferido",
        valida: this.validacoesDe(it.rateio, it.pag, it.autorizacao)
      })),
      sienge: { status: "pendente", historico: [] }
    }));
    s.lotes = s.lotes.concat([lote]);
    const salvoRemoto = await this.salvarLote(lote);
    this.auditarLote(lote);
    itens.forEach((it) => { s.sel[it.selKey] = false; });
    s.gerandoLote = "";
    this.paintTitulos();
    if (!salvoRemoto) alert("O lote foi gerado, mas ficou salvo só neste computador (não consegui gravar no Firebase).");
    if (opts && opts.semEnvio) return lote;
    return await this.enviarAoSienge(id);
  },

  usuarioAtual() {
    try {
      const u = (window.MouraAuth && MouraAuth.getCurrentUser && MouraAuth.getCurrentUser()) || (window.AppState && AppState.currentUser);
      return (u && (u.name || u.email)) || "Usuário";
    } catch (e) {
      return "Usuário";
    }
  },

  /* O robô entra no Sienge com este e-mail: o lote é criado e aprovado com o acesso de quem está no Integra. */
  emailAtual() {
    try {
      const u = (window.MouraAuth && MouraAuth.getCurrentUser && MouraAuth.getCurrentUser()) || (window.AppState && AppState.currentUser);
      return String((u && u.email) || "").trim().toLowerCase();
    } catch (e) {
      return "";
    }
  },

  async salvarLote(lote) {
    this.salvarLotesLocal(this.lotesLocal().filter((l) => l.id !== lote.id).concat([lote]));
    const fc = window.firebaseCollections;
    if (!(window.firebaseDb && fc && fc.setDoc)) return false;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, this.LOTES_COLLECTION, lote.id), JSON.parse(JSON.stringify(lote)));
      return true;
    } catch (e) {
      console.warn("[Gerar Pagamento] salvar lote", e);
      return false;
    }
  },

  podeAprovar() {
    if (typeof window.isCrmSuperAdmin === "function" && window.isCrmSuperAdmin()) return true;
    return typeof window.hasCrmPerm === "function" && window.hasCrmPerm("sub_fin_cp_gerar_pagamento_editar");
  },

  async roboChamar(caminho, corpo) {
    const email = this.emailAtual();
    if (!email) return { ok: false, cancelado: true, erro: "Entre no Integra com sua conta Microsoft da Moura Leite: o robô usa o mesmo usuário no Sienge." };
    corpo = Object.assign({}, corpo, { usuario: this.usuarioAtual(), usuarioEmail: email });
    let token = "";
    try { token = localStorage.getItem(this.ROBO_TOKEN_KEY) || ""; } catch (e) {}
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      if (!token) token = await this.roboParear();
      if (!token) {
        token = String(prompt("Cole o código do robô do Sienge (fica no arquivo robo-token.txt da pasta robo-sienge deste computador):") || "").trim();
        if (!token) return { ok: false, cancelado: true, erro: "Código do robô não informado." };
        try { localStorage.setItem(this.ROBO_TOKEN_KEY, token); } catch (e) {}
      }
      let resp;
      try {
        resp = await fetch(this.ROBO_URL + caminho, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Robo-Token": token },
          body: JSON.stringify(corpo)
        });
      } catch (e) {
        return { ok: false, offline: true, erro: "O robô do Sienge não está ligado neste computador." };
      }
      const r = await resp.json().catch(() => ({ ok: false, erro: "Resposta inválida do robô." }));
      if (resp.status !== 401) return r;
      try { localStorage.removeItem(this.ROBO_TOKEN_KEY); } catch (e) {}
      token = "";
    }
    return { ok: false, erro: "O código do robô não confere. Confira o arquivo robo-token.txt na pasta robo-sienge." };
  },

  /* O robô entrega o código só para o endereço oficial do Integra; assim ninguém precisa copiar e colar. */
  async roboParear() {
    try {
      const resp = await fetch(this.ROBO_URL + "/parear", { method: "GET" });
      if (!resp.ok) return "";
      const r = await resp.json();
      const token = r && r.ok ? String(r.token || "") : "";
      if (token) {
        try { localStorage.setItem(this.ROBO_TOKEN_KEY, token); } catch (e) {}
      }
      return token;
    } catch (e) {
      return "";
    }
  },

  async roboNoAr() {
    try {
      const resp = await fetch(this.ROBO_URL + "/status", { method: "GET" });
      return !!resp.ok;
    } catch (e) {
      return false;
    }
  },

  abrirProtocoloRobo(acao) {
    const email = (acao === "entrar" || acao === "preparar") ? this.emailAtual() : "";
    const href = email ? ("mourarobo://" + acao + "/" + encodeURIComponent(email)) : ("mourarobo://" + (acao || "ligar"));
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.src = href;
    document.body.appendChild(frame);
    setTimeout(() => { try { frame.remove(); } catch (e) {} }, 4000);
  },

  pintarRoboMsg() {
    const el = document.getElementById("gp-robo-msg");
    if (el) el.textContent = this.state.roboMsg || "";
    const btn = document.getElementById("gp-robo-btn");
    if (btn) btn.disabled = !!this.state.roboLigando;
  },

  baixarInstaladorRobo() {
    const origem = window.location.origin;
    const cmd = [
      "@echo off",
      "chcp 65001 >nul",
      "echo Instalando o robô do Sienge neste computador...",
      "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Invoke-WebRequest -Uri '" + origem + "/robo-pacote/instalar.ps1' -OutFile $env:TEMP\\moura-robo-instalar.ps1 -UseBasicParsing; $env:MOURA_ROBO_ORIGEM='" + origem + "'; & $env:TEMP\\moura-robo-instalar.ps1\"",
      "echo.",
      "echo Quando terminar, volte ao Integra e clique em Ligar robô.",
      "pause"
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([cmd], { type: "text/plain" }));
    a.download = "Ligar robo do Sienge.cmd";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  /** Liga o robô neste computador, pega o código e, se ele estava desligado, abre o login do Sienge. */
  async ligarRobo() {
    if (this.state.roboLigando) return;
    this.state.roboLigando = true;
    this.state.roboMsg = "Ligando o robô neste computador…";
    this.pintarRoboMsg();
    const preparar = !this._roboPreparou;
    this.abrirProtocoloRobo(preparar ? "preparar" : "ligar");
    const jaEstava = await this.roboNoAr();
    let ligado = jaEstava;
    if (!ligado) {
      for (let i = 0; i < 16; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await this.roboNoAr()) { ligado = true; break; }
      }
    }
    if (!ligado) {
      this.baixarInstaladorRobo();
      this.state.roboMsg = "Abra o arquivo Ligar robo do Sienge que foi baixado. Na primeira vez ele instala o Node, sobe o robô e abre o Sienge. Depois é só clicar em Ligar robô.";
      this.state.roboLigando = false;
      this.pintarRoboMsg();
      return;
    }
    await this.roboParear();
    this._roboPreparou = true;
    this.state.roboMsg = jaEstava && !preparar
      ? "Robô ligado. O Integra já tem o código deste computador."
      : "Robô ligado. A janela do Sienge abriu para o login neste computador.";
    this.state.roboLigando = false;
    this.pintarRoboMsg();
  },

  /* Lotes gravados antes de guardar a empresa: busca nos títulos carregados e no CC dono da conta. */
  completarLote(lote) {
    (lote.itens || []).forEach((it) => {
      if (it.companyId) return;
      const r = this.state.titulos.find((x) => x.titulo === String(it.titulo) && String(x.parcela) === String(it.parcela || ""));
      if (r && r.companyId) it.companyId = r.companyId;
    });
    if (lote.empresaConta) return;
    const alvo = this.numConta(lote.conta && (lote.conta.numero || lote.conta.id));
    const cc = alvo && this.state.costCenters.find((c) => {
      const conta = this.contaParceriaDe(c);
      return conta && this.numConta(conta.numero || conta.id) === alvo;
    });
    if (cc) lote.empresaConta = String(this.companyIdOf(cc) || "");
  },

  async registrarSienge(lote, acao, r, extra) {
    const sg = lote.sienge || { historico: [] };
    sg.historico = (sg.historico || []).concat([{
      acao, por: this.usuarioAtual(), porEmail: this.emailAtual(), em: new Date().toISOString(), ok: !!r.ok, msg: r.ok ? (r.numeroSienge ? "Lote Sienge nº " + r.numeroSienge : "OK") : r.erro || ""
    }]).slice(-30);
    Object.assign(sg, extra);
    lote.sienge = sg;
    await this.salvarLote(lote);
    this.auditarLote(lote);
  },

  /* ---------- auditoria: cada passo do lote vira um registro em Segurança › Auditoria ---------- */
  LOTE_AUDIT_KEY: "gp_lotes_auditados",

  /** Grava na auditoria os passos do lote que ainda não foram gravados (o id fixo evita registro em dobro). */
  auditarLote(lote) {
    if (!lote || !lote.id || !window.AuditService) return;
    const eventos = [{ tipo: "LOTE_GERADO", em: lote.criadoEm, por: lote.criadoPor, porEmail: lote.criadoPorEmail, ok: true }];
    ((lote.sienge && lote.sienge.historico) || []).forEach((h) => eventos.push({
      tipo: h.acao === "excluir" || h.acao === "retirar" ? "LOTE_EXCLUIDO" : (!h.ok ? "LOTE_ERRO" : (h.acao === "aprovar" ? "LOTE_APROVADO" : "LOTE_SIENGE")),
      acao: h.acao, em: h.em, por: h.por, porEmail: h.porEmail || "", ok: !!h.ok, msg: h.ok && h.acao !== "excluir" ? "" : h.msg || ""
    }));
    let feitos;
    try { feitos = new Set(JSON.parse(localStorage.getItem(this.LOTE_AUDIT_KEY) || "[]")); } catch (e) { feitos = new Set(); }
    const remoto = !!window.firebaseDb;
    let novo = false;
    eventos.forEach((ev) => {
      const ms = new Date(ev.em || "").getTime();
      if (!Number.isFinite(ms)) return;
      const id = `lote-${lote.id}-${ev.tipo}-${ms}`;
      if (feitos.has(id)) return;
      this.auditarEvento(lote, ev, id);
      if (remoto) {
        feitos.add(id);
        novo = true;
      }
    });
    if (novo) {
      try { localStorage.setItem(this.LOTE_AUDIT_KEY, JSON.stringify([...feitos].slice(-3000))); } catch (e) {}
    }
  },

  auditarEvento(lote, ev, id) {
    const sg = lote.sienge || {};
    const itens = lote.itens || [];
    const titulos = itens.map((i) => `${i.titulo}/${i.parcela || 1}`);
    const credores = [...new Set(itens.map((i) => i.credor).filter(Boolean))];
    const titulo = {
      LOTE_GERADO: "Lote gerado no Integra",
      LOTE_SIENGE: "Lote criado no Sienge pelo robô",
      LOTE_APROVADO: "Lote autorizado no Sienge e arquivo de contas a pagar gerado",
      LOTE_ERRO: ev.acao === "aprovar" ? "O robô não aprovou o lote no Sienge" : "O robô não criou o lote no Sienge",
      LOTE_EXCLUIDO: ev.acao === "retirar" ? "Títulos saíram do lote no Sienge e voltaram para reenvio" : (ev.acao === "excluir" ? "Lote excluído no Sienge" : "Lote excluído no Integra")
    }[ev.tipo] || ev.tipo;
    const numero = (ev.tipo === "LOTE_SIENGE" || ev.tipo === "LOTE_APROVADO" || (ev.tipo === "LOTE_ERRO" && ev.acao === "aprovar")) && sg.numero ? ` (Sienge nº ${sg.numero})` : "";
    try {
      window.AuditService.logEvent({
        id,
        timestamp: new Date(ev.em).toISOString(),
        user: ev.por || "",
        userEmail: ev.porEmail || "",
        action: ev.tipo,
        module: "Gerar Pagamento",
        status: ev.ok ? "ok" : "erro",
        summary: `${titulo}: ${lote.id}${numero} · ${titulos.length} título(s) · ${this.money(lote.total)} · baixa ${this.dataBr(lote.dataBaixa || lote.dia)} · ${this.contaLabel(lote.conta)}${ev.tipo === "LOTE_APROVADO" && sg.arquivo ? " · arquivo " + sg.arquivo : ""}${ev.msg ? " · " + ev.msg : ""}${(lote.transferencias || []).length ? " · " + (lote.transferencias || []).map((a) => `transferir ${this.money(a.valor)} da ${a.deNumero} para ${a.paraNumero} (CC ${(a.ccs || []).map((c) => c.id).join(", ")})`).join("; ") : ""}`,
        customerLabel: credores.slice(0, 3).join(", ") + (credores.length > 3 ? ` e mais ${credores.length - 3}` : ""),
        enterpriseId: String((itens[0] && itens[0].ccs) || "").split(" - ")[0],
        titleId: titulos.join(", "),
        details: { lote: lote.id, numeroSienge: sg.numero || "", arquivo: sg.arquivo || "", total: lote.total, pagamento: lote.dia, dataBaixa: lote.dataBaixa || lote.dia, conta: this.contaLabel(lote.conta), titulos, mensagem: ev.msg || "", transferencias: lote.transferencias || [] }
      });
    } catch (e) {
      console.warn("[Gerar Pagamento] auditoria", e);
    }
  },

  async enviarAoSienge(id) {
    const s = this.state;
    const lote = s.lotes.find((l) => l.id === id);
    if (!lote || s.roboLote) return false;
    const sg = lote.sienge || {};
    if (sg.status === "aprovado") return true;
    if (sg.status === "gerado") return await this.aprovarNoSienge(id, { confirmar: false });
    const ocupados = (lote.itens || []).filter((i) => {
      const k = this.chaveTitulo(i.titulo, i.parcela);
      return s.loteSienge[k] || this.loteIntegraDe(k);
    });
    if (ocupados.length) {
      alert(`Não dá para enviar o lote ${id}: estes títulos já estão em outro lote no Sienge.\n\n${ocupados.slice(0, 8).map((i) => `• ${i.titulo}/${i.parcela || 1} ${i.credor || ""}`).join("\n")}\n\nExclua este lote e gere de novo com os títulos livres.`);
      return false;
    }
    this.completarLote(lote);
    s.roboLote = id;
    this.paintTitulos();
    const r = await this.roboChamar("/lotes/gerar", { lote });
    s.roboLote = "";
    if (r.offline || r.cancelado) {
      this.paintTitulos();
      alert(`Lote ${id} salvo no Integra, mas ainda não foi criado no Sienge.\n\n${r.erro}` + (r.offline ? `\nClique em Ligar robô no topo desta tela. Na primeira vez, abra o arquivo que o Integra baixar.` : ""));
      return false;
    }
    if (r.ok) {
      await this.registrarSienge(lote, "gerar", r, { status: "gerado", numero: r.numeroSienge || "", geradoEm: new Date().toISOString(), geradoPor: this.usuarioAtual(), erro: "" });
    } else {
      await this.registrarSienge(lote, "gerar", r, { status: "erro", erro: r.erro || "Falha no robô." });
    }
    this.paintTitulos();
    if (!r.ok) {
      alert(`O robô não conseguiu criar o lote ${id} no Sienge:\n\n${r.erro || "Falha no robô."}`);
      return false;
    }
    if (!this.podeAprovar()) {
      alert(`Lote ${id} criado no Sienge. Falta autorizar: este usuário não tem Gerar Pagamento · editar.`);
      return false;
    }
    return await this.aprovarNoSienge(id, { confirmar: false });
  },

  async aprovarNoSienge(id, opts) {
    const s = this.state;
    const lote = s.lotes.find((l) => l.id === id);
    if (!lote || s.roboLote) return false;
    const sg = lote.sienge || {};
    if (sg.status !== "gerado") return false;
    if (!this.podeAprovar()) {
      alert("Você não tem permissão para aprovar lotes de pagamento (precisa de Gerar Pagamento · editar).");
      return false;
    }
    if (!opts || opts.confirmar !== false) {
      const pergunta = `Autorizar no Sienge o lote ${sg.numero ? "nº " + sg.numero : id}: ${(lote.itens || []).length} título(s), total de ${this.money(lote.total)}, pela conta ${this.contaLabel(lote.conta)}?\n\nA autorização fica gravada em seu nome e o Integra gera o arquivo de contas a pagar nesse mesmo passo.`;
      const okConf = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(pergunta) : confirm(pergunta);
      if (!okConf) return false;
    }
    s.roboLote = id;
    this.paintTitulos();
    this.completarLote(lote);
    const r = await this.roboChamar("/lotes/aprovar", { lote, numeroSienge: sg.numero || "" });
    s.roboLote = "";
    if (r.offline || r.cancelado) {
      this.paintTitulos();
      alert(r.erro + (r.offline ? `\nClique em Ligar robô no topo desta tela e tente aprovar de novo.` : ""));
      return false;
    }
    if (r.ok) {
      await this.registrarSienge(lote, "aprovar", r, { status: "aprovado", aprovadoEm: new Date().toISOString(), aprovadoPor: this.usuarioAtual(), arquivo: r.arquivo || "", erro: "" });
    } else {
      await this.registrarSienge(lote, "aprovar", r, { erro: r.erro || "Falha no robô." });
    }
    this.paintTitulos();
    if (!r.ok) alert(`O robô não concluiu a autorização do lote no Sienge:\n\n${r.erro || "Falha no robô."}\n\nSe a autorização já ficou gravada, use Autorizar lote de novo para gerar o arquivo.`);
    return !!r.ok;
  },

  siengeHtml(l) {
    const sg = l.sienge || {};
    const rodando = this.state.roboLote === l.id;
    const hist = (sg.historico || []).map((h) => `${new Date(h.em).toLocaleString("pt-BR")} · ${h.acao === "aprovar" ? "Autorizar" : "Gerar"} · ${h.por} · ${h.ok ? "ok" : "erro"}${h.msg ? " · " + h.msg : ""}`).join("\n");
    if (rodando) return `<span class="gp-pill gp-wait"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;width:10px;height:10px;"></span> Robô no Sienge…</span>`;
    if (!l.sienge) return `<span class="gp-pill gp-warn" title="Lote salvo só no Integra (Excel); os títulos continuam livres para um novo lote">Não gerado no Sienge</span>`;
    if (sg.status === "aprovado") return `<span class="gp-pill gp-ok" title="${this.esc(hist)}">Autorizado${sg.numero ? " · nº " + this.esc(sg.numero) : ""}</span><small>${this.esc(String(sg.aprovadoPor || "").split(" ")[0])} · ${new Date(sg.aprovadoEm).toLocaleDateString("pt-BR")}${sg.arquivo ? " · arquivo " + this.esc(sg.arquivo) : ""}</small>`;
    if (sg.status === "gerado") return `<span class="gp-pill gp-ok" title="${this.esc(hist)}">No Sienge${sg.numero ? " · nº " + this.esc(sg.numero) : ""}</span><small>${sg.erro ? `<b style="color:#b91c1c;">Autorização falhou</b>` : "Aguardando autorização"}</small>`;
    if (sg.status === "erro") return `<span class="gp-pill gp-bad" title="${this.esc(hist)}">Erro no Sienge</span><small title="${this.esc(sg.erro || "")}">${this.esc(String(sg.erro || "").slice(0, 60))}</small>`;
    return `<span class="gp-pill gp-warn" title="${this.esc(hist)}">Não gerado no Sienge</span><small>Aguardando robô</small>`;
  },

  siengeAcoesHtml(l) {
    const sg = l.sienge || {};
    if (this.state.roboLote) return "";
    if (!l.sienge || sg.status === "pendente" || sg.status === "erro") {
      return `<button type="button" class="btn btn-sm btn-primary" onclick="GerarPagamentoApp.enviarAoSienge('${this.esc(l.id)}')" title="Cria o lote no Sienge, grava a autorização e gera o arquivo de contas a pagar"><i data-lucide="send" style="width:14px;height:14px;"></i> Enviar e autorizar</button>`;
    }
    if (sg.status === "gerado" && this.podeAprovar()) {
      return `<button type="button" class="btn btn-sm btn-primary" onclick="GerarPagamentoApp.aprovarNoSienge('${this.esc(l.id)}')" title="Grava a autorização do lote no Sienge e gera o arquivo de contas a pagar"><i data-lucide="badge-check" style="width:14px;height:14px;"></i> Autorizar lote</button>`;
    }
    return "";
  },

  baixarLoteExcel(loteOuId) {
    const lote = typeof loteOuId === "string" ? this.state.lotes.find((l) => l.id === loteOuId) : loteOuId;
    if (!lote) return;
    if (typeof XLSX === "undefined") {
      alert("A biblioteca de Excel não carregou. Recarregue a página.");
      return;
    }
    const sg = lote.sienge || {};
    const emp = (this.state.companies || []).find((c) => String(c.id) === String(lote.empresaConta || ""));
    const empresa = lote.empresaConta ? `${String(lote.empresaConta).padStart(4, "0")}${emp ? " - " + (emp.name || emp.tradeName || "") : ""}` : "";
    const situacao = sg.status === "aprovado" ? "Aprovado no Sienge" : (sg.status === "gerado" ? "Programado no Sienge (aguardando aprovação)" : (sg.status === "erro" ? "Erro no Sienge" : "Só no Integra"));
    const quando = (iso, quem) => iso ? `${new Date(iso).toLocaleString("pt-BR")}${quem ? " · " + quem : ""}` : "—";
    const N = 14;
    const cab = ["Título/Parcela", "Documento", "Vencimento", "Valor", "Credor", "Rateio (CC e % do título)", "Plano financeiro", "Forma de pagamento", "Linha digitável / chave", "Autorização", "Plano financeiro", "Rateio parceiro", "Boleto / PIX", "Desconto"];
    const linhas = [
      ["Lote de Pagamento Escritural"],
      [],
      ["Empresa", empresa, "", "", "", "Situação", situacao],
      ["Lote Sienge", sg.numero ? String(sg.numero) : "—", "", "", "", "Lote Integra", lote.id],
      ["Conta corrente", this.contaLabel(lote.conta), "", "", "", "Data da baixa", (lote.dataBaixa || lote.dia) ? this.dataBr(lote.dataBaixa || lote.dia) : ""],
      ["Gerado", quando(lote.criadoEm, lote.criadoPor), "", "", "", "Aprovado", quando(sg.aprovadoEm, sg.aprovadoPor)],
      [],
      cab
    ];
    const inicio = linhas.length;
    const itens = lote.itens || [];
    itens.forEach((i) => {
      const v = this.validacoesItem(i);
      linhas.push([`${i.titulo}/${i.parcela || 1}`, i.documento || "", this.dataBr(i.vencimento), Number(i.valor) || 0, i.credor || "",
        v.rateioTexto || i.ccs || "", v.planoTexto || "", i.forma || "", i.linhaDigitavel || "", v.autorizacao || "Não verificada", v.plano, v.rateio, v.pagamento, v.desconto]);
    });
    linhas.push(["", "", "Total do lote", Number(lote.total) || 0]);
    (lote.transferencias || []).forEach((a) => {
      const ccs = this.listaPt((a.ccs || []).map((c) => c.id));
      linhas.push([`Transferir ${this.money(a.valor)} da conta ${a.deNumero} para a conta ${a.paraNumero}. Centros de custo: ${ccs}. Compensa o que foi pago na conta final e deveria sair da conta de parceria.`]);
    });
    linhas.push([], [`Gerado pelo Integra em ${new Date().toLocaleString("pt-BR")}`]);
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 13 }, { wch: 34 }, { wch: 30 }, { wch: 34 }, { wch: 18 }, { wch: 50 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 13 }, { wch: 14 }];
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: N - 1 } },
      ...[2, 3, 4, 5].map((r) => ({ s: { r, c: 1 }, e: { r, c: 4 } })),
      ...[2, 3, 4, 5].map((r) => ({ s: { r, c: 6 }, e: { r, c: N - 1 } }))
    ];
    const borda = { style: "thin", color: { rgb: "B8C4BE" } };
    const bordas = { top: borda, bottom: borda, left: borda, right: borda };
    const cor = (txt) => /^(Conferido|Autorizado)$/.test(txt) ? { fg: "DCFCE7", fc: "166534" }
      : (/^(Não se aplica)$/.test(txt) ? { fg: "F1F5F9", fc: "475569" }
        : (/^(Com desconto|Sem plano|Sem padrão|Não conferido|Não verificada)$/.test(txt) ? { fg: "FEF3C7", fc: "92400E" } : { fg: "FEE2E2", fc: "991B1B" }));
    const pinta = (r, c, s) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      ws[ref].s = s;
    };
    pinta(0, 0, { font: { bold: true, sz: 16, color: { rgb: "105436" } }, alignment: { horizontal: "center" } });
    [2, 3, 4, 5].forEach((r) => {
      [0, 5].forEach((c) => pinta(r, c, { font: { bold: true }, fill: { fgColor: { rgb: "E2E8E5" } }, alignment: { horizontal: "right" }, border: bordas }));
      for (let c = 1; c < N; c++) if (c !== 5) pinta(r, c, { border: bordas });
    });
    cab.forEach((_, c) => pinta(inicio - 1, c, {
      font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: c >= 9 ? "0B3D27" : "105436" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: bordas
    }));
    itens.forEach((_, k) => {
      const r = inicio + k;
      for (let c = 0; c < N; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        const txt = ws[ref] ? String(ws[ref].v) : "";
        if (c >= 9) {
          const k2 = cor(txt);
          pinta(r, c, { font: { bold: true, color: { rgb: k2.fc } }, fill: { fgColor: { rgb: k2.fg } }, alignment: { horizontal: "center", vertical: "center" }, border: bordas });
        } else {
          pinta(r, c, Object.assign({ alignment: { vertical: "center", horizontal: c === 3 ? "right" : "left" }, border: bordas }, c === 3 ? { numFmt: "#,##0.00" } : {}));
        }
      }
    });
    const rTot = inicio + itens.length;
    [2, 3].forEach((c) => pinta(rTot, c, Object.assign({ font: { bold: true }, fill: { fgColor: { rgb: "E2E8E5" } }, alignment: { horizontal: "right" }, border: bordas }, c === 3 ? { numFmt: "#,##0.00" } : {})));
    pinta(rTot + 2, 0, { font: { italic: true, sz: 9, color: { rgb: "64748B" } } });
    ws["!rows"] = [{ hpt: 26 }];
    ws["!rows"][inicio - 1] = { hpt: 30 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lote");
    const conta = String((lote.conta && (lote.conta.numero || lote.conta.id)) || "").replace(/[^\w-]/g, "");
    XLSX.writeFile(wb, `lote_pagar_${lote.id}${conta ? "_cc" + conta : ""}.xlsx`);
  },

  async excluirLote(id) {
    const lote = this.state.lotes.find((l) => l.id === id);
    if (!lote) return;
    const sg = lote.sienge || {};
    if (this.state.roboLote === id) return;
    if (sg.status === "aprovado") {
      alert(`O lote ${id} já foi aprovado no Sienge${sg.numero ? " (nº " + sg.numero + ")" : ""}. Cancele primeiro no Sienge; aqui ele não pode ser excluído.`);
      return;
    }
    const aviso = sg.status === "gerado" ? `\n\nAtenção: este lote já existe no Sienge${sg.numero ? " (nº " + sg.numero + ")" : ""}. Excluir aqui NÃO exclui no Sienge.` : "";
    const okConf = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm(`Excluir o lote ${id}? Os títulos voltam a ficar disponíveis para um novo lote.${aviso}`)
      : confirm(`Excluir o lote ${id}?`);
    if (!okConf) return;
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.deleteDoc) {
      try {
        await fc.deleteDoc(fc.doc(window.firebaseDb, this.LOTES_COLLECTION, id));
      } catch (e) {
        console.warn("[Gerar Pagamento] excluir lote", e);
        alert("Não consegui excluir o lote no Firebase.");
        return;
      }
    }
    const em = new Date().toISOString();
    this.auditarEvento(lote, { tipo: "LOTE_EXCLUIDO", em, por: this.usuarioAtual(), porEmail: this.emailAtual(), ok: true,
      msg: sg.status === "gerado" ? "continua no Sienge — excluir lá também" : "" }, `lote-${id}-LOTE_EXCLUIDO-${new Date(em).getTime()}`);
    this.state.lotes = this.state.lotes.filter((l) => l.id !== id);
    this.salvarLotesLocal(this.lotesLocal().filter((l) => l.id !== id));
    Object.keys(this.state.selInit).forEach((k) => {
      if ((lote.itens || []).some((i) => k.endsWith("|" + this.chaveTitulo(i.titulo, i.parcela)))) delete this.state.selInit[k];
    });
    this.paintTitulos();
  },

  planosDoItem(it) {
    const planos = [];
    const ccs = it && it.ccs;
    if (Array.isArray(ccs)) ccs.forEach((c) => {
      (c && c.planos || []).forEach((p) => {
        const t = [p && p.id, p && p.nome].filter(Boolean).join(" ");
        if (t && planos.indexOf(t) < 0) planos.push(t);
      });
    });
    if (!planos.length && it && it.valida && it.valida.planoTexto) planos.push(it.valida.planoTexto);
    return planos;
  },

  centrosDoItem(it) {
    if (it && typeof it.ccs === "string" && it.ccs.trim()) return it.ccs.trim();
    return (it && it.ccs || []).map((c) => {
      if (!c || typeof c === "string") return String(c || "");
      return [c.id, c.nome].filter(Boolean).join(" ");
    }).filter(Boolean).join(" · ") || "—";
  },

  linhaTituloHtml(it, chave) {
    const planos = this.planosDoItem(it);
    const id = `${this.esc(it.titulo)}${it.parcela ? " / " + this.esc(it.parcela) : ""}`;
    return `<button type="button" class="gp-titulo-linha" onclick="GerarPagamentoApp.abrirResumo('${this.esc(chave)}')" title="Abrir o título">
      <span class="gp-tl-id"><strong>${id}</strong></span>
      <span class="gp-tl-credor">${this.esc(it.credor || "")}</span>
      <span class="gp-tl-meta"><b>Centro de custo</b> ${this.esc(this.centrosDoItem(it))}</span>
      <span class="gp-tl-meta"><b>Plano financeiro</b> ${this.esc(planos.join(" · ") || "—")}</span>
      <span class="gp-tl-val">${this.money(it.valor != null && it.aPagar == null ? it.valor : this.valorPagar(it))}</span>
    </button>`;
  },

  resumoEmLoteHtml(g) {
    const linhas = (g.itens || []).map((it) => this.linhaTituloHtml(it, it.chave)).join("");
    return `<div class="gp-lote-linhas">${linhas}</div>`;
  },

  resumoLoteGeradoHtml(l) {
    const conta = `<div class="gp-conta-linha"><b>Conta corrente</b> ${this.esc(this.contaLabel(l.conta) || "—")}</div>`;
    const linhas = (l.itens || []).map((it) => this.linhaTituloHtml(it, this.chaveTitulo(it.titulo, it.parcela))).join("");
    return `<div class="gp-lote-linhas">${conta}${linhas || '<div class="gp-titulo-linha" style="cursor:default;">Nenhum título neste lote.</div>'}</div>`;
  },

  lotesHtml() {
    const s = this.state;
    const grupos = this.gruposLote();
    if (!grupos.length) {
      return `<div style="padding:22px 20px;color:#64748b;font-size:0.85rem;">Nenhum título em aberto dos centros de custo de parceiro no período.</div>`;
    }
    const card = (g) => {
      const sem = g.key === "__sem";
      const marcados = g.itens.filter((it) => it.marcado);
      const total = marcados.reduce((t, it) => t + this.valorPagar(it), 0);
      const disponiveis = g.itens.filter((it) => !it.emLote);
      const liberados = disponiveis.filter((it) => !it.bloqueio);
      const divergentes = disponiveis.filter((it) => this.bloqueioVisivel(it)).length;
      const todos = liberados.length > 0 && liberados.every((it) => it.marcado);
      const gerando = s.gerandoLote === g.key;
      const jaGerado = !sem && !disponiveis.length;
      const lotesDoDia = this.lotesDoGrupo(g);
      const linhas = g.itens.map((it) => {
        const tag = it.loteIntegra
          ? `<span class="gp-pill gp-ok">No lote ${this.esc(it.loteIntegra.id)}</span>`
          : (it.loteSienge ? `<span class="gp-pill gp-warn">Já em lote no Sienge${it.loteSienge !== "sim" ? " nº " + this.esc(it.loteSienge) : ""}</span>`
            : (this.lotePendenteDe(it.chave)
              ? `<span class="gp-pill gp-wait" title="Está no lote ${this.esc(this.lotePendenteDe(it.chave).id)}, que não foi gerado no Sienge. Ao gerar de novo, ele sai daquele lote.">Em aberto</span><small>Lote não gerado no Sienge</small>`
              : `<span class="gp-pill gp-wait">Em aberto</span>`));
        const pagSelo = this.pagSeloDe(it);
        const fiscalSelo = this.fiscalSeloDe(it);
        const retido = this.retidoDe(it);
        return `<tr class="gp-click${it.emLote ? " gp-em-lote" : ""}${this.bloqueioVisivel(it) ? " gp-row-bad" : ""}" onclick="GerarPagamentoApp.abrirResumo('${this.esc(it.chave)}')" title="Clique para ver o resumo do título">
          <td style="text-align:center;" onclick="event.stopPropagation()"><input type="checkbox" ${it.marcado ? "checked" : ""} ${sem || it.emLote || it.bloqueio || gerando ? "disabled" : ""}
            title="${this.esc(it.emLote ? "Já está em lote; não pode entrar em outro." : (it.bloqueio ? "Bloqueado: " + it.bloqueio : ""))}"
            onchange="GerarPagamentoApp.toggleItem('${this.esc(it.selKey)}')"></td>
          <td>${this.dataBr(it.vencimento)}</td>
          <td><strong>${this.esc(it.titulo)}</strong>${it.parcela ? `<span class="gp-muted"> / ${this.esc(it.parcela)}</span>` : ""}</td>
          <td title="${this.esc(it.credor)}">${this.esc(it.credor)}</td>
          <td>${this.esc(it.documento || "—")}${it.guiaUnica ? `<br><small class="gp-acerto-mini">Documento inteiro nesta conta</small>` : ""}</td>
          <td class="gp-status">${this.ccsCelulaHtml(it)}</td>
          <td style="text-align:right;"${retido ? ` title="${this.esc(`Líquido: bruto ${this.money(it.aPagar)} − impostos retidos ${this.money(retido)}`)}"` : ""}>${this.money(this.valorPagar(it))}${retido ? `<br><small class="gp-muted" style="white-space:nowrap;">retido ${this.money(retido)}</small>` : ""}</td>
          <td class="gp-status">${pagSelo}</td>
          <td class="gp-status">${fiscalSelo}</td>
          <td class="gp-status">${this.autorizacaoSeloHtml(it)}</td>
          <td class="gp-status">${tag}</td>
        </tr>`;
      }).join("");
      const vencs = [...new Set(g.itens.map((it) => String(it.vencimento || "").slice(0, 10)).filter(Boolean))].sort();
      const faixa = !sem && vencs.length && (vencs[0] !== g.dia || vencs[vencs.length - 1] !== g.dia)
        ? ` · vencimentos de ${this.dataBr(vencs[0])} a ${this.dataBr(vencs[vencs.length - 1])}`
        : "";
      const resumo = sem
        ? "Cadastre a conta em Centros de Custo para incluir estes títulos em lote."
        : (jaGerado
          ? `${g.itens.length} título(s) · todos já em lote (${lotesDoDia.map((x) => this.esc(x)).join(", ")})${faixa}`
          : `${g.itens.length} título(s) · ${disponiveis.length} disponível(is) · ${marcados.length} marcado(s)${lotesDoDia.length ? ` · ${g.itens.length - disponiveis.length} já em lote` : ""}${divergentes ? ` · <b class="gp-bloq">${divergentes} bloqueado(s) por divergência</b>` : ""}${faixa}`);
      const somaGrupo = g.itens.reduce((t, it) => t + this.valorPagar(it), 0);
      const aberto = !!s.lotesAbertos[g.key];
      return `<div class="gp-lote${sem ? " gp-lote-sem" : ""}${jaGerado ? " gp-lote-feito" : ""}${aberto ? " is-open" : ""}">
        <div class="gp-lote-h" role="button" tabindex="0" aria-expanded="${aberto}" title="${aberto ? "Clique para fechar o lote" : "Clique para ver os títulos do lote"}"
          onclick="GerarPagamentoApp.toggleLote('${this.esc(g.key)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();GerarPagamentoApp.toggleLote('${this.esc(g.key)}');}">
          <div class="gp-lote-tit">
            <i data-lucide="chevron-right" class="gp-lote-seta"></i>
            <div>
              <div class="gp-lote-conta">${sem ? "Sem conta de parceria cadastrada" : `${jaGerado ? '<span class="gp-cc-rotulo">Conta corrente</span> ' : ""}${this.esc(this.contaLabel(g.conta))} <span class="gp-lote-dia"><i data-lucide="calendar" style="width:13px;height:13px;"></i> ${this.dataBr(g.dia)}</span>`}</div>
              <small>${resumo} · ${this.money(somaGrupo)}</small>
            </div>
          </div>
          ${sem ? "" : (jaGerado ? `<div class="gp-lote-acoes" onclick="event.stopPropagation()">
            <span class="gp-pill gp-ok" style="height:30px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;"><i data-lucide="check-circle-2" style="width:14px;height:14px;"></i> Lote já gerado</span>
          </div>` : `<div class="gp-lote-acoes" onclick="event.stopPropagation()">
            <label class="gp-lote-todos"><input type="checkbox" ${todos ? "checked" : ""} ${gerando || !liberados.length ? "disabled" : ""} onchange="GerarPagamentoApp.toggleGrupo('${this.esc(g.key)}', this.checked)"> Marcar todos</label>
            <label class="gp-baixa">Data da baixa
              <input type="date" value="${this.esc(this.dataBaixaDoGrupo(g))}" ${gerando ? "disabled" : ""}
                title="O robô preenche esta data no campo Data da baixa do Sienge"
                onchange="GerarPagamentoApp.setDataBaixa('${this.esc(g.key)}', this.value)">
            </label>
            <strong class="gp-lote-total">${this.money(total)}</strong>
            <button type="button" class="gp-conferido${this.loteConferido(g) ? " is-on" : ""}" onclick="GerarPagamentoApp.marcarConferido('${this.esc(g.key)}')"
              title="${this.loteConferido(g) ? "Classificação aceita. Clique para desfazer o aceite deste lote." : "Aceite de que a classificação, o rateio e a conta estão corretos. O Integra passa a reconhecer este padrão."}">
              <i data-lucide="${this.loteConferido(g) ? "circle-check" : "circle-alert"}" style="width:14px;height:14px;"></i> Conferido
            </button>
            <button type="button" class="btn btn-primary" ${s.gerandoLote || !marcados.length || !this.loteConferido(g) ? "disabled" : ""} onclick="GerarPagamentoApp.gerarLote('${this.esc(g.key)}')"
              title="${!this.loteConferido(g) ? "Marque Conferido para liberar a geração deste lote." : (!marcados.length && divergentes ? "Os títulos divergentes ficam de fora deste envio." : "Gera só este lote.")}"
              style="height:36px;width:150px;justify-content:center;display:inline-flex;align-items:center;gap:6px;">
              ${gerando ? '<span class="btn-spin"></span> Gerando…' : '<i data-lucide="layers" style="width:14px;"></i> Gerar lote'}
            </button>
          </div>`)}
        </div>
        ${this.transferenciasHtml(this.transferenciasDe(g.itens))}
        ${jaGerado ? this.resumoEmLoteHtml(g) : ""}
        <div class="gp-lote-corpo" style="overflow:auto;"${aberto ? "" : " hidden"}>
          <table class="gp-table gp-titulos">
            <colgroup><col style="width:3%"><col style="width:8%"><col style="width:7%"><col style="width:12%"><col style="width:9%"><col style="width:11%"><col style="width:9%"><col style="width:10%"><col style="width:9%"><col style="width:12%"><col style="width:10%"></colgroup>
            <thead><tr><th></th><th>Vencimento</th><th>Título</th><th>Credor</th><th>Documento</th><th>Rateio</th><th style="text-align:right;">A pagar</th><th>Pagamento</th><th title="Imposto retido lançado no Sienge × nota fiscal anexada × CNAE do prestador">Fiscal</th><th>Autorização</th><th>Situação</th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      </div>`;
    };
    const noPeriodo = (dia) => this.noPeriodoBuscado(dia);
    const aGerarTodos = grupos.map((g) => ({ ...g, itens: g.itens.filter((it) => !it.emLote) })).filter((g) => g.itens.length);
    const diasRetro = this.diasRetroPendentes(aGerarTodos);
    if (s.diaRetro && !diasRetro.some((d) => d.dia === s.diaRetro)) s.diaRetro = "";
    const aGerar = this.recortarGrupos(aGerarTodos, noPeriodo);
    const aGerarRetro = s.diaRetro ? this.recortarGrupos(aGerarTodos, (dia) => dia === s.diaRetro) : [];
    const emLote = this.recortarGrupos(
      grupos.map((g) => ({ ...g, key: g.key + "#lote", itens: g.itens.filter((it) => it.emLote) })).filter((g) => g.itens.length),
      noPeriodo);
    const aba = s.abaLotes === "lote" ? "lote" : "gerar";
    const fonteEmpresa = s.diaRetro && aba !== "lote" ? aGerarRetro : (aba === "lote" ? emLote : aGerar);
    const baseStatus = s.diaRetro && aba !== "lote" ? aGerarRetro : aGerar;
    const abasEmpresa = this.abasEmpresaHtml(fonteEmpresa, baseStatus);
    const emp = this.state.abaEmpresa;
    const soEmpresa = (lista) => this.filtrarEmpresa(lista, emp);
    const aGerarVis = soEmpresa(aGerar);
    const emLoteVis = soEmpresa(emLote);
    const retroVis = soEmpresa(aGerarRetro);
    const nAGerar = aGerarVis.reduce((t, g) => t + g.itens.length, 0);
    const nEmLote = emLoteVis.reduce((t, g) => t + g.itens.length, 0);
    const abas = `<div class="ml-tabs gp-abas-lote" role="tablist">
        <button type="button" role="tab" aria-selected="${aba === "gerar"}" class="ml-tab ${aba === "gerar" ? "is-active" : ""}" onclick="GerarPagamentoApp.setAbaLotes('gerar')"><i data-lucide="layers"></i> A gerar <span class="ml-tab-count">${nAGerar}</span></button>
        <button type="button" role="tab" aria-selected="${aba === "lote"}" class="ml-tab ${aba === "lote" ? "is-active" : ""}" onclick="GerarPagamentoApp.setAbaLotes('lote')"><i data-lucide="check-circle-2"></i> Já em lote <span class="ml-tab-count">${nEmLote}</span></button>
      </div>`;
    const faixa = (extra) => `<div class="gp-faixa">${abasEmpresa}${abas}${extra || ""}</div>`;
    const vazio = (txt) => `<div style="padding:22px 20px;color:#64748b;font-size:0.85rem;">${txt}</div>`;
    const chaves = new Set(s.titulos.filter((r) => noPeriodo(String(r.vencimento || "").slice(0, 10))).map((r) => this.chaveTitulo(r.titulo, r.parcela)));
    const gerados = s.lotes
      .filter((l) => (l.itens || []).some((i) => chaves.has(this.chaveTitulo(i.titulo, i.parcela))))
      .filter((l) => !emp || this.empresaDoGrupo({ empresaConta: l.empresaConta, itens: l.itens || [] }) === emp)
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const geradosHtml = gerados.length ? `<div class="gp-lote">
        <div class="gp-lote-h"><div><div class="gp-lote-conta">Lotes gerados com títulos deste período</div></div></div>
        <table class="gp-table gp-titulos">
          <colgroup><col style="width:17%"><col style="width:8%"><col style="width:19%"><col style="width:6%"><col style="width:9%"><col style="width:10%"><col style="width:14%"><col style="width:17%"></colgroup>
          <thead><tr><th>Lote</th><th>Data da baixa</th><th>Conta</th><th>Títulos</th><th style="text-align:right;">Total</th><th>Gerado</th><th>Sienge</th><th></th></tr></thead>
          <tbody>${gerados.map((l) => `<tr>
            <td><strong>${this.esc(l.id)}</strong></td>
            <td>${(l.dataBaixa || l.dia) ? this.dataBr(l.dataBaixa || l.dia) : this.esc([...new Set((l.itens || []).map((i) => this.dataBr(i.vencimento)))].join(", "))}</td>
            <td title="${this.esc(this.contaLabel(l.conta))}">${this.esc(this.contaLabel(l.conta))}</td>
            <td>${(l.itens || []).length}</td>
            <td style="text-align:right;">${this.money(l.total)}</td>
            <td title="${this.esc(l.criadoPor || "")}">${new Date(l.criadoEm).toLocaleDateString("pt-BR")} · ${this.esc(String(l.criadoPor || "").split(" ")[0])}</td>
            <td class="gp-status">${this.siengeHtml(l)}</td>
            <td style="text-align:right;white-space:nowrap;">
              ${this.siengeAcoesHtml(l)}
              <button type="button" class="btn btn-sm btn-excel" onclick="GerarPagamentoApp.baixarLoteExcel('${this.esc(l.id)}')" title="Baixar o lote em Excel"><i data-lucide="download" style="width:14px;height:14px;"></i> Excel</button>
              <button type="button" class="btn btn-sm" onclick="GerarPagamentoApp.excluirLote('${this.esc(l.id)}')" style="color:#b91c1c;background:#fff;border:1px solid #fecaca;">Excluir</button>
            </td>
          </tr>
          <tr><td colspan="8">${this.resumoLoteGeradoHtml(l)}</td></tr>
          ${(l.transferencias || []).length ? `<tr><td colspan="8">${this.transferenciasHtml(l.transferencias)}</td></tr>` : ""}`).join("")}</tbody>
        </table>
      </div>` : "";
    if (aba === "lote") {
      return `${faixa()}<p class="gp-nota">Lotes gerados e títulos deste período que já estão em lote no Integra ou no Sienge. Eles não entram em outro lote. Clique na linha para ver o resumo do título.</p>${geradosHtml}${emLoteVis.length ? emLoteVis.map(card).join("") : (gerados.length ? "" : vazio("Nenhum título desta empresa está em lote no período."))}`;
    }
    const alerta = this.retroAlertaHtml(diasRetro);
    const massa = `<div class="gp-massa">
      <button type="button" class="btn btn-sm btn-outline" onclick="GerarPagamentoApp.marcarLotes(true)">Marcar todos os lotes</button>
      <button type="button" class="btn btn-sm btn-outline" onclick="GerarPagamentoApp.marcarLotes(false)">Desmarcar todos os lotes</button>
      <button type="button" class="btn btn-sm btn-primary" title="Gera os lotes marcados de todas as empresas do período" onclick="GerarPagamentoApp.gerarLotesMarcados()">Gerar lotes marcados</button>
    </div>`;
    if (s.diaRetro) {
      const titulosRetro = retroVis.reduce((t, g) => t + g.itens.length, 0);
      const totalRetro = retroVis.reduce((t, g) => t + g.itens.reduce((s2, it) => s2 + this.valorPagar(it), 0), 0);
      return `${faixa(massa)}${alerta}
        <div class="gp-retro-vendo">
          <span><i data-lucide="history" style="width:15px;height:15px;"></i> Pendências de <strong>${this.dataBr(s.diaRetro)}</strong>, antes do período buscado · ${titulosRetro} título(s) · ${this.money(totalRetro)}</span>
          <button type="button" class="btn btn-outline btn-sm" onclick="GerarPagamentoApp.setDiaRetro('')"><i data-lucide="arrow-left" style="width:14px;height:14px;"></i> Voltar ao período ${this.dataBr(s.startDate)}${s.endDate !== s.startDate ? " a " + this.dataBr(s.endDate) : ""}</button>
        </div>
        ${retroVis.map(card).join("")}`;
    }
    const vazioPeriodo = this.state.titulos.some((r) => noPeriodo(String(r.vencimento || "").slice(0, 10)) && !r.pago && r.aPagar > 0.009)
      ? "Nenhum título a gerar lote nesta empresa no período: todos já estão em lote."
      : "Nenhum título em aberto com vencimento no período buscado.";
    return `${this.conferenciaHtml()}${faixa(massa)}${alerta}${aGerarVis.length ? aGerarVis.map(card).join("") : vazio(vazioPeriodo)}`;
  },

  grupoStatus(r) {
    if (r.status === "ok") return "ok";
    if (r.status === "outra" || r.status === "sem-conta") return "outra";
    return "aberto";
  },

  /* Uma linha por título/parcela: CC de parceiro sempre vem rateado com o CC da obra (13901 com 13900). */
  titulosAgrupados() {
    const ordem = [];
    const grupos = {};
    const prioridade = ["outra", "sem-conta", "aberto", "pago-sem-conta", "ok"];
    this.state.titulos.forEach((r) => {
      const chave = this.chaveTitulo(r.titulo, r.parcela);
      if (!grupos[chave]) {
        grupos[chave] = { ...r, linhas: [], valor: 0 };
        ordem.push(chave);
      }
      const g = grupos[chave];
      g.linhas.push(r);
      g.valor += r.valor;
      if (prioridade.indexOf(r.status) < prioridade.indexOf(g.status)) g.status = r.status;
    });
    return ordem.map((k) => {
      const g = grupos[k];
      if (g.tituloValor != null) g.valor = g.tituloValor;
      g.contasEsperadas = [...new Set(g.linhas.map((r) => (r.esperada ? String(r.esperada.numero || r.esperada.id) : "")).filter(Boolean))];
      return g;
    });
  },

  obra(ccId) {
    return String(ccId || "").slice(0, -2);
  },

  ccDeParceriaPeloNome(id, nome) {
    return !this.ehCorporativo(id) && /parce(ir|ri)/i.test(String(nome || ((this.ccDe(id) || {}).name) || ""));
  },

  num(v) {
    const n = parseFloat(String(v == null ? "" : v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  },

  /* Padrão da obra no cadastro: % Moura Leite no CC da obra (14000) e % Terrenista no CC do parceiro (14001). */
  rateioPadraoObra(baseId, parcId) {
    const ml = this.num(this.customOf(baseId).perc_ml);
    const terr = parcId ? this.num(this.customOf(parcId).perc_terrenista) : 0;
    if (terr > 0 && terr < 100) {
      const aviso = ml > 0 && ml < 100 && Math.abs(ml + terr - 100) > 0.01
        ? `Cadastro da obra ${this.obra(baseId)}: ${this.pct(ml)} Moura Leite (${baseId}) + ${this.pct(terr)} terrenista (${parcId}) não somam 100%. Usei ${this.pct(100 - terr)} / ${this.pct(terr)}.`
        : "";
      return { ml: 100 - terr, terr, aviso };
    }
    if (ml > 0 && ml < 100) return { ml, terr: 100 - ml, aviso: "" };
    return null;
  },

  /* Distrato emitido até esta data pode ficar só no CC do parceiro.
     A partir do dia seguinte o título sai inteiro no CC da obra, o pagamento usa a conta do CC do parceiro
     e a prestação de contas aplica o rateio padrão. */
  DISTRATO_PARCEIRO_ATE: "2025-12-31",

  /* Loteador (13300) e parceiro (13301) da mesma obra e da mesma empresa. */
  parDoObra(ccId, companyId) {
    const obra = this.obra(ccId);
    if (!obra) return null;
    const emp = String(companyId || "");
    const mesmos = (this.state.costCenters || []).filter((c) => this.obra(c.id) === obra && (!emp || String(this.companyIdOf(c) || "") === emp));
    const porNome = (c) => this.ccDeParceriaPeloNome(c.id, c.name);
    const parc = mesmos.find(porNome) || mesmos.find((c) => String(c.id) !== obra + "00" && this.contaParceriaDe(c));
    const base = mesmos.find((c) => String(c.id) === obra + "00" && !porNome(c))
      || mesmos.find((c) => c && parc && String(c.id) !== String(parc.id) && !porNome(c));
    if (!parc || !base || String(base.id) === String(parc.id)) return null;
    return { base, parc };
  },

  /* Repasse ou distribuição: o plano do título, o plano cadastrado no credor, ou o nome da conta. */
  ehRepasse(r) {
    const planos = [];
    ((r && r.ccsTitulo) || []).forEach((c) => ((c && c.planos) || []).forEach((p) => { if (p) planos.push(p); }));
    const texto = [r && r.docId, r && r.docNome].concat(planos.map((p) => [p.id, p.nome].filter(Boolean).join(" "))).join(" ");
    if (/repasse|distribui[cç][aã]o de lucro/i.test(texto)) return true;
    const ids = new Set(planos.map((p) => String(p.id || "").trim()).filter(Boolean));
    const doc = String((r && r.docId) || "").trim();
    return this.parceriasRateio().some((part) => (part.socios || []).some((s) => {
      const lista = Array.isArray(s.planos) && s.planos.length
        ? s.planos.map((pl) => String((pl && pl.id) || "").trim()).filter(Boolean)
        : [String(s.planoId || "").trim()].filter(Boolean);
      const tipo = String(s.docTipo || "").trim();
      return lista.some((plano) => ids.has(plano)) && (!tipo || !doc || tipo === doc);
    }));
  },

  /* Saldo do parceiro lançado no CC do loteador e pago pela conta de parceria do CC do parceiro. */
  contaPagamentoRepasse(r) {
    if (!r || this.ccDeParceriaPeloNome(r.ccId, r.ccNome) || !this.ehRepasse(r)) return null;
    const par = this.parDoObra(r.ccId, this.companyIdOf(this.ccDe(r.ccId)) || r.companyId);
    if (!par || String(par.base.id) !== String(r.ccId)) return null;
    return this.contaParceriaDe(par.parc);
  },

  /**
   * Distrato de parceria sai pela conta cadastrada no centro do parceiro (13801),
   * mesmo quando o título está apropriado só no centro da obra (13800).
   * Vale para todas as obras com par empreendedor + parceiro.
   */
  contaPagamentoDistratoNovo(r) {
    if (!r || this.ccDeParceriaPeloNome(r.ccId, r.ccNome)) return null;
    const ccs = r.ccsTitulo && r.ccsTitulo.length
      ? r.ccsTitulo
      : [{ id: r.ccId, nome: r.ccNome, planos: [], rateio: 100 }];
    if (!this.ehDistrato(ccs, this.contextoRateio(r))) return null;
    const emp = String(this.companyIdOf(this.ccDe(r.ccId)) || r.companyId || "");
    const par = this.parDoObra(r.ccId, emp) || this.parDoObra(r.ccId, "");
    if (!par || this.obra(r.ccId) !== this.obra(par.base.id)) return null;
    if (String(r.ccId) === String(par.parc.id)) return null;
    return this.contaParceriaDe(par.parc);
  },

  contextoRateio(r) {
    return { emissao: (r && r.emissao) || "", docId: (r && r.docId) || "", docNome: (r && r.docNome) || "" };
  },

  ehDistrato(ccs, ctx) {
    const planos = (ccs || []).reduce((l, c) => l.concat((c.planos || []).map((p) => [p && p.id, p && p.nome].filter(Boolean).join(" "))), []);
    const texto = [ctx && ctx.docId, ctx && ctx.docNome, ctx && ctx.documento].concat(planos).join(" ");
    if (/distrat/i.test(texto)) return true;
    return String((ctx && ctx.docId) || "").trim().toUpperCase() === "RD";
  },

  /** Obra cadastrada como sociedade não tem rateio. O lote não pode ser barrado por isso. */
  obraEhSociedade(obra, ids) {
    const PP = window.ParametrizacaoParceiroApp;
    if (!PP || typeof PP.normalizeItem !== "function" || typeof PP.isSociedade !== "function") return false;
    const lista = Array.isArray(PP.items) && PP.items.length
      ? PP.items
      : (() => { try { return JSON.parse(localStorage.getItem("crm_parcerias_v1") || "[]") || []; } catch (e) { return []; } })();
    const set = new Set((ids || []).map((id) => String(id || "")).filter(Boolean));
    const code = String(obra || "");
    return (lista || []).some((raw) => {
      const p = PP.normalizeItem(raw);
      if (!p || !PP.isSociedade(p)) return false;
      return (p.obras || []).some((o) => String(o.code) === code || (o.costCenters || []).some((c) => set.has(String(c.id))));
    });
  },

  parceriasRateio() {
    const PP = window.ParametrizacaoParceiroApp;
    if (!PP || typeof PP.normalizeItem !== "function") return [];
    const lista = Array.isArray(PP.items) && PP.items.length
      ? PP.items
      : (() => { try { return JSON.parse(localStorage.getItem("crm_parcerias_v1") || "[]") || []; } catch (e) { return []; } })();
    return (Array.isArray(lista) ? lista : []).map((p) => PP.normalizeItem(p)).filter((p) => p && !PP.isSociedade(p));
  },

  planoConstaNoDfc(accId) {
    const PP = window.ParametrizacaoParceiroApp;
    if (!PP || typeof PP.dfcGroups !== "function") return false;
    const nk = typeof PP.normKey === "function" ? PP.normKey(accId) : String(accId || "").replace(/\D/g, "");
    if (!nk) return false;
    return PP.dfcGroups().some((g) => (g.accounts || []).some((a) => String(a) === String(accId) || PP.normKey(a) === nk));
  },

  /* 2.03.05.02.02 no título e 203050202 na visão DFC são a mesma conta. */
  planoNoDfc(plano) {
    const PP = window.ParametrizacaoParceiroApp;
    const id = String((plano && plano.id) || "").trim();
    const nome = String((plano && plano.nome) || "").trim();
    const grupos = PP && typeof PP.dfcGroups === "function" ? PP.dfcGroups() : [];
    const nk = (v) => (PP && typeof PP.normKey === "function" ? PP.normKey(v) : String(v || "").replace(/\D/g, ""));
    const achar = (chave) => {
      const alvo = nk(chave);
      if (!alvo) return "";
      let hit = "";
      grupos.some((g) => (g.accounts || []).some((a) => {
        if (String(a) === String(chave) || nk(a) === alvo) { hit = String(a); return true; }
        return false;
      }));
      return hit;
    };
    const direto = achar(id);
    if (direto) return { id: direto, nome, rotulo: id };
    const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const alvoNome = fold(nome);
    if (!alvoNome || !PP || !Array.isArray(PP.categories)) return null;
    const cat = PP.categories.find((c) => fold(c._name || c.name || c.description) === alvoNome);
    const cid = cat ? achar(cat._id || cat.id) : "";
    return cid ? { id: cid, nome, rotulo: id || cid } : null;
  },

  /* Título só no 14000: o 14001 da mesma obra também acha a parceria. */
  centrosDaParceria(ccIds) {
    const ids = [];
    const add = (id) => {
      const s = String(id || "");
      if (s && ids.indexOf(s) < 0) ids.push(s);
    };
    (ccIds || []).forEach(add);
    ids.slice().forEach((id) => {
      const emp = String(this.companyIdOf(this.ccDe(id)) || "");
      const par = (emp && this.parDoObra(id, emp)) || this.parDoObra(id, "");
      if (!par) return;
      add(par.base && par.base.id);
      add(par.parc && par.parc.id);
    });
    return ids;
  },

  /** Plano que a configuração do parceiro manda ratear. Vazio quando a conta está fora ou não há parceria neste centro. */
  planoExigeRateio(ccIds, planos) {
    const PP = window.ParametrizacaoParceiroApp;
    if (!PP || typeof PP.accountEntersPartnership !== "function") return "";
    const lista = [];
    (planos || []).forEach((p) => {
      const canon = this.planoNoDfc(p);
      if (!canon || lista.some((x) => x.id === canon.id)) return;
      lista.push(canon);
    });
    if (!lista.length) return "";
    const ids = this.centrosDaParceria(ccIds);
    for (const part of this.parceriasRateio()) {
      let obra = ids.map((id) => PP.obraForCostCenter(part, id)).find(Boolean);
      if (!obra) {
        const codigo = ids.map((id) => this.obra(id)).find(Boolean);
        obra = (codigo && (part.obras || []).find((o) => String(o.code) === String(codigo))) || null;
      }
      if (!obra) continue;
      for (const plano of lista) {
        if (PP.accountEntersPartnership(part, obra, plano.id)) return [plano.rotulo || plano.id, plano.nome].filter(Boolean).join(" — ");
      }
    }
    return "";
  },

  /* O valor de cada obra no título é dividido entre o CC da obra e o do parceiro pelo padrão do cadastro. */
  conferirRateio(ccs, valor, ctx) {
    const distrato = this.ehDistrato(ccs, ctx);
    const emissao = String((ctx && ctx.emissao) || "");
    const distratoAntigo = distrato && !!emissao && emissao <= this.DISTRATO_PARCEIRO_ATE;
    const total = Number(valor) || 0;
    const soma = (ccs || []).reduce((t, c) => t + this.num(c.rateio), 0);
    const linhas = (ccs || []).map((c) => {
      const pct = soma > 0 ? this.num(c.rateio) * 100 / soma : 100 / ccs.length;
      return { id: String(c.id), nome: c.nome || ((this.ccDe(c.id) || {}).name) || "", parceria: !!c.parceria, pct, valor: total * pct / 100, planos: c.planos || [] };
    }).sort((a, b) => Number(a.id) - Number(b.id));
    // Obra e empresa: obra que virou SPE mantém o CC antigo (ex.: 14200 na empresa 1) fora do par 14201/14202.
    const empresaDe = (id) => String(this.companyIdOf(this.ccDe(id)) || "");
    const obras = [];
    const porObra = {};
    linhas.forEach((l) => {
      const ob = this.obra(l.id);
      const emp = empresaDe(l.id);
      const k = ob + "|" + emp;
      if (!porObra[k]) obras.push(porObra[k] = { obra: ob, empresa: emp, linhas: [] });
      porObra[k].linhas.push(l);
    });
    obras.forEach((o) => {
      o.rotulo = obras.some((x) => x !== o && x.obra === o.obra) && o.empresa ? `${o.obra} (empresa ${o.empresa})` : o.obra;
    });
    const problemas = [];
    const avisos = [];
    let erroRateio = false;
    let erroPlano = false;
    let semPadrao = false;
    obras.forEach((o) => {
      o.pct = o.linhas.reduce((t, l) => t + l.pct, 0);
      o.valor = total * o.pct / 100;
      const comPlano = o.linhas.filter((l) => l.planos.length);
      const ehParc = (l) => this.ccDeParceriaPeloNome(l.id, l.nome)
        || (String(l.id) === o.obra + "01" && o.linhas.some((x) => String(x.id) === o.obra + "00"));
      const temParceriaNoTitulo = o.linhas.some(ehParc);
      const sociedade = this.obraEhSociedade(o.obra, o.linhas.map((l) => l.id));
      const planosObra = o.linhas.reduce((acc, l) => acc.concat(l.planos || []), []);
      const exigeNasLinhas = this.planoExigeRateio(o.linhas.map((l) => l.id), planosObra);
      const parDistrato = distrato ? (this.parDoObra(o.linhas[0] && o.linhas[0].id, o.empresa) || this.parDoObra(o.linhas[0] && o.linhas[0].id, "")) : null;
      const distratoNaObra = !!(parDistrato && o.linhas.some((l) => String(l.id) === String(parDistrato.base.id)) && !o.linhas.some((l) => String(l.id) === String(parDistrato.parc.id)));
      if (!temParceriaNoTitulo && !exigeNasLinhas && !sociedade && !distratoNaObra) {
        o.consumo = true;
        o.linhas.forEach((l) => {
          l.padrao = null;
          l.esperado = l.valor;
          l.ok = true;
        });
        return;
      }
      if ((temParceriaNoTitulo || sociedade) && comPlano.length > 1 && new Set(comPlano.map((l) => this.chavePlanos(l.planos))).size > 1) {
        erroPlano = true;
        comPlano.forEach((l) => { l.planoErro = true; });
        problemas.push(`Plano financeiro diferente na obra ${o.rotulo}: ${comPlano.map((l) => `${l.id} em ${this.planosTexto(l.planos)}`).join("; ")}. O CC da obra e o do parceiro devem usar o mesmo plano.`);
      }
      if (sociedade) {
        o.sociedade = true;
        o.linhas.forEach((l) => {
          l.padrao = null;
          l.esperado = l.valor;
          l.ok = !l.planoErro;
        });
        return;
      }
      // O CC da obra também pode ter conta de parceria cadastrada; o par do rateio é decidido pelo nome.
      const daObra = this.state.costCenters.filter((c) => this.obra(c.id) === o.obra && (!o.empresa || empresaDe(c.id) === o.empresa))
        .slice().sort((a, b) => Number(a.id) - Number(b.id));
      const baseCad = daObra.find((c) => String(c.id) === o.obra + "00" && !this.ccDeParceriaPeloNome(c.id, c.name))
        || daObra.find((c) => !this.ccDeParceriaPeloNome(c.id, c.name));
      const base = (o.linhas.find((l) => l.id === o.obra + "00" && !ehParc(l)) || o.linhas.find((l) => !ehParc(l)) || {}).id
        || (baseCad ? String(baseCad.id) : o.obra + "00");
      const parcTitulo = o.linhas.find((l) => l.id !== base && ehParc(l));
      const parcCad = parcTitulo ? null : daObra.find((c) => String(c.id) !== base && this.ccDeParceriaPeloNome(c.id, c.name));
      const parc = parcTitulo ? parcTitulo.id : (parcCad ? String(parcCad.id) : (parDistrato ? String(parDistrato.parc.id) : ""));
      // Título só no CC da Moura Leite é 100% dela, sem rateio. Só no CC do parceiro, apenas distrato emitido até 31/12/2025.
      const temBase = o.linhas.some((l) => l.id === base);
      const soParceiro = parc && !temBase && !!parcTitulo;
      const aplicouRateio = !!(temBase && parcTitulo && parcTitulo.pct > 0.009);
      const distratoNovo = distrato && temBase && !parcTitulo && !!parc;
      if (distratoNovo) {
        const padraoNovo = this.rateioPadraoObra(base, parc);
        o.distratoNovo = true;
        o.contaParceiro = parc;
        if (!padraoNovo) {
          o.linhas.forEach((l) => {
            l.padrao = 100;
            l.esperado = l.valor;
            l.ok = !l.planoErro;
          });
          return;
        }
        o.padrao = padraoNovo;
        if (padraoNovo.aviso) avisos.push(padraoNovo.aviso);
        o.linhas.forEach((l) => {
          l.padrao = 100;
          l.esperado = l.valor;
          l.ok = !l.planoErro;
        });
        if (!o.linhas.some((l) => l.id === parc)) {
          o.linhas.push({
            id: parc,
            nome: (this.ccDe(parc) || {}).name || "",
            parceria: true,
            pct: 0,
            valor: 0,
            planos: [],
            prestacao: true,
            padrao: padraoNovo.terr,
            esperado: o.valor * padraoNovo.terr / 100,
            ok: true
          });
        }
        o.linhas.sort((a, b) => Number(a.id) - Number(b.id));
        return;
      }
      const exigeRateio = this.planoExigeRateio(o.linhas.map((l) => l.id).concat([base, parc].filter(Boolean)), planosObra);
      if (exigeRateio && !aplicouRateio && !distratoAntigo) {
        erroRateio = true;
        o.linhas.forEach((l) => { l.ok = false; });
        problemas.push(`Obra ${o.rotulo}: o plano ${exigeRateio} entra na parceria e o título foi lançado sem rateio${parc ? ` (falta o centro ${parc})` : ""}.`);
        return;
      }
      if (soParceiro && !distratoAntigo) {
        problemas.push(distrato
          ? `Obra ${o.rotulo}: distrato lançado só no CC do parceiro ${parc} com emissão ${emissao ? this.dataBr(emissao) : "não informada"}. Só distrato emitido até ${this.dataBr(this.DISTRATO_PARCEIRO_ATE)} pode ficar só no CC do parceiro.`
          : `Obra ${o.rotulo}: título lançado só no CC do parceiro ${parc}. Ele precisa estar rateado com o ${base} (exceto distrato emitido até ${this.dataBr(this.DISTRATO_PARCEIRO_ATE)}).`);
      }
      if (parc && temBase !== !!parcTitulo && (temBase || distratoAntigo)) {
        o.exclusivo = temBase ? "ml" : "parceiro";
        o.padrao = { ml: temBase ? 100 : 0, terr: temBase ? 0 : 100, aviso: "", exclusivo: true };
        o.linhas.forEach((l) => {
          l.padrao = o.pct > 0 ? l.pct * 100 / o.pct : 100;
          l.esperado = l.valor;
          l.ok = true;
        });
        return;
      }
      const padrao = parc ? this.rateioPadraoObra(base, parc) : { ml: 100, terr: 0, aviso: "" };
      if (!padrao) {
        o.semPadrao = semPadrao = true;
        problemas.push(`Obra ${o.rotulo}: rateio padrão não cadastrado. Informe o % Moura Leite no ${base} e o % Terrenista no ${parc} em Centros de Custo.`);
        return;
      }
      o.padrao = padrao;
      if (padrao.aviso) avisos.push(padrao.aviso);
      [base, parc].filter(Boolean).forEach((id) => {
        if (o.linhas.some((l) => l.id === id) || !((id === base ? padrao.ml : padrao.terr) > 0)) return;
        o.linhas.push({ id, nome: (this.ccDe(id) || {}).name || "", parceria: id === parc, pct: 0, valor: 0, planos: [], ausente: true });
      });
      o.linhas.sort((a, b) => Number(a.id) - Number(b.id));
      o.linhas.forEach((l) => {
        l.padrao = l.id === base ? padrao.ml : (l.id === parc ? padrao.terr : 0);
        l.esperado = o.valor * l.padrao / 100;
        const pctObra = o.pct > 0 ? l.pct * 100 / o.pct : 0;
        l.ok = Math.abs(l.valor - l.esperado) < 0.02 || Math.abs(pctObra - l.padrao) < 0.006;
        if (l.ok) return;
        erroRateio = true;
        problemas.push(l.ausente
          ? `${l.id} não está no rateio; o padrão é ${this.pct(l.padrao)} da obra ${o.rotulo} = ${this.money(l.esperado)}.`
          : `${l.id}: lançado ${this.money(l.valor)}; o padrão é ${this.pct(l.padrao)} da obra ${o.rotulo} = ${this.money(l.esperado)}.`);
      });
    });
    return { total, obras, problemas, avisos, erroRateio, erroPlano, semPadrao, ok: !problemas.length };
  },

  /** Caixinhas do relatório do lote: plano financeiro, rateio do parceiro, boleto/PIX e desconto. */
  validacoesDe(conf, pag, aut) {
    const linhas = conf ? conf.obras.reduce((l, o) => l.concat(o.linhas.filter((x) => !x.ausente)), []) : [];
    const planos = [];
    linhas.forEach((l) => l.planos.forEach((p) => {
      const t = [p.id, p.nome].filter(Boolean).join(" ");
      if (t && !planos.includes(t)) planos.push(t);
    }));
    const temParceiro = !!conf && conf.obras.some((o) => o.linhas.some((l) => l.parceria) || (o.padrao && o.padrao.terr > 0));
    const c = pag && pag.check;
    return {
      autorizacao: !aut ? "Não verificada" : (aut.ok ? "Autorizado" : (aut.parcial ? "Autorização incompleta" : "Não autorizado")),
      autorizadoPor: aut && aut.ok ? `${aut.por || ""}${aut.em ? " em " + this.dataBr(aut.em) : ""}`.trim() : "",
      rateioTexto: linhas.map((l) => `${l.id} ${this.pct(l.pct)}`).join(" · "),
      planoTexto: planos.join(" / "),
      plano: !conf ? "Não conferido" : (conf.erroPlano ? "Divergente" : (planos.length ? "Conferido" : "Sem plano")),
      rateio: !conf ? "Não conferido" : (conf.erroRateio ? "Fora do padrão" : (conf.semPadrao ? "Sem padrão" : (temParceiro ? "Conferido" : "Não se aplica"))),
      pagamento: !c ? "Não conferido" : (["erro", "aviso", "sem"].includes(c.nivel) ? "Divergente" : "Conferido"),
      desconto: !c ? "Não conferido" : (c.desconto ? "Com desconto" : "Não se aplica")
    };
  },

  /** Validações gravadas no lote; lote antigo usa a conferência dos títulos carregados na tela. */
  validacoesItem(i) {
    if (i.valida) return i.valida;
    const chave = this.chaveTitulo(i.titulo, i.parcela);
    const t = this.resumoTitulo(chave);
    const v = this.validacoesDe(t ? this.conferirRateio(t.ccs, t.valor, t.ctx) : null, this.state.pagInfo[chave] || null, t ? t.rows[0].autorizacao : null);
    if (!t) v.rateioTexto = i.ccs || "";
    if (v.pagamento === "Não conferido" && /conferid/i.test(i.conferencia || "")) v.pagamento = "Conferido";
    return v;
  },

  chavePlanos(planos) {
    return (planos || []).map((p) => p.id || p.nome).sort().join("|");
  },

  planosTexto(planos) {
    return (planos || []).map((p) => [p.id, p.nome].filter(Boolean).join(" - ")).join(" + ") || "sem plano";
  },

  /* Motivo que impede o título de ir para lote por causa do rateio ou do plano financeiro. */
  bloqueioRateio(conf) {
    if (!conf || conf.ok) return "";
    return conf.problemas[0] + (conf.problemas.length > 1 ? ` (e mais ${conf.problemas.length - 1} divergência(s) no rateio)` : "");
  },

  /** Centros de custo do título em ordem crescente: % do título e % dentro da obra (rateio Moura Leite × parceiro). */
  ccsCelulaHtml(it) {
    const ccs = (it.ccs || []).slice().sort((a, b) => Number(a.id) - Number(b.id))
      .map((c) => ({ ...c, parceria: (it.ccs || []).length > 1 ? this.ccDeParceriaPeloNome(c.id, c.nome) : c.parceria }));
    const doRateio = {};
    const ausentes = [];
    ((it.rateio && it.rateio.obras) || []).forEach((o) => o.linhas.forEach((l) => {
      if (l.ausente) ausentes.push(l);
      else doRateio[l.id] = { titulo: l.pct, obra: o.pct > 0 ? l.pct * 100 / o.pct : 0, linha: l };
    }));
    const resumo = this.rateioResumo(it);
    const idHtml = (c) => (c.parceria ? `<strong>${this.esc(c.id)}</strong>` : `<span class="gp-cc-outro">${this.esc(c.id)}</span>`);
    const status = (l) => {
      if (!l) return `<span class="gp-muted">—</span>`;
      if (l.ausente) return `<span class="bchk bchk-erro">Falta ✗</span>`;
      if (l.ok === false || l.planoErro) return `<span class="bchk bchk-erro">${l.planoErro && l.ok !== false ? "Plano ✗" : "Rateio ✗"}</span>`;
      return l.ok || (l.ok == null && it.rateio && it.rateio.ok) ? `<span class="bchk bchk-ok">Rateio ✓</span>` : `<span class="gp-muted">—</span>`;
    };
    const linhas = ccs.map((c) => {
      const r = doRateio[c.id];
      return `<tr><td>${idHtml(c)} <span class="gp-cc-pop-nome">${this.esc(c.nome || "")}</span></td>
        <td class="num">${r ? this.pct(r.titulo) : "—"}</td>
        <td class="num">${r ? this.pct(r.obra) : "—"}</td>
        <td>${status(r && r.linha)}</td></tr>`;
    }).concat(ausentes.map((l) => `<tr><td><strong>${this.esc(l.id)}</strong> <span class="gp-cc-pop-nome">${this.esc(l.nome || "")}</span></td>
        <td class="num">—</td><td class="num">${l.padrao != null ? this.pct(l.padrao) : "—"}</td><td>${status(l)}</td></tr>`)).join("");
    const pop = `<table class="gp-cc-pop-tab"><thead><tr><th>Centro de custo</th><th class="num">Rateio título</th><th class="num">Rateio parceria</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table>`;
    const selo = `<span class="bchk ${resumo.cls}">${this.esc(resumo.texto)}</span>`;
    return `<span class="gp-cc-lista" title="${this.esc(resumo.dica)}" onmouseenter="GerarPagamentoApp.ccPopAbrir(this)" onmouseleave="GerarPagamentoApp.ccPopFechar()">${selo}<template>${pop}</template></span>`;
  },

  /** Primeira conferência: se o título tem rateio entre centros e se esse rateio passou na validação atual. */
  rateioResumo(it) {
    const conf = it && it.rateio;
    const ids = new Set();
    if (conf && conf.obras) conf.obras.forEach((o) => (o.linhas || []).forEach((l) => { if (l && !l.ausente && l.id) ids.add(String(l.id)); }));
    ((it && it.ccs) || []).forEach((c) => {
      if (c && c.id && (c.rateio == null || this.num(c.rateio) > 0.009)) ids.add(String(c.id));
    });
    const temRateio = ids.size > 1;
    const soSociedade = conf && conf.obras && conf.obras.length && conf.obras.every((o) => o.sociedade);
    if (conf && conf.aprendido) {
      const aviso = conf.avisos && conf.avisos.length ? conf.avisos.join("\n") : "O financeiro aceitou esta classificação.";
      return { texto: "Aceito", cls: "bchk-ok", dica: aviso };
    }
    if (conf && conf.ok !== false && conf.obras && conf.obras.some((o) => o.distratoNovo)) {
      const o = conf.obras.find((x) => x.distratoNovo);
      const prestacao = o.padrao ? ` A prestação de contas aplica ${this.pct(o.padrao.ml)} Moura Leite / ${this.pct(o.padrao.terr)} terrenista.` : "";
      const dica = `Distrato de parceria: o título pode estar no centro da obra e o pagamento sai pela conta do centro do parceiro ${o.contaParceiro || ""}.${prestacao}`;
      return { texto: "Prestação", cls: "bchk-ok", dica };
    }
    if (soSociedade && !(conf && conf.ok === false)) {
      return { texto: "Não se aplica", cls: "bchk-info", dica: "Sociedade não tem rateio entre centros de custo." };
    }
    if (conf && conf.ok === false) {
      const dica = conf.problemas && conf.problemas.length ? conf.problemas.join("\n") : "Não validado.";
      return { texto: "Não validado", cls: "bchk-erro", dica };
    }
    if (!temRateio) return { texto: "Não se aplica", cls: "bchk-info", dica: "Este título não tem rateio entre centros de custo." };
    if (!conf) return { texto: "Não conferido", cls: "bchk-wait", dica: "O rateio ainda não foi conferido." };
    const validado = !!conf.ok;
    const dica = conf.problemas && conf.problemas.length ? conf.problemas.join("\n") : (validado ? "Validado." : "Não validado.");
    return { texto: validado ? "Validado ✓" : "Não validado", cls: validado ? "bchk-ok" : "bchk-erro", dica };
  },

  ccPopAbrir(el) {
    const tpl = el && el.querySelector("template");
    if (!tpl) return;
    let pop = document.getElementById("gp-cc-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "gp-cc-pop";
      pop.className = "gp-cc-pop";
      document.body.appendChild(pop);
    }
    pop.innerHTML = tpl.innerHTML;
    pop.style.display = "block";
    const r = el.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const top = r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  },

  ccPopFechar() {
    const pop = document.getElementById("gp-cc-pop");
    if (pop) pop.style.display = "none";
  },

  rateioSeloHtml(conf) {
    if (!conf || !conf.obras.length || conf.ok) return "";
    const rotulos = [
      conf.erroRateio ? "Rateio fora do padrão" : "",
      conf.erroPlano ? "Plano financeiro diferente" : "",
      conf.semPadrao ? "Sem rateio padrão no cadastro" : ""
    ].filter(Boolean);
    return `<small class="gp-bloq" title="${this.esc(conf.problemas.join("\n"))}">${this.esc((rotulos.length ? rotulos : ["Rateio fora do padrão"]).join(" · "))}</small>`;
  },

  rateioHtml(conf) {
    if (!conf || !conf.obras.length) return "";
    const corpo = conf.obras.map((o) => `
      <tr class="gp-rateio-obra"><td colspan="7">Obra ${this.esc(o.rotulo || o.obra)} · ${this.pct(o.pct)} do título · ${this.money(o.valor)}${o.sociedade
        ? ` <span>· sociedade, sem rateio</span>`
        : (o.distratoNovo
        ? ` <span>· distrato de parceria: 100% no CC da obra, pagamento pela conta do ${this.esc(o.contaParceiro)}${o.padrao ? `. Prestação ${this.pct(o.padrao.ml)} / ${this.pct(o.padrao.terr)}` : ""}</span>`
        : (o.exclusivo
        ? ` <span>· ${o.exclusivo === "ml" ? "CC exclusivo da Moura Leite: 100% Moura Leite, sem rateio" : `distrato emitido até ${this.dataBr(this.DISTRATO_PARCEIRO_ATE)}: 100% no CC do parceiro, sem rateio`}</span>`
        : (o.padrao
          ? ` <span>· padrão ${this.pct(o.padrao.ml)} Moura Leite${o.padrao.terr ? ` / ${this.pct(o.padrao.terr)} terrenista` : ""}</span>`
          : ` <span class="gp-rateio-x">· sem rateio padrão no cadastro</span>`)))}</td></tr>
      ${o.linhas.map((l) => `<tr class="${l.ok === false || l.planoErro ? "is-bad" : ""}">
        <td><strong>${this.esc(l.id)}</strong> <span class="gp-rateio-nome">${this.esc(l.nome)}</span></td>
        <td class="gp-rateio-plano${l.planoErro ? " is-bad" : ""}">${l.planos.length
          ? l.planos.map((p) => `<div><span class="gp-rateio-cod">${this.esc(p.id || "")}</span> ${this.esc(p.nome || "")}</div>`).join("")
          : "—"}</td>
        <td class="num">${this.pct(l.pct)}</td>
        <td class="num">${this.money(l.valor)}</td>
        <td class="num">${l.prestacao ? this.pct(l.padrao) + " na prestação" : (o.sociedade ? "sem rateio" : (o.exclusivo ? "exclusivo" : (l.padrao != null ? this.pct(l.padrao) + " da obra" : "—")))}</td>
        <td class="num">${l.esperado != null ? this.money(l.esperado) : "—"}</td>
        <td class="ic">${l.ok == null && !l.planoErro ? "" : (l.ok && !l.planoErro ? `<span class="gp-rateio-ok">✓</span>` : `<span class="gp-rateio-x">✗</span>`)}</td>
      </tr>`).join("")}`).join("");
    const rodape = (conf.ok
      ? (conf.obras.some((o) => o.distratoNovo)
        ? `<p class="gp-rateio-msg is-ok">Distrato de parceria: o título pode ficar no centro de custo da obra e o lote paga pela conta cadastrada no centro do parceiro.</p>`
        : (conf.obras.every((o) => o.sociedade)
        ? `<p class="gp-rateio-msg is-ok">Sociedade: não há rateio entre os centros. O título pode ir para o lote.</p>`
        : `<p class="gp-rateio-msg is-ok">O rateio e o plano financeiro conferem com o padrão cadastrado em Centros de Custo.</p>`))
      : `<div class="gp-rateio-msg is-bad"><strong>Título bloqueado para lote até corrigir:</strong>${conf.problemas.map((p) => `<div>${this.esc(p)}</div>`).join("")}</div>`)
      + (conf.avisos.length ? `<div class="gp-rateio-msg is-warn">${conf.avisos.map((p) => `<div>${this.esc(p)}</div>`).join("")}</div>` : "");
    return `<h4>Rateio por centro de custo</h4>
      <table class="gp-rateio">
        <thead><tr><th>Centro de custo</th><th>Plano financeiro</th><th class="num">% do título</th><th class="num">Valor</th><th class="num">Padrão</th><th class="num">Esperado</th><th></th></tr></thead>
        <tbody>${corpo}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${this.pct(conf.obras.reduce((t, o) => t + o.pct, 0))}</td><td class="num">${this.money(conf.total)}</td><td colspan="3"></td></tr></tfoot>
      </table>${rodape}`;
  },

  ccsHtml(r) {
    const ccs = (r.ccsTitulo && r.ccsTitulo.length ? r.ccsTitulo : [{ id: r.ccId, nome: r.ccNome, parceria: true }])
      .slice().sort((a, b) => Number(a.id) - Number(b.id));
    const semObra = ccs.filter((c) => c.parceria && !ccs.some((o) => !o.parceria && this.obra(o.id) === this.obra(c.id)));
    const nomes = ccs.map((c) => `${c.id} ${c.nome}${c.rateio != null ? ` · ${this.pct(c.rateio)}` : ""}${c.parceria ? " (parceria)" : ""}`).join("\n");
    const conf = this.conferirRateio(ccs, r.tituloValor != null ? r.tituloValor : r.valor, this.contextoRateio(r));
    return `<span title="${this.esc(nomes)}">${ccs.map((c) => (c.parceria ? `<strong>${this.esc(c.id)}</strong>` : `<span class="gp-cc-outro">${this.esc(c.id)}</span>`)).join(" / ")} <span class="gp-muted">${this.esc(ccs.length === 1 ? ccs[0].nome : "rateado")}</span></span>`
      + (semObra.length ? `<small class="gp-bloq">Sem o CC da obra de ${semObra.map((c) => this.esc(c.id)).join(", ")}</small>` : "")
      + this.rateioSeloHtml(conf);
  },

  statusHtml(r) {
    const conta = r.contasEsperadas && r.contasEsperadas.length ? r.contasEsperadas.join(" / ") : (r.esperada ? (r.esperada.numero || r.esperada.id) : "");
    const alvos = (r.contasEsperadas || [conta]).map((c) => this.numConta(c));
    const outras = r.contas.filter((c) => !alvos.includes(this.numConta(c)));
    if (r.status === "ok") return `<span class="gp-pill gp-ok">Pago na conta de parceria</span>`;
    if (r.status === "outra") return `<span class="gp-pill gp-bad">Pago em outra conta</span><small>Saiu pela C/C ${this.esc(outras.join(", "))} · esperado C/C ${this.esc(conta)}</small>`;
    if (r.status === "sem-conta") return `<span class="gp-pill gp-bad">CC sem conta de parceria</span><small>Pago pela C/C ${this.esc(r.contas.join(", "))}</small>`;
    if (r.status === "pago-sem-conta") return `<span class="gp-pill gp-wait">Pago</span><small>O Sienge não informou a conta da baixa</small>`;
    const origem = r.contaOrigemCc ? ` · conta de parceria do ${this.esc(r.contaOrigemCc)}` : "";
    return `<span class="gp-pill gp-wait">Em aberto</span><small>Deve sair pela C/C ${this.esc(conta || "—")}${origem}</small>`;
  },

  titulosHtml() {
    const s = this.state;
    if (s.consultando) return this.carregandoHtml();
    if (s.erroTitulos) return `<div style="padding:18px 20px;color:#b91c1c;">${this.esc(s.erroTitulos)}</div>`;
    if (!s.consultado) {
      return `<div style="padding:22px 20px;color:#64748b;font-size:0.85rem;">Escolha o período e clique em <strong>Buscar títulos</strong> para conferir em qual conta os títulos dos centros de custo de parceiro foram pagos.</div>`;
    }
    this.reclassificar();
    const nAbertos = new Set(s.titulos.filter((r) => !r.pago && r.aPagar > 0.009 && this.noPeriodoBuscado(String(r.vencimento || "").slice(0, 10)))
      .map((r) => this.chaveTitulo(r.titulo, r.parcela))).size;
    const visoes = `<div class="gp-visoes">
        <button type="button" class="gp-visao${s.visao !== "lotes" ? " is-active" : ""}" onclick="GerarPagamentoApp.setVisao('titulos')"><i data-lucide="list" style="width:14px;"></i> Títulos</button>
        <button type="button" class="gp-visao${s.visao === "lotes" ? " is-active" : ""}" onclick="GerarPagamentoApp.setVisao('lotes')"><i data-lucide="layers" style="width:14px;"></i> Lotes por conta e dia <b>${nAbertos}</b></button>
      </div>`;
    if (s.visao === "lotes") return visoes + this.lotesHtml();
    const todos = this.titulosAgrupados();
    const cont = { todos: todos.length, ok: 0, outra: 0, aberto: 0 };
    todos.forEach((r) => { cont[this.grupoStatus(r)] += 1; });
    const visiveis = s.filtro === "todos" ? todos : todos.filter((r) => this.grupoStatus(r) === s.filtro);
    const filtros = this.FILTROS.map((f) => `<button type="button" class="gp-filtro${s.filtro === f.id ? " is-active" : ""}${f.id === "outra" ? " is-bad" : ""}" onclick="GerarPagamentoApp.setFiltro('${f.id}')">${this.esc(f.label)} <b>${cont[f.id]}</b></button>`).join("");
    const linhas = visiveis.length
      ? visiveis.map((r) => `<tr class="gp-click${r.status === "outra" || r.status === "sem-conta" ? " gp-row-bad" : ""}" onclick="GerarPagamentoApp.abrirResumo('${this.esc(this.chaveTitulo(r.titulo, r.parcela))}')" title="Clique para ver o resumo do título">
          <td>${this.dataBr(r.vencimento)}</td>
          <td>${r.pagamento ? this.dataBr(r.pagamento) : "—"}</td>
          <td><strong>${this.esc(r.titulo)}</strong>${r.parcela ? `<span class="gp-muted"> / ${this.esc(r.parcela)}</span>` : ""}</td>
          <td title="${this.esc(r.credor)}">${this.esc(r.credor)}</td>
          <td>${this.esc(r.documento || "—")}</td>
          <td class="gp-status">${this.ccsHtml(r)}</td>
          <td style="text-align:right;">${this.money(r.valor)}</td>
          <td class="gp-status">${this.statusHtml(r)}</td>
        </tr>`).join("")
      : `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">Nenhum título ${s.filtro === "todos" ? "dos centros de custo de parceiro" : "neste filtro"} no período.</td></tr>`;
    return `${visoes}
      <div class="gp-filtros">${filtros}</div>
      ${s.previsoesIgnoradas ? `<p class="gp-nota">${s.previsoesIgnoradas} previsão(ões) ignorada(s) — só entram títulos que não são previsão.</p>` : ""}
      <div style="max-height:56vh;overflow:auto;">
        <table class="gp-table gp-titulos">
          <colgroup><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:17%"><col style="width:10%"><col style="width:18%"><col style="width:10%"><col style="width:20%"></colgroup>
          <thead><tr>
            <th>Vencimento</th><th>Pagamento</th><th>Título</th><th>Credor</th><th>Documento</th><th>Centro de custo</th><th style="text-align:right;">Valor</th><th>Conta</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  },

  paintTitulos() {
    const box = document.getElementById("gp-titulos-box");
    if (box) box.innerHTML = this.titulosHtml();
    if (window.lucide) lucide.createIcons();
  },

  render() {
    const root = document.getElementById("gerar-pagamento-root");
    if (!root) return;
    const s = this.state;
    const busy = s.consultando;
    const body = s.loading
      ? `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 0;color:var(--color-text-muted);">
          <div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <span style="font-weight:500;">Carregando centros de custo de parceiro…</span>
        </div>`
      : (s.error
        ? `<div class="crm-card" style="padding:20px;color:#b91c1c;">${this.esc(s.error)}</div>`
        : `
        <style>
          #gerar-pagamento-root .gp-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
          #gerar-pagamento-root .gp-table thead th { position:sticky; top:0; background:#1b8253; color:#fff; padding:12px; text-align:left; font-weight:600; z-index:2; white-space:nowrap; }
          #gerar-pagamento-root .gp-table tbody tr { border-bottom:1px solid #e0e5e0; }
          #gerar-pagamento-root .gp-table tbody tr:nth-child(even) { background:#f4f6f4; }
          #gerar-pagamento-root .gp-table td { padding:10px 12px; vertical-align:middle; }
          #gerar-pagamento-root .gp-titulos { table-layout:fixed; min-width:1100px; font-size:0.82rem; }
          #gerar-pagamento-root .gp-titulos td { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          #gerar-pagamento-root .gp-titulos td.gp-status { white-space:normal; }
          #gerar-pagamento-root .gp-titulos tbody tr.gp-row-bad { background:#fef2f2; }
          #gerar-pagamento-root .gp-muted { color:#64748b; font-weight:400; }
          #gerar-pagamento-root .gp-pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700; }
          #gerar-pagamento-root .gp-ok { background:#dcfce7; color:#105436; }
          #gerar-pagamento-root .gp-bad { background:#fee2e2; color:#b91c1c; }
          #gerar-pagamento-root .gp-wait { background:#e2e8f0; color:#334155; }
          #gerar-pagamento-root .gp-status small { display:block; margin-top:3px; color:#64748b; font-size:0.72rem; line-height:1.3; }
          #gerar-pagamento-root .gp-busca { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; padding:16px 20px; border-bottom:1px solid #e2e8f0; }
          #gerar-pagamento-root .gp-busca .form-group { margin:0; display:flex; flex-direction:column; gap:4px; }
          #gerar-pagamento-root .gp-busca label { font-size:0.75rem; font-weight:700; color:#475569; }
          #gerar-pagamento-root .gp-busca .form-control { height:38px; min-width:150px; }
          #gerar-pagamento-root .gp-filtros { display:flex; gap:8px; flex-wrap:wrap; padding:14px 20px 4px; }
          #gerar-pagamento-root .gp-filtro { height:32px; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:0.8rem; font-weight:600; cursor:pointer; }
          #gerar-pagamento-root .gp-filtro b { margin-left:4px; }
          #gerar-pagamento-root .gp-filtro.is-active { background:#105436; border-color:#105436; color:#fff; }
          #gerar-pagamento-root .gp-filtro.is-bad.is-active { background:#b91c1c; border-color:#b91c1c; }
          #gerar-pagamento-root .gp-nota { margin:6px 20px 10px; color:#64748b; font-size:0.78rem; }
          #gerar-pagamento-root .gp-alerta-conta { margin:12px 20px 0; padding:12px 14px; border:1px solid #fecaca; border-radius:10px; background:#fef2f2; color:#7f1d1d; font-size:0.82rem; line-height:1.45; }
          #gerar-pagamento-root .gp-alerta-conta strong { display:block; color:#b91c1c; font-size:0.9rem; margin-bottom:2px; }
          #gerar-pagamento-root .gp-alerta-conta span { display:block; margin-bottom:6px; }
          #gerar-pagamento-root .gp-alerta-conta ul { margin:0; padding-left:18px; }
          #gerar-pagamento-root .gp-alerta-conta li { margin:2px 0; }
          #gerar-pagamento-root .gp-acerto { margin:0 16px 12px; padding:12px 14px; border:1px solid #fdba74; border-radius:10px; background:#fff7ed; color:#9a3412; font-size:0.82rem; line-height:1.45; }
          #gerar-pagamento-root .gp-acerto strong { color:#c2410c; }
          #gerar-pagamento-root .gp-acerto span { display:block; margin-top:2px; }
          #gerar-pagamento-root .gp-acerto ul { margin:6px 0 0; padding-left:18px; }
          #gerar-pagamento-root .gp-acerto li { margin:4px 0; }
          #gerar-pagamento-root .gp-acerto-mini { color:#c2410c; font-weight:600; }
          #gerar-pagamento-root .gp-abas-lote { margin:0; }
          #gerar-pagamento-root .gp-faixa { display:flex; flex-wrap:wrap; align-items:flex-end; gap:8px 16px; margin:8px 20px 4px; }
          #gerar-pagamento-root .gp-abas-empresa { margin:0; flex:1 1 100%; }
          #gerar-pagamento-root .ml-tab.gp-tab-pend { color:#a16207; background:#fef9c3; border-radius:8px 8px 0 0; }
          #gerar-pagamento-root .ml-tab.gp-tab-pend.is-active { color:#a16207; border-bottom-color:#eab308; }
          #gerar-pagamento-root .ml-tab.gp-tab-ok { color:#105436; background:#ecfdf5; border-radius:8px 8px 0 0; }
          #gerar-pagamento-root .ml-tab.gp-tab-ok.is-active { color:#105436; border-bottom-color:#105436; }
          #gerar-pagamento-root .ml-tab.gp-tab-erro { color:#b91c1c; background:#fef2f2; border-radius:8px 8px 0 0; }
          #gerar-pagamento-root .ml-tab.gp-tab-erro.is-active { color:#b91c1c; border-bottom-color:#b91c1c; }
          #gerar-pagamento-root .gp-tab-selo { width:15px; height:15px; }
          #gp-fila-conf { position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; background:rgba(12,41,29,0.55); padding:16px; }
          #gp-fila-conf .gp-fila-box { background:#fff; border-radius:12px; width:100%; max-width:460px; max-height:min(78vh, 640px); display:flex; flex-direction:column; padding:18px 18px 14px; box-shadow:0 18px 40px rgba(0,0,0,0.22); }
          #gp-fila-conf h3 { margin:0; color:#105436; font-size:1rem; }
          #gp-fila-conf p { margin:6px 0 0; color:#475569; font-size:0.82rem; }
          #gp-fila-conf .gp-fila-lista { overflow:auto; margin-top:12px; border:1px solid #e2e8f0; border-radius:10px; }
          #gp-fila-conf .gp-fila-emp { padding:8px 10px; border-bottom:1px solid #e2e8f0; }
          #gp-fila-conf .gp-fila-emp:last-child { border-bottom:0; }
          #gp-fila-conf h4 { margin:0 0 4px; font-size:0.78rem; color:#105436; }
          #gp-fila-conf .gp-fila-linha { display:grid; grid-template-columns:1fr auto auto; gap:10px; align-items:center; font-size:0.8rem; color:#0f172a; padding:3px 0; }
          #gp-fila-conf .gp-fila-linha strong { text-align:right; }
          #gp-fila-conf .gp-fila-nota { color:#64748b; }
          #gp-fila-conf .gp-fila-acoes { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
          #gerar-pagamento-root .gp-lote-acoes .btn:disabled { opacity:0.45; cursor:not-allowed; }
          #gerar-pagamento-root .gp-conferido { height:36px; padding:0 12px; border-radius:8px; border:1px solid #eab308; background:#fef9c3; color:#a16207; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
          #gerar-pagamento-root .gp-conferido.is-on { border-color:#105436; background:#105436; color:#fff; }
          #gerar-pagamento-root .gp-cc-rotulo { display:inline-block; margin-right:6px; padding:1px 7px; border-radius:999px; background:#e2e8f0; color:#334155; font-size:0.68rem; font-weight:800; letter-spacing:.02em; text-transform:uppercase; }
          #gerar-pagamento-root .gp-lote-linhas { display:flex; flex-direction:column; gap:6px; padding:10px 14px 12px; background:#fff; }
          #gerar-pagamento-root .gp-conta-linha { font-size:0.82rem; color:#0f172a; font-weight:700; }
          #gerar-pagamento-root .gp-conta-linha b { color:#64748b; font-size:0.68rem; text-transform:uppercase; letter-spacing:.02em; margin-right:6px; }
          #gerar-pagamento-root .gp-titulo-linha { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; width:100%; text-align:left; padding:8px 10px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; cursor:pointer; font:inherit; color:#0f172a; }
          #gerar-pagamento-root .gp-titulo-linha:hover { background:#ecfdf5; border-color:#86efac; }
          #gerar-pagamento-root .gp-tl-id { font-weight:800; min-width:88px; }
          #gerar-pagamento-root .gp-tl-credor { color:#334155; flex:1 1 140px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          #gerar-pagamento-root .gp-tl-meta { color:#334155; font-size:0.78rem; }
          #gerar-pagamento-root .gp-tl-meta b { display:block; color:#64748b; font-size:0.66rem; text-transform:uppercase; letter-spacing:.02em; }
          #gerar-pagamento-root .gp-tl-val { margin-left:auto; font-weight:800; color:#105436; white-space:nowrap; }
          #gerar-pagamento-root .gp-conf { display:flex; gap:10px; align-items:flex-start; margin:12px 20px 4px; padding:12px 14px; border:1px solid #bbf7d0; border-left:4px solid #105436; border-radius:10px; background:#f0fdf4; color:#14532d; font-size:0.82rem; line-height:1.45; }
          #gerar-pagamento-root .gp-conf.is-erro { border-color:#fecaca; border-left-color:#b91c1c; background:#fef2f2; color:#7f1d1d; }
          #gerar-pagamento-root .gp-conf-spin { width:16px; height:16px; flex:none; margin-top:2px; border:2px solid rgba(16,84,54,0.2); border-top-color:#105436; border-radius:50%; animation:spin 0.8s linear infinite; }
          #gerar-pagamento-root .gp-retro { display:flex; gap:10px; align-items:flex-start; margin:12px 20px 4px; padding:12px 14px; border:1px solid #fed7aa; border-left:4px solid #f37021; border-radius:10px; background:#fff7ed; color:#7c2d12; font-size:0.82rem; line-height:1.45; }
          #gerar-pagamento-root .gp-retro-ic { width:18px; height:18px; color:#ea580c; flex-shrink:0; margin-top:1px; }
          #gerar-pagamento-root .gp-retro-corpo { display:flex; flex-direction:column; gap:8px; min-width:0; }
          #gerar-pagamento-root .gp-retro-txt strong { color:#9a3412; }
          #gerar-pagamento-root .gp-retro-dias { display:flex; flex-wrap:wrap; gap:6px; }
          #gerar-pagamento-root .gp-retro-dia { display:inline-flex; align-items:center; gap:5px; height:28px; padding:0 10px; border-radius:999px; border:1px solid #fdba74; background:#fff; color:#9a3412; font-size:0.78rem; font-weight:700; cursor:pointer; }
          #gerar-pagamento-root .gp-retro-dia b { display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 5px; border-radius:999px; background:#ffedd5; color:#9a3412; font-size:0.7rem; }
          #gerar-pagamento-root .gp-retro-dia.has-bad b { background:#fee2e2; color:#b91c1c; }
          #gerar-pagamento-root .gp-retro-dia:hover { background:#ffedd5; }
          #gerar-pagamento-root .gp-retro-dia.is-on { background:#f37021; border-color:#f37021; color:#fff; }
          #gerar-pagamento-root .gp-retro-dia.is-on b { background:#fff; color:#c2410c; }
          #gerar-pagamento-root .gp-retro-mais { height:28px; padding:0 10px; border:0; background:transparent; color:#9a3412; font-size:0.78rem; font-weight:700; text-decoration:underline; cursor:pointer; }
          #gerar-pagamento-root .gp-retro-vendo { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin:10px 20px 0; padding:8px 12px; border-radius:8px; background:#f1f5f9; color:#334155; font-size:0.82rem; }
          #gerar-pagamento-root .gp-retro-vendo span { display:inline-flex; align-items:center; gap:6px; }
          #gerar-pagamento-root .gp-warn { background:#ffedd5; color:#c2410c; }
          #gerar-pagamento-root .btn:disabled { opacity:0.55; cursor:not-allowed; }
          #gerar-pagamento-root .gp-visoes { display:flex; gap:8px; padding:14px 20px 0; }
          #gerar-pagamento-root .gp-visao { height:34px; padding:0 14px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:0.82rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
          #gerar-pagamento-root .gp-visao.is-active { background:#105436; border-color:#105436; color:#fff; }
          #gerar-pagamento-root .gp-lote { margin:12px 20px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#fff; }
          #gerar-pagamento-root .gp-lote-sem { border-color:#fecaca; }
          #gerar-pagamento-root .gp-lote-h { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 14px; background:#f0f7f3; border-bottom:1px solid #e2e8f0; }
          #gerar-pagamento-root .gp-lote-h[role="button"] { cursor:pointer; user-select:none; }
          #gerar-pagamento-root .gp-lote-h[role="button"]:hover { filter:brightness(0.98); }
          #gerar-pagamento-root .gp-lote:not(.is-open) .gp-lote-h { border-bottom:0; }
          #gerar-pagamento-root .gp-lote-tit { display:flex; align-items:center; gap:10px; min-width:0; }
          #gerar-pagamento-root .gp-lote-seta { width:18px; height:18px; color:#105436; flex-shrink:0; transition:transform .15s ease; }
          #gerar-pagamento-root .gp-lote.is-open .gp-lote-seta { transform:rotate(90deg); }
          #gerar-pagamento-root .gp-cc-outro { color:#64748b; font-weight:600; }
          #gerar-pagamento-root .gp-aut { display:inline-flex; align-items:center; gap:2px; flex-wrap:wrap; }
          #gerar-pagamento-root .gp-aut-seta { width:12px; height:12px; color:#94a3b8; }
          #gerar-pagamento-root .gp-cc-lista { display:inline-flex; flex-direction:column; align-items:flex-start; gap:3px; cursor:help; font-size:0.85rem; }
          .gp-cc-pop { display:none; position:fixed; z-index:3000; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 10px 30px rgba(15,23,42,.18); padding:8px 10px; pointer-events:none; }
          .gp-cc-pop-tab { border-collapse:collapse; font-size:0.8rem; color:#1e293b; }
          .gp-cc-pop-tab th { text-align:left; font-size:0.68rem; text-transform:uppercase; color:#64748b; font-weight:700; padding:4px 10px; border-bottom:1px solid #e2e8f0; white-space:nowrap; }
          .gp-cc-pop-tab td { padding:5px 10px; border-bottom:1px solid #f1f5f9; white-space:nowrap; }
          .gp-cc-pop-tab tr:last-child td { border-bottom:0; }
          .gp-cc-pop-tab .num { text-align:right; }
          .gp-cc-pop-tab .gp-cc-outro { color:#64748b; font-weight:600; }
          .gp-cc-pop-nome { color:#64748b; font-size:0.74rem; margin-left:4px; }
          .gp-cc-pop .bchk { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700; }
          #gerar-pagamento-root .gp-bloq, #gerar-pagamento-root .gp-status small.gp-bloq { color:#b91c1c; font-weight:700; }
          #gerar-pagamento-root .gp-liberar { height:22px; margin-left:4px; padding:0 8px; border:1px solid #c2410c; border-radius:999px; background:#fff; color:#c2410c; font-size:0.68rem; font-weight:800; cursor:pointer; }
          #gerar-pagamento-root .gp-liberar:hover { background:#ffedd5; }
          #gerar-pagamento-root .gp-lote-sem .gp-lote-h { background:#fef2f2; }
          #gerar-pagamento-root .gp-lote-conta { font-weight:800; color:#105436; font-size:0.92rem; }
          #gerar-pagamento-root .gp-lote-sem .gp-lote-conta { color:#b91c1c; }
          #gerar-pagamento-root .gp-lote-dia { display:inline-flex; align-items:center; gap:4px; margin-left:8px; padding:2px 10px; border-radius:999px; background:#105436; color:#fff; font-size:0.78rem; font-weight:700; vertical-align:middle; }
          #gerar-pagamento-root .gp-lote-feito { opacity:0.8; }
          #gerar-pagamento-root .gp-lote-feito .gp-lote-h { background:#f1f5f9; }
          #gerar-pagamento-root .gp-lote-feito .gp-lote-dia { background:#64748b; }
          #gerar-pagamento-root tr.gp-click { cursor:pointer; }
          #gerar-pagamento-root tr.gp-click:hover td { background:#ecfdf5; }
          #gerar-pagamento-root .gp-valida { display:inline-flex; align-items:center; gap:6px; margin-left:6px; color:#475569; font-weight:600; }
          #gerar-pagamento-root tr.gp-em-lote td { color:#94a3b8; }
          #gerar-pagamento-root tr.gp-em-lote td strong { color:#64748b; }
          #gerar-pagamento-root .gp-lote-h small { color:#64748b; font-size:0.75rem; }
          #gerar-pagamento-root .gp-lote-acoes { display:flex; align-items:center; gap:14px; }
          #gerar-pagamento-root .gp-baixa { display:inline-flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:700; color:#334155; white-space:nowrap; }
          #gerar-pagamento-root .gp-baixa input { height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:0.82rem; color:#0f172a; background:#fff; }
          #gerar-pagamento-root .gp-lote-todos { display:inline-flex; align-items:center; gap:6px; font-size:0.8rem; color:#334155; cursor:pointer; }
          #gerar-pagamento-root .gp-massa { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:0 0 8px auto; }
          #gerar-pagamento-root .gp-lote-total { font-size:1.05rem; color:#0f172a; min-width:120px; text-align:right; }
          #gerar-pagamento-root .gp-lote .gp-titulos { min-width:1000px; }
          #gerar-pagamento-root .gp-robo-btn { height:36px; padding:0 14px; border:0; border-radius:8px; background:#fff; color:#105436; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
          #gerar-pagamento-root .gp-robo-btn:disabled { opacity:0.6; cursor:wait; }
          #gerar-pagamento-root .gp-robo-msg { color:#ecfdf5; font-size:0.75rem; font-weight:700; max-width:420px; line-height:1.35; }
        </style>
        <div class="crm-card" style="overflow:hidden;padding:0;">
          <div class="gp-busca">
            <div style="flex:1 1 220px;">
              <h3 style="margin:0 0 4px;color:var(--color-primary);font-size:1rem;">Títulos a pagar dos centros de custo de parceiro</h3>
              <p style="margin:0;color:#64748b;font-size:0.78rem;">Abre no dia seguinte. Na sexta, de sábado a segunda. Previsões ficam de fora.</p>
            </div>
            <div class="form-group">
              <label>Vencimento de</label>
              <input type="date" class="form-control" value="${this.esc(s.startDate)}" ${busy ? "disabled" : ""}
                onchange="GerarPagamentoApp.onField('startDate', this.value)">
            </div>
            <div class="form-group">
              <label>Até</label>
              <input type="date" class="form-control" value="${this.esc(s.endDate)}" ${busy ? "disabled" : ""}
                onchange="GerarPagamentoApp.onField('endDate', this.value)">
            </div>
            <button type="button" class="btn btn-primary" ${busy ? "disabled" : ""} onclick="GerarPagamentoApp.consultarTitulos()"
              style="height:38px;width:150px;justify-content:center;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="search" style="width:14px;"></i> Buscar títulos
            </button>
          </div>
          ${this.alertaSemContaHtml()}
          <div id="gp-titulos-box">${this.titulosHtml()}</div>
        </div>`);

    root.innerHTML = `
      <style>
        #gerar-pagamento-root .gp-robo-btn { height:36px; padding:0 14px; border:0; border-radius:8px; background:#fff; color:#105436; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
        #gerar-pagamento-root .gp-robo-btn:disabled { opacity:0.6; cursor:wait; }
        #gerar-pagamento-root .gp-robo-msg { color:#ecfdf5; font-size:0.75rem; font-weight:700; max-width:420px; line-height:1.35; }
      </style>
      <div style="display:flex;flex-direction:column;min-height:calc(100vh - 85px);font-family:inherit;">
        <div style="background:#105436;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:12px 12px 0 0;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="wallet" style="width:18px;height:18px;color:#fff;"></i>
            </div>
            <div>
              <h2 style="margin:0;color:#fff;font-size:1.15rem;font-weight:600;">Gerar Pagamento</h2>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
            <span id="gp-robo-msg" class="gp-robo-msg">${this.esc(s.roboMsg || "")}</span>
            <button type="button" id="gp-robo-btn" class="gp-robo-btn" ${s.roboLigando ? "disabled" : ""} onclick="GerarPagamentoApp.ligarRobo()">
              <i data-lucide="bot" style="width:16px;height:16px;"></i> Ligar robô
            </button>
          </div>
        </div>
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:16px 18px;">
          ${body}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
};

window.GerarPagamentoApp = GerarPagamentoApp;
window.contaPagamentoDoCentroCusto = function (input) {
  return GerarPagamentoApp.resolverContaPagamento(input);
};

document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "gerar-pagamento") GerarPagamentoApp.init();
});
