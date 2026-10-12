/**
 * Home da pagadoria: caixa das empresas geridas (aplicar, resgatar, sem saldo em 60 dias),
 * títulos incompletos, vencidos e pendências de ciência e autorização dos próximos 10 dias.
 * A consulta roda uma vez por dia a partir das 06:30 no navegador de um operador da pagadoria
 * conectado; o resultado fica em pagadoria_painel/atual no Firebase para todos.
 */
const PagadoriaPainelApp = {
  COL: "pagadoria_painel",
  DOC: "atual",
  HORA: 6,
  MINUTO: 30,
  DIAS_VENCIDOS: 180,
  DIAS_PROXIMOS: 10,
  DIAS_INCOMPLETOS: 90,
  MAX_ITENS: 300,
  TRAVA_MIN: 30,

  snap: null,
  rodando: false,
  progresso: "",
  _timer: null,
  _unsub: null,

  hoje() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  },

  addDias(iso, n) {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  money(v) {
    return "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  dataBr(iso) {
    const m = String(iso || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "—";
  },

  dataHora(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return "—";
    return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  },

  ehPagadoria(user) {
    const n = String((user && (user.profile_name || user.profile)) || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return n.includes("PAGADORIA");
  },

  fx() {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    return fx && db && typeof fx.getDoc === "function" ? { fx, db, ref: fx.doc(db, this.COL, this.DOC) } : null;
  },

  passouHorario() {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes() >= this.HORA * 60 + this.MINUTO;
  },

  /** Agenda: confere a cada minuto, para o operador da pagadoria conectado, se a consulta do dia já rodou. */
  iniciar() {
    if (this._timer) return;
    this._timer = setInterval(() => this.verificar(), 60000);
    setTimeout(() => this.verificar(), 8000);
  },

  async verificar() {
    const user = window.AppState && AppState.currentUser;
    if (!user || !this.ehPagadoria(user) || this.rodando || !this.passouHorario()) return;
    const f = this.fx();
    if (!f) return;
    try {
      const s = await f.fx.getDoc(f.ref);
      const d = s.exists() ? (s.data() || {}) : {};
      if (d.dia === this.hoje() && d.status === "ok") return;
    } catch (e) {
      return;
    }
    await this.rodar(false);
  },

  async travar(forcar) {
    const f = this.fx();
    if (!f || typeof f.fx.runTransaction !== "function") return false;
    const hoje = this.hoje();
    const user = (window.AppState && AppState.currentUser) || {};
    return f.fx.runTransaction(f.db, async (tx) => {
      const s = await tx.get(f.ref);
      const d = s.exists() ? (s.data() || {}) : {};
      const agora = Date.now();
      if (d.status === "rodando" && agora - (Number(d.iniciadoMs) || 0) < this.TRAVA_MIN * 60000) return false;
      if (!forcar && d.dia === hoje && d.status === "ok") return false;
      if (!forcar && d.status === "erro" && d.erroDia === hoje && agora - (Number(d.finalizadoMs) || 0) < this.TRAVA_MIN * 60000) return false;
      tx.set(f.ref, { status: "rodando", iniciadoMs: agora, rodandoPor: user.name || user.email || "" }, { merge: true });
      return true;
    });
  },

  async rodar(forcar) {
    if (this.rodando) return;
    if (!this.fx()) {
      if (forcar) alert("O Firebase não está disponível. Atualize a página e tente de novo.");
      return;
    }
    let ok = false;
    try {
      ok = await this.travar(forcar);
    } catch (e) {
      console.warn("[Painel pagadoria] trava", e);
    }
    if (!ok) {
      if (forcar) alert("A consulta já está rodando em outro computador. O painel atualiza sozinho quando ela terminar.");
      return;
    }
    const f = this.fx();
    const user = (window.AppState && AppState.currentUser) || {};
    const inicio = Date.now();
    this.rodando = true;
    this.pintarProgresso("Começando a consulta…");
    try {
      const dados = await this.calcular();
      const doc = JSON.parse(JSON.stringify(Object.assign(dados, {
        dia: this.hoje(),
        status: "ok",
        geradoEm: new Date().toISOString(),
        geradoPor: user.name || user.email || "",
        duracaoS: Math.round((Date.now() - inicio) / 1000),
        iniciadoMs: inicio,
        finalizadoMs: Date.now()
      })));
      await f.fx.setDoc(f.ref, doc);
      this.snap = doc;
    } catch (e) {
      console.error("[Painel pagadoria] consulta", e);
      try {
        await f.fx.setDoc(f.ref, {
          status: "erro",
          erro: (e && e.message) || String(e),
          erroDia: this.hoje(),
          finalizadoMs: Date.now()
        }, { merge: true });
      } catch (e2) {}
    } finally {
      this.rodando = false;
      this.progresso = "";
      this.renderHome();
    }
  },

  pintarProgresso(txt) {
    this.progresso = txt || "";
    const el = document.getElementById("pgp-progresso");
    if (el) {
      el.textContent = this.progresso;
      el.hidden = !this.progresso;
    }
  },

  /* ---------- Consulta ---------- */

  async calcular() {
    const cx = window.FluxoCaixaDiarioApp;
    if (!cx) throw new Error("O módulo do Fluxo de caixa diário não está carregado.");
    await cx.ensureCompanies();
    await cx.ensureCcCompany();
    const empresas = cx.empresasGeridas().slice().sort((a, b) => Number(a.id) - Number(b.id));
    if (!empresas.length) throw new Error("Nenhuma empresa marcada como Gerida pelo Grupo no cadastro de Empresas.");
    const ids = empresas.map((e) => String(e.id));
    const nome = (id) => cx.companyName(id);
    const erros = [];

    const caixa = [];
    for (let i = 0; i < empresas.length; i++) {
      const e = empresas[i];
      this.pintarProgresso(`Caixa das empresas · ${i + 1} de ${empresas.length}: ${e.name || e.id}`);
      try {
        caixa.push(await cx.projetarEmpresa(e.id));
      } catch (err) {
        caixa.push({ companyId: String(e.id), nome: nome(e.id), erro: (err && err.message) || String(err) });
      }
    }

    this.pintarProgresso("Títulos incompletos…");
    let incompletos = [];
    try {
      incompletos = await this.buscarIncompletos(ids, nome);
    } catch (err) {
      erros.push("Títulos incompletos: " + ((err && err.message) || err));
    }

    const pagar = await this.buscarPagar(ids, nome, erros);

    return {
      empresas: empresas.length,
      caixa,
      incompletos: this.lista(incompletos),
      vencidosTitulos: this.lista(pagar.vencidosTitulos),
      vencidosPrevisoes: this.lista(pagar.vencidosPrevisoes),
      ciencia: this.lista(pagar.ciencia),
      autorizacao: this.lista(pagar.autorizacao),
      erros
    };
  },

  lista(itens) {
    const ord = itens.slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || Number(a.companyId) - Number(b.companyId));
    return {
      total: ord.length,
      valor: Math.round(ord.reduce((s, x) => s + (Number(x.valor) || 0), 0) * 100) / 100,
      itens: ord.slice(0, this.MAX_ITENS)
    };
  },

  faixas(ini, fim) {
    return typeof siengeSplitDateRange === "function" ? siengeSplitDateRange(ini, fim) : [{ start: ini, end: fim }];
  },

  async buscarIncompletos(ids, nome) {
    const app = window.TitulosIncompletosApp;
    if (!app || typeof app.buscarFaixa !== "function") throw new Error("o módulo de títulos incompletos não está carregado.");
    const hoje = this.hoje();
    const geridas = new Set(ids);
    const vistos = {};
    const out = [];
    for (const f of this.faixas(this.addDias(hoje, -this.DIAS_INCOMPLETOS), hoje)) {
      const bills = await app.buscarFaixa(f.start, f.end, 0);
      (bills || []).forEach((b) => {
        const r = app.normalizar(b);
        if (!r || !geridas.has(r.companyId)) return;
        const k = r.titulo + "|" + r.parcela;
        if (vistos[k]) return;
        vistos[k] = true;
        out.push({
          companyId: r.companyId,
          empresa: r.empresa || nome(r.companyId),
          titulo: r.titulo,
          parcela: r.parcela,
          credor: r.credor,
          documento: [r.tipo, r.documento].filter(Boolean).join(" "),
          vencimento: r.vencimento,
          valor: r.saldo || r.valor,
          situacao: r.legenda
        });
      });
    }
    return out;
  },

  apiPagar() {
    const base = window.ComprasControleApp;
    if (!base || typeof base.outcomeRange !== "function") return null;
    const api = Object.create(base);
    api.noteProgress = () => {};
    api.outcomeEndpoint = function (start, end, companyId) {
      const url = base.outcomeEndpoint.call(this, start, end, companyId);
      return url.indexOf("withAuthorizations=false") >= 0
        ? url.replace("withAuthorizations=false", "withAuthorizations=true")
        : url + "&withAuthorizations=true";
    };
    return api;
  },

  autorizacao(bill) {
    if (window.GerarPagamentoApp && typeof GerarPagamentoApp.autorizacaoDe === "function") return GerarPagamentoApp.autorizacaoDe(bill);
    return { ok: String((bill && bill.authorizationStatus) || "").toUpperCase() === "S" };
  },

  async buscarPagar(ids, nome, erros) {
    const out = { vencidosTitulos: [], vencidosPrevisoes: [], ciencia: [], autorizacao: [] };
    const api = this.apiPagar();
    if (!api) {
      erros.push("Contas a pagar: o módulo de compras não está carregado.");
      return out;
    }
    if (window.DocumentosSiengeApp && typeof DocumentosSiengeApp.garantirLista === "function") {
      try { await DocumentosSiengeApp.garantirLista(false); } catch (e) { erros.push("Tipos de documento (ciência): " + ((e && e.message) || e)); }
    }
    const exigeCiencia = (doc) => !!doc && typeof window.documentoExigeCiencia === "function" && window.documentoExigeCiencia(doc);
    const hoje = this.hoje();
    const limite = this.addDias(hoje, this.DIAS_PROXIMOS);
    const faixas = this.faixas(this.addDias(hoje, -this.DIAS_VENCIDOS), limite);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      this.pintarProgresso(`Contas a pagar · ${i + 1} de ${ids.length}: ${nome(id)}`);
      const bills = [];
      try {
        for (const f of faixas) {
          const parte = await api.outcomeRange(f.start, f.end, id);
          if (Array.isArray(parte)) bills.push.apply(bills, parte);
        }
      } catch (e) {
        erros.push(`Contas a pagar de ${nome(id)}: ${(e && e.message) || e}`);
        continue;
      }
      const auts = {};
      bills.forEach((b) => {
        if (!b || b.billId == null) return;
        const k = String(b.billId) + "|" + (b.installmentId != null ? String(b.installmentId) : "");
        if (!auts[k]) auts[k] = this.autorizacao(b);
      });
      const vistos = {};
      (api.transform({ data: bills }) || []).forEach((r) => {
        if (!r || r.pago || r.substituido) return;
        const k = r.titulo + "|" + (r.parcela || "");
        if (vistos[k]) return;
        vistos[k] = true;
        const venc = String(r.vencimento || "").slice(0, 10);
        if (!venc) return;
        const saldo = Number(r.saldo);
        const valor = Number.isFinite(saldo) && saldo > 0.009 ? saldo : (Number(r.valor) || 0);
        if (!(valor > 0.009)) return;
        const item = {
          companyId: String(r.companyId || id),
          empresa: nome(r.companyId || id),
          titulo: r.titulo,
          parcela: r.parcela || "",
          credor: r.credor || "",
          documento: [r.docId, r.documento].filter(Boolean).join(" "),
          vencimento: venc,
          valor
        };
        if (venc < hoje) {
          (r.forecast ? out.vencidosPrevisoes : out.vencidosTitulos).push(item);
          return;
        }
        if (r.forecast || venc > limite) return;
        const aut = auts[k] || { ok: false };
        if (aut.ok) return;
        if (!aut.parcial && exigeCiencia(r.docId)) {
          out.ciencia.push(Object.assign(item, { situacao: "Sem ciência" }));
          return;
        }
        out.autorizacao.push(Object.assign(item, { situacao: aut.parcial ? "Autorização incompleta" : "Não autorizado" }));
      });
    }
    return out;
  },

  /* ---------- Home ---------- */

  observar() {
    if (this._unsub) return;
    const f = this.fx();
    if (!f || typeof f.fx.onSnapshot !== "function") return;
    this._unsub = f.fx.onSnapshot(f.ref, (s) => {
      this.snap = s.exists() ? (s.data() || null) : null;
      this.renderHome();
    }, (e) => console.warn("[Painel pagadoria] leitura", e));
  },

  abrirCaixa(companyId) {
    const cx = window.FluxoCaixaDiarioApp;
    if (cx) cx.companyIds = [String(companyId)];
    try { localStorage.setItem("cxd_company", String(companyId)); } catch (e) {}
    if (typeof window.switchTab === "function") window.switchTab("fluxo-caixa-diario", "Fluxo de caixa diário");
  },

  abrirTela(tab, titulo) {
    if (typeof window.switchTab === "function") window.switchTab(tab, titulo);
  },

  toggleCard(id) {
    this._abertos = this._abertos || {};
    this._abertos[id] = !this._abertos[id];
    this.renderHome();
  },

  aberto(id) {
    return !!(this._abertos && this._abertos[id]);
  },

  empLink(c) {
    return `<button type="button" class="pgp-emp" onclick="PagadoriaPainelApp.abrirCaixa('${this.esc(c.companyId)}')" title="Abrir no Fluxo de caixa diário">${this.esc(c.companyId)} - ${this.esc(String(c.nome || "").toUpperCase())}</button>`;
  },

  card(id, opts) {
    const aberto = this.aberto(id);
    const vazio = !opts.qtd;
    const cls = ["pgp-card", opts.tom ? "is-" + opts.tom : "", vazio ? "is-vazio" : ""].filter(Boolean).join(" ");
    const head = `<button type="button" class="pgp-card-head" ${vazio ? "disabled" : `onclick="PagadoriaPainelApp.toggleCard('${id}')"`}>
        <i data-lucide="${opts.icone}"></i>
        <span class="pgp-card-tit">${this.esc(opts.titulo)}</span>
        <span class="pgp-card-qtd">${opts.qtd}</span>
        ${opts.valor != null && opts.qtd ? `<span class="pgp-card-val">${this.money(opts.valor)}</span>` : ""}
        ${vazio ? "" : `<i data-lucide="${aberto ? "chevron-up" : "chevron-down"}" class="pgp-card-seta"></i>`}
      </button>`;
    const sub = opts.sub ? `<p class="pgp-card-sub">${opts.sub}</p>` : "";
    const corpo = aberto && !vazio ? `<div class="pgp-card-body">${opts.corpo()}</div>` : "";
    return `<section class="${cls}">${head}${sub}${corpo}</section>`;
  },

  tabelaTitulos(lista, extra) {
    const itens = (lista && lista.itens) || [];
    const mais = lista && lista.total > itens.length ? `<p class="pgp-mais">Mostrando ${itens.length} de ${lista.total}.</p>` : "";
    const rows = itens.map((r) => `<tr>
        <td>${this.esc(r.companyId)} - ${this.esc(String(r.empresa || "").toUpperCase())}</td>
        <td>${this.esc(r.titulo)}${r.parcela ? "/" + this.esc(r.parcela) : ""}</td>
        <td>${this.esc(r.documento || "")}</td>
        <td>${this.esc(r.credor || "")}</td>
        <td class="pgp-c">${this.dataBr(r.vencimento)}</td>
        <td class="pgp-n">${this.money(r.valor)}</td>
        ${extra ? `<td>${this.esc(r.situacao || "")}</td>` : ""}
      </tr>`).join("");
    return `<div class="pgp-scroll"><table class="pgp-tab"><thead><tr>
        <th>Empresa</th><th>Título</th><th>Documento</th><th>Credor</th><th class="pgp-c">Vencimento</th><th class="pgp-n">Valor</th>${extra ? `<th>${this.esc(extra)}</th>` : ""}
      </tr></thead><tbody>${rows}</tbody></table></div>${mais}`;
  },

  renderHome() {
    const root = document.getElementById("home-pagadoria-container");
    if (!root || root.style.display === "none") return;
    this.estilo();
    const d = this.snap;
    const hoje = this.hoje();
    const rodandoFora = d && d.status === "rodando" && !this.rodando && Date.now() - (Number(d.iniciadoMs) || 0) < this.TRAVA_MIN * 60000;
    let info;
    if (!d || !d.geradoEm) info = "A consulta ainda não rodou. Ela roda todo dia às 06:30.";
    else info = `Consulta de ${this.dataHora(d.geradoEm)}${d.geradoPor ? " · rodou no acesso de " + this.esc(d.geradoPor) : ""}. A próxima roda às 06:30.`;
    if (d && d.dia && d.dia !== hoje && d.geradoEm) info += ` <b class="pgp-velha">Estes dados são de ${this.dataBr(d.dia)}.</b>`;
    if (d && d.status === "erro" && d.erroDia === hoje) info += ` <b class="pgp-velha">A consulta de hoje falhou: ${this.esc(d.erro || "")}</b>`;
    const prog = this.rodando ? this.progresso : (rodandoFora ? `Consulta em andamento no acesso de ${d.rodandoPor || "outro operador"}…` : "");
    const barra = `<div class="pgp-top">
        <p class="pgp-info">${info}</p>
        <button type="button" class="btn btn-primary pgp-btn" onclick="PagadoriaPainelApp.rodar(true)" ${this.rodando || rodandoFora ? "disabled" : ""}>
          <i data-lucide="refresh-cw"></i> Atualizar agora
        </button>
      </div>
      <p id="pgp-progresso" class="pgp-prog" ${prog ? "" : "hidden"}>${this.esc(prog)}</p>`;
    if (!d || !d.geradoEm) {
      root.innerHTML = `<div class="pgp">${barra}</div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const caixa = Array.isArray(d.caixa) ? d.caixa : [];
    const semSaldo = caixa.filter((c) => c.semSaldo).sort((a, b) => String(a.semSaldo.date).localeCompare(String(b.semSaldo.date)));
    const aplicar = caixa.filter((c) => (Number(c.cdb) || 0) + (Number(c.comp) || 0) > 0.5);
    const resgatar = caixa.filter((c) => Array.isArray(c.resgates) && c.resgates.length);
    const comErro = caixa.filter((c) => c.erro);

    const alerta = semSaldo.length
      ? `<div class="pgp-alerta" role="alert"><i data-lucide="alert-triangle"></i><div><b>${semSaldo.length === 1 ? "1 empresa fica" : semSaldo.length + " empresas ficam"} sem dinheiro nos próximos 60 dias</b>
          ${semSaldo.map((c) => `<span>${this.empLink(c)} em ${this.dataBr(c.semSaldo.date)}: conta corrente e aplicação somam ${this.money(c.semSaldo.valor)}.</span>`).join("")}</div></div>`
      : "";

    const cardsCaixa = [
      this.card("aplicar", {
        titulo: "Saldo para aplicar", icone: "piggy-bank", tom: "verde", qtd: aplicar.length,
        valor: aplicar.reduce((s, c) => s + (Number(c.cdb) || 0) + (Number(c.comp) || 0), 0),
        sub: "Conta corrente acima do mínimo, conforme a sugestão do Fluxo de caixa diário.",
        corpo: () => `<div class="pgp-scroll"><table class="pgp-tab"><thead><tr><th>Empresa</th><th class="pgp-n">CDB</th><th class="pgp-n">Compromissada</th><th class="pgp-n">Conta corrente hoje</th></tr></thead><tbody>
          ${aplicar.map((c) => `<tr><td>${this.empLink(c)}</td>
            <td class="pgp-n">${c.cdb > 0.5 ? this.money(c.cdb) + `<small>até ${this.dataBr(c.fimCdb)}</small>` : "—"}</td>
            <td class="pgp-n">${c.comp > 0.5 ? this.money(c.comp) + `<small>até ${this.dataBr(c.fimComp)}</small>` : "—"}</td>
            <td class="pgp-n">${this.money(c.cc)}</td></tr>`).join("")}
          </tbody></table></div>`
      }),
      this.card("resgatar", {
        titulo: "Resgate da aplicação", icone: "arrow-down-to-line", tom: "laranja", qtd: resgatar.length,
        valor: resgatar.reduce((s, c) => s + c.resgates.reduce((t, r) => t + (Number(r.valor) || 0), 0), 0),
        sub: "Conta corrente fica negativa nos próximos 30 dias e há dinheiro na aplicação.",
        corpo: () => `<div class="pgp-scroll"><table class="pgp-tab"><thead><tr><th>Empresa</th><th>Resgates</th><th class="pgp-n">Total</th><th class="pgp-n">Aplicação hoje</th></tr></thead><tbody>
          ${resgatar.map((c) => `<tr><td>${this.empLink(c)}</td>
            <td>${c.resgates.map((r) => `${this.dataBr(r.dia)}: ${this.money(r.valor)}${r.falta > 0.5 ? ` <b class="pgp-neg">(faltam ${this.money(r.falta)})</b>` : ""}`).join("<br>")}</td>
            <td class="pgp-n">${this.money(c.resgates.reduce((t, r) => t + (Number(r.valor) || 0), 0))}</td>
            <td class="pgp-n">${this.money(c.inv)}</td></tr>`).join("")}
          </tbody></table></div>`
      }),
      this.card("semsaldo", {
        titulo: "Sem saldo em 60 dias", icone: "alert-octagon", tom: "vermelho", qtd: semSaldo.length,
        sub: "Conta corrente e aplicação somadas ficam negativas.",
        corpo: () => `<div class="pgp-scroll"><table class="pgp-tab"><thead><tr><th>Empresa</th><th class="pgp-c">Primeiro dia</th><th class="pgp-n">Saldo nesse dia</th><th class="pgp-c">Pior dia</th><th class="pgp-n">Pior saldo</th></tr></thead><tbody>
          ${semSaldo.map((c) => `<tr><td>${this.empLink(c)}</td>
            <td class="pgp-c">${this.dataBr(c.semSaldo.date)}</td><td class="pgp-n pgp-neg">${this.money(c.semSaldo.valor)}</td>
            <td class="pgp-c">${this.dataBr(c.semSaldo.menorData)}</td><td class="pgp-n pgp-neg">${this.money(c.semSaldo.menor)}</td></tr>`).join("")}
          </tbody></table></div>`
      })
    ].join("");

    const L = (k) => d[k] || { total: 0, valor: 0, itens: [] };
    const cardsTitulos = [
      this.card("incompletos", {
        titulo: "Títulos incompletos", icone: "file-warning", tom: "laranja", qtd: L("incompletos").total, valor: L("incompletos").valor,
        sub: `Emitidos nos últimos ${this.DIAS_INCOMPLETOS} dias. <a href="#" onclick="PagadoriaPainelApp.abrirTela('titulos-incompletos','Títulos incompletos');return false;">Abrir Títulos incompletos</a>`,
        corpo: () => this.tabelaTitulos(L("incompletos"), "Situação")
      }),
      this.card("vencTit", {
        titulo: "Títulos vencidos", icone: "calendar-x", tom: "vermelho", qtd: L("vencidosTitulos").total, valor: L("vencidosTitulos").valor,
        sub: `Em aberto, com vencimento nos últimos ${this.DIAS_VENCIDOS} dias.`,
        corpo: () => this.tabelaTitulos(L("vencidosTitulos"))
      }),
      this.card("vencPrev", {
        titulo: "Previsões vencidas", icone: "calendar-clock", tom: "vermelho", qtd: L("vencidosPrevisoes").total, valor: L("vencidosPrevisoes").valor,
        sub: `Previsões em aberto, com vencimento nos últimos ${this.DIAS_VENCIDOS} dias.`,
        corpo: () => this.tabelaTitulos(L("vencidosPrevisoes"))
      }),
      this.card("ciencia", {
        titulo: "Pendentes de ciência", icone: "eye", tom: "azul", qtd: L("ciencia").total, valor: L("ciencia").valor,
        sub: `Vencem até ${this.dataBr(this.addDias(d.dia || hoje, this.DIAS_PROXIMOS))}. Documento exige ciência e o título ainda não tem autorização no Sienge.`,
        corpo: () => this.tabelaTitulos(L("ciencia"))
      }),
      this.card("autorizacao", {
        titulo: "Pendentes de autorização", icone: "shield-alert", tom: "azul", qtd: L("autorizacao").total, valor: L("autorizacao").valor,
        sub: `Vencem até ${this.dataBr(this.addDias(d.dia || hoje, this.DIAS_PROXIMOS))}.`,
        corpo: () => this.tabelaTitulos(L("autorizacao"), "Situação")
      })
    ].join("");

    const errosLista = (d.erros || []).concat(comErro.map((c) => `Caixa de ${c.companyId} - ${c.nome}: ${c.erro}`));
    const erros = errosLista.length
      ? `<details class="pgp-erros"><summary>${errosLista.length} ${errosLista.length === 1 ? "consulta voltou" : "consultas voltaram"} com erro</summary><ul>${errosLista.map((e) => `<li>${this.esc(e)}</li>`).join("")}</ul></details>`
      : "";

    root.innerHTML = `<div class="pgp">${barra}${alerta}
        <h3 class="pgp-sec">Caixa das empresas <small>${caixa.length} empresas geridas</small></h3>
        <div class="pgp-grid">${cardsCaixa}</div>
        <h3 class="pgp-sec">Contas a pagar</h3>
        <div class="pgp-grid">${cardsTitulos}</div>
        ${erros}
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  /** Chamado pela home quando o usuário é da pagadoria. */
  mostrarHome() {
    this.observar();
    this.renderHome();
    this.verificar();
  },

  estilo() {
    if (document.getElementById("pgp-style")) return;
    const st = document.createElement("style");
    st.id = "pgp-style";
    st.textContent = `
      #home-pagadoria-container { padding:20px; height:100%; overflow-y:auto; background:#fff; }
      .pgp { display:flex; flex-direction:column; gap:14px; max-width:100%; min-width:0; }
      .pgp-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .pgp-info { margin:0; font-size:.85rem; color:#475569; }
      .pgp-velha { color:#b91c1c; }
      .pgp-btn { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 14px; border:none; border-radius:8px; font-weight:600; cursor:pointer; }
      .pgp-btn[disabled] { opacity:.55; cursor:default; }
      .pgp-btn i, .pgp-btn svg { width:16px; height:16px; }
      .pgp-prog { margin:0; padding:8px 12px; background:#f0fdf4; border:1px dashed #86efac; border-radius:8px; color:#105436; font-size:.82rem; font-weight:600; }
      .pgp-alerta { display:flex; gap:12px; align-items:flex-start; background:#fee2e2; border:1px solid #fca5a5; border-left:5px solid #dc2626; color:#991b1b; padding:12px 14px; border-radius:10px; font-size:.85rem; }
      .pgp-alerta > svg, .pgp-alerta > i { flex:0 0 22px; width:22px; height:22px; color:#dc2626; }
      .pgp-alerta div { display:flex; flex-direction:column; gap:4px; }
      .pgp-alerta b { color:#b91c1c; font-size:.95rem; }
      .pgp-alerta .pgp-emp { color:#991b1b; }
      .pgp-sec { margin:6px 0 0; font-size:.95rem; font-weight:700; color:#105436; }
      .pgp-sec small { font-weight:500; color:#64748b; font-size:.78rem; margin-left:6px; }
      .pgp-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap:12px; align-items:start; }
      .pgp-card { background:#fff; border:1px solid #e2e8f0; border-top:4px solid #94a3b8; border-radius:10px; min-width:0; }
      .pgp-card.is-verde { border-top-color:#105436; }
      .pgp-card.is-laranja { border-top-color:#f37021; }
      .pgp-card.is-vermelho { border-top-color:#dc2626; }
      .pgp-card.is-azul { border-top-color:#2563eb; }
      .pgp-card:has(.pgp-card-body) { grid-column:1 / -1; }
      .pgp-card-head { width:100%; display:flex; align-items:center; gap:8px; background:none; border:none; padding:12px 14px 4px; cursor:pointer; text-align:left; font:inherit; color:#0f172a; }
      .pgp-card-head[disabled] { cursor:default; }
      .pgp-card-head svg { width:18px; height:18px; color:#475569; flex:0 0 18px; }
      .pgp-card-tit { font-weight:700; font-size:.9rem; flex:1 1 auto; }
      .pgp-card-qtd { min-width:28px; text-align:center; padding:2px 8px; border-radius:99px; background:#f1f5f9; font-weight:700; font-size:.85rem; }
      .pgp-card.is-vermelho:not(.is-vazio) .pgp-card-qtd { background:#fee2e2; color:#b91c1c; }
      .pgp-card.is-laranja:not(.is-vazio) .pgp-card-qtd { background:#ffedd5; color:#9a3412; }
      .pgp-card.is-verde:not(.is-vazio) .pgp-card-qtd { background:#dcfce7; color:#105436; }
      .pgp-card.is-azul:not(.is-vazio) .pgp-card-qtd { background:#dbeafe; color:#1e3a8a; }
      .pgp-card.is-vazio .pgp-card-qtd { color:#94a3b8; }
      .pgp-card-val { font-size:.8rem; font-weight:600; color:#475569; white-space:nowrap; }
      .pgp-card-seta { width:16px !important; height:16px !important; }
      .pgp-card-sub { margin:0; padding:0 14px 12px 40px; font-size:.75rem; color:#64748b; }
      .pgp-card-sub a { color:#105436; font-weight:600; }
      .pgp-card-body { padding:0 14px 14px; }
      .pgp-scroll { max-width:100%; overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px; }
      .pgp-tab { width:100%; border-collapse:collapse; font-size:.78rem; }
      .pgp-tab th { background:#105436; color:#fff; font-weight:600; text-align:left; padding:6px 8px; white-space:nowrap; }
      .pgp-tab td { padding:6px 8px; border-top:1px solid #f1f5f9; vertical-align:top; }
      .pgp-tab tr:nth-child(even) td { background:#f8fafc; }
      .pgp-tab .pgp-n { text-align:right; white-space:nowrap; }
      .pgp-tab .pgp-c { text-align:center; white-space:nowrap; }
      .pgp-tab small { display:block; color:#64748b; font-size:.7rem; }
      .pgp-neg { color:#b91c1c; }
      .pgp-emp { background:none; border:none; padding:0; font:inherit; font-weight:600; color:#105436; cursor:pointer; text-align:left; text-decoration:underline dotted; }
      .pgp-mais { margin:6px 0 0; font-size:.72rem; color:#64748b; }
      .pgp-erros { font-size:.78rem; color:#9a3412; }
      .pgp-erros summary { cursor:pointer; font-weight:600; }
    `;
    document.head.appendChild(st);
  }
};

window.PagadoriaPainelApp = PagadoriaPainelApp;
PagadoriaPainelApp.iniciar();
