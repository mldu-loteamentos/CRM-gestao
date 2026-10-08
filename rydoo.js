/* Financeiro · Contas a pagar · Rydoo
   Importa o Excel aprovado no Rydoo e confere a classificação. */
const RydooApp = {
  state: {
    rows: [],
    fileName: "",
    pessoa: "",
    status: "",
    q: "",
    sortKey: "data",
    sortDir: "asc",
    error: "",
    view: "linhas",
    groups: [],
    preparing: false,
    prepMsg: ""
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  fold(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  },

  money(n) {
    if (n == null || !Number.isFinite(n)) return "";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  num(v) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const t = String(v == null ? "" : v).trim();
    if (!t) return null;
    const n = t.indexOf(",") >= 0
      ? Number(t.replace(/\./g, "").replace(",", "."))
      : Number(t);
    return Number.isFinite(n) ? n : null;
  },

  dateText(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
      const d = String(v.getDate()).padStart(2, "0");
      const m = String(v.getMonth() + 1).padStart(2, "0");
      return d + "/" + m + "/" + v.getFullYear();
    }
    if (typeof v === "number" && v > 20000 && v < 80000) {
      const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return this.dateText(utc);
    }
    const t = String(v == null ? "" : v).trim();
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + "/" + m[2] + "/" + m[1];
    return t;
  },

  dateKey(v) {
    const t = this.dateText(v);
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? m[3] + m[2] + m[1] : t;
  },

  text(v) {
    if (v == null) return "";
    if (v instanceof Date) return this.dateText(v);
    return String(v).trim();
  },

  init() {
    this.render();
  },

  onFile(input) {
    const file = input && input.files && input.files[0];
    if (input) input.value = "";
    if (!file) return;
    if (typeof XLSX === "undefined") {
      this.state.error = "A biblioteca de Excel não carregou. Atualize a página.";
      this.render();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
        const parsed = this.parseMatrix(aoa);
        if (!parsed.ok) {
          this.state.error = parsed.error;
          this.render();
          return;
        }
        this.state.rows = parsed.rows;
        this.state.fileName = file.name;
        this.state.error = "";
        this.state.pessoa = "";
        this.state.status = "";
        this.state.q = "";
        this.state.view = "linhas";
        this.state.groups = [];
        this.state.prepMsg = "";
        this._prepGen = (this._prepGen || 0) + 1;
        this.render();
      } catch (e) {
        this.state.error = "Não consegui ler esse arquivo.";
        this.render();
      }
    };
    reader.readAsArrayBuffer(file);
  },

  parseMatrix(aoa) {
    const grid = Array.isArray(aoa) ? aoa : [];
    let headerAt = -1;
    for (let i = 0; i < Math.min(grid.length, 15); i++) {
      const names = (grid[i] || []).map((c) => this.fold(c));
      if (names.indexOf("data da transacao") >= 0 && names.indexOf("agrupar por") >= 0 && names.indexOf("valor") >= 0) {
        headerAt = i;
        break;
      }
    }
    if (headerAt < 0) {
      return { ok: false, error: "Não reconheci o Excel do Rydoo. A planilha precisa ter Agrupar por, Data da transação e Valor." };
    }
    const header = (grid[headerAt] || []).map((c) => this.fold(c));
    const col = (name) => header.indexOf(name);
    const idx = {
      pessoa: col("agrupar por"),
      data: col("data da transacao"),
      valor: col("valor"),
      aprovacao: col("data de aprovacao"),
      categoria: col("categoria"),
      conta: col("conta contabil"),
      comentario: col("comentario"),
      tipo: col("tipo"),
      cc: col("centro de custo"),
      aprovador: col("aprovada por"),
      finalizacao: col("data de finalizacao"),
      pagamento: col("nome do metodo de pagamento"),
      hierCat: col("categorias hierarquicas"),
      hierConta: col("numeros das categorias hierarquicas"),
      invalid: col("invalidreason"),
      validation: col("validationstatus"),
      estabelecimento: col("estabelecimento"),
      xpd: col("xpdreference"),
      grupo: col("grupo"),
      filial: col("filial")
    };
    const pick = (row, key, asDate) => {
      const i = idx[key];
      if (i < 0) return "";
      return asDate ? this.dateText(row[i]) : this.text(row[i]);
    };
    const rows = [];
    for (let r = headerAt + 1; r < grid.length; r++) {
      const line = grid[r] || [];
      const pessoa = pick(line, "pessoa");
      const valor = this.num(idx.valor >= 0 ? line[idx.valor] : "");
      if (!pessoa && valor == null) continue;
      rows.push({
        pessoa: pessoa,
        data: pick(line, "data", true),
        valor: valor,
        aprovacao: pick(line, "aprovacao", true),
        categoria: pick(line, "categoria"),
        conta: pick(line, "conta"),
        comentario: pick(line, "comentario"),
        tipo: pick(line, "tipo"),
        cc: pick(line, "cc"),
        aprovador: pick(line, "aprovador"),
        finalizacao: pick(line, "finalizacao", true),
        pagamento: pick(line, "pagamento"),
        hierCat: pick(line, "hierCat"),
        hierConta: pick(line, "hierConta"),
        invalid: pick(line, "invalid"),
        validation: pick(line, "validation"),
        estabelecimento: pick(line, "estabelecimento"),
        xpd: pick(line, "xpd"),
        grupo: pick(line, "grupo"),
        filial: pick(line, "filial")
      });
    }
    this.classify(rows);
    return { ok: true, rows: rows };
  },

  contaKey(s) {
    return String(s || "").replace(/\s+/g, "").replace(/,/g, ".");
  },

  classify(rows) {
    const buckets = {};
    rows.forEach((r) => {
      const cat = this.fold(r.categoria);
      const conta = this.contaKey(r.conta);
      if (!cat || !conta) return;
      if (!buckets[cat]) buckets[cat] = {};
      buckets[cat][conta] = (buckets[cat][conta] || 0) + 1;
    });
    const padrao = {};
    Object.keys(buckets).forEach((cat) => {
      let best = "";
      let n = 0;
      let tie = false;
      Object.keys(buckets[cat]).forEach((conta) => {
        const q = buckets[cat][conta];
        if (q > n) { best = conta; n = q; tie = false; }
        else if (q === n) tie = true;
      });
      if (best && !tie) padrao[cat] = best;
    });
    rows.forEach((r) => {
      const red = [];
      const amber = [];
      const conta = this.contaKey(r.conta);
      const hierConta = this.contaKey(r.hierConta);
      const expected = padrao[this.fold(r.categoria)] || "";
      if (r.hierCat && this.fold(r.hierCat) !== this.fold(r.categoria)) {
        red.push("Categoria " + r.categoria + " diferente da hierárquica " + r.hierCat);
      }
      if (hierConta && conta && hierConta !== conta) {
        red.push("Conta " + r.conta + " diferente da hierárquica " + r.hierConta);
      }
      if (expected && conta && conta !== expected) {
        red.push("Conta " + r.conta + " fora do padrão " + expected + " da categoria " + r.categoria);
      }
      if (/plano financeiro|trocar a conta|outra conta/i.test(r.comentario || "")) {
        red.push("Comentário pede outra classificação");
      }
      const policy = [r.invalid, r.validation].filter(Boolean).join(" — ");
      if (policy) red.push(policy);
      if (r.valor != null && r.valor < 0) amber.push("Ajuste negativo");
      if (!r.aprovacao) amber.push("Sem data de aprovação");
      if (!r.cc) amber.push("Sem centro de custo");
      r.level = red.length ? "divergente" : (amber.length ? "revisar" : "ok");
      r.why = red.concat(amber).join(" · ");
      r.padrao = expected;
    });
  },

  limpar() {
    this._prepGen = (this._prepGen || 0) + 1;
    this.state.rows = [];
    this.state.fileName = "";
    this.state.error = "";
    this.state.pessoa = "";
    this.state.status = "";
    this.state.q = "";
    this.state.view = "linhas";
    this.state.groups = [];
    this.state.preparing = false;
    this.state.prepMsg = "";
    this.render();
  },

  pessoas() {
    const set = {};
    this.state.rows.forEach((r) => { if (r.pessoa) set[r.pessoa] = true; });
    return Object.keys(set).sort((a, b) => a.localeCompare(b, "pt"));
  },

  visible() {
    const q = this.fold(this.state.q);
    const list = this.state.rows.filter((r) => {
      if (this.state.pessoa && r.pessoa !== this.state.pessoa) return false;
      if (this.state.status && r.level !== this.state.status) return false;
      if (!q) return true;
      const blob = this.fold([r.pessoa, r.categoria, r.conta, r.comentario, r.cc, r.tipo, r.pagamento, r.aprovador, r.why].join(" "));
      return blob.indexOf(q) >= 0;
    });
    const key = this.state.sortKey;
    const dir = this.state.sortDir === "desc" ? -1 : 1;
    list.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (key === "valor") return ((av || 0) - (bv || 0)) * dir;
      if (key === "data" || key === "aprovacao" || key === "finalizacao") {
        return this.dateKey(av).localeCompare(this.dateKey(bv)) * dir;
      }
      return this.fold(av).localeCompare(this.fold(bv), "pt") * dir;
    });
    return list;
  },

  toggleSort(key) {
    if (this.state.sortKey === key) this.state.sortDir = this.state.sortDir === "asc" ? "desc" : "asc";
    else { this.state.sortKey = key; this.state.sortDir = "asc"; }
    this.renderList();
  },

  onFilter(key, value) {
    this.state[key] = value;
    this.renderList();
    this.renderKpis();
  },

  render() {
    const root = document.getElementById("rydoo-root");
    if (!root) return;
    const s = this.state;
    const pessoas = this.pessoas();
    root.innerHTML = `
      <style>
        #rydoo-root { padding: 16px 18px 28px; }
        #rydoo-root .rydoo-card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px 12px; }
        #rydoo-root .rydoo-bar { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
        #rydoo-root .rydoo-field { display:flex; flex-direction:column; gap:4px; min-width:160px; }
        #rydoo-root .rydoo-field label { font-size:11px; font-weight:700; letter-spacing:.04em; color:#64748b; }
        #rydoo-root .rydoo-field input, #rydoo-root .rydoo-field select { height:36px; }
        #rydoo-root .rydoo-hint { margin:10px 0 0; color:#64748b; font-size:12.5px; }
        #rydoo-root .rydoo-kpis { display:flex; flex-wrap:wrap; gap:10px; margin:12px 0; }
        #rydoo-root .rydoo-kpi { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px; min-width:140px; }
        #rydoo-root .rydoo-kpi b { display:block; font-size:18px; color:#105436; }
        #rydoo-root .rydoo-kpi span { font-size:12px; color:#64748b; }
        #rydoo-root .rydoo-table-wrap { overflow:auto; background:#fff; border:1px solid #e2e8f0; border-radius:12px; }
        #rydoo-root table { width:max-content; min-width:100%; border-collapse:collapse; font-size:13px; }
        #rydoo-root th { position:sticky; top:0; background:#f8fafc; color:#105436; text-align:left; padding:8px 10px; border-bottom:1px solid #e2e8f0; white-space:nowrap; }
        #rydoo-root td { padding:8px 10px; border-bottom:1px solid #f1f5f9; vertical-align:top; max-width:280px; }
        #rydoo-root th.rydoo-sticky, #rydoo-root td.rydoo-sticky { position:sticky; left:0; z-index:1; background:#fff; min-width:220px; max-width:320px; }
        #rydoo-root th.rydoo-sticky { z-index:3; background:#f8fafc; }
        #rydoo-root tr.rydoo-row-divergente td { background:#fff7f7; }
        #rydoo-root tr.rydoo-row-revisar td { background:#fffaf3; }
        #rydoo-root tr.rydoo-row-divergente td.rydoo-sticky { background:#fff7f7; }
        #rydoo-root tr.rydoo-row-revisar td.rydoo-sticky { background:#fffaf3; }
        #rydoo-root .rydoo-tag { display:inline-block; border-radius:999px; padding:2px 8px; font-size:12px; font-weight:700; }
        #rydoo-root .rydoo-tag-ok { background:#dcfce7; color:#166534; }
        #rydoo-root .rydoo-tag-revisar { background:#ffedd5; color:#c2410c; }
        #rydoo-root .rydoo-tag-divergente { background:#fee2e2; color:#b91c1c; }
        #rydoo-root .rydoo-why { margin-top:4px; color:#475569; font-size:12px; }
        #rydoo-root .rydoo-empty, #rydoo-root .rydoo-error { padding:22px; color:#64748b; }
        #rydoo-root .rydoo-error { color:#b91c1c; }
        #rydoo-root .rydoo-file { margin-left:auto; color:#64748b; font-size:12px; align-self:center; }
        #rydoo-root .rydoo-groups { display:flex; flex-direction:column; gap:12px; }
        #rydoo-root .rydoo-credor { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
        #rydoo-root .rydoo-credor h3 { margin:0; font-size:16px; color:#0f172a; }
        #rydoo-root .rydoo-credor-top { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; }
        #rydoo-root .rydoo-meta { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; }
        #rydoo-root .rydoo-meta > div { flex:1; min-width:220px; background:#f8fafc; border-radius:8px; padding:8px 10px; }
        #rydoo-root .rydoo-meta > div > span { display:block; font-size:11px; font-weight:700; letter-spacing:.04em; color:#64748b; }
        #rydoo-root .rydoo-meta .rydoo-tag { display:inline-block; margin-top:4px; }
        #rydoo-root .rydoo-note { margin:8px 0 0; font-size:12.5px; color:#9a3412; }
        #rydoo-root .rydoo-accounts { width:100%; margin-top:12px; border-collapse:collapse; }
        #rydoo-root .rydoo-accounts td { padding:6px 8px; border-bottom:1px solid #f1f5f9; }
      </style>
      <div class="rydoo-card">
        <div class="rydoo-bar">
          <label class="btn btn-primary btn-sm" style="margin:0;height:36px;">
            <i data-lucide="upload" style="width:14px;height:14px;"></i> Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="RydooApp.onFile(this)">
          </label>
          <button type="button" class="btn btn-cancel btn-sm" style="height:36px;" onclick="RydooApp.limpar()" ${s.rows.length ? "" : "disabled"}>Limpar</button>
          <button type="button" class="btn btn-sm ${s.view === "linhas" ? "btn-primary" : ""}" style="height:36px;" onclick="RydooApp.setView('linhas')" ${s.rows.length ? "" : "disabled"}>Lançamentos</button>
          <button type="button" class="btn btn-sm ${s.view === "credores" ? "btn-primary" : ""}" style="height:36px;" onclick="RydooApp.setView('credores')" ${s.groups.length ? "" : "disabled"}>Por credor</button>
          <button type="button" class="btn btn-primary btn-sm" style="height:36px;" onclick="RydooApp.preparar()" ${s.rows.length && !s.preparing ? "" : "disabled"}>${s.preparing ? "Preparando…" : "Agrupar reembolso"}</button>
          <div class="rydoo-field">
            <label>AGRUPAR POR</label>
            <select class="form-control" onchange="RydooApp.onFilter('pessoa', this.value)">
              <option value="">Todos</option>
              ${pessoas.map((p) => `<option value="${this.esc(p)}" ${s.pessoa === p ? "selected" : ""}>${this.esc(p)}</option>`).join("")}
            </select>
          </div>
          <div class="rydoo-field">
            <label>CLASSIFICAÇÃO</label>
            <select class="form-control" onchange="RydooApp.onFilter('status', this.value)">
              <option value="" ${s.status === "" ? "selected" : ""}>Todas</option>
              <option value="divergente" ${s.status === "divergente" ? "selected" : ""}>Divergentes</option>
              <option value="revisar" ${s.status === "revisar" ? "selected" : ""}>A revisar</option>
              <option value="ok" ${s.status === "ok" ? "selected" : ""}>Ok</option>
            </select>
          </div>
          <div class="rydoo-field" style="flex:1;min-width:220px;">
            <label>BUSCAR</label>
            <input class="form-control" value="${this.esc(s.q)}" placeholder="Pessoa, categoria, conta, comentário" oninput="RydooApp.onFilter('q', this.value)">
          </div>
          ${s.fileName ? `<div class="rydoo-file">${this.esc(s.fileName)}</div>` : ""}
        </div>
        <p class="rydoo-hint">${this.esc(s.prepMsg || "Depois da aprovação no Rydoo, importe o Excel. A classificação compara a conta com o padrão da categoria, com a hierárquica e com o comentário. Agrupar reembolso busca o credor, se é colaborador, a descrição no plano financeiro e os dados bancários, e gera o PDF de cada pessoa.")}</p>
      </div>
      <div id="rydoo-kpis"></div>
      <div id="rydoo-list"></div>`;
    this.renderKpis();
    this.renderList();
    if (window.lucide) lucide.createIcons();
  },

  renderKpis() {
    const box = document.getElementById("rydoo-kpis");
    if (!box) return;
    const rows = this.state.rows;
    if (!rows.length) { box.innerHTML = ""; return; }
    const shown = this.visible();
    const sum = (list) => list.reduce((a, r) => a + (Number.isFinite(r.valor) ? r.valor : 0), 0);
    const count = (level) => rows.filter((r) => r.level === level).length;
    box.innerHTML = `<div class="rydoo-kpis">
      <div class="rydoo-kpi"><b>${rows.length}</b><span>Lançamentos</span></div>
      <div class="rydoo-kpi"><b>${this.money(sum(rows))}</b><span>Valor</span></div>
      <div class="rydoo-kpi"><b>${count("ok")}</b><span>Classificação ok</span></div>
      <div class="rydoo-kpi"><b>${count("divergente")}</b><span>Divergentes</span></div>
      <div class="rydoo-kpi"><b>${count("revisar")}</b><span>A revisar</span></div>
      <div class="rydoo-kpi"><b>${shown.length}</b><span>Na tela · ${this.money(sum(shown))}</span></div>
    </div>`;
  },

  renderList() {
    const box = document.getElementById("rydoo-list");
    if (!box) return;
    if (this.state.error) {
      box.innerHTML = `<div class="rydoo-table-wrap"><div class="rydoo-error">${this.esc(this.state.error)}</div></div>`;
      return;
    }
    if (!this.state.rows.length) {
      box.innerHTML = `<div class="rydoo-table-wrap"><div class="rydoo-empty">Nenhum Excel importado.</div></div>`;
      return;
    }
    if (this.state.preparing && this.state.view !== "credores") {
      box.innerHTML = `<div class="rydoo-table-wrap"><div class="rydoo-empty">${this.esc(this.state.prepMsg || "Preparando o reembolso…")}</div></div>`;
      return;
    }
    if (this.state.view === "credores") {
      this.renderGroups();
      return;
    }
    const th = (key, label) => `<th onclick="RydooApp.toggleSort('${key}')" style="cursor:pointer;user-select:none;">${label} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
    const rows = this.visible();
    const tag = (r) => {
      const label = r.level === "ok" ? "Ok" : (r.level === "revisar" ? "Revisar" : "Divergente");
      return `<span class="rydoo-tag rydoo-tag-${r.level}">${label}</span>${r.why ? `<div class="rydoo-why">${this.esc(r.why)}</div>` : ""}`;
    };
    const td = (v) => `<td>${this.esc(v)}</td>`;
    box.innerHTML = `<div class="rydoo-table-wrap"><table>
      <thead><tr>
        <th class="rydoo-sticky" onclick="RydooApp.toggleSort('level')" style="cursor:pointer;user-select:none;">Classificação <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>
        ${th("pessoa", "Agrupar por")}
        ${th("data", "Data da transação")}
        ${th("valor", "Valor")}
        ${th("aprovacao", "Data de aprovação")}
        ${th("categoria", "Categoria")}
        ${th("conta", "Conta contábil")}
        ${th("comentario", "Comentário")}
        ${th("tipo", "Tipo")}
        ${th("cc", "Centro de custo")}
        ${th("aprovador", "Aprovada por")}
        ${th("finalizacao", "Data de finalização")}
        ${th("pagamento", "Método de pagamento")}
        ${th("hierCat", "Categorias hierárquicas")}
      </tr></thead>
      <tbody>
        ${rows.map((r) => `<tr class="rydoo-row-${r.level}">
          <td class="rydoo-sticky">${tag(r)}</td>
          ${td(r.pessoa)}
          ${td(r.data)}
          <td style="text-align:right;white-space:nowrap;">${this.esc(this.money(r.valor))}</td>
          ${td(r.aprovacao)}
          ${td(r.categoria)}
          <td>${this.esc(r.conta)}${this.contaNome(r.conta) ? `<div class="rydoo-why">${this.esc(this.contaNome(r.conta))}</div>` : ""}</td>
          ${td(r.comentario)}
          ${td(r.tipo)}
          ${td(r.cc)}
          ${td(r.aprovador)}
          ${td(r.finalizacao)}
          ${td(r.pagamento)}
          ${td(r.hierCat)}
        </tr>`).join("")}
        ${rows.length ? "" : `<tr><td colspan="14" class="rydoo-empty">Nenhuma linha com esse filtro.</td></tr>`}
      </tbody>
    </table></div>`;
    if (window.lucide) lucide.createIcons();
  },

  setView(view) {
    if (view === "credores" && !this.state.groups.length) return;
    this.state.view = view;
    this.render();
  },

  dottedCode(id) {
    const raw = String(id == null ? "" : id).trim();
    if (!raw) return "";
    if (raw.indexOf(".") >= 0) return raw.replace(/^\.+|\.+$/g, "");
    if (!/^\d+$/.test(raw) || raw.length < 3) return raw;
    const first = raw.charAt(0);
    let rest = raw.slice(1);
    if (rest.length % 2 === 1) rest = "0" + rest;
    return [first].concat(rest.match(/.{2}/g) || []).join(".");
  },

  contaNome(code) {
    const map = this._accounts || {};
    const key = this.contaKey(code);
    if (!key) return "";
    return map[key] || map[key.replace(/\./g, "")] || map[this.dottedCode(key.replace(/\./g, ""))] || "";
  },

  async preparar() {
    if (this.state.preparing || !this.state.rows.length) return;
    if (typeof siengeFetchWithRetry !== "function") {
      this.state.error = "A API do Sienge não está disponível nesta tela.";
      this.render();
      return;
    }
    const gen = (this._prepGen || 0) + 1;
    this._prepGen = gen;
    this.state.preparing = true;
    this.state.error = "";
    this.state.prepMsg = "Lendo o plano financeiro…";
    this.render();
    try {
      await this.loadAccounts();
      if (this._prepGen !== gen) return;
      await this.loadCreditors((msg) => {
        if (this._prepGen !== gen) return;
        this.state.prepMsg = msg;
        const hint = document.querySelector("#rydoo-root .rydoo-hint");
        if (hint) hint.textContent = msg;
      });
      if (this._prepGen !== gen) return;
      this.state.groups = this.buildGroups();
      this.state.view = "credores";
      this.state.prepMsg = "Lendo dados bancários…";
      this.render();
      await this.loadBanks(this.state.groups);
      if (this._prepGen !== gen) return;
      this.state.preparing = false;
      this.state.prepMsg = "";
      this.render();
    } catch (e) {
      if (this._prepGen !== gen) return;
      this.state.preparing = false;
      this.state.prepMsg = "";
      this.state.error = (e && e.message) ? e.message : "Não consegui montar o reembolso.";
      this.render();
    }
  },

  async loadAccounts() {
    if (this._accounts) return;
    const map = {};
    let offset = 0;
    let total = null;
    let guard = 0;
    do {
      const res = await siengeFetchWithRetry("/payment-categories?limit=200&offset=" + offset);
      const list = (res && res.results) || (Array.isArray(res) ? res : []);
      if (total == null) total = (res && res.resultSetMetadata && res.resultSetMetadata.count) || list.length;
      list.forEach((c) => {
        const name = String((c && (c.name || c.description)) || "").trim();
        const id = String(c && c.id != null ? c.id : "").trim();
        if (!name || !id) return;
        map[id] = name;
        const dotted = this.dottedCode(id);
        if (dotted) map[dotted] = name;
        const bare = dotted.replace(/\./g, "");
        if (bare) map[bare] = name;
      });
      if (!list.length) break;
      offset += list.length;
      guard += 1;
    } while (offset < total && guard < 20);
    if (!Object.keys(map).length) throw new Error("O plano financeiro não retornou contas.");
    this._accounts = map;
  },

  async loadCreditors(onProgress) {
    if (this._creditors && this._creditors.length) return;
    const all = [];
    let offset = 0;
    let total = null;
    do {
      const res = await siengeFetchWithRetry("/creditors?limit=200&offset=" + offset);
      const results = (res && res.results) || [];
      if (total == null) {
        total = (res && res.resultSetMetadata && res.resultSetMetadata.count) || results.length;
      }
      results.forEach((c) => {
        all.push({
          id: c.id,
          name: c.name || "",
          tradeName: c.tradeName || "",
          employee: c.employee,
          active: c.active === true || c.active === "S" || c.active === "true"
        });
      });
      offset += 200;
      if (onProgress) onProgress("Lendo credores " + Math.min(offset, total) + " de " + total + "…");
      if (!results.length) break;
      if (offset < total) await new Promise((r) => setTimeout(r, 200));
    } while (offset < total);
    this._creditors = all;
  },

  matchCreditor(pessoa) {
    const tokens = this.fold(pessoa).split(" ").filter((t) => t.length > 1);
    const scored = [];
    (this._creditors || []).forEach((c) => {
      const name = this.fold(c.name);
      const trade = this.fold(c.tradeName);
      const blob = (name + " " + trade).trim();
      if (!tokens.length || !tokens.every((t) => blob.indexOf(t) >= 0)) return;
      let score = 0;
      if (trade && trade === this.fold(pessoa)) score += 100;
      if (name === this.fold(pessoa)) score += 80;
      if (c.employee === "S" || c.employee === true) score += 30;
      if (c.active) score += 10;
      score -= Math.abs(name.split(" ").filter(Boolean).length - tokens.length);
      scored.push({ c: c, score: score });
    });
    scored.sort((a, b) => b.score - a.score || Number(a.c.id) - Number(b.c.id));
    if (!scored.length) return { creditor: null, options: [], ambiguous: false };
    const top = scored.filter((x) => x.score === scored[0].score).map((x) => x.c);
    return { creditor: top.length === 1 ? top[0] : null, options: top, ambiguous: top.length > 1 };
  },

  buildGroups() {
    const by = new Map();
    this.state.rows.forEach((r) => {
      const key = r.pessoa || "(sem nome)";
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(r);
    });
    const groups = [];
    by.forEach((rows, pessoa) => {
      const match = this.matchCreditor(pessoa);
      groups.push({
        pessoa: pessoa,
        rows: rows,
        creditor: match.creditor,
        options: match.options,
        ambiguous: match.ambiguous,
        bank: null,
        banks: [],
        bankStatus: match.creditor ? "loading" : ""
      });
    });
    groups.sort((a, b) => this.fold(a.pessoa).localeCompare(this.fold(b.pessoa), "pt"));
    return groups;
  },

  async loadBanks(groups) {
    const pending = groups.filter((g) => g.creditor && g.creditor.id != null);
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const g = pending[cursor++];
        await this.loadBank(g);
      }
    };
    const n = Math.min(3, pending.length);
    const jobs = [];
    for (let i = 0; i < n; i++) jobs.push(worker());
    await Promise.all(jobs);
  },

  async loadBank(g) {
    const id = g.creditor && g.creditor.id;
    if (id == null) {
      g.bankStatus = "";
      return;
    }
    g.bankStatus = "loading";
    try {
      if (!this._banks) this._banks = {};
      if (!this._banks[id]) {
        const res = await siengeFetchWithRetry("/creditors/" + encodeURIComponent(id) + "/bank-informations");
        this._banks[id] = (res && res.results) || (Array.isArray(res) ? res : []);
      }
      g.banks = this._banks[id];
      g.bank = this.bancoPrincipal(g.banks);
      g.bankStatus = "ok";
    } catch (e) {
      g.bankStatus = "erro";
    }
  },

  bancoPrincipal(list) {
    const rows = Array.isArray(list) ? list : [];
    return rows.find((b) => b.defaultFlag === "S" || b.defaultFlag === true || b.defaultFlag === "Y" || b.defaultFlag === 1) || rows[0] || null;
  },

  tipoConta(t) {
    const s = String(t || "").toUpperCase();
    if (s === "C" || s === "CHECKING") return "Conta corrente";
    if (s === "P" || s === "SAVING" || s === "SAVINGS") return "Poupança";
    if (s === "I" || s === "INVESTMENT") return "Investimento";
    return s;
  },

  bancoTexto(b) {
    if (!b) return "";
    const acc = String(b.accountNumber || "") + (b.checkDigit ? "-" + b.checkDigit : "");
    const nome = b.nameOfBank || "";
    const codigo = b.bank ? String(b.bank) : "";
    const banco = nome ? (codigo ? nome + " (" + codigo + ")" : nome) : codigo;
    return [banco, b.agency ? "Ag. " + b.agency : "", acc ? "Cc " + acc : "", this.tipoConta(b.accountType)].filter(Boolean).join(" · ");
  },

  colaborador(c) {
    return !!(c && (c.employee === "S" || c.employee === true || c.employee === "true"));
  },

  soma(rows) {
    return rows.reduce((a, r) => a + (Number.isFinite(r.valor) ? r.valor : 0), 0);
  },

  mode(rows, key, fallback) {
    const count = {};
    rows.forEach((r) => {
      const v = String(r[key] || "").trim();
      if (v) count[v] = (count[v] || 0) + 1;
    });
    const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    return best || fallback || "";
  },

  competencia(rows) {
    const count = {};
    rows.forEach((r) => {
      const key = this.dateKey(r.data).slice(0, 6);
      if (/^\d{6}$/.test(key)) count[key] = (count[key] || 0) + 1;
    });
    const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    if (!best) return "";
    return best.slice(4) + "." + best.slice(0, 4);
  },

  contasDoGrupo(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const key = this.contaKey(r.conta) || "(sem conta)";
      if (!map.has(key)) {
        map.set(key, { conta: r.conta || "", nome: this.contaNome(r.conta), valor: 0, n: 0 });
      }
      const item = map.get(key);
      item.valor += Number.isFinite(r.valor) ? r.valor : 0;
      item.n += 1;
      if (!item.nome) item.nome = this.contaNome(r.conta);
    });
    return Array.from(map.values());
  },

  arg(pessoa) {
    return encodeURIComponent(pessoa);
  },

  async escolher(pessoa, id) {
    const g = this.state.groups.find((x) => x.pessoa === pessoa);
    const c = (this._creditors || []).find((x) => String(x.id) === String(id));
    if (!g || !c) return;
    g.creditor = c;
    g.bank = null;
    g.bankStatus = "loading";
    this.renderGroups();
    await this.loadBank(g);
    this.renderGroups();
  },

  renderGroups() {
    const box = document.getElementById("rydoo-list");
    if (!box) return;
    const groups = this.state.groups;
    if (!groups.length) {
      box.innerHTML = `<div class="rydoo-table-wrap"><div class="rydoo-empty">Agrupar reembolso ainda não foi executado.</div></div>`;
      return;
    }
    box.innerHTML = `<div class="rydoo-groups">${groups.map((g) => this.groupCard(g)).join("")}</div>`;
    if (window.lucide) lucide.createIcons();
  },

  groupCard(g) {
    const pessoa = this.arg(g.pessoa);
    const total = this.money(this.soma(g.rows));
    const comp = this.competencia(g.rows);
    const divergente = g.rows.filter((r) => r.level === "divergente").length;
    const c = g.creditor;
    let credorHtml = "";
    if (g.options.length > 1) {
      credorHtml = `<select class="form-control" onchange="RydooApp.escolher(decodeURIComponent('${pessoa}'), this.value)">
        <option value="">Escolha o cadastro</option>
        ${g.options.map((o) => `<option value="${this.esc(o.id)}" ${c && String(c.id) === String(o.id) ? "selected" : ""}>${this.esc(o.id + " — " + (o.tradeName || o.name))}</option>`).join("")}
      </select>`;
      if (!c) credorHtml += `<p class="rydoo-note">Há mais de um credor com esse nome. Escolha o cadastro antes de criar o título.</p>`;
    }
    if (c) {
      const tag = this.colaborador(c)
        ? `<span class="rydoo-tag rydoo-tag-ok">Colaborador</span>`
        : `<span class="rydoo-tag rydoo-tag-revisar">Não é colaborador</span>`;
      const nome = `<strong>${this.esc(c.id + " — " + c.name)}</strong> ${tag}`
        + (c.tradeName ? `<div class="rydoo-why">${this.esc(c.tradeName)}</div>` : "");
      credorHtml = g.options.length > 1 ? credorHtml + nome : nome;
    } else if (!g.options.length) {
      credorHtml = `<span class="rydoo-tag rydoo-tag-divergente">Credor não encontrado</span>
        <p class="rydoo-note">Nenhum cadastro da base de credores bate com esse nome. O PDF sai mesmo assim.</p>`;
    }
    let banco = "—";
    if (c && g.bankStatus === "loading") banco = "Lendo dados bancários…";
    else if (c && g.bankStatus === "erro") banco = "Não consegui ler os dados bancários.";
    else if (c && g.bank) banco = this.bancoTexto(g.bank);
    else if (c) banco = "Sem conta bancária no cadastro do credor.";
    const contas = this.contasDoGrupo(g.rows);
    return `<article class="rydoo-credor">
      <div class="rydoo-credor-top">
        <div>
          <h3>${this.esc(g.pessoa)}</h3>
          <div class="rydoo-why">${this.esc([comp, g.rows.length + (g.rows.length === 1 ? " lançamento" : " lançamentos"), total].filter(Boolean).join(" · "))}</div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" style="height:36px;" onclick="RydooApp.baixarPdf(decodeURIComponent('${pessoa}'))">
          <i data-lucide="file-down" style="width:14px;height:14px;"></i> PDF do reembolso
        </button>
      </div>
      <div class="rydoo-meta">
        <div><span>CREDOR</span>${credorHtml}</div>
        <div><span>DADOS BANCÁRIOS</span><strong>${this.esc(banco)}</strong></div>
      </div>
      ${divergente ? `<p class="rydoo-note">${divergente === 1 ? "1 lançamento divergente entra no PDF e pede conferência antes do título." : divergente + " lançamentos divergentes entram no PDF e pedem conferência antes do título."}</p>` : ""}
      <table class="rydoo-accounts">
        <tbody>
          ${contas.map((item) => `<tr>
            <td><strong>${this.esc(item.conta || "—")}</strong><div class="rydoo-why">${this.esc(item.nome || "Conta sem descrição no plano financeiro")}</div></td>
            <td style="text-align:right;white-space:nowrap;">${this.esc(this.money(item.valor))}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </article>`;
  },

  baixarPdf(pessoa) {
    const g = this.state.groups.find((x) => x.pessoa === pessoa);
    if (!g) return;
    const bytes = this.montarPdf(g);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    const comp = this.competencia(g.rows).replace(".", "-") || "reembolso";
    const slug = this.fold(g.pessoa).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "credor";
    a.href = URL.createObjectURL(blob);
    a.download = "reembolso-" + slug + "-" + comp + ".pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  },

  pdfStr(s) {
    let out = "(";
    const text = String(s == null ? "" : s);
    for (let i = 0; i < text.length; i++) {
      let c = text.charCodeAt(i);
      if (c > 255) c = 63;
      if (c === 40 || c === 41 || c === 92) out += "\\" + String.fromCharCode(c);
      else if (c < 32 || c > 126) out += "\\" + c.toString(8).padStart(3, "0");
      else out += String.fromCharCode(c);
    }
    return out + ")";
  },

  pdfDocument(contents) {
    const nPages = contents.length || 1;
    const streams = contents.length ? contents : ["BT /F1 12 Tf 40 800 Td (vazio) Tj ET"];
    const objects = [];
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    const kids = streams.map((_, i) => (5 + i) + " 0 R").join(" ");
    objects.push("<< /Type /Pages /Count " + nPages + " /Kids [" + kids + "] >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    streams.forEach((stream, i) => {
      objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (5 + nPages + i) + " 0 R >>");
    });
    streams.forEach((stream) => {
      objects.push("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
    });
    let out = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += (i + 1) + " 0 obj\n" + body + "\nendobj\n";
    });
    const xref = out.length;
    out += "xref\n0 " + (objects.length + 1) + "\n";
    out += "0000000000 65535 f \n";
    for (let i = 1; i <= objects.length; i++) {
      out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    out += "trailer << /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
    return new TextEncoder().encode(out);
  },

  montarPdf(g) {
    const pages = [];
    let ops = [];
    let y = 800;
    const left = 40;
    const right = 555;
    const filial = this.mode(g.rows, "filial", "Moura Leite Loteamentos");
    const grupo = this.mode(g.rows, "grupo", "");
    const comp = this.competencia(g.rows);
    const primeiro = String(g.pessoa || "").trim().split(/\s+/)[0] || g.pessoa;
    const titulo = String(primeiro).toUpperCase() + " - TIME - " + (comp || "");
    const hoje = new Date();
    const dataRel = String(hoje.getDate()).padStart(2, "0") + "/" + String(hoje.getMonth() + 1).padStart(2, "0") + "/" + hoje.getFullYear();
    const green = "0.063 0.329 0.212";
    const orange = "0.953 0.439 0.129";
    const ink = "0.12 0.16 0.22";
    const muted = "0.39 0.45 0.55";

    const flush = () => {
      pages.push(ops.join("\n"));
      ops = [];
      y = 800;
      text(g.pessoa + " — continuação", left, y, 9, true, green);
      y -= 18;
    };
    const need = (h) => {
      if (y - h < 48) flush();
    };
    const text = (str, x, yy, size, bold, color) => {
      ops.push("BT");
      ops.push((color || ink) + " rg");
      ops.push("/" + (bold ? "F2" : "F1") + " " + size + " Tf");
      ops.push("1 0 0 1 " + x.toFixed(2) + " " + yy.toFixed(2) + " Tm");
      ops.push(this.pdfStr(str) + " Tj");
      ops.push("ET");
    };
    const wrap = (str, size, maxW) => {
      const maxChars = Math.max(8, Math.floor(maxW / (size * 0.5)));
      const words = String(str || "").split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = "";
      words.forEach((w) => {
        const next = cur ? cur + " " + w : w;
        if (next.length > maxChars && cur) { lines.push(cur); cur = w; }
        else cur = next;
      });
      if (cur) lines.push(cur);
      return lines.length ? lines : [""];
    };
    const textRight = (str, xRight, yy, size, bold, color) => {
      const x = xRight - String(str).length * size * 0.5;
      text(str, x, yy, size, bold, color);
    };
    const rule = (yy) => {
      ops.push("0.82 0.86 0.90 RG");
      ops.push("0.6 w");
      ops.push(left + " " + yy.toFixed(2) + " m " + right + " " + yy.toFixed(2) + " l S");
    };

    text("MOURA LEITE", left, y, 11, true, green);
    text("LOTEAMENTOS", left + 92, y, 11, false, orange);
    y -= 26;
    const center = (str, yy, size, bold, color) => {
      const x = Math.max(left, (595 - String(str).length * size * 0.5) / 2);
      text(str, x, yy, size, bold, color);
    };
    center("Relatório de despesas", y, 16, true, ink);
    y -= 18;
    center(titulo, y, 12, true, ink);
    y -= 28;
    const blockTop = y;
    ["Moura Leite Loteamentos", "Avenida Doutor Vital Brasil, 1190", "18603193 São Paulo", "Brazil", filial].forEach((line) => {
      text(line, left, y, 9, false, ink);
      y -= 12;
    });
    let ry = blockTop;
    const meta = [
      ["De:", grupo || filial],
      ["Data do relatório:", dataRel],
      ["ID do usuário:", g.pessoa],
      ["Grupos:", grupo || "—"]
    ];
    meta.forEach((pair) => {
      text(pair[0], 320, ry, 9, true, ink);
      const lines = wrap(pair[1], 9, 150);
      lines.forEach((line, i) => text(line, 430, ry - i * 11, 9, false, ink));
      ry -= Math.max(12, lines.length * 11);
    });
    y = Math.min(y, ry) - 8;
    textRight("Resumido por categoria", right, y, 8, false, muted);
    y -= 8;
    rule(y);
    y -= 16;
    text("DATA", left, y, 8, true, green);
    text("MÉTODO", 110, y, 8, true, green);
    text("ESTABELECIMENTO", 190, y, 8, true, green);
    text("CATEGORIA", 330, y, 8, true, green);
    textRight("QUANTIA", right, y, 8, true, green);
    y -= 8;
    rule(y);
    y -= 16;

    const bands = new Map();
    g.rows.forEach((r) => {
      const key = (r.categoria || "") + "\0" + this.contaKey(r.conta);
      if (!bands.has(key)) bands.set(key, []);
      bands.get(key).push(r);
    });
    let seq = 0;
    bands.forEach((rows) => {
      rows.sort((a, b) => this.dateKey(a.data).localeCompare(this.dateKey(b.data)));
      const head = rows[0];
      const nome = this.contaNome(head.conta) || head.categoria || "Sem categoria";
      const label = nome + " (" + (head.filial || filial) + ")" + (head.conta ? " (" + head.conta + ")" : "");
      const labelLines = wrap(label, 9, 400);
      need(16 + labelLines.length * 12);
      labelLines.forEach((line, i) => text(line, left, y - i * 12, 9, true, ink));
      textRight(this.money(this.soma(rows)) + " BRL", right, y, 9, true, ink);
      y -= labelLines.length * 12 + 2;
      rows.forEach((r) => {
        seq += 1;
        const metodo = wrap(r.pagamento || "—", 8, 70);
        const local = wrap(r.estabelecimento || "—", 8, 130);
        const cat = wrap(r.categoria || "—", 8, 130);
        const lines = Math.max(metodo.length, local.length, cat.length, 1);
        const extra = (r.xpd ? 11 : 0) + wrap(r.comentario ? "Comentário: " + r.comentario : "", 8, 480).filter((x) => x).length * 11;
        need(16 + lines * 11 + extra);
        text("#" + seq, left, y, 8, true, muted);
        text(r.data || "—", 62, y, 8, false, ink);
        for (let i = 0; i < lines; i++) {
          if (metodo[i]) text(metodo[i], 110, y - i * 11, 8, false, ink);
          if (local[i]) text(local[i], 190, y - i * 11, 8, false, ink);
          if (cat[i]) text(cat[i], 330, y - i * 11, 8, false, ink);
        }
        textRight(this.money(r.valor) + " BRL", right, y, 8, false, ink);
        y -= lines * 11;
        if (r.xpd) {
          text(r.xpd, 62, y, 8, false, muted);
          y -= 11;
        }
        if (r.comentario) {
          wrap("Comentário: " + r.comentario, 8, 480).forEach((line) => {
            text(line, 62, y, 8, false, muted);
            y -= 11;
          });
        }
        y -= 6;
      });
      y -= 4;
      rule(y);
      y -= 16;
    });

    const total = this.money(this.soma(g.rows)) + " BRL";
    need(52);
    textRight("TOTAL: " + total, right, y, 10, true, ink);
    y -= 14;
    textRight("Reembolsáveis: " + total, right, y, 9, false, ink);
    y -= 14;
    textRight("Nota Fiscal: 0 BRL", right, y, 9, false, muted);
    if (!ops.length) ops.push("BT /F1 10 Tf 40 800 Td ( ) Tj ET");
    pages.push(ops.join("\n"));
    return this.pdfDocument(pages);
  }
};

window.RydooApp = RydooApp;
document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "rydoo") RydooApp.init();
});
