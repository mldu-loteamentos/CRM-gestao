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
  lendo: false,

  SOLTOS: { "14703": 1, "14704": 1, "14304": 1, "14305": 1 },
  MESES: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],

  init() {
    if (!this.date) this.date = new Date().toISOString().slice(0, 10);
    if (!this._ok) {
      this._ok = true;
      this.lerLocal();
      if (!this.mes) this.mes = new Date().getMonth() + 1;
    }
    this.render();
    if (this.aba === "posicao" && !this.rows.length && !this.loading) this.refresh();
  },

  setAba(id) {
    this.aba = id || "entradas";
    this.render();
    if (this.aba === "posicao" && !this.dates.length && !this.loading) this.refresh();
    if (window.lucide) lucide.createIcons();
  },

  lerLocal() {
    try {
      const raw = localStorage.getItem("rc_orc_v1");
      this.anos = raw ? JSON.parse(raw) : {};
    } catch (e) {
      this.anos = {};
    }
  },

  gravarLocal() {
    try {
      localStorage.setItem("rc_orc_v1", JSON.stringify(this.anos || {}));
    } catch (e) {
      this.error = "Não coube no navegador guardar o orçamento. Suba um arquivo por vez.";
    }
  },

  anoAtual() {
    const ys = Object.keys(this.anos || {}).map(Number).filter((n) => n > 1900).sort((a, b) => a - b);
    return ys.length ? ys[ys.length - 1] : 0;
  },

  grupoCc(id) {
    const s = String(id || "").replace(/\D/g, "");
    if (this.SOLTOS[s]) return s;
    if (s.length >= 5) return s.slice(0, 3) + "00";
    return s;
  },

  rotulo(id, nome, solto) {
    const partes = String(nome || "").split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    let n = partes.length >= 3 && /^\d+$/.test(partes[0]) ? partes.slice(2).join(" - ") : (nome || id);
    n = n.replace(/\s+MLDU$/i, "").trim();
    if (!solto) n = n.replace(/\s*-\s*PARCERIA\b.*$/i, "").trim();
    return n || id;
  },

  normCode(v) {
    return String(v == null ? "" : v).trim().replace(/\s+/g, "");
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
      const meses = [];
      (grid[head] || []).forEach((c, col) => {
        const m = String(c == null ? "" : c).trim().toLowerCase().match(mesRe);
        if (!m) return;
        let realCol = col;
        const ate = col + 5;
        for (let k = col; k < ate && k < labels.length; k++) {
          if (/realizado/i.test(String(labels[k] == null ? "" : labels[k]))) { realCol = k; break; }
        }
        const mm = mesNum[m[1].slice(0, 3)];
        meses.push({ ym: m[2] + "-" + String(mm).padStart(2, "0"), colOrc: col, colReal: realCol });
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

  aplicarBlocos(nomeArquivo, blocos) {
    const porAno = {};
    blocos.forEach((b) => {
      ["entradas", "saidas"].forEach((lado) => {
        const mapa = this.somarLinhas(b.linhas, lado);
        Object.keys(mapa).forEach((ym) => {
          const ano = ym.slice(0, 4);
          const mm = String(Number(ym.slice(5, 7)));
          if (!porAno[ano]) porAno[ano] = { file: nomeArquivo, entradas: {}, saidas: {} };
          const bag = porAno[ano][lado];
          if (!bag[b.id]) bag[b.id] = { nome: b.nome, meses: {} };
          const cel = bag[b.id].meses[mm] || { o: 0, r: 0 };
          cel.o += mapa[ym].o;
          cel.r += mapa[ym].r;
          bag[b.id].meses[mm] = cel;
        });
      });
    });
    Object.keys(porAno).forEach((ano) => { this.anos[ano] = porAno[ano]; });
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
    this.render();
    try {
      for (let i = 0; i < files.length; i++) {
        const buf = await files[i].arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const blocos = this.lerPlanilha(wb);
        if (!blocos.length) throw new Error("Não reconheci centros de custo em " + files[i].name + ". Use o comparativo orçado × realizado da visão DFC.");
        this.aplicarBlocos(files[i].name, blocos);
      }
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.lendo = false;
    if (input) input.value = "";
    this.render();
  },

  removerAno(ano) {
    delete this.anos[String(ano)];
    this.gravarLocal();
    this.render();
  },

  valor(lado, ano, ccId, mes, campo, ate) {
    const bag = this.anos[String(ano)] && this.anos[String(ano)][lado] && this.anos[String(ano)][lado][ccId];
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

  linhasTabela(lado) {
    const ano = this.anoAtual();
    const ant = ano - 1;
    const mes = Number(this.mes) || 1;
    const fontes = [];
    [ano, ant].forEach((y) => {
      const bag = this.anos[String(y)] && this.anos[String(y)][lado];
      if (!bag) return;
      Object.keys(bag).forEach((id) => fontes.push({ ano: y, id, nome: bag[id].nome || id }));
    });
    const grupos = {};
    fontes.forEach((f) => {
      const key = this.grupoCc(f.id);
      if (!grupos[key]) grupos[key] = { key, nome: "", solto: !!this.SOLTOS[key] };
      const g = grupos[key];
      if (f.id === key || !g.nome) g.nome = f.nome;
    });
    const rows = Object.keys(grupos).map((key) => {
      const g = grupos[key];
      const ids = fontes.filter((f) => this.grupoCc(f.id) === key).map((f) => f.id);
      const uniq = [...new Set(ids)];
      const soma = (y, campo, ate) => uniq.reduce((s, id) => s + this.valor(lado, y, id, mes, campo, ate), 0);
      const rec = (ate) => ({
        ant: soma(ant, "r", ate),
        orc: soma(ano, "o", ate),
        real: soma(ano, "r", ate)
      });
      return {
        key,
        nome: this.rotulo(key, g.nome, g.solto),
        mensal: rec(false),
        acum: rec(true)
      };
    }).filter((r) => {
      const z = (b) => Math.abs(b.ant) + Math.abs(b.orc) + Math.abs(b.real);
      return z(r.mensal) + z(r.acum) > 0.5;
    });
    rows.sort((a, b) => Math.abs(b.acum.real) - Math.abs(a.acum.real) || a.nome.localeCompare(b.nome, "pt"));
    return { ano, ant, rows };
  },

  fmt(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  pct(real, orc) {
    if (!orc) return null;
    return ((real - orc) / Math.abs(orc)) * 100;
  },

  celVar(real, orc) {
    const v = real - orc;
    const cls = v < -0.5 ? "is-neg" : (v > 0.5 ? "is-pos" : "");
    const p = this.pct(real, orc);
    const pTxt = p == null ? "—" : (p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%");
    return `<td class="rcx-num ${cls}">${this.fmt(v)}</td><td class="rcx-num ${cls}">${pTxt}</td>`;
  },

  blocoNums(b, ant) {
    return `<td class="rcx-num">${this.fmt(b.ant)}</td><td class="rcx-num">${this.fmt(b.orc)}</td><td class="rcx-num">${this.fmt(b.real)}</td>${this.celVar(b.real, b.orc)}`;
  },

  orcamentoHtml(lado) {
    const pack = this.linhasTabela(lado);
    const anos = Object.keys(this.anos || {}).sort();
    const arqs = anos.map((y) => `<span class="rcx-arq">${caixaEsc(y)} · ${caixaEsc((this.anos[y] && this.anos[y].file) || "")} <button type="button" onclick="ResultadoCaixaApp.removerAno('${y}')">tirar</button></span>`).join("");
    const mesOpts = this.MESES.map((n, i) => `<option value="${i + 1}" ${Number(this.mes) === i + 1 ? "selected" : ""}>${n}</option>`).join("");
    const antH = pack.ant > 1900 ? String(pack.ant) : "Ano ant.";
    const headGrupo = (titulo) => `<th colspan="5">${titulo}</th>`;
    const sub = `<th>${caixaEsc(antH)}</th><th>Orç.</th><th>Real</th><th>Var. R$</th><th>Var. %</th>`;
    const total = { ant: 0, orc: 0, real: 0 };
    const totalA = { ant: 0, orc: 0, real: 0 };
    pack.rows.forEach((r) => {
      ["ant", "orc", "real"].forEach((k) => { total[k] += r.mensal[k]; totalA[k] += r.acum[k]; });
    });
    const body = pack.rows.map((r) => `<tr>
      <td class="rcx-nome" title="${caixaEsc(r.key)}">${caixaEsc(r.nome)}</td>
      ${this.blocoNums(r.mensal)}
      ${this.blocoNums(r.acum)}
    </tr>`).join("");
    const vazio = !anos.length
      ? `<p class="rcx-vazio">Suba o Excel do comparativo orçado × realizado, visão DFC, um arquivo por ano.</p>`
      : (!body ? `<p class="rcx-vazio">Nenhum valor nesse mês para os grupos desta aba.</p>` : "");
    const nota = lado === "entradas"
      ? "Grupos Receitas e Receitas financeiras da visão DFC. Centros da mesma obra somam no código 00. 14703, 14704, 14304 e 14305 ficam separados."
      : "Grupos Impostos, Custos, Despesas, Capex, Despesas financeiras e Amortizações. O mesmo agrupamento de centros de custo das entradas.";
    return `
      <div class="rcx-tools">
        <label class="rcx-up">Orçamento
          <input type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple onchange="ResultadoCaixaApp.subir(this)">
        </label>
        <label>Mês
          <select onchange="ResultadoCaixaApp.mes=Number(this.value);ResultadoCaixaApp.render()">${mesOpts}</select>
        </label>
        <div class="rcx-arqs">${arqs || `<span class="rcx-muted">Nenhum arquivo ainda.</span>`}</div>
      </div>
      <p class="rcx-nota">${nota}</p>
      ${this.error ? `<div class="rcx-erro">${caixaEsc(this.error)}</div>` : ""}
      ${this.lendo ? `<p class="rcx-muted">Lendo a planilha…</p>` : ""}
      ${vazio}
      ${body ? `<div class="rcx-scroll"><table class="rcx-grid">
        <thead>
          <tr><th rowspan="2">Produto</th>${headGrupo("Mensal")}${headGrupo("Acumulado")}</tr>
          <tr>${sub}${sub}</tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot><tr>
          <td>Total</td>
          ${this.blocoNums(total)}
          ${this.blocoNums(totalA)}
        </tr></tfoot>
      </table></div>` : ""}
    `;
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
    const corpo = aba === "posicao" ? this.posicaoHtml() : this.orcamentoHtml(aba);
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
  }
};

window.ResultadoCaixaApp = ResultadoCaixaApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "resultado-caixa") ResultadoCaixaApp.init();
});
