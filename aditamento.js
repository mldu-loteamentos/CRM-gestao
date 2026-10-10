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

  const ALTERACOES = [
    { id: "condicao", label: "Condição de pagamento", texto: "condição de pagamento" },
    { id: "qtd", label: "Quantidade de parcelas", texto: "quantidade de parcelas" },
    { id: "valor", label: "Valor das parcelas", texto: "valor das parcelas" },
    { id: "venc", label: "Vencimentos", texto: "vencimentos" }
  ];

  const INDICES = ["IGP-M", "IPCA", "INCC", "INPC", "IPC-DI"];

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
        return {
          chave: g.chave,
          label: g.label,
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
        periodo: periodoDoCodigo(l.chave, l.abertas),
        qtd: l.abertas,
        valor: l.valorAberto,
        venc: l.proximo || ""
      }));
      return {
        alteracoes: {},
        manual: {},
        juros: atual.juros != null ? atual.juros : 0,
        reajuste: atual.comReajuste ? "com" : "sem",
        indice: atual.comReajuste ? atual.indice : "",
        linhas: linhas.length ? linhas : [{ periodo: "mensal", qtd: 1, valor: 0, venc: "" }]
      };
    },

    _adiPreparar(ctx) {
      ctx.adiAtual = this._adiResumoAtual(ctx);
      ctx.adiForm = this._adiFormPadrao(ctx.adiAtual);
      ctx.adiBloqueio = this._adiMotivoBloqueio(ctx);
      this._adiRender(ctx);
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
              <thead><tr><th></th><th>Tipo</th><th class="adi-num">Qtde.</th><th class="adi-num">Valor da parcela</th><th class="adi-num">Total</th><th>1º vencimento</th><th></th></tr></thead>
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
        if (!this._adiLinhaValida(l)) return `<li class="adi-atencao">Condição ${i + 1}: falta preencher quantidade, valor ou vencimento</li>`;
        total += l.qtd * l.valor;
        const p = PERIODOS[l.periodo] || PERIODOS.mensal;
        const ult = this._adiUltimoVenc(l);
        return `<li><strong>${esc(p.label)}</strong> ${l.qtd} × ${brl(l.valor)}<span>${dmy(l.venc)}${ult && ult !== l.venc ? " a " + dmy(ult) : ""}</span></li>`;
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
      const chips = ALTERACOES.map((o) => `
        <label class="adi-chip"><input type="checkbox" id="adi-alt-${o.id}" ${f.alteracoes[o.id] ? "checked" : ""} onchange="RelacionamentoApp.adiMarcarAlteracao('${o.id}', this.checked)"> ${o.label}</label>`).join("");
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
            <div class="adi-lbl">O que muda no termo <small>(marcado sozinho conforme você altera)</small></div>
            <div class="adi-chips">${chips}</div>
          </div>
        </div>`;
    },

    _adiLinhasHtml(ctx) {
      const f = ctx.adiForm;
      return f.linhas.map((l, i) => `
        <tr>
          <td class="adi-cond-n">${i + 1}</td>
          <td><select class="form-control adi-in" onchange="RelacionamentoApp.adiLinha(${i}, 'periodo', this.value)">
            ${Object.keys(PERIODOS).map((k) => `<option value="${k}" ${l.periodo === k ? "selected" : ""}>${PERIODOS[k].label}</option>`).join("")}
          </select></td>
          <td class="adi-num"><input type="number" min="1" step="1" class="form-control adi-in adi-in-qtd" value="${l.qtd || ""}" ${l.periodo === "unica" ? "readonly" : ""} oninput="RelacionamentoApp.adiLinha(${i}, 'qtd', this.value)"></td>
          <td class="adi-num"><input type="text" inputmode="decimal" class="form-control adi-in adi-in-valor" value="${l.valor ? num2(l.valor) : ""}" placeholder="0,00" oninput="RelacionamentoApp.adiLinha(${i}, 'valor', this.value)" onblur="RelacionamentoApp.adiFormatarValor(this, ${i})"></td>
          <td class="adi-num" id="adi-total-${i}">—</td>
          <td><input type="date" class="form-control adi-in adi-in-data" value="${l.venc || ""}" onchange="RelacionamentoApp.adiLinha(${i}, 'venc', this.value)"><small class="adi-ate" id="adi-ate-${i}"></small></td>
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
        const previaAberta = !!ctx.adiPreviaAberta;
        box.innerHTML = `${this._adiResumoHtml(ctx)}
          ${this._adiParcelasCardHtml(ctx)}
          ${this._adiAjustesHtml(ctx)}
          <details class="adi-previa-box"${previaAberta ? " open" : ""} ontoggle="RelacionamentoState.aditamento && (RelacionamentoState.aditamento.adiPreviaAberta = this.open)">
            <summary><i data-lucide="file-search"></i> Ver como sai no termo (cláusula 1.1)</summary>
            <div id="adi-previa" class="adi-previa"></div>
          </details>`;
      }
      if (window.lucide) lucide.createIcons();
      this._adiAtualizar();
    },

    _adiCtx() {
      const ctx = RelacionamentoState.aditamento;
      return ctx && ctx.adiForm ? ctx : null;
    },

    adiMarcarAlteracao(id, on) {
      const ctx = this._adiCtx();
      if (!ctx) return;
      ctx.adiForm.alteracoes[id] = !!on;
      ctx.adiForm.manual[id] = true;
      this._adiAtualizar();
    },

    adiCampo(campo, valor) {
      const ctx = this._adiCtx();
      if (!ctx) return;
      const f = ctx.adiForm;
      if (campo === "juros") f.juros = parseValor(valor);
      else if (campo === "indice") {
        f.indice = String(valor || "").trim();
        if (f.indice && f.reajuste !== "com") {
          f.reajuste = "com";
          const r = document.querySelector('input[name="adi-reajuste"][value="com"]');
          if (r) r.checked = true;
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
      if (campo === "periodo") {
        if (valor === "unica") l.qtd = 1;
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
      ctx.adiForm.linhas.push({ periodo: "mensal", qtd: 1, valor: 0, venc: ult && ult.venc ? somarMeses(this._adiUltimoVenc(ult), 1) : "" });
      this._adiRedesenharLinhas(ctx);
      const rolagem = document.querySelector("#adi-pop .adi-linhas-scroll");
      if (rolagem) rolagem.scrollTop = rolagem.scrollHeight;
    },

    adiRemoverLinha(i) {
      const ctx = this._adiCtx();
      if (!ctx || ctx.adiForm.linhas.length <= 1) return;
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
      return l && Number.isInteger(l.qtd) && l.qtd >= 1 && Number.isFinite(l.valor) && l.valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(l.venc || ""));
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
      if (novas.length !== padrao.length || novas.some((l, i) => !padrao[i] || padrao[i].periodo !== l.periodo)) out.condicao = true;
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
      const f = ctx.adiForm;
      const a = ctx.adiAtual;
      const itens = ALTERACOES.filter((o) => f.alteracoes[o.id]).map((o) => o.texto);
      const juros = Number.isFinite(f.juros) ? f.juros : 0;
      if (a.juros != null && Math.abs(juros - Number(a.juros)) > 0.00001) itens.push("juros de parcelamento");
      if (a.indice) {
        const hoje = a.comReajuste ? a.indice.toUpperCase() : "";
        const novo = f.reajuste === "com" ? String(f.indice || "").toUpperCase() : "";
        if (hoje !== novo) itens.push("reajuste do contrato");
      }
      return itens.length ? "alterar " + juntarE(itens) : "";
    },

    _adiPendencias(ctx) {
      if (!ctx || !ctx.adiForm) return ["Aguarde o contrato carregar."];
      if (ctx.adiBloqueio) return ["O aditamento só pode ser feito em contrato ativo (" + ctx.adiBloqueio + ")."];
      const f = ctx.adiForm;
      const out = [];
      if (!ALTERACOES.some((o) => f.alteracoes[o.id])) out.push("Marque o que está sendo alterado no contrato.");
      const ruins = f.linhas.map((l, i) => (this._adiLinhaValida(l) ? 0 : i + 1)).filter(Boolean);
      if (ruins.length) out.push("Preencha quantidade, valor e 1º vencimento da condição " + ruins.join(", ") + ".");
      if (!Number.isFinite(f.juros) || f.juros < 0) out.push("Informe os juros de parcelamento (0 se não houver).");
      if (f.reajuste === "com" && !f.indice) out.push("Informe o índice de reajuste.");
      return out;
    },

    _adiAtualizar() {
      const ctx = this._adiCtx();
      if (ctx && !ctx.adiBloqueio) {
        const f = ctx.adiForm;
        const dif = this._adiDiferencas(ctx);
        ALTERACOES.forEach((o) => {
          if (f.manual[o.id]) return;
          f.alteracoes[o.id] = !!dif[o.id];
          const cb = this._adiEl("adi-alt-" + o.id);
          if (cb) cb.checked = f.alteracoes[o.id];
        });
        let total = 0;
        f.linhas.forEach((l, i) => {
          const t = (l.qtd > 0 && l.valor > 0) ? l.qtd * l.valor : 0;
          total += t;
          const tc = this._adiEl("adi-total-" + i);
          if (tc) tc.textContent = t ? brl(t) : "—";
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
        const previa = this._adiEl("adi-previa");
        if (previa) {
          const cond = this._adiTextoCondicoes(ctx);
          const motivo = this._adiTextoMotivo(ctx);
          previa.innerHTML = cond
            ? `${motivo ? `<p class="adi-previa-motivo">(II) … procurara(m) o(s) PROMITENTE(S) VENDEDOR(ES) para ${this._escDoc(motivo)}.</p>` : ""}<p>${this._escDoc(cond).replace(/\n/g, "<br>")}</p><p>${this._escDoc(this._adiTextoReajusteJuros(ctx))}</p>`
            : `<p class="adi-vazio">Preencha as novas condições para ver o texto.</p>`;
        }
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
        const users = typeof window.getDistratoWitnessUsers === "function" ? window.getDistratoWitnessUsers() : [];
        const w1 = users[0] || {};
        const w2 = users[1] || {};
        const { legalBase, quadraLote, titulo, preambleText } = this._escDocBase(ctx, {
          MOTIVO_ADITAMENTO: this._adiTextoMotivo(ctx),
          NOVAS_CONDICOES: this._adiTextoCondicoes(ctx),
          REAJUSTE_JUROS_ADITAMENTO: this._adiTextoReajusteJuros(ctx),
          JUROS_ADITAMENTO: pct4(ctx.adiForm.juros || 0),
          INDICE_REAJUSTE: ctx.adiForm.reajuste === "com" ? ctx.adiForm.indice : "sem reajuste",
          CIDADE_ATUAL: "Botucatu",
          TESTEMUNHA_1_NOME: w1.name || w1.nome || "LETICIA PEREIRA DE OLIVIERA",
          TESTEMUNHA_1_RG: w1.doc_rg || w1.rg || "50.505.231-3",
          TESTEMUNHA_2_NOME: w2.name || w2.nome || "MICHELLE FRANCINE VIEIRA",
          TESTEMUNHA_2_RG: w2.doc_rg || w2.rg || "463210852"
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
