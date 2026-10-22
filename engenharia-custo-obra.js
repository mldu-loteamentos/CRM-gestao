/* Custo obra 13900 — leitura dos relatórios enviados, sem consulta ao Sienge.
   IDD de outubro/2026: planejado x comprometido por item (UC2 e UC4).
   IDT de setembro/2026: custo orçado, medido, realizado, verba e tendência.
   Caução de out-nov-dez/2026. */
(function() {
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function brl(v) {
    return num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function pct(v, casas) {
    return num(v).toLocaleString("pt-BR", { minimumFractionDigits: casas == null ? 1 : casas, maximumFractionDigits: casas == null ? 1 : casas }) + "%";
  }

  function dataBr(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "/" + m[2] + "/" + m[1]) : "—";
  }

  function somaAte(lista, indice) {
    let s = 0;
    const ate = Math.min(indice, (lista || []).length - 1);
    for (let i = 0; i <= ate; i++) s += num(lista[i]);
    return Math.round(s * 100) / 100;
  }

  function indice(planejado, comprometido) {
    if (!(comprometido > 0.009)) return null;
    return planejado / comprometido;
  }

  function textoIndice(valor) {
    if (valor == null) return "—";
    return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const App = {
    aba: "resumo",
    unidade: "UC2",
    mes: "",
    doc: "todos",
    cc: "todos",
    busca: { idd: "", ppc: "" },
    ordem: {
      idd: { campo: "id", dir: 1 },
      ppc: { campo: "vencimento", dir: 1 }
    },
    _foco: "",

    dados: function() {
      return window.CustoObraDados || { meses: [], unidades: [], idt: { linhas: [] }, compromissos: [] };
    },

    indiceMes: function() {
      const meses = this.dados().meses || [];
      const alvo = this.mes || this.dados().mesPadrao || meses[meses.length - 1];
      const i = meses.indexOf(alvo);
      return i >= 0 ? i : Math.max(0, meses.length - 1);
    },

    nomeMes: function() {
      return (this.dados().meses || [])[this.indiceMes()] || "";
    },

    unidadeAtual: function() {
      const lista = this.dados().unidades || [];
      return lista.find((u) => u.id === this.unidade) || lista[0] || { id: "", nome: "", itens: [] };
    },

    init: function() {
      if (!this.mes) this.mes = this.dados().mesPadrao || "";
      this.render();
    },

    setAba: function(id) {
      this.aba = id;
      this._foco = "";
      this.render();
    },

    setUnidade: function(id) {
      this.unidade = id;
      this.render();
    },

    setMes: function(valor) {
      this.mes = valor;
      this.render();
    },

    setDoc: function(valor) {
      this.doc = valor;
      this.render();
    },

    setCc: function(valor) {
      this.cc = valor;
      this.render();
    },

    filtrar: function(qual, valor) {
      this.busca[qual] = String(valor || "");
      this._foco = qual;
      this.render();
    },

    ordenar: function(tabela, campo) {
      const atual = this.ordem[tabela] || { campo: campo, dir: 1 };
      this.ordem[tabela] = { campo: campo, dir: atual.campo === campo ? -atual.dir : 1 };
      this.render();
    },

    comparar: function(a, b, campo) {
      const va = a && a[campo];
      const vb = b && b[campo];
      const na = Number(va);
      const nb = Number(vb);
      if (va != null && vb != null && Number.isFinite(na) && Number.isFinite(nb) && typeof va !== "string") return na - nb;
      return String(va || "").localeCompare(String(vb || ""), "pt-BR", { numeric: true });
    },

    ordenarLista: function(lista, tabela) {
      const ord = this.ordem[tabela] || { campo: "", dir: 1 };
      const self = this;
      return lista.slice().sort(function(a, b) { return self.comparar(a, b, ord.campo) * (ord.dir || 1); });
    },

    th: function(tabela, campo, rotulo, direita) {
      return '<th class="' + (direita ? "cob-num" : "") + '" onclick="CustoObraApp.ordenar(\'' + tabela + '\',\'' + campo + '\')">'
        + esc(rotulo) + ' <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>';
    },

    linhaIdd: function(item, idx) {
      const pMes = num(item.p && item.p[idx]);
      const cMes = num(item.c && item.c[idx]);
      const pAc = somaAte(item.p, idx);
      const cAc = somaAte(item.c, idx);
      return {
        id: Number(item.id) || 0,
        desc: item.desc,
        grupo: !!item.grupo,
        total: num(item.total),
        pMes: pMes,
        cMes: cMes,
        pAc: pAc,
        cAc: cAc,
        idd: indice(pAc, cAc)
      };
    },

    abasHtml: function() {
      const tabs = [
        { id: "resumo", label: "Resumo", icon: "layout-dashboard" },
        { id: "idd", label: "Desembolso", icon: "wallet" },
        { id: "ppc", label: "Caução", icon: "file-text", count: (this.dados().compromissos || []).filter(function(c) { return c.doc !== "PPC" && c.doc !== "PCT"; }).length }
      ];
      const atual = this.aba;
      return '<div class="ml-tabs cob-tabs" role="tablist">' + tabs.map(function(t) {
        const ativo = atual === t.id;
        const count = t.count != null ? '<span class="ml-tab-count">' + t.count + "</span>" : "";
        return '<button type="button" role="tab" aria-selected="' + ativo + '" class="ml-tab' + (ativo ? " is-active" : "") + '" onclick="CustoObraApp.setAba(\'' + t.id + '\')"><i data-lucide="' + t.icon + '"></i> ' + t.label + count + "</button>";
      }).join("") + "</div>";
    },

    render: function() {
      const root = document.getElementById("engenharia-custo-obra-root");
      if (!root) return;
      const d = this.dados();
      const corpo = !d.meses ? '<p class="cob-erro">Os relatórios da obra não carregaram.</p>'
        : (this.aba === "idd" ? this.htmlIdd() : (this.aba === "ppc" ? this.htmlPpc() : this.htmlResumo()));
      root.innerHTML = ''
        + '<div class="cob-page">'
        + '<p class="cob-nota">Obra ' + esc(d.obra) + " · " + esc(d.nome) + ". Os números vêm do IDD de outubro/2026 e do IDT de setembro/2026, unidades UC2 e UC4. Período da obra: " + esc(d.periodoObra) + ".</p>"
        + this.abasHtml()
        + '<div class="cob-corpo">' + corpo + "</div>"
        + "</div>";
      const foco = this._foco;
      if (foco) {
        const el = document.getElementById(foco === "idd" ? "cob-busca-idd" : "cob-busca-ppc");
        if (el) {
          el.focus();
          const p = el.value.length;
          if (typeof el.setSelectionRange === "function") el.setSelectionRange(p, p);
        }
      }
      try { if (window.lucide) window.lucide.createIcons({ root: root }); } catch (e) {}
    },

    kpi: function(rotulo, valor) {
      return '<div class="cob-kpi"><span>' + esc(rotulo) + "</span><strong>" + esc(valor) + "</strong></div>";
    },

    htmlResumo: function() {
      const d = this.dados();
      const i = this.indiceMes();
      const mes = this.nomeMes();
      const raizes = (d.unidades || []).map((u) => {
        const item = (u.itens || [])[0];
        const linha = item ? this.linhaIdd(item, i) : null;
        return { unidade: u.id, nome: u.nome, linha: linha };
      }).filter((x) => x.linha);
      let pMes = 0, cMes = 0, pAc = 0, cAc = 0;
      raizes.forEach((x) => { pMes += x.linha.pMes; cMes += x.linha.cMes; pAc += x.linha.pAc; cAc += x.linha.cAc; });
      const idt = ((d.idt && d.idt.linhas) || []).map((l) => "<tr>"
        + "<td>" + esc(l.unidade) + "</td><td>" + esc(l.nome) + "</td><td class=\"cob-num\">" + pct(l.medidoPct, 2) + "</td>"
        + "<td class=\"cob-num\">" + brl(l.orcado) + "</td><td class=\"cob-num\">" + brl(l.valorMedido) + "</td><td class=\"cob-num\">" + brl(l.realizado) + "</td>"
        + "<td class=\"cob-num\">" + brl(l.desvio) + "</td><td class=\"cob-num\">" + brl(l.comprometido) + "</td><td class=\"cob-num\">" + brl(l.verba) + "</td>"
        + "<td class=\"cob-num\">" + brl(l.reprogramado) + "</td><td class=\"cob-num\">" + brl(l.tendencia) + "</td></tr>").join("");
      const idd = raizes.map((x) => {
        const cls = x.linha.idd != null && x.linha.idd < 1 ? "cob-idd is-baixo" : "cob-idd";
        return "<tr><td>" + esc(x.unidade) + "</td><td>" + esc(x.nome) + "</td>"
          + "<td class=\"cob-num\">" + brl(x.linha.pMes) + "</td><td class=\"cob-num\">" + brl(x.linha.cMes) + "</td>"
          + "<td class=\"cob-num\">" + brl(x.linha.pAc) + "</td><td class=\"cob-num\">" + brl(x.linha.cAc) + "</td>"
          + '<td class="cob-num"><span class="' + cls + '">' + textoIndice(x.linha.idd) + "</span></td></tr>";
      }).join("");
      const total = (d.idt.linhas || []).find((l) => l.unidade === "Obra") || {};
      return '<div class="cob-kpis">'
        + this.kpi("Orçado", brl(total.orcado))
        + this.kpi("Medido até set/26", brl(total.valorMedido))
        + this.kpi("Realizado até set/26", brl(total.realizado))
        + this.kpi("Tendência", brl(total.tendencia))
        + this.kpi("Verba disponível", brl(total.verba))
        + this.kpi("IDD acum. " + mes, textoIndice(indice(pAc, cAc)))
        + "</div>"
        + '<section class="cob-sub"><h3 class="cob-sec">Custo e tendência · IDT até ' + esc(dataBr(d.idt && d.idt.referencia)) + "</h3>"
        + '<p class="cob-nota">Tendência é o realizado acumulado mais o custo reprogramado. Verba disponível é o orçado menos o comprometido. O desvio é o valor medido menos o realizado.</p>'
        + '<div class="cob-table-wrap"><table class="cob-table"><thead><tr><th>Unidade</th><th>Nome</th><th class="cob-num">% medido</th><th class="cob-num">Orçado</th><th class="cob-num">Valor medido</th><th class="cob-num">Realizado</th><th class="cob-num">Desvio</th><th class="cob-num">Comprometido</th><th class="cob-num">Verba</th><th class="cob-num">Reprogramado</th><th class="cob-num">Tendência</th></tr></thead><tbody>'
        + idt + "</tbody></table></div></section>"
        + '<section class="cob-sub"><h3 class="cob-sec">Desembolso · IDD em ' + esc(mes) + "</h3>"
        + '<p class="cob-nota">IDD = planejado acumulado ÷ comprometido acumulado, desde janeiro/2023 até o mês. Acima de 1, o comprometido ficou abaixo do planejado.</p>'
        + '<div class="cob-table-wrap"><table class="cob-table"><thead><tr><th>Unidade</th><th>Nome</th><th class="cob-num">Planejado no mês</th><th class="cob-num">Comprometido no mês</th><th class="cob-num">Planejado acum.</th><th class="cob-num">Comprometido acum.</th><th class="cob-num">IDD</th></tr></thead><tbody>'
        + idd
        + "<tr class=\"cob-grupo\"><td></td><td>UC2 + UC4</td><td class=\"cob-num\">" + brl(pMes) + "</td><td class=\"cob-num\">" + brl(cMes) + "</td><td class=\"cob-num\">" + brl(pAc) + "</td><td class=\"cob-num\">" + brl(cAc) + "</td><td class=\"cob-num\"><span class=\"" + (indice(pAc, cAc) != null && indice(pAc, cAc) < 1 ? "cob-idd is-baixo" : "cob-idd") + "\">" + textoIndice(indice(pAc, cAc)) + "</span></td></tr>"
        + "</tbody></table></div></section>";
    },

    htmlIdd: function() {
      const self = this;
      const u = this.unidadeAtual();
      const i = this.indiceMes();
      const q = this.busca.idd.trim().toLowerCase();
      const meses = this.dados().meses || [];
      const lista = this.ordenarLista((u.itens || []).map(function(item) { return self.linhaIdd(item, i); }).filter(function(item) {
        if (!q) return true;
        return (item.desc || "").toLowerCase().indexOf(q) >= 0;
      }), "idd");
      const linhas = lista.map(function(item) {
        const cls = item.idd != null && item.idd < 1 ? "cob-idd is-baixo" : "cob-idd";
        return '<tr class="' + (item.grupo ? "cob-grupo" : "") + '"><td>' + item.id + "</td><td>" + esc(item.desc) + "</td>"
          + '<td class="cob-num">' + brl(item.total) + "</td>"
          + '<td class="cob-num">' + brl(item.pMes) + "</td><td class=\"cob-num\">" + brl(item.cMes) + "</td>"
          + '<td class="cob-num">' + brl(item.pAc) + "</td><td class=\"cob-num\">" + brl(item.cAc) + "</td>"
          + '<td class="cob-num"><span class="' + cls + '">' + textoIndice(item.idd) + "</span></td></tr>";
      }).join("");
      const unidades = (this.dados().unidades || []).map(function(un) {
        const on = un.id === u.id;
        return '<button type="button" class="cob-pill' + (on ? " is-ok" : "") + '" onclick="CustoObraApp.setUnidade(\'' + un.id + '\')">' + esc(un.id) + " · " + esc(un.nome) + "</button>";
      }).join("");
      const opcoes = meses.map(function(nome) {
        return '<option value="' + esc(nome) + '"' + (nome === self.nomeMes() ? " selected" : "") + ">" + esc(nome) + "</option>";
      }).join("");
      return '<div class="cob-toolbar">'
        + unidades
        + '<label class="cob-field">Mês<select id="cob-mes" onchange="CustoObraApp.setMes(this.value)">' + opcoes + "</select></label>"
        + '<input id="cob-busca-idd" class="cob-busca" placeholder="Buscar item" value="' + esc(this.busca.idd) + '" oninput="CustoObraApp.filtrar(\'idd\', this.value)">'
        + "</div>"
        + '<p class="cob-nota">Cada linha do relatório tem o planejado (P) e o comprometido (C). O acumulado soma de janeiro/2023 até ' + esc(this.nomeMes()) + ". Grupo em negrito.</p>"
        + '<div class="cob-table-wrap cob-scroll"><table class="cob-table"><thead><tr>'
        + this.th("idd", "id", "ID")
        + this.th("idd", "desc", "Item")
        + this.th("idd", "total", "Planejado total", true)
        + this.th("idd", "pMes", "Planejado no mês", true)
        + this.th("idd", "cMes", "Comprometido no mês", true)
        + this.th("idd", "pAc", "Planejado acum.", true)
        + this.th("idd", "cAc", "Comprometido acum.", true)
        + this.th("idd", "idd", "IDD", true)
        + "</tr></thead><tbody>" + (linhas || '<tr><td colspan="8" class="cob-vazio">Nenhum item.</td></tr>') + "</tbody></table></div>";
    },

    htmlPpc: function() {
      const self = this;
      const q = this.busca.ppc.trim().toLowerCase();
      const ccs = ["todos"].concat([...new Set((this.dados().compromissos || []).filter(function(c) { return c.doc !== "PPC" && c.doc !== "PCT"; }).map(function(c) { return c.ccId; }).filter(Boolean))]);
      const lista = this.ordenarLista((this.dados().compromissos || []).filter(function(c) {
        if (c.doc === "PPC" || c.doc === "PCT") return false;
        if (self.cc !== "todos" && c.ccId !== self.cc) return false;
        if (!q) return true;
        return (c.credor + " " + c.titulo + " " + c.numero + " " + c.nota).toLowerCase().indexOf(q) >= 0;
      }), "ppc");
      let total = 0;
      const linhas = lista.map(function(c) {
        total += num(c.valor);
        return "<tr><td>" + esc(c.ccId) + "</td><td>" + dataBr(c.vencimento) + "</td><td>" + esc(c.titulo) + " / " + esc(c.parcela) + "</td><td>" + esc(c.credor) + "</td><td>" + esc(c.doc) + " " + esc(c.numero) + "</td><td class=\"cob-num\">" + brl(c.valor) + "</td><td>" + esc(c.nota || "—") + "</td></tr>";
      }).join("");
      const botoes = function(atual, lista, fn) {
        return lista.map(function(id) {
          const on = atual === id;
          return '<button type="button" class="cob-pill' + (on ? " is-ok" : "") + '" onclick="CustoObraApp.' + fn + '(\'' + id + '\')">' + esc(id === "todos" ? "Todos" : id) + "</button>";
        }).join("");
      };
      return '<div class="cob-toolbar">' + botoes(this.cc, ccs, "setCc")
        + '<input id="cob-busca-ppc" class="cob-busca" placeholder="Buscar credor ou título" value="' + esc(this.busca.ppc) + '" oninput="CustoObraApp.filtrar(\'ppc\', this.value)">'
        + "</div>"
        + '<p class="cob-nota">Títulos de caução de outubro a dezembro de 2026, da planilha do IDD. O total desta seleção é ' + brl(total) + ".</p>"
        + '<div class="cob-table-wrap cob-scroll"><table class="cob-table"><thead><tr>'
        + this.th("ppc", "ccId", "Centro")
        + this.th("ppc", "vencimento", "Vencimento")
        + this.th("ppc", "titulo", "Título")
        + this.th("ppc", "credor", "Credor")
        + this.th("ppc", "doc", "Documento")
        + this.th("ppc", "valor", "Valor", true)
        + "<th>Nota</th>"
        + "</tr></thead><tbody>" + (linhas || '<tr><td colspan="7" class="cob-vazio">Nenhum título neste filtro.</td></tr>') + "</tbody></table></div>";
    }
  };

  window.CustoObraApp = App;

  document.addEventListener("tabChanged", function(e) {
    if (e && e.detail === "engenharia-custo-obra") App.init();
  });
})();
