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
    error: ""
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
      validation: col("validationstatus")
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
        validation: pick(line, "validation")
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
    this.state.rows = [];
    this.state.fileName = "";
    this.state.error = "";
    this.state.pessoa = "";
    this.state.status = "";
    this.state.q = "";
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
      </style>
      <div class="rydoo-card">
        <div class="rydoo-bar">
          <label class="btn btn-primary btn-sm" style="margin:0;height:36px;">
            <i data-lucide="upload" style="width:14px;height:14px;"></i> Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="RydooApp.onFile(this)">
          </label>
          <button type="button" class="btn btn-cancel btn-sm" style="height:36px;" onclick="RydooApp.limpar()" ${s.rows.length ? "" : "disabled"}>Limpar</button>
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
        <p class="rydoo-hint">Depois da aprovação no Rydoo, importe o Excel. A conta de cada linha é comparada com o padrão da categoria neste arquivo, com a categoria hierárquica e com o comentário que pede outra classificação.</p>
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
          ${td(r.conta)}
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
  }
};

window.RydooApp = RydooApp;
document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "rydoo") RydooApp.init();
});
