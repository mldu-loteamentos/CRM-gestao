/* Aditamento contratual (Gestão → Aditamento): mostra o contrato hoje, recebe as novas condições e gera o termo. */
(function () {
  const App = window.RelacionamentoApp;
  if (!App) return;

  const PERIODOS = {
    mensal: { label: "Mensal", meses: 1, plural: "mensais", demais: "nos meses subsequentes" },
    bimestral: { label: "Bimestral", meses: 2, plural: "bimestrais", demais: "a cada 2 (dois) meses" },
    trimestral: { label: "Trimestral", meses: 3, plural: "trimestrais", demais: "a cada 3 (três) meses" },
    semestral: { label: "Semestral", meses: 6, plural: "semestrais", demais: "a cada 6 (seis) meses" },
    anual: { label: "Anual", meses: 12, plural: "anuais", demais: "nos anos subsequentes" },
    unica: { label: "Parcela única", meses: 0, plural: "", demais: "" }
  };

  const INDICES = ["REAL", "IGP-M", "IPCA", "INCC", "INPC", "IPC-DI"];
  const DIAS_MENSAL = ["10", "15", "20"];

  function hojeIso() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const num2 = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct4 = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + "%";
  const dmy = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
  const my = (iso) => (/^\d{4}-\d{2}/.test(String(iso || "")) ? String(iso).slice(5, 7) + "/" + String(iso).slice(0, 4) : "—");
  const extenso = (v) => (typeof window.valorPorExtensoBRL === "function" ? window.valorPorExtensoBRL(v) : "");

  function parseValor(raw) {
    let s = String(raw == null ? "" : raw).replace(/[R$\s]/g, "");
    if (!s) return 0;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function somarMeses(iso, meses) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    const dia = Number(m[3]);
    const base = new Date(Number(m[1]), Number(m[2]) - 1 + meses, 1);
    const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    return base.getFullYear() + "-" + String(base.getMonth() + 1).padStart(2, "0") + "-" + String(Math.min(dia, ultimo)).padStart(2, "0");
  }

  function juntarE(lista) {
    if (lista.length <= 1) return lista.join("");
    return lista.slice(0, -1).join(", ") + " e " + lista[lista.length - 1];
  }

  function periodoDoCodigo(codigo, qtd) {
    const c = String(codigo || "").toUpperCase();
    if (/^(PA|AN|A\d)/.test(c)) return "anual";
    if (/^PS/.test(c)) return "semestral";
    if (/^PT/.test(c)) return "trimestral";
    if (/^PB/.test(c)) return "bimestral";
    if (/^(PU|SI|SA|EN|AT|E\d)/.test(c) || qtd === 1) return qtd > 1 ? "mensal" : "unica";
    return "mensal";
  }

  function indiceReal(nome, id) {
    const n = String(nome || "").trim();
    if (String(id) === "0") return true;
    return !n || /^(real|0|sem\s*index|sem\s*reajuste)/i.test(n);
  }

  Object.assign(App, {
    _adiEl(id) {
      return document.getElementById(id);
    },

    _adiAoAbrir() {
      this.adiFecharParcelas();
      const c = this._adiEl("adi-conteudo");
      if (c) c.innerHTML = "";
      this._adiAtualizarBotao();
    },

    _adiLimpar() {
      this.adiFecharParcelas();
      const c = this._adiEl("adi-conteudo");
      if (c) c.innerHTML = "";
      const aviso = this._adiEl("adi-aviso");
      if (aviso) aviso.textContent = "";
      this._adiAtualizarBotao();
    },

    /** Gestão primeiro; depois o que o Sienge diz do contrato e das parcelas. */
    _adiMotivoBloqueio(ctx) {
      const g = String(RelacionamentoState.aditamentoStatusGestao || "").toLowerCase();
      if (/distrat|cancel/.test(g)) return "contrato distratado/cancelado";
      if (/quitad/.test(g)) return "contrato quitado";
      const sale = (ctx && ctx.sale) || {};
      const s = String(sale.status || "").toLowerCase();
      if (/distrat|cancel/.test(s) || sale.cancellationDate || String(sale.situation) === "3") return "contrato distratado/cancelado";
      if (/quit/.test(s) || (ctx && ctx.bill && ctx.bill.payOffDate)) return "contrato quitado";
      const atual = ctx && ctx.adiAtual;
      if (atual && atual.total > 0 && atual.abertas === 0) return "contrato quitado (todas as parcelas baixadas no Sienge)";
      return "";
    },

    _adiResumoAtual(ctx) {
      const lista = Array.isArray(ctx.installments) ? ctx.installments : [];
      const grupos = new Map();
      let valorPago = 0;
      let saldoAberto = 0;
      let pagas = 0;
      lista.forEach((p) => {
        const parts = typeof window.collectInstallmentTypeParts === "function" ? window.collectInstallmentTypeParts(p) : [];
        const chave = (typeof window.installmentConditionKey === "function" ? window.installmentConditionKey(p) : "") || parts[0] || "Parcelas";
        const label = parts[0] || chave;
        const due = this._dueKey(p.dueDate || p.originalDueDate || p.installmentDueDate || p.dataVencto);
        const valor = Number(p.originalValue != null ? p.originalValue : (p.value != null ? p.value : p.installmentValue)) || 0;
        const paga = this._installmentSettled(p);
        const saldo = paga ? 0 : Number(p.currentBalance != null ? p.currentBalance : valor) || 0;
        if (paga) { pagas += 1; valorPago += valor; } else saldoAberto += saldo;
        if (!grupos.has(chave)) grupos.set(chave, { chave, label, itens: [] });
        grupos.get(chave).itens.push({ due, valor, paga, saldo });
      });
      const moda = (vals) => {
        const bag = new Map();
        vals.forEach((v) => { const k = Math.round(v * 100); bag.set(k, (bag.get(k) || 0) + 1); });
        let best = null;
        bag.forEach((n, k) => { if (!best || n > best.n) best = { k, n }; });
        return best ? best.k / 100 : 0;
      };
      const linhas = Array.from(grupos.values()).map((g) => {
        const itens = g.itens.slice().sort((a, b) => String(a.due).localeCompare(String(b.due)));
        const abertos = itens.filter((i) => !i.paga);
        const valores = itens.map((i) => i.valor);
        const min = Math.min.apply(null, valores);
        const max = Math.max.apply(null, valores);
        const mesDe = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})/); return m ? Number(m[1]) * 12 + Number(m[2]) : null; };
        const saltos = itens.slice(1).map((it, k) => {
          const a = mesDe(itens[k].due);
          const b = mesDe(it.due);
          return a != null && b != null ? b - a : null;
        }).filter((n) => n > 0);
        return {
          chave: g.chave,
          label: g.label,
          meses: saltos.length ? moda(saltos) : null,
          qtd: itens.length,
          pagas: itens.length - abertos.length,
          abertas: abertos.length,
          valorParcela: moda(valores),
          variavel: max - min > 0.009,
          valorAberto: abertos.length ? moda(abertos.map((i) => i.valor)) : 0,
          total: valores.reduce((s, v) => s + v, 0),
          primeiro: itens[0] && itens[0].due,
          ultimo: itens.length && itens[itens.length - 1].due,
          proximo: abertos[0] && abertos[0].due
        };
      }).sort((a, b) => String(a.primeiro || "").localeCompare(String(b.primeiro || "")));

      const sale = ctx.sale || {};
      const conds = Array.isArray(sale.paymentConditions) ? sale.paymentConditions : [];
      let juros = null;
      [sale.interestPercentage].concat(conds.map((c) => c && c.interestPercentage)).some((v) => {
        const n = Number(v);
        if (v == null || v === "" || !Number.isFinite(n)) return false;
        juros = n;
        return true;
      });
      let indice = "";
      let indiceAchado = false;
      conds.concat(lista).some((o) => {
        if (!o) return false;
        const nome = o.indexerName || o.indexerDescription || (typeof o.indexer === "string" ? o.indexer : (o.indexer && (o.indexer.name || o.indexer.description))) || "";
        const id = o.indexerId != null ? o.indexerId : (o.indexer && typeof o.indexer === "object" ? o.indexer.id : null);
        if (!nome && id == null) return false;
        indiceAchado = true;
        indice = indiceReal(nome, id) ? "REAL" : String(nome || ("Índice " + id)).trim();
        return indice !== "REAL";
      });

      return {
        linhas,
        total: lista.length,
        pagas,
        abertas: lista.length - pagas,
        valorPago,
        saldoAberto,
        valorContrato: Number(sale.contractValue || sale.updatedContractValue || 0) || linhas.reduce((s, l) => s + l.total, 0),
        juros,
        indice: indiceAchado ? indice : "",
        comReajuste: indiceAchado && indice !== "REAL"
      };
    },

    _adiFormPadrao(atual) {
      const linhas = atual.linhas.filter((l) => l.abertas > 0).map((l) => ({
        tipo: String(l.chave || l.label || ""),
        periodo: this._adiPeriodoDe(l.chave || l.label, l.abertas, atual),
        qtd: l.abertas,
        valor: l.valorAberto,
        venc: l.proximo || ""
      }));
      return {
        juros: atual.juros != null ? atual.juros : 0,
        reajuste: atual.comReajuste ? "com" : "sem",
        indice: atual.comReajuste ? atual.indice : "REAL",
        linhas: linhas.length ? linhas : [{ tipo: "", periodo: "mensal", qtd: 1, valor: 0, venc: "" }]
      };
    },

    _adiPreparar(ctx) {
      ctx.adiAtual = this._adiResumoAtual(ctx);
      ctx.adiForm = this._adiFormPadrao(ctx.adiAtual);
      ctx.adiBloqueio = this._adiMotivoBloqueio(ctx);
      this._adiRender(ctx);
      this._adiCarregarTipos();
    },

    /** Tipos de condição do Sienge com "Gera boleto (Sienge)" ligado em Comercial → Condições de Pagamento. */
    _adiTiposHabilitados() {
      const permite = typeof window.paymentConditionAllowsBoleto === "function" ? window.paymentConditionAllowsBoleto : () => true;
      return (this._adiTipos || []).filter((t) => permite(t.id));
    },

    async _adiCarregarTipos() {
      if (this._adiTipos) return this._adiTipos;
      const cp = window.CondicoesPagamentoApp;
      if (cp && Array.isArray(cp.items) && cp.items.length) {
        this._adiTipos = cp.items.map((t) => ({ id: String(t.id), name: String(t.name || t.id) }));
      } else if (window.SiengeApiService && typeof SiengeApiService.getPaymentConditionTypes === "function") {
        try {
          this._adiTiposP = this._adiTiposP || SiengeApiService.getPaymentConditionTypes();
          const lista = await this._adiTiposP;
          this._adiTipos = (lista || []).map((t) => (cp && cp.normalizeItem ? cp.normalizeItem(t) : t)).filter(Boolean)
            .map((t) => ({ id: String(t.id), name: String(t.name || t.description || t.id) }))
            .sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
        } catch (e) {
          console.warn("[Aditamento] tipos de condição", e);
          this._adiTiposP = null;
          return [];
        }
      }
      const ctx = this._adiCtx();
      if (ctx && this._adiEl("adi-pop")) this._adiRedesenharLinhas(ctx);
      return this._adiTipos || [];
    },

    /**
     * Periodicidade da condição: intervalo real das parcelas desse código no contrato; senão o nome
     * do tipo no Sienge ("Parcelas Semestrais"…); senão o código. Uma parcela só é parcela única.
     */
    _adiPeriodoDe(tipo, qtd, atual) {
      const codigo = String(tipo || "").trim();
      if (qtd === 1) return "unica";
      const porMeses = { 1: "mensal", 2: "bimestral", 3: "trimestral", 6: "semestral", 12: "anual" };
      const noContrato = ((atual || (this._adiCtx() || {}).adiAtual || {}).linhas || []).find((l) => String(l.chave || l.label) === codigo);
      if (noContrato && porMeses[noContrato.meses]) return porMeses[noContrato.meses];
      const nome = ((this._adiTipos || []).find((t) => t.id === codigo) || {}).name || "";
      if (/mensa/i.test(nome)) return "mensal";
      if (/bimestr/i.test(nome)) return "bimestral";
      if (/trimestr/i.test(nome)) return "trimestral";
      if (/semestr/i.test(nome)) return "semestral";
      if (/anua/i.test(nome)) return "anual";
      const p = periodoDoCodigo(codigo, qtd);
      return p === "unica" ? "mensal" : p;
    },

    /** Motivo de a condição estar incompleta ou fora da regra; vazio quando está certa. */
    _adiProblemaLinha(l) {
      if (!l) return "condição vazia";
      if (!l.tipo) return "escolha a condição";
      if (!(Number.isInteger(l.qtd) && l.qtd >= 1)) return "informe a quantidade";
      if (!(Number.isFinite(l.valor) && l.valor > 0)) return "informe o valor da parcela";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l.venc || ""))) return "escolha o 1º vencimento";
      if (l.venc < hojeIso()) return "o 1º vencimento não pode ser retroativo";
      if (l.qtd > 1 && !DIAS_MENSAL.includes(l.venc.slice(8, 10))) return "parcelas recorrentes só vencem nos dias 10, 15 ou 20";
      return "";
    },

    _adiResumoHtml(ctx) {
      const a = ctx.adiAtual;
      const adimpl = ctx.adimplencia || { adimplente: true, label: "Adimplente" };
      const esc = (s) => this._escDoc(s);
      const reajuste = !a.indice ? "não informado" : (a.indice === "REAL" ? "Sem reajuste" : a.indice);
      return `
        <div class="adi-resumo">
          <div><span>Valor do contrato</span><strong>${brl(a.valorContrato)}</strong></div>
          <div><span>Parcelas pagas</span><strong>${a.pagas} de ${a.total}</strong><small>${brl(a.valorPago)}</small></div>
          <div><span>Saldo em aberto</span><strong>${brl(a.saldoAberto)}</strong><small>${a.abertas} parcela(s)</small></div>
          <div><span>Juros hoje</span><strong>${a.juros != null ? pct4(a.juros) : "—"}</strong><small>ao mês</small></div>
          <div><span>Reajuste hoje</span><strong>${esc(reajuste)}</strong></div>
          <div><span>Situação</span><strong class="${adimpl.adimplente ? "adi-ok" : "adi-ruim"}">${esc(adimpl.label || "—")}</strong></div>
        </div>`;
    },

    _adiHojeHtml(ctx) {
      const a = ctx.adiAtual;
      const esc = (s) => this._escDoc(s);
      const quitadas = a.linhas.filter((l) => l.abertas === 0);
      const abertas = a.linhas.filter((l) => l.abertas > 0);
      const linhaAberta = (l) => `<tr>
            <td><strong>${esc(l.label)}</strong></td>
            <td class="adi-num">${l.pagas} pagas · <strong>${l.abertas} em aberto</strong></td>
            <td class="adi-num">${brl(l.valorAberto || l.valorParcela)}${l.variavel ? ' <small title="As parcelas desta condição não têm todas o mesmo valor; aparece o valor mais comum.">(varia)</small>' : ""}</td>
            <td>${my(l.proximo || l.primeiro)} a ${my(l.ultimo)}</td>
          </tr>`;
      const linhaQuitadas = quitadas.length ? `<tr class="adi-quitadas">
            <td colspan="4"><i data-lucide="check-circle-2"></i> Já quitadas: ${esc(quitadas.map((l) => l.label).join(", "))}
              <small>(${quitadas.reduce((s, l) => s + l.qtd, 0)} parcela(s) · ${brl(quitadas.reduce((s, l) => s + l.total, 0))})</small></td>
          </tr>` : "";
      const corpo = a.linhas.length
        ? abertas.map(linhaAberta).join("") + linhaQuitadas
        : `<tr><td colspan="4" class="adi-vazio">Não consegui ler as parcelas deste título no Sienge.</td></tr>`;
      return `
        <section class="adi-col">
          <h4 class="adi-col-tit"><i data-lucide="file-text"></i> Como está hoje</h4>
          <table class="adi-tab">
            <thead><tr><th>Condição</th><th class="adi-num">Parcelas</th><th class="adi-num">Valor da parcela</th><th>Em aberto</th></tr></thead>
            <tbody>${corpo}</tbody>
          </table>
        </section>`;
    },

    _adiNovoHtml(ctx) {
      return `
        <section class="adi-col adi-col-novo">
          <div class="adi-lbl-row">
            <h4 class="adi-col-tit"><i data-lucide="pencil-line"></i> Como vai ficar</h4>
            <span class="adi-acoes">
              <button type="button" class="btn btn-outline btn-sm" onclick="RelacionamentoApp.adiRestaurar()" title="Voltar para as parcelas em aberto de hoje"><i data-lucide="rotate-ccw"></i> Restaurar padrão</button>
              <button type="button" class="btn btn-primary btn-sm" onclick="RelacionamentoApp.adiAdicionarLinha()"><i data-lucide="plus"></i> Adicionar condição</button>
            </span>
          </div>
          <div class="adi-linhas-scroll">
            <table class="adi-tab adi-tab-edit">
              <thead><tr><th></th><th>Condição</th><th class="adi-num">Qtde.</th><th class="adi-num">Valor da parcela</th><th class="adi-num">Total</th><th>1º vencimento</th><th></th></tr></thead>
              <tbody id="adi-linhas">${this._adiLinhasHtml(ctx)}</tbody>
            </table>
          </div>
          <div id="adi-totais" class="adi-totais"></div>
        </section>`;
    },

    /** Resumo de tamanho fixo na tela do aditamento; a edição das parcelas fica no pop-up. */
    _adiParcelasCardHtml(ctx) {
      return `
        <section class="adi-parc">
          <div id="adi-parc-resumo" class="adi-parc-resumo">${this._adiParcelasResumoHtml(ctx)}</div>
          <button type="button" class="btn btn-primary" onclick="RelacionamentoApp.adiAbrirParcelas()"><i data-lucide="table-2"></i> Ver e editar parcelas</button>
        </section>`;
    },

    _adiParcelasResumoHtml(ctx) {
      const a = ctx.adiAtual;
      const f = ctx.adiForm;
      const esc = (s) => this._escDoc(s);
      const MAX = 4;
      const lista = (itens) => (itens.length > MAX
        ? itens.slice(0, MAX - 1).concat([`<li class="adi-parc-mais">+ ${itens.length - (MAX - 1)} condição(ões)</li>`])
        : itens).join("");
      const abertas = a.linhas.filter((l) => l.abertas > 0);
      const quitadas = a.linhas.filter((l) => l.abertas === 0);
      const hoje = abertas.map((l) => `<li><strong>${esc(l.label)}</strong> ${l.abertas} × ${brl(l.valorAberto || l.valorParcela)}<span>${my(l.proximo || l.primeiro)} a ${my(l.ultimo)}</span></li>`);
      if (quitadas.length) hoje.push(`<li class="adi-parc-mais">Já quitadas: ${esc(quitadas.map((l) => l.label).join(", "))}</li>`);
      let total = 0;
      const novas = f.linhas.map((l, i) => {
        const problema = this._adiProblemaLinha(l);
        if (problema) return `<li class="adi-atencao">Condição ${i + 1}: ${esc(problema)}</li>`;
        total += l.qtd * l.valor;
        const p = PERIODOS[l.periodo] || PERIODOS.mensal;
        const ult = this._adiUltimoVenc(l);
        return `<li><strong>${esc(l.tipo || p.label)}</strong> ${l.qtd} × ${brl(l.valor)} <small>${esc(p.label.toLowerCase())}</small><span>${dmy(l.venc)}${ult && ult !== l.venc ? " a " + dmy(ult) : ""}</span></li>`;
      });
      const diff = total - a.saldoAberto;
      return `
        <div class="adi-parc-col">
          <div class="adi-lbl">Como está hoje</div>
          <ul>${hoje.length ? lista(hoje) : '<li class="adi-vazio">Sem parcelas lidas do Sienge.</li>'}</ul>
          <div class="adi-parc-rod">Saldo em aberto <strong>${brl(a.saldoAberto)}</strong> · ${a.abertas} parcela(s)</div>
        </div>
        <div class="adi-parc-seta" aria-hidden="true">→</div>
        <div class="adi-parc-col adi-parc-novo">
          <div class="adi-lbl">Como vai ficar</div>
          <ul>${lista(novas)}</ul>
          <div class="adi-parc-rod">Total <strong>${brl(total)}</strong> · Diferença <strong class="${Math.abs(diff) < 1 ? "adi-ok" : "adi-atencao"}">${diff > 0 ? "+" : ""}${brl(diff)}</strong></div>
        </div>`;
    },

    adiAbrirParcelas() {
      const ctx = this._adiCtx();
      if (!ctx) return;
      let pop = this._adiEl("adi-pop");
      if (!pop) {
        pop = document.createElement("div");
        pop.id = "adi-pop";
        pop.className = "doc-modal adi-pop";
        pop.setAttribute("role", "dialog");
        pop.setAttribute("aria-modal", "true");
        pop.addEventListener("mousedown", (e) => { if (e.target === pop) this.adiFecharParcelas(); });
        document.body.appendChild(pop);
      }
      this._adiPopKey = this._adiPopKey || ((e) => { if (e.key === "Escape") this.adiFecharParcelas(); });
      document.addEventListener("keydown", this._adiPopKey);
      this._adiPopRender(ctx);
    },

    _adiPopRender(ctx) {
      const pop = this._adiEl("adi-pop");
      if (!pop) return;
      const sub = this._adiEl("adi-modal-sub");
      pop.innerHTML = `
        <div class="doc-modal-panel adi-pop-panel">
          <div class="crm-card" style="margin:0;display:flex;flex-direction:column;max-height:inherit;">
            <div class="crm-card-header adi-pop-head">
              <div>
                <h3 style="margin:0;font-size:1.1rem;color:var(--color-primary);">Parcelas: como está hoje e como vai ficar</h3>
                ${sub && sub.textContent ? `<div class="doc-modal-sub">${this._escDoc(sub.textContent)}</div>` : ""}
              </div>
              <button type="button" class="adi-pop-x" onclick="RelacionamentoApp.adiFecharParcelas()" title="Fechar">&times;</button>
            </div>
            <div class="adi-pop-body">
              <div class="adi-grid">${this._adiHojeHtml(ctx)}${this._adiNovoHtml(ctx)}</div>
            </div>
            <div class="adi-pop-rodape">
              <button type="button" class="btn btn-primary" style="height:40px;min-width:150px;justify-content:center;" onclick="RelacionamentoApp.adiFecharParcelas()"><i data-lucide="check"></i> Concluir</button>
            </div>
          </div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      this._adiAtualizar();
    },

    adiFecharParcelas() {
      this.adiCalFechar();
      const pop = this._adiEl("adi-pop");
      if (this._adiPopKey) document.removeEventListener("keydown", this._adiPopKey);
      if (!pop) return;
      pop.remove();
      if (this._adiCtx()) this._adiAtualizar();
    },

    _adiAjustesHtml(ctx) {
      const a = ctx.adiAtual;
      const f = ctx.adiForm;
      const esc = (s) => this._escDoc(s);
      return `
        <div class="adi-ajustes">
          <div>
            <div class="adi-lbl">Juros de parcelamento</div>
            <div class="adi-depara">
              <span>de <strong>${a.juros != null ? pct4(a.juros) : "—"}</strong> para</span>
              <input type="text" class="form-control adi-in adi-in-juros" id="adi-juros" inputmode="decimal" value="${esc(String(f.juros).replace(".", ","))}" oninput="RelacionamentoApp.adiCampo('juros', this.value)">
              <span>% ao mês</span>
            </div>
          </div>
          <div>
            <div class="adi-lbl">Reajuste anual</div>
            <div class="adi-reaj">
              <label class="adi-radio"><input type="radio" name="adi-reajuste" value="sem" ${f.reajuste === "sem" ? "checked" : ""} onchange="RelacionamentoApp.adiCampo('reajuste', 'sem')"> Sem reajuste</label>
              <label class="adi-radio"><input type="radio" name="adi-reajuste" value="com" ${f.reajuste === "com" ? "checked" : ""} onchange="RelacionamentoApp.adiCampo('reajuste', 'com')"> Com</label>
              <select class="form-control adi-in adi-in-indice" id="adi-indice" onchange="RelacionamentoApp.adiCampo('indice', this.value)">
                <option value="">Índice…</option>
                ${INDICES.concat([f.indice, a.comReajuste ? a.indice : ""].filter((i) => i && !INDICES.includes(i)))
                  .filter((i, n, l) => l.indexOf(i) === n)
                  .map((i) => `<option value="${esc(i)}" ${f.indice === i ? "selected" : ""}>${esc(i)}</option>`).join("")}
              </select>
            </div>
          </div>
          <div>
            <div class="adi-lbl">O que muda no termo <small>(automático, conforme você edita)</small></div>
            <div class="adi-mudancas" id="adi-mudancas">${this._adiMudancasHtml(ctx)}</div>
          </div>
        </div>`;
    },

    /** Cada item que pode mudar no termo, comparando o contrato de hoje com o que está sendo editado. */
    _adiMudancas(ctx) {
      const a = ctx.adiAtual;
      const f = ctx.adiForm;
      const dif = this._adiDiferencas(ctx);
      const padrao = this._adiFormPadrao(a).linhas;
      const novas = f.linhas;
      const nomeTipos = (ls) => ls.map((l) => l.tipo || (PERIODOS[l.periodo] || PERIODOS.mensal).label).join(", ") || "—";
      const soma = (ls) => ls.reduce((s, l) => s + (l.qtd || 0), 0);
      const vencs = novas.map((l) => l.venc).filter(Boolean).sort();
      const idxValor = novas.map((l, i) => i).filter((i) => !padrao[i] || Math.abs((padrao[i].valor || 0) - (novas[i].valor || 0)) > 0.009);
      const valorDetalhe = () => {
        if (idxValor.length !== 1) return `${idxValor.length} condições com valor novo`;
        const i = idxValor[0];
        const nome = novas[i].tipo || (PERIODOS[novas[i].periodo] || PERIODOS.mensal).label;
        return padrao[i] ? `${nome}: ${brl(padrao[i].valor)} → ${brl(novas[i].valor)}` : `${nome}: ${brl(novas[i].valor)} (nova)`;
      };
      const jurosHoje = a.juros != null ? Number(a.juros) : null;
      const jurosNovo = Number.isFinite(f.juros) ? f.juros : 0;
      const reajHoje = a.comReajuste ? String(a.indice || "").toUpperCase() : "";
      const reajNovo = f.reajuste === "com" ? String(f.indice || "").toUpperCase() : "";
      const reajLbl = (v) => v || "sem reajuste";
      return [
        { id: "condicao", label: "Condição de pagamento", texto: "condição de pagamento", muda: !!dif.condicao,
          detalhe: dif.condicao ? `${nomeTipos(padrao)} → ${nomeTipos(novas)}` : nomeTipos(padrao) },
        { id: "qtd", label: "Quantidade de parcelas", texto: "quantidade de parcelas", muda: !!dif.qtd,
          detalhe: dif.qtd ? `${soma(padrao)} → ${soma(novas)}` : `${soma(padrao)} em aberto` },
        { id: "valor", label: "Valor das parcelas", texto: "valor das parcelas", muda: !!dif.valor,
          detalhe: dif.valor ? valorDetalhe() : "mesmos valores" },
        { id: "venc", label: "Vencimentos", texto: "vencimentos", muda: !!dif.venc,
          detalhe: dif.venc ? (vencs[0] ? `1º em ${dmy(vencs[0])}` : "a definir") : "mesmas datas" },
        { id: "juros", label: "Juros de parcelamento", texto: "juros de parcelamento", muda: jurosHoje != null && Math.abs(jurosNovo - jurosHoje) > 0.00001,
          detalhe: jurosHoje != null && Math.abs(jurosNovo - jurosHoje) > 0.00001 ? `${pct4(jurosHoje)} → ${pct4(jurosNovo)}` : (jurosHoje != null ? pct4(jurosHoje) + " ao mês" : "não informado") },
        { id: "reajuste", label: "Reajuste", texto: "reajuste do contrato", muda: reajHoje !== reajNovo,
          detalhe: reajHoje !== reajNovo ? `${reajLbl(reajHoje)} → ${reajLbl(reajNovo)}` : reajLbl(reajHoje) }
      ];
    },

    _adiMudancasHtml(ctx) {
      const esc = (s) => this._escDoc(s);
      const itens = this._adiMudancas(ctx);
      const n = itens.filter((m) => m.muda).length;
      return `
        <div class="adi-mud-cont ${n ? "" : "adi-mud-nada"}">${n ? `${n} ${n === 1 ? "item muda" : "itens mudam"}` : "Nada mudou ainda: edite as parcelas, os juros ou o reajuste"}</div>
        <ul class="adi-mud-lista">${itens.map((m) => `
          <li class="${m.muda ? "adi-mud-sim" : ""}">
            <i data-lucide="${m.muda ? "circle-check" : "circle-minus"}"></i>
            <span><strong>${esc(m.label)}</strong><small>${m.muda ? "" : "mantém · "}${esc(m.detalhe)}</small></span>
          </li>`).join("")}
        </ul>`;
    },

    _adiTestemunhasHtml(ctx) {
      const users = typeof window.getDistratoWitnessUsers === "function" ? window.getDistratoWitnessUsers() : [];
      const t = ctx.adiTestemunhas || (ctx.adiTestemunhas = { 1: "", 2: "" });
      const esc = (s) => this._escDoc(s);
      const select = (n) => {
        const outro = String(t[n === 1 ? 2 : 1] || "");
        const opts = users.filter((u) => String(u.id) !== outro).map((u) => {
          const rg = u.doc_rg || u.rg || "";
          return `<option value="${esc(u.id)}" ${String(u.id) === String(t[n]) ? "selected" : ""}>${esc(u.name || u.nome || "")}${rg ? " — RG " + esc(rg) : ""}</option>`;
        }).join("");
        return `<label class="adi-test-campo"><span>Testemunha ${n}</span>
          <select class="form-control adi-in" id="adi-test-${n}" onchange="RelacionamentoApp.adiTestemunha(${n}, this.value)"><option value="">Selecione…</option>${opts}</select></label>`;
      };
      return `
        <div class="adi-testemunhas" id="adi-testemunhas">
          <div class="adi-lbl">Testemunhas <small>(quem assina este aditamento)</small></div>
          ${users.length
            ? `<div class="adi-test-grid">${select(1)}${select(2)}</div>`
            : `<div class="adi-atencao">Nenhum usuário marcado como testemunha. Ligue “Assina documentos como testemunha” no cadastro de usuários.</div>`}
        </div>`;
    },

    adiTestemunha(n, valor) {
      const ctx = this._adiCtx();
      if (!ctx) return;
      ctx.adiTestemunhas = ctx.adiTestemunhas || { 1: "", 2: "" };
      ctx.adiTestemunhas[n] = String(valor || "");
      const box = this._adiEl("adi-testemunhas");
      if (box) box.outerHTML = this._adiTestemunhasHtml(ctx);
      this._adiAtualizarBotao();
    },

    _adiTestemunhaEscolhida(ctx, n) {
      const id = ctx && ctx.adiTestemunhas ? String(ctx.adiTestemunhas[n] || "") : "";
      if (!id) return null;
      const users = typeof window.getDistratoWitnessUsers === "function" ? window.getDistratoWitnessUsers() : [];
      return users.find((u) => String(u.id) === id) || null;
    },

    /** Uma condição só pode aparecer em uma linha: as usadas nas outras linhas ficam desabilitadas. */
    _adiTipoOptions(l, i, ctx) {
      const esc = (s) => this._escDoc(s);
      const tipos = this._adiTiposHabilitados();
      const atual = String(l.tipo || "");
      const usados = new Set(((ctx && ctx.adiForm.linhas) || []).filter((x, k) => k !== i && x.tipo).map((x) => String(x.tipo)));
      const extra = atual && !tipos.some((t) => t.id === atual) ? [{ id: atual, name: this._adiTipos ? "não gera boleto no Sienge" : "" }] : [];
      const carregando = !this._adiTipos ? `<option value="" disabled>Carregando condições…</option>` : "";
      return `<option value="" ${atual ? "" : "selected"}>Condição…</option>${carregando}` +
        extra.concat(tipos).map((t) => {
          const usado = usados.has(t.id) && t.id !== atual;
          return `<option value="${esc(t.id)}" ${t.id === atual ? "selected" : ""} ${usado ? "disabled" : ""}>${esc(t.id)}${t.name && t.name !== t.id ? " · " + esc(t.name) : ""}${usado ? " (já usada)" : ""}</option>`;
        }).join("");
    },

    _adiVencHtml(l, i) {
      return `<button type="button" class="form-control adi-in adi-cal-btn${l.venc ? "" : " is-vazio"}" onclick="RelacionamentoApp.adiCalAbrir(${i}, this)">
          <span>${l.venc ? dmy(l.venc) : "Escolher data"}</span><i data-lucide="calendar"></i>
        </button>`;
    },

    /** Dia permitido no 1º vencimento: nunca retroativo; com mais de uma parcela, só 10, 15 ou 20. */
    _adiDiaPermitido(l, iso) {
      if (iso < hojeIso()) return false;
      return !(l && l.qtd > 1) || DIAS_MENSAL.includes(iso.slice(8, 10));
    },

    adiCalAbrir(i, btn) {
      const ctx = this._adiCtx();
      if (!ctx || !ctx.adiForm.linhas[i]) return;
      const l = ctx.adiForm.linhas[i];
      const base = /^\d{4}-\d{2}/.test(String(l.venc || "")) && l.venc >= hojeIso() ? l.venc : hojeIso();
      this._adiCal = { i, ano: Number(base.slice(0, 4)), mes: Number(base.slice(5, 7)) - 1, btn };
      this._adiCalRender();
      if (!this._adiCalFora) {
        this._adiCalFora = (e) => {
          const pop = this._adiEl("adi-cal-pop");
          if (pop && !pop.contains(e.target) && !(this._adiCal && this._adiCal.btn && this._adiCal.btn.contains(e.target))) this.adiCalFechar();
        };
        this._adiCalEsc = (e) => { if (e.key === "Escape") { e.stopPropagation(); this.adiCalFechar(); } };
      }
      document.addEventListener("mousedown", this._adiCalFora, true);
      document.addEventListener("keydown", this._adiCalEsc, true);
    },

    adiCalFechar() {
      const pop = this._adiEl("adi-cal-pop");
      if (pop) pop.remove();
      this._adiCal = null;
      if (this._adiCalFora) document.removeEventListener("mousedown", this._adiCalFora, true);
      if (this._adiCalEsc) document.removeEventListener("keydown", this._adiCalEsc, true);
    },

    adiCalMes(delta) {
      const c = this._adiCal;
      if (!c) return;
      const d = new Date(c.ano, c.mes + delta, 1);
      const hoje = hojeIso();
      if (d.getFullYear() * 12 + d.getMonth() < Number(hoje.slice(0, 4)) * 12 + Number(hoje.slice(5, 7)) - 1) return;
      c.ano = d.getFullYear();
      c.mes = d.getMonth();
      this._adiCalRender();
    },

    adiCalEscolher(iso) {
      const c = this._adiCal;
      const ctx = this._adiCtx();
      if (!c || !ctx || !ctx.adiForm.linhas[c.i]) return;
      if (!this._adiDiaPermitido(ctx.adiForm.linhas[c.i], iso)) return;
      const i = c.i;
      this.adiCalFechar();
      this.adiLinha(i, "venc", iso);
      this._adiRedesenharLinhas(ctx);
    },

    _adiCalRender() {
      const c = this._adiCal;
      const ctx = this._adiCtx();
      if (!c || !ctx) return;
      const l = ctx.adiForm.linhas[c.i];
      const hoje = hojeIso();
      const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      const noMesAtual = c.ano * 12 + c.mes <= Number(hoje.slice(0, 4)) * 12 + Number(hoje.slice(5, 7)) - 1;
      const primeiro = new Date(c.ano, c.mes, 1).getDay();
      const dias = new Date(c.ano, c.mes + 1, 0).getDate();
      const cel = [];
      for (let k = 0; k < primeiro; k++) cel.push(`<span></span>`);
      for (let d = 1; d <= dias; d++) {
        const iso = `${c.ano}-${String(c.mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const ok = this._adiDiaPermitido(l, iso);
        const cls = [iso === l.venc ? "is-sel" : "", iso === hoje ? "is-hoje" : ""].filter(Boolean).join(" ");
        cel.push(ok
          ? `<button type="button" class="${cls}" onclick="RelacionamentoApp.adiCalEscolher('${iso}')">${d}</button>`
          : `<button type="button" class="${cls}" disabled>${d}</button>`);
      }
      let pop = this._adiEl("adi-cal-pop");
      if (!pop) {
        pop = document.createElement("div");
        pop.id = "adi-cal-pop";
        pop.className = "adi-cal-pop";
        document.body.appendChild(pop);
      }
      pop.innerHTML = `
        <div class="adi-cal-cab">
          <button type="button" ${noMesAtual ? "disabled" : ""} onclick="RelacionamentoApp.adiCalMes(-1)" aria-label="Mês anterior">‹</button>
          <strong>${nomes[c.mes].charAt(0).toUpperCase() + nomes[c.mes].slice(1)} de ${c.ano}</strong>
          <button type="button" onclick="RelacionamentoApp.adiCalMes(1)" aria-label="Próximo mês">›</button>
        </div>
        <div class="adi-cal-sem">${["D", "S", "T", "Q", "Q", "S", "S"].map((s) => `<span>${s}</span>`).join("")}</div>
        <div class="adi-cal-dias">${cel.join("")}</div>
        <div class="adi-cal-nota">${l.qtd > 1 ? "Parcelas recorrentes: só dias 10, 15 ou 20." : "Parcela única: qualquer dia a partir de hoje."}</div>`;
      const r = c.btn && document.body.contains(c.btn) ? c.btn.getBoundingClientRect() : null;
      if (r) {
        const w = pop.offsetWidth;
        const h = pop.offsetHeight;
        pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
        pop.style.top = (r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4) + "px";
      }
    },

    _adiLinhasHtml(ctx) {
      const f = ctx.adiForm;
      return f.linhas.map((l, i) => `
        <tr>
          <td class="adi-cond-n">${i + 1}</td>
          <td><select class="form-control adi-in adi-in-tipo" onchange="RelacionamentoApp.adiLinha(${i}, 'tipo', this.value)">${this._adiTipoOptions(l, i, ctx)}</select>
            <small class="adi-ate" id="adi-per-${i}"></small></td>
          <td class="adi-num"><input type="number" min="1" step="1" class="form-control adi-in adi-in-qtd" value="${l.qtd || ""}" oninput="RelacionamentoApp.adiLinha(${i}, 'qtd', this.value)"></td>
          <td class="adi-num"><input type="text" inputmode="decimal" class="form-control adi-in adi-in-valor" value="${l.valor ? num2(l.valor) : ""}" placeholder="0,00" oninput="RelacionamentoApp.adiLinha(${i}, 'valor', this.value)" onblur="RelacionamentoApp.adiFormatarValor(this, ${i})"></td>
          <td class="adi-num" id="adi-total-${i}">—</td>
          <td>${this._adiVencHtml(l, i)}<small class="adi-ate" id="adi-ate-${i}"></small></td>
          <td>${f.linhas.length > 1 ? `<button type="button" class="adi-del" title="Remover condição" onclick="RelacionamentoApp.adiRemoverLinha(${i})"><i data-lucide="trash-2"></i></button>` : ""}</td>
        </tr>`).join("");
    },

    _adiRender(ctx) {
      const box = this._adiEl("adi-conteudo");
      if (!box) return;
      if (ctx.adiBloqueio) {
        box.innerHTML = `<div class="adi-bloqueio"><i data-lucide="ban"></i> O aditamento só pode ser feito em contrato ativo: ${this._escDoc(ctx.adiBloqueio)}.</div>
          ${this._adiResumoHtml(ctx)}
          <div class="adi-grid adi-grid-um">${this._adiHojeHtml(ctx)}</div>`;
      } else {
        box.innerHTML = `${this._adiResumoHtml(ctx)}
          ${this._adiParcelasCardHtml(ctx)}
          ${this._adiAjustesHtml(ctx)}
          ${this._adiTestemunhasHtml(ctx)}`;
      }
      if (window.lucide) lucide.createIcons();
      this._adiAtualizar();
    },

    _adiCtx() {
      const ctx = RelacionamentoState.aditamento;
      return ctx && ctx.adiForm ? ctx : null;
    },

    adiCampo(campo, valor) {
      const ctx = this._adiCtx();
      if (!ctx) return;
      const f = ctx.adiForm;
      const marcar = (v) => {
        const r = document.querySelector(`input[name="adi-reajuste"][value="${v}"]`);
        if (r) r.checked = true;
      };
      const indiceSel = (v) => {
        const s = this._adiEl("adi-indice");
        if (s) s.value = v;
      };
      if (campo === "juros") f.juros = parseValor(valor);
      else if (campo === "indice") {
        f.indice = String(valor || "").trim();
        // REAL é o indexador sem correção: equivale a "Sem reajuste".
        if (f.indice === "REAL") {
          f.reajuste = "sem";
          marcar("sem");
        } else if (f.indice && f.reajuste !== "com") {
          f.reajuste = "com";
          marcar("com");
        }
      } else if (campo === "reajuste") {
        f.reajuste = valor;
        marcar(valor);
        if (valor === "sem") {
          f.indice = "REAL";
          indiceSel("REAL");
        } else if (f.indice === "REAL") {
          f.indice = "";
          indiceSel("");
        }
      } else f[campo] = valor;
      this._adiAtualizar();
    },

    adiLinha(i, campo, valor) {
      const ctx = this._adiCtx();
      if (!ctx || !ctx.adiForm.linhas[i]) return;
      const l = ctx.adiForm.linhas[i];
      if (campo === "qtd") l.qtd = Math.floor(Number(valor) || 0);
      else if (campo === "valor") l.valor = parseValor(valor);
      else l[campo] = valor;
      if (campo === "tipo" || campo === "qtd") l.periodo = this._adiPeriodoDe(l.tipo, l.qtd);
      if (campo === "tipo") {
        this._adiRedesenharLinhas(ctx);
        return;
      }
      this._adiAtualizar();
    },

    adiFormatarValor(el, i) {
      const ctx = this._adiCtx();
      if (!ctx || !ctx.adiForm.linhas[i]) return;
      const v = ctx.adiForm.linhas[i].valor;
      if (Number.isFinite(v) && v > 0) el.value = num2(v);
    },

    adiAdicionarLinha() {
      const ctx = this._adiCtx();
      if (!ctx) return;
      const ult = ctx.adiForm.linhas[ctx.adiForm.linhas.length - 1];
      ctx.adiForm.linhas.push({
        tipo: "",
        periodo: "unica",
        qtd: 1,
        valor: 0,
        venc: ult && ult.venc ? somarMeses(this._adiUltimoVenc(ult), Math.max(1, (PERIODOS[ult.periodo] || PERIODOS.mensal).meses)) : ""
      });
      this._adiRedesenharLinhas(ctx);
      const rolagem = document.querySelector("#adi-pop .adi-linhas-scroll");
      if (rolagem) rolagem.scrollTop = rolagem.scrollHeight;
    },

    adiRemoverLinha(i) {
      const ctx = this._adiCtx();
      if (!ctx || ctx.adiForm.linhas.length <= 1) return;
      this.adiCalFechar();
      ctx.adiForm.linhas.splice(i, 1);
      this._adiRedesenharLinhas(ctx);
    },

    adiRestaurar() {
      const ctx = this._adiCtx();
      if (!ctx) return;
      ctx.adiForm = this._adiFormPadrao(ctx.adiAtual);
      this._adiRender(ctx);
      if (this._adiEl("adi-pop")) this._adiPopRender(ctx);
    },

    _adiRedesenharLinhas(ctx) {
      const tb = this._adiEl("adi-linhas");
      if (tb) tb.innerHTML = this._adiLinhasHtml(ctx);
      if (window.lucide) lucide.createIcons();
      this._adiAtualizar();
    },

    _adiUltimoVenc(l) {
      const p = PERIODOS[l.periodo] || PERIODOS.mensal;
      if (!l.venc || !(l.qtd > 1) || !p.meses) return l.venc || "";
      return somarMeses(l.venc, p.meses * (l.qtd - 1));
    },

    _adiLinhaValida(l) {
      return !!l && !this._adiProblemaLinha(l);
    },

    /** O que mudou em relação ao contrato hoje; serve para marcar as alterações sozinho. */
    _adiDiferencas(ctx) {
      const a = ctx.adiAtual;
      const padrao = this._adiFormPadrao(a).linhas;
      const novas = ctx.adiForm.linhas;
      const out = {};
      const qtdHoje = padrao.reduce((s, l) => s + (l.qtd || 0), 0);
      const qtdNova = novas.reduce((s, l) => s + (l.qtd || 0), 0);
      if (qtdHoje !== qtdNova) out.qtd = true;
      if (novas.length !== padrao.length || novas.some((l, i) => !padrao[i] || padrao[i].periodo !== l.periodo || padrao[i].tipo !== l.tipo)) out.condicao = true;
      if (novas.some((l, i) => !padrao[i] || Math.abs((padrao[i].valor || 0) - (l.valor || 0)) > 0.009)) out.valor = true;
      if (novas.some((l, i) => !padrao[i] || padrao[i].venc !== l.venc)) out.venc = true;
      return out;
    },

    _adiTextoCondicoes(ctx) {
      const validas = ctx.adiForm.linhas.filter((l) => this._adiLinhaValida(l));
      const frases = validas.map((l) => {
        const p = PERIODOS[l.periodo] || PERIODOS.mensal;
        const valor = brl(l.valor) + " (" + extenso(l.valor) + ")";
        if (l.qtd === 1 || !p.meses) {
          return (l.qtd === 1 ? "1 parcela única" : l.qtd + " parcelas") + " no valor de " + valor + (l.qtd === 1 ? "" : " cada") + ", com vencimento no dia " + dmy(l.venc) + ".";
        }
        return l.qtd + " parcelas " + p.plural + " no valor de " + valor + " cada, com primeiro vencimento no dia " + dmy(l.venc) + " e demais " + p.demais + ".";
      });
      if (frases.length <= 1) return frases.join("");
      return frases.map((f, i) => String.fromCharCode(97 + i) + ") " + f).join("\n");
    },

    _adiTextoReajusteJuros(ctx) {
      const f = ctx.adiForm;
      const qtd = f.linhas.filter((l) => this._adiLinhaValida(l)).reduce((s, l) => s + l.qtd, 0);
      const um = qtd === 1;
      const juros = Number.isFinite(f.juros) && f.juros > 0 ? f.juros : 0;
      const com = f.reajuste === "com" && f.indice;
      const sujeito = um ? "A referida parcela" : "As referidas parcelas";
      const reaj = com
        ? (um ? "será reajustada" : "serão reajustadas") + " anualmente pelo índice " + f.indice
        : (um ? "está" : "estão") + " sem reajuste anual";
      const jur = juros
        ? (com ? (um ? " e terá" : " e terão") : " e com") + " juros de parcelamento de " + pct4(juros) + " ao mês"
        : (com ? (um ? " e está" : " e estão") : " e") + " sem juros de parcelamento";
      return sujeito + " " + reaj + jur + ".";
    },

    _adiTextoMotivo(ctx) {
      const itens = this._adiMudancas(ctx).filter((m) => m.muda).map((m) => m.texto);
      return itens.length ? "alterar " + juntarE(itens) : "";
    },

    _adiPendencias(ctx) {
      if (!ctx || !ctx.adiForm) return ["Aguarde o contrato carregar."];
      if (ctx.adiBloqueio) return ["O aditamento só pode ser feito em contrato ativo (" + ctx.adiBloqueio + ")."];
      const f = ctx.adiForm;
      const out = [];
      if (!this._adiMudancas(ctx).some((m) => m.muda)) out.push("Nada mudou em relação ao contrato: edite as parcelas, os juros ou o reajuste.");
      f.linhas.forEach((l, i) => {
        const p = this._adiProblemaLinha(l);
        if (p) out.push(`Condição ${i + 1}: ${p}.`);
        if (l.tipo && f.linhas.findIndex((x) => x.tipo === l.tipo) !== i) out.push(`Condição ${i + 1}: ${l.tipo} já está em outra linha.`);
      });
      if (!Number.isFinite(f.juros) || f.juros < 0) out.push("Informe os juros de parcelamento (0 se não houver).");
      if (f.reajuste === "com" && (!f.indice || f.indice === "REAL")) out.push("Informe o índice de reajuste.");
      if (!this._adiTestemunhaEscolhida(ctx, 1) || !this._adiTestemunhaEscolhida(ctx, 2)) out.push("Escolha as duas testemunhas.");
      return out;
    },

    _adiAtualizar() {
      const ctx = this._adiCtx();
      if (ctx && !ctx.adiBloqueio) {
        const f = ctx.adiForm;
        const mud = this._adiEl("adi-mudancas");
        if (mud) {
          mud.innerHTML = this._adiMudancasHtml(ctx);
          if (window.lucide) lucide.createIcons();
        }
        let total = 0;
        f.linhas.forEach((l, i) => {
          const t = (l.qtd > 0 && l.valor > 0) ? l.qtd * l.valor : 0;
          total += t;
          const tc = this._adiEl("adi-total-" + i);
          if (tc) tc.textContent = t ? brl(t) : "—";
          const per = this._adiEl("adi-per-" + i);
          if (per) per.textContent = l.tipo ? (PERIODOS[l.periodo] || PERIODOS.mensal).label : "";
          const ate = this._adiEl("adi-ate-" + i);
          if (ate) ate.textContent = (l.qtd > 1 && l.venc && (PERIODOS[l.periodo] || {}).meses) ? "último em " + dmy(this._adiUltimoVenc(l)) : "";
        });
        const saldo = ctx.adiAtual.saldoAberto;
        const diff = total - saldo;
        const tot = this._adiEl("adi-totais");
        if (tot) {
          const cls = Math.abs(diff) < 1 ? "adi-ok" : "adi-atencao";
          tot.innerHTML = `<span>Total das novas condições <strong>${brl(total)}</strong></span>
            <span>Saldo em aberto hoje <strong>${brl(saldo)}</strong></span>
            <span>Diferença <strong class="${cls}">${diff > 0 ? "+" : ""}${brl(diff)}</strong></span>`;
        }
        const resumo = this._adiEl("adi-parc-resumo");
        if (resumo) resumo.innerHTML = this._adiParcelasResumoHtml(ctx);
      }
      this._adiAtualizarBotao();
    },

    _adiAtualizarBotao() {
      const btn = this._adiEl("adi-btn-gerar");
      const aviso = this._adiEl("adi-aviso");
      const ctx = RelacionamentoState.aditamento;
      const pend = this._adiPendencias(ctx);
      const ok = !pend.length && !(this._docPdfBusy && this._docPdfBusy.aditamento);
      if (btn) {
        btn.disabled = !ok;
        btn.style.opacity = ok ? "" : "0.55";
        btn.style.cursor = ok ? "" : "not-allowed";
        btn.title = pend[0] || "";
      }
      if (aviso) aviso.textContent = ctx && ctx.adiForm && !ctx.adiBloqueio ? (pend[0] || "") : "";
    },

    async gerarAditamentoPdf() {
      const ctx = this._adiCtx();
      const pend = this._adiPendencias(ctx);
      if (pend.length) {
        alert(pend.join("\n"));
        return;
      }
      this._docPdfBusy = this._docPdfBusy || {};
      if (this._docPdfBusy.aditamento) return;
      this._docPdfBusy.aditamento = true;
      const btn = this._adiEl("adi-btn-gerar");
      const btnHtml = btn ? btn.innerHTML : "";
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spin"></span> Gerando...`;
      }
      try {
        const cfg = this._docCfg("aditamento");
        await this._sincronizarModeloDoc(cfg);
        let t = {};
        try { t = JSON.parse(localStorage.getItem(cfg.storage) || "{}"); } catch (e) {}
        const titleEl = document.getElementById(cfg.titleId);
        const titleSalvo = t[cfg.titleId];
        const docTitle = (titleEl && titleEl.value && (titleEl.value !== titleEl.defaultValue || !titleSalvo) ? titleEl.value : titleSalvo) || cfg.defaultTitle;
        let corpo = this._resolveDocCorpo(cfg, document.getElementById(cfg.corpoId));
        if (!corpo) {
          alert("O modelo do aditamento não está preenchido. Salve-o em Configurações → Documentos padrões.");
          return;
        }
        corpo = corpo.replace(/^\s*(?:<[^>]+>\s*|[*_]+\s*)*t[ií]tulo\s*:[^\n]*\n*/i, "");
        await this._carregarUnidadeCompleta(ctx);
        const w1 = this._adiTestemunhaEscolhida(ctx, 1) || {};
        const w2 = this._adiTestemunhaEscolhida(ctx, 2) || {};
        const { legalBase, quadraLote, titulo, preambleText } = this._escDocBase(ctx, {
          MOTIVO_ADITAMENTO: this._adiTextoMotivo(ctx),
          NOVAS_CONDICOES: this._adiTextoCondicoes(ctx),
          REAJUSTE_JUROS_ADITAMENTO: this._adiTextoReajusteJuros(ctx),
          JUROS_ADITAMENTO: pct4(ctx.adiForm.juros || 0),
          INDICE_REAJUSTE: ctx.adiForm.reajuste === "com" ? ctx.adiForm.indice : "sem reajuste",
          CIDADE_ATUAL: "Botucatu",
          TESTEMUNHA_1_NOME: w1.name || w1.nome || "________________",
          TESTEMUNHA_1_RG: w1.doc_rg || w1.rg || "________________",
          TESTEMUNHA_2_NOME: w2.name || w2.nome || "________________",
          TESTEMUNHA_2_RG: w2.doc_rg || w2.rg || "________________"
        });
        if (!preambleText || /NÃO CADASTRADO/i.test(String(preambleText))) {
          alert("Preâmbulo não cadastrado para o centro de custo deste contrato. Cadastre-o antes de gerar o aditamento.");
          return;
        }
        legalBase.PREAMBULO = String(preambleText).trim().replace(/[.;,\s]+$/, "");
        const docCliente = this._docFmtCpfCnpj(legalBase.CPF_CNPJ || (ctx.customer && (ctx.customer.cpfCnpj || ctx.customer.cpf || ctx.customer.cnpj)));
        if (docCliente) legalBase.CPF_CNPJ = legalBase.CPF_CLIENTE = docCliente;
        if (typeof window.applyDistratoConditionals === "function") {
          corpo = window.applyDistratoConditionals(corpo, { hasConjuge: !!legalBase._HAS_CONJUGE });
        }
        const markup = typeof window.formatDocPadraoMarkup === "function" ? window.formatDocPadraoMarkup(corpo) : corpo;
        let filled = this._fillDocVars(markup, legalBase);
        if (typeof window.centerDistratoSignatures === "function") filled = window.centerDistratoSignatures(filled);

        const visivel = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
        const corteAss = filled.indexOf('<div class="pdf-sign-keep"');
        const texto = corteAss >= 0 ? filled.slice(0, corteAss) : filled;
        const assinaturas = corteAss >= 0 ? filled.slice(corteAss) : "";
        const blocos = String(texto).replace(/[ \t]+\n/g, "\n").split(/\n[ \t]*\n/)
          .map((b) => b.replace(/^\n+|\s+$/g, "")).filter((b) => visivel(b));
        if (assinaturas) blocos.push(assinaturas.trim());
        const codEmp = legalBase.CODIGO_EMPREENDIMENTO && legalBase.CODIGO_EMPREENDIMENTO !== "____" ? legalBase.CODIGO_EMPREENDIMENTO : "";
        const unidade = [codEmp, quadraLote].filter(Boolean).join(" - ");
        const topo = `<div style="font-family:'Times New Roman',serif;font-size:11pt;color:#111;margin:0 0 24px;">Título: ${this._escDoc(titulo)} | Unidade: ${this._escDoc(unidade || "____")}</div>
          <h2 style="text-align:center;color:#111;font-size:13pt;font-weight:bold;letter-spacing:0.04em;margin:0 0 26px;font-family:'Times New Roman',serif;">${docTitle}</h2>`;
        const corpoCss = "font-family:'Times New Roman',serif;font-size:11pt;line-height:1.5;text-align:justify;white-space:pre-wrap;color:#111;";
        const paginas = this._paginarDoc(topo, blocos, corpoCss);
        const nome = (ctx.customer && ctx.customer.name) || ctx.sale.customerName || "";
        const fileName = typeof window.buildFichaPdfFilename === "function"
          ? window.buildFichaPdfFilename(cfg.title, { contrato: unidade, costCenterId: codEmp, titulo, nome })
          : cfg.title + " | Título " + titulo + ".pdf";
        await this._baixarPaginasPdf(paginas, fileName);
      } catch (err) {
        console.error("Erro ao gerar aditamento", err);
        alert("Não foi possível gerar o aditamento. Verifique o modelo em Documentos padrões e tente de novo.");
      } finally {
        this._docPdfBusy.aditamento = false;
        if (btn) btn.innerHTML = btnHtml;
        this._adiAtualizarBotao();
        if (window.lucide) lucide.createIcons();
      }
    }
  });
})();
