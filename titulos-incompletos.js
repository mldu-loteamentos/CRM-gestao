/**
 * Contas a Pagar · Títulos incompletos
 * Mesma leitura do Power BI: outcome por data de emissão (selectionType=I),
 * consistência N (Incompleto) ou I (Em inclusão).
 */
const TitulosIncompletosApp = {
  state: null,

  novo() {
    const hoje = this.hoje();
    return {
      startDate: this.isoShift(hoje, -30),
      endDate: hoje,
      busca: "",
      status: "todos",
      sort: "vencimento",
      dir: "asc",
      loading: false,
      erro: "",
      consultado: false,
      rows: []
    };
  },

  hoje() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  isoShift(iso, days) {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  dataBr(iso) {
    const s = String(iso || "").slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : (s || "—");
  },

  dataHora(v) {
    const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return this.dataBr(v);
    return m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] + ":" + m[5];
  },

  legenda(status) {
    if (status === "N") return "Incompleto";
    if (status === "I") return "Em inclusão";
    return status || "—";
  },

  init() {
    if (!this.state) this.state = this.novo();
    this.render();
    if (!this.state.consultado && !this.state.loading) this.consultar();
  },

  setCampo(k, v) {
    this.state[k] = v;
  },

  setStatus(id) {
    this.state.status = id;
    this.pintarCorpo();
  },

  ordenar(col) {
    if (this.state.sort === col) this.state.dir = this.state.dir === "asc" ? "desc" : "asc";
    else {
      this.state.sort = col;
      this.state.dir = col === "empresa" || col === "credor" || col === "criado" || col === "legenda" || col === "tipo" ? "asc" : "desc";
    }
    this.pintarCorpo();
  },

  endpoint(start, end) {
    return "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=I&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
  },

  async buscarFaixa(start, end, depth) {
    const fetchFn = window.siengeFetchWithRetry || window.siengeFetch;
    if (typeof fetchFn !== "function") throw new Error("A consulta ao Sienge não está disponível.");
    try {
      const payload = await fetchFn(this.endpoint(start, end), 2);
      return (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    } catch (err) {
      const grande = Number(err && err.status) === 507 || /\b507\b/.test(String((err && err.message) || ""));
      if (!grande || depth > 6 || start >= end) throw err;
      const s = new Date(start + "T12:00:00");
      const e = new Date(end + "T12:00:00");
      const midDate = new Date(s.getTime() + Math.floor((e - s) / 2));
      const mid = midDate.getFullYear() + "-" + String(midDate.getMonth() + 1).padStart(2, "0") + "-" + String(midDate.getDate()).padStart(2, "0");
      const next = this.isoShift(mid, 1);
      if (!(mid >= start && mid < end && next <= end)) throw err;
      const left = await this.buscarFaixa(start, mid, depth + 1);
      const right = await this.buscarFaixa(next, end, depth + 1);
      return left.concat(right);
    }
  },

  normalizar(bill) {
    const status = String(bill.consistencyStatus || "").trim().toUpperCase();
    if (status !== "N" && status !== "I") return null;
    return {
      empresa: String(bill.companyName || "").trim(),
      emissao: String(bill.issueDate || "").slice(0, 10),
      tipo: String(bill.documentIdentificationId || "").trim(),
      documento: String(bill.documentNumber || "").trim(),
      titulo: String(bill.billId || "").trim(),
      credor: String(bill.creditorName || "").trim(),
      criado: String(bill.registeredUserId || "").trim(),
      cadastrado: String(bill.registeredDate || ""),
      vencimento: String(bill.dueDate || "").slice(0, 10),
      status,
      legenda: this.legenda(status)
    };
  },

  async consultar() {
    const s = this.state;
    if (!s.startDate || !s.endDate) {
      s.erro = "Informe o período de emissão.";
      this.render();
      return;
    }
    if (s.startDate > s.endDate) {
      s.erro = "A emissão inicial não pode ser maior que a final.";
      this.render();
      return;
    }
    s.loading = true;
    s.erro = "";
    s.consultado = true;
    this.render();
    try {
      const bills = await this.buscarFaixa(s.startDate, s.endDate, 0);
      const vistos = new Set();
      const rows = [];
      (bills || []).forEach((bill) => {
        const row = this.normalizar(bill);
        if (!row) return;
        const chave = [row.titulo, row.vencimento, row.documento, row.tipo, row.empresa].join("|");
        if (vistos.has(chave)) return;
        vistos.add(chave);
        rows.push(row);
      });
      s.rows = rows;
      s.loading = false;
      this.render();
    } catch (err) {
      s.loading = false;
      s.erro = "Não consegui ler os títulos no Sienge. " + (err && err.message ? err.message : "");
      this.render();
    }
  },

  visiveis() {
    const s = this.state;
    const q = String(s.busca || "").trim().toLowerCase();
    let lista = s.rows.filter((r) => s.status === "todos" || r.status === s.status);
    if (q) {
      lista = lista.filter((r) => [r.empresa, r.credor, r.documento, r.titulo, r.tipo, r.criado, r.legenda].join(" ").toLowerCase().includes(q));
    }
    const dir = s.dir === "asc" ? 1 : -1;
    const campo = s.sort;
    lista = lista.slice().sort((a, b) => String(a[campo] || "").localeCompare(String(b[campo] || ""), "pt-BR", { numeric: true, sensitivity: "base" }) * dir);
    return lista;
  },

  contagens() {
    const n = this.state.rows.filter((r) => r.status === "N").length;
    const i = this.state.rows.filter((r) => r.status === "I").length;
    return { n, i, todos: this.state.rows.length };
  },

  th(col, rotulo) {
    return `<th onclick="TitulosIncompletosApp.ordenar('${col}')" style="cursor:pointer;user-select:none;">${rotulo} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
  },

  cabecalho() {
    return `<tr>${this.th("empresa", "Empresa")}${this.th("emissao", "Emissão")}${this.th("tipo", "Tipo documento")}${this.th("documento", "Documento")}${this.th("titulo", "Título")}${this.th("credor", "Credor")}${this.th("criado", "Criado por")}${this.th("cadastrado", "Cadastrado em")}${this.th("vencimento", "Vencimento")}${this.th("legenda", "Situação")}</tr>`;
  },

  linhas(lista) {
    const hoje = this.hoje();
    if (!lista.length) {
      return `<tr><td colspan="10" class="tin-vazio">${this.state.rows.length ? "Nenhum título com esse filtro." : "Nenhum título incompleto nesse período de emissão."}</td></tr>`;
    }
    return lista.map((r) => {
      const atrasado = r.vencimento && r.vencimento < hoje;
      return `<tr>
        <td title="${this.esc(r.empresa)}">${this.esc(r.empresa || "—")}</td>
        <td>${this.dataBr(r.emissao)}</td>
        <td>${this.esc(r.tipo || "—")}</td>
        <td><strong>${this.esc(r.documento || "—")}</strong></td>
        <td>${this.esc(r.titulo || "—")}</td>
        <td title="${this.esc(r.credor)}">${this.esc(r.credor || "—")}</td>
        <td>${this.esc(r.criado || "—")}</td>
        <td>${this.dataHora(r.cadastrado)}</td>
        <td class="${atrasado ? "tin-atraso" : ""}">${this.dataBr(r.vencimento)}</td>
        <td><span class="tin-tag tin-${r.status === "N" ? "inc" : "inc2"}">${this.esc(r.legenda)}</span></td>
      </tr>`;
    }).join("");
  },

  pintarCorpo() {
    if (this.state && this.state.loading) return;
    const body = document.getElementById("tin-body");
    const kpis = document.getElementById("tin-kpis");
    if (!body || !kpis) { this.render(); return; }
    const c = this.contagens();
    const s = this.state;
    kpis.innerHTML = this.kpisHtml(c, s.status);
    body.innerHTML = this.linhas(this.visiveis());
    const head = document.getElementById("tin-head");
    if (head) head.innerHTML = this.cabecalho();
    if (window.lucide) lucide.createIcons();
  },

  kpisHtml(c, status) {
    const item = (id, rotulo, qtd, cor) => `<button type="button" class="tin-kpi${status === id ? " is-on" : ""}" style="border-top-color:${cor}" onclick="TitulosIncompletosApp.setStatus('${id}')">
      <span>${rotulo}</span><strong>${qtd.toLocaleString("pt-BR")}</strong>
    </button>`;
    return item("todos", "No período", c.todos, "#105436")
      + item("N", "Incompletos", c.n, "#b91c1c")
      + item("I", "Em inclusão", c.i, "#c2410c");
  },

  async exportar() {
    const lista = this.visiveis();
    if (!lista.length) {
      alert("Não há títulos para exportar.");
      return;
    }
    const Inv = window.InvestimentoApp;
    let ExcelJS = window.ExcelJS;
    try {
      if (!ExcelJS && Inv && typeof Inv.ensureExcelJS === "function") ExcelJS = await Inv.ensureExcelJS();
    } catch (e) {
      ExcelJS = null;
    }
    if (!ExcelJS) {
      alert("Não foi possível carregar a biblioteca de Excel. Recarregue a página.");
      return;
    }
    const paint = (cell, opts) => (Inv && Inv.excelPaint ? Inv.excelPaint(cell, opts) : null);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Incompletos");
    ws.addRow(["Títulos incompletos"]);
    ws.addRow(["Emissão de " + this.dataBr(this.state.startDate) + " até " + this.dataBr(this.state.endDate)]);
    ws.addRow([]);
    const head = ws.addRow(["Empresa", "Emissão", "Tipo documento", "Documento", "Título", "Credor", "Criado por", "Cadastrado em", "Vencimento", "Situação"]);
    head.eachCell((cell) => paint(cell, { fill: "FF105436", font: { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }, align: { vertical: "middle" } }));
    lista.forEach((r) => {
      ws.addRow([r.empresa, this.dataBr(r.emissao), r.tipo, r.documento, r.titulo, r.credor, r.criado, this.dataHora(r.cadastrado), this.dataBr(r.vencimento), r.legenda]);
    });
    ws.columns.forEach((col) => { col.width = 22; });
    ws.getColumn(1).width = 42;
    ws.getColumn(6).width = 36;
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = "titulos_incompletos_" + this.hoje() + ".xlsx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },

  render() {
    const root = document.getElementById("titulos-incompletos-root");
    if (!root) return;
    if (!this.state) this.state = this.novo();
    const s = this.state;
    const c = this.contagens();
    const lista = s.loading ? [] : this.visiveis();
    root.innerHTML = `
      <style>
        #titulos-incompletos-root { padding: 16px 18px 28px; }
        #titulos-incompletos-root .tin-head { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
        #titulos-incompletos-root .tin-head h2 { margin:0; font-size:1.05rem; color:#105436; }
        #titulos-incompletos-root .tin-head small { display:block; color:#64748b; font-size:0.78rem; font-weight:500; margin-top:2px; }
        #titulos-incompletos-root .tin-card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
        #titulos-incompletos-root .tin-bar { display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; }
        #titulos-incompletos-root .tin-bar label { display:block; font-size:0.72rem; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:4px; }
        #titulos-incompletos-root .tin-bar input { height:36px; padding:0 10px; border:1px solid #cbd5e1; border-radius:4px; font:inherit; font-size:0.85rem; background:#fff; box-sizing:border-box; }
        #titulos-incompletos-root .tin-bar input[type="search"] { min-width:240px; }
        #titulos-incompletos-root .tin-kpis { display:grid; grid-template-columns:repeat(3, minmax(0, 180px)); gap:12px; margin:14px 0; }
        #titulos-incompletos-root .tin-kpi { text-align:left; background:#fff; border:1px solid #e2e8f0; border-top:4px solid #105436; border-radius:10px; padding:12px 14px; cursor:pointer; font:inherit; min-height:78px; }
        #titulos-incompletos-root .tin-kpi.is-on { background:#f0fdf4; box-shadow:inset 0 0 0 1px #105436; }
        #titulos-incompletos-root .tin-kpi span { display:block; font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; }
        #titulos-incompletos-root .tin-kpi strong { display:block; font-size:1.45rem; color:#0f172a; margin-top:2px; }
        #titulos-incompletos-root .tin-tablewrap { max-height:62vh; overflow:auto; border:1px solid #e2e8f0; border-radius:10px; }
        #titulos-incompletos-root table { width:100%; border-collapse:collapse; font-size:0.82rem; }
        #titulos-incompletos-root thead th { position:sticky; top:0; background:#f8fafc; color:#105436; padding:10px; text-align:left; font-weight:700; z-index:1; border-bottom:2px solid #105436; }
        #titulos-incompletos-root td { padding:9px 10px; border-bottom:1px solid #e2e8f0; white-space:nowrap; max-width:280px; overflow:hidden; text-overflow:ellipsis; }
        #titulos-incompletos-root tbody tr:nth-child(even) { background:#f8faf9; }
        #titulos-incompletos-root tbody tr:hover td { background:#e7f6ee; }
        #titulos-incompletos-root .tin-id { color:#94a3b8; font-weight:500; }
        #titulos-incompletos-root .tin-atraso { color:#b91c1c; font-weight:700; }
        #titulos-incompletos-root .tin-tag { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700; }
        #titulos-incompletos-root .tin-inc { background:#fee2e2; color:#b91c1c; }
        #titulos-incompletos-root .tin-inc2 { background:#ffedd5; color:#c2410c; }
        #titulos-incompletos-root .tin-vazio { text-align:center; color:#64748b; padding:28px; }
        #titulos-incompletos-root .tin-erro { margin-top:12px; color:#b91c1c; font-size:0.85rem; }
        #titulos-incompletos-root .tin-load { display:flex; flex-direction:column; align-items:center; gap:12px; padding:48px 16px; color:#105436; font-weight:600; }
        #titulos-incompletos-root .tin-track { width:min(420px, 100%); height:8px; background:#e2e8f0; border-radius:99px; overflow:hidden; }
        #titulos-incompletos-root .tin-barfill { height:100%; width:45%; background:#105436; border-radius:99px; animation:tin-run 1.1s ease-in-out infinite; }
        @keyframes tin-run { 0% { transform:translateX(-120%); } 100% { transform:translateX(280%); } }
      </style>
      <div class="tin-head">
        <i data-lucide="file-warning" style="width:22px;height:22px;color:#105436;"></i>
        <div>
          <h2>Títulos incompletos</h2>
          <small>Contas a pagar com emissão no período e consistência Incompleto ou Em inclusão</small>
        </div>
      </div>
      <div class="tin-card">
        <div class="tin-bar">
          <div><label for="tin-de">Emissão de</label><input id="tin-de" type="date" value="${this.esc(s.startDate)}" onchange="TitulosIncompletosApp.setCampo('startDate', this.value)"></div>
          <div><label for="tin-ate">Emissão até</label><input id="tin-ate" type="date" value="${this.esc(s.endDate)}" onchange="TitulosIncompletosApp.setCampo('endDate', this.value)"></div>
          <div><label for="tin-q">Buscar</label><input id="tin-q" type="search" placeholder="Empresa, credor ou documento" value="${this.esc(s.busca)}" oninput="TitulosIncompletosApp.setCampo('busca', this.value); TitulosIncompletosApp.pintarCorpo()"></div>
          <button type="button" class="btn btn-primary" style="height:36px;" onclick="TitulosIncompletosApp.consultar()" ${s.loading ? "disabled" : ""}><i data-lucide="search" style="width:14px;height:14px;"></i> Consultar</button>
          <button type="button" class="btn btn-excel" onclick="TitulosIncompletosApp.exportar()" title="Exportar tabela atual para Excel"><i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel</button>
        </div>
        ${s.erro ? `<p class="tin-erro">${this.esc(s.erro)}</p>` : ""}
      </div>
      ${s.loading ? `<div class="tin-card" style="margin-top:14px;"><div class="tin-load"><div class="loading-spinner"></div><div>Buscando títulos incompletos no Sienge…</div><div class="tin-track"><div class="tin-barfill"></div></div></div></div>` : `
      <div class="tin-kpis" id="tin-kpis">${this.kpisHtml(c, s.status)}</div>
      <div class="tin-tablewrap"><table>
        <thead id="tin-head">${this.cabecalho()}</thead>
        <tbody id="tin-body">${this.linhas(lista)}</tbody>
      </table></div>`}
    `;
    if (window.lucide) lucide.createIcons();
  }
};

window.TitulosIncompletosApp = TitulosIncompletosApp;
document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "titulos-incompletos") TitulosIncompletosApp.init();
});
