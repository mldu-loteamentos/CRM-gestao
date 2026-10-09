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
    prepMsg: "",
    openUsers: {},
    openCc: {},
    openPlano: {},
    picked: {},
    job: null
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
        this._excelBuffer = reader.result;
        this.state.error = "";
        this.state.pessoa = "";
        this.state.status = "";
        this.state.q = "";
        this.state.view = "linhas";
        this.state.groups = [];
        this.state.prepMsg = "";
        this.state.openUsers = {};
        this.state.openCc = {};
        this.state.openPlano = {};
        this._prepGen = (this._prepGen || 0) + 1;
        this.render();
        this.preparar();
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

  cartaoClara(r) {
    return this.fold(r && r.pagamento).indexOf("cartao clara") >= 0;
  },

  viagem(r) {
    const blob = this.fold([r && r.categoria, r && r.tipo, r && r.hierCat].join(" "));
    return /refeic|almoco|jantar|lanche|aliment|desloc|passagem|pedagio|estacion|hosped|quilometr|kilometr|\bkm\b/.test(blob);
  },

  chaveLancamento(r) {
    const tipo = this.fold((r && (r.categoria || r.tipo)) || "");
    const valor = r && Number.isFinite(r.valor) ? r.valor.toFixed(2) : "";
    return [this.fold(r && r.pessoa), this.dateKey(r && r.data), tipo, valor].join("|");
  },

  compAnoMes(rows) {
    const c = this.competencia(rows);
    const m = String(c || "").match(/^(\d{2})\.(\d{4})$/);
    return m ? m[2] + m[1] : "";
  },

  classify(rows, historico) {
    const hist = historico || new Set();
    const comp = this.compAnoMes(rows);
    const counts = {};
    rows.forEach((r) => {
      const k = this.chaveLancamento(r);
      r._chave = k;
      counts[k] = (counts[k] || 0) + 1;
    });
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
      const mes = this.dateKey(r.data).slice(0, 6);
      const retro = !!(comp && mes && mes < comp);
      r.retroativa = !!(retro && ((counts[r._chave] || 0) > 1 || hist.has(r._chave)));
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
      if (r.retroativa) red.push("Despesa igual já lançada, com data retroativa");
      r.clara = this.cartaoClara(r);
      r.reembolsa = !r.clara;
      if (!r.clara && !this.viagem(r)) amber.push("Despesa fora de viagem — revisar");
      if (!r.clara && !r.aprovacao) amber.push("Sem data de aprovação");
      if (!r.clara && !r.cc) amber.push("Sem centro de custo");
      if (r.clara) {
        r.level = red.length ? "divergente" : "ok";
        r.why = red.join(" · ");
      } else {
        r.level = red.length ? "divergente" : (amber.length ? "revisar" : "ok");
        r.why = red.concat(amber).join(" · ");
      }
      r.padrao = expected;
    });
  },

  limpar() {
    this._prepGen = (this._prepGen || 0) + 1;
    this.state.rows = [];
    this.state.fileName = "";
    this._excelBuffer = null;
    this.state.error = "";
    this.state.pessoa = "";
    this.state.status = "";
    this.state.q = "";
    this.state.view = "linhas";
    this.state.groups = [];
    this.state.preparing = false;
    this.state.prepMsg = "";
    this.state.openUsers = {};
    this.state.openCc = {};
    this.state.openPlano = {};
    this.state.picked = {};
    this.state.job = null;
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
        #rydoo-root .rydoo-tag-clara { background:#e0f2fe; color:#075985; }
        #rydoo-root .rydoo-tag-revisar { background:#ffedd5; color:#c2410c; }
        #rydoo-root .rydoo-tag-divergente { background:#fee2e2; color:#b91c1c; }
        #rydoo-root .rydoo-why { margin-top:4px; color:#475569; font-size:12px; }
        #rydoo-root .rydoo-empty, #rydoo-root .rydoo-error { padding:22px; color:#64748b; }
        #rydoo-root .rydoo-error { color:#b91c1c; }
        #rydoo-root .rydoo-file { margin-left:auto; color:#64748b; font-size:12px; align-self:center; }
        #rydoo-root .rydoo-tree { display:flex; flex-direction:column; gap:14px; }
        #rydoo-root details.rydoo-user { background:#fff; border:1px solid #105436; border-left:7px solid #105436; border-radius:10px; }
        #rydoo-root details.rydoo-cc { background:#fff; border:1px solid #f37021; border-left:5px solid #f37021; border-radius:10px; margin:8px 0 0 8px; }
        #rydoo-root details.rydoo-plano { background:#fff; border:1px solid #94a3b8; border-left:4px solid #64748b; border-radius:10px; margin:8px 0 0 16px; }
        #rydoo-root summary { cursor:pointer; display:flex; align-items:center; gap:10px; padding:10px 12px; list-style:none; }
        #rydoo-root summary::-webkit-details-marker { display:none; }
        #rydoo-root summary::before { content:""; width:0; height:0; border-top:5px solid transparent; border-bottom:5px solid transparent; border-left:6px solid #105436; flex:none; }
        #rydoo-root details[open] > summary::before { transform:rotate(90deg); }
        #rydoo-root .rydoo-user > summary { background:#e7f6ee; border-radius:8px; }
        #rydoo-root .rydoo-user[open] > summary { border-bottom:1px solid #105436; border-radius:8px 8px 0 0; }
        #rydoo-root .rydoo-user > summary strong { font-size:15px; color:#105436; }
        #rydoo-root .rydoo-cc > summary { background:#fff4ec; border-radius:8px; }
        #rydoo-root .rydoo-cc[open] > summary { border-bottom:1px solid #f37021; border-radius:8px 8px 0 0; }
        #rydoo-root .rydoo-cc > summary strong { color:#c2410c; }
        #rydoo-root .rydoo-cc > summary::before { border-left-color:#f37021; }
        #rydoo-root .rydoo-plano > summary { background:#f1f5f9; border-radius:8px; }
        #rydoo-root .rydoo-plano[open] > summary { border-bottom:1px solid #94a3b8; border-radius:8px 8px 0 0; }
        #rydoo-root .rydoo-plano > summary strong { color:#334155; }
        #rydoo-root .rydoo-plano > summary::before { border-left-color:#64748b; }
        #rydoo-root .rydoo-user-body { padding:8px 12px 12px 14px; background:#f3faf6; }
        #rydoo-root .rydoo-cc-body { padding:8px 10px 10px 12px; background:#fffaf6; }
        #rydoo-root .rydoo-plano-body { padding:4px 10px 10px 12px; background:#fff; }
        #rydoo-root .rydoo-user-main { display:flex; flex-direction:column; gap:2px; min-width:0; }
        #rydoo-root .rydoo-sum { margin-left:auto; font-weight:700; color:#105436; white-space:nowrap; }
        #rydoo-root .rydoo-cc .rydoo-sum { color:#c2410c; }
        #rydoo-root .rydoo-plano .rydoo-sum { color:#334155; }
        #rydoo-root .rydoo-pick { width:16px; height:16px; flex:none; accent-color:#105436; }
        #rydoo-root .rydoo-edit-row { display:flex; flex-wrap:wrap; gap:10px; padding:4px 0 2px; }
        #rydoo-root .rydoo-edit-row label { display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:700; color:#64748b; min-width:240px; flex:1; }
        #rydoo-root .rydoo-edit-row select { height:34px; }
        #rydoo-root .rydoo-job { margin-top:12px; }
        #rydoo-root .rydoo-job-label { font-size:12.5px; font-weight:600; color:#105436; margin-bottom:6px; }
        #rydoo-root .rydoo-job-track { height:8px; background:#e7f6ee; border-radius:999px; overflow:hidden; }
        #rydoo-root .rydoo-job-bar { height:100%; width:0; background:#105436; transition:width .25s; }
        #rydoo-root .rydoo-lines { width:100%; border-collapse:collapse; font-size:12.5px; }
        #rydoo-root .rydoo-lines td { padding:6px 8px; border-bottom:1px solid #f1f5f9; max-width:280px; }
        #rydoo-root .rydoo-note { margin:4px 0 0; font-size:12.5px; color:#9a3412; }
        #rydoo-root .btn:disabled { opacity:0.45; cursor:not-allowed; }
      </style>
      <div class="rydoo-card">
        <div class="rydoo-bar">
          <label class="btn btn-primary btn-sm" style="margin:0;height:36px;">
            <i data-lucide="upload" style="width:14px;height:14px;"></i> Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="RydooApp.onFile(this)">
          </label>
          <button type="button" class="btn btn-cancel btn-sm" style="height:36px;" onclick="RydooApp.limpar()" ${s.rows.length ? "" : "disabled"}>Limpar</button>
          <button type="button" class="btn btn-outline btn-sm" style="height:36px;" onclick="RydooApp.marcarTodos()" ${s.rows.length ? "" : "disabled"}>Marcar todos</button>
          <button type="button" class="btn btn-primary btn-sm" style="height:36px;" onclick="RydooApp.gerarMarcados()" ${s.rows.length ? "" : "disabled"}>Gerar títulos</button>
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
        <p class="rydoo-hint" ${s.prepMsg ? "" : "hidden"}>${this.esc(s.prepMsg || "")}</p>
        <div id="rydoo-job" class="rydoo-job" ${s.job ? "" : "hidden"}>
          <div class="rydoo-job-label">${this.esc((s.job && s.job.label) || "")}</div>
          <div class="rydoo-job-track"><div class="rydoo-job-bar" style="width:${s.job ? s.job.pct : 0}%"></div></div>
        </div>
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
    const sum = (list) => list.reduce((a, r) => a + (r.reembolsa !== false && Number.isFinite(r.valor) ? r.valor : 0), 0);
    const count = (level) => rows.filter((r) => r.level === level).length;
    box.innerHTML = `<div class="rydoo-kpis">
      <div class="rydoo-kpi"><b>${rows.length}</b><span>Lançamentos</span></div>
      <div class="rydoo-kpi"><b>${this.money(sum(rows))}</b><span>Reembolso</span></div>
      <div class="rydoo-kpi"><b>${count("ok")}</b><span>Classificação ok</span></div>
      <div class="rydoo-kpi"><b>${count("divergente")}</b><span>Divergentes</span></div>
      <div class="rydoo-kpi"><b>${count("revisar")}</b><span>A revisar</span></div>
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
    const rows = this.visible();
    if (!rows.length) {
      box.innerHTML = `<div class="rydoo-table-wrap"><div class="rydoo-empty">Nenhuma linha com esse filtro.</div></div>`;
      return;
    }
    box.innerHTML = `<div class="rydoo-tree">${this.treeHtml(rows)}</div>`;
    if (window.lucide) lucide.createIcons();
  },

  paintHint() {
    const hint = document.querySelector("#rydoo-root .rydoo-hint");
    if (!hint) return;
    hint.textContent = this.state.prepMsg || "";
    hint.hidden = !this.state.prepMsg;
  },

  onToggle(kind, key, open) {
    const bag = kind === "cc" ? "openCc" : (kind === "plano" ? "openPlano" : "openUsers");
    if (!this.state[bag]) this.state[bag] = {};
    this.state[bag][key] = !!open;
  },

  treeHtml(rows) {
    const byUser = new Map();
    rows.forEach((r) => {
      const pessoa = r.pessoa || "(sem nome)";
      if (!byUser.has(pessoa)) byUser.set(pessoa, []);
      byUser.get(pessoa).push(r);
    });
    const tree = Array.from(byUser.keys())
      .sort((a, b) => this.fold(a).localeCompare(this.fold(b), "pt"))
      .map((pessoa) => this.userBlock(pessoa, byUser.get(pessoa)))
      .join("");
    const contas = this.contaOpcoes();
    const lista = contas.map((c) => `<option value="${this.esc(c.id)}">${this.esc(c.id + " — " + c.name)}</option>`).join("");
    return tree + `<datalist id="rydoo-contas">${lista}</datalist>`;
  },

  userBlock(pessoa, rows) {
    const g = (this.state.groups || []).find((x) => x.pessoa === pessoa) || null;
    const arg = this.arg(pessoa);
    const open = this.state.openUsers[pessoa] ? "open" : "";
    const n = rows.length;
    const total = this.money(this.somaReembolso(rows));
    const alertas = rows.some((r) => r.reembolsa !== false && r.level !== "ok");
    const pronto = g && g.creditor && this.colaborador(g.creditor) && this.somaReembolso(rows) > 0 && !this.state.preparing;
    const podeGerar = !!(pronto && !alertas && !(g && g.billId));
    const marcado = this.state.picked && this.state.picked[pessoa] && podeGerar;
    const pick = `<input type="checkbox" class="rydoo-pick" ${podeGerar ? "" : "disabled"} ${marcado ? "checked" : ""} title="${podeGerar ? "Incluir na geração em massa" : "Revise os alertas antes de gerar o título"}" onclick="event.stopPropagation()" onchange="event.stopPropagation(); RydooApp.marcar(decodeURIComponent('${arg}'), this.checked)">`;
    let acao = "";
    if (g && g.billId) {
      const bancoBtn = g.bank && !g.bankSent
        ? `<button type="button" class="btn btn-outline btn-sm" style="height:32px;" onclick="event.preventDefault(); event.stopPropagation(); RydooApp.reenviarBanco(decodeURIComponent('${arg}'))">Enviar dados bancários</button>`
        : "";
      acao = `<span class="rydoo-tag rydoo-tag-ok">Título ${this.esc(g.billId)}</span>${bancoBtn}`;
    } else if (pronto) {
      const off = alertas || g.billBusy ? "disabled" : "";
      const title = alertas ? "Revise os alertas antes de gerar o título" : "Gerar título REEM no Sienge";
      acao = `<button type="button" class="btn btn-primary btn-sm" style="height:32px;" title="${this.esc(title)}" ${off} onclick="event.preventDefault(); event.stopPropagation(); RydooApp.gerarTitulo(decodeURIComponent('${arg}'))">Gerar título</button>`;
    }
    const byCc = new Map();
    rows.forEach((r) => {
      const cc = r.cc || "(sem centro de custo)";
      if (!byCc.has(cc)) byCc.set(cc, []);
      byCc.get(cc).push(r);
    });
    const ccs = Array.from(byCc.keys())
      .sort((a, b) => this.fold(a).localeCompare(this.fold(b), "pt"))
      .map((cc) => this.ccBlock(pessoa, cc, byCc.get(cc)))
      .join("");
    return `<details class="rydoo-user" ${open} ontoggle="RydooApp.onToggle('user', decodeURIComponent('${arg}'), this.open)">
      <summary>
        ${pick}
        <span class="rydoo-user-main">
          <strong>${this.esc(pessoa)}</strong>
          <span class="rydoo-why">${n === 1 ? "1 lançamento" : n + " lançamentos"} · ${this.esc(this.competencia(rows) || "")}</span>
          ${this.credorLinha(g)}
        </span>
        <span class="rydoo-sum">${this.esc(total)}</span>
        ${acao}
        <button type="button" class="btn btn-primary btn-sm" style="height:32px;" onclick="event.preventDefault(); event.stopPropagation(); RydooApp.baixarPdf(decodeURIComponent('${arg}'))">PDF</button>
      </summary>
      <div class="rydoo-user-body">${ccs}</div>
    </details>`;
  },

  credorLinha(g) {
    if (!g) {
      return this.state.preparing ? `<span class="rydoo-why">Buscando credor e dados bancários…</span>` : "";
    }
    if (!g.creditor && !(g.options && g.options.length)) {
      return `<span class="rydoo-tag rydoo-tag-divergente">Credor não encontrado</span>`;
    }
    const c = g.creditor;
    const arg = this.arg(g.pessoa);
    let html = "";
    if (g.options && g.options.length > 1) {
      html += `<select class="form-control" style="height:32px;max-width:360px;" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" onchange="event.stopPropagation(); RydooApp.escolher(decodeURIComponent('${arg}'), this.value)">
        <option value="">Escolha o cadastro</option>
        ${g.options.map((o) => `<option value="${this.esc(o.id)}" ${c && String(c.id) === String(o.id) ? "selected" : ""}>${this.esc(o.id + " — " + (o.tradeName || o.name))}</option>`).join("")}
      </select>`;
    }
    if (c) {
      const tag = this.colaborador(c)
        ? `<span class="rydoo-tag rydoo-tag-ok">Colaborador</span>`
        : `<span class="rydoo-tag rydoo-tag-revisar">Não é colaborador</span>`;
      let banco = "Sem conta bancária no cadastro.";
      if (g.bankStatus === "loading") banco = "Lendo dados bancários…";
      else if (g.bankStatus === "erro") banco = "Não consegui ler os dados bancários.";
      else if (g.bank) banco = this.bancoTexto(g.bank);
      html += `<span class="rydoo-why">${this.esc(c.id + " — " + c.name)} ${tag} · ${this.esc(banco)}</span>`;
    }
    return html;
  },

  ccBlock(pessoa, cc, rows) {
    const key = pessoa + "\0" + cc;
    const arg = this.arg(key);
    const open = this.state.openCc[key] ? "open" : "";
    const byConta = new Map();
    rows.forEach((r) => {
      const conta = this.contaKey(r.conta) || "(sem conta)";
      if (!byConta.has(conta)) byConta.set(conta, []);
      byConta.get(conta).push(r);
    });
    const planos = Array.from(byConta.keys())
      .sort()
      .map((conta) => this.planoBlock(pessoa, cc, conta, byConta.get(conta)))
      .join("");
    return `<details class="rydoo-cc" ${open} ontoggle="RydooApp.onToggle('cc', decodeURIComponent('${arg}'), this.open)">
      <summary>
        <span class="rydoo-user-main"><strong>Centro de custo</strong><span class="rydoo-why">${this.esc(cc)}</span></span>
        <span class="rydoo-sum">${this.esc(this.money(this.somaReembolso(rows)))}</span>
      </summary>
      <div class="rydoo-cc-body">${planos}</div>
    </details>`;
  },

  planoBlock(pessoa, cc, conta, rows) {
    const key = pessoa + "\0" + cc + "\0" + conta;
    const arg = this.arg(key);
    const open = this.state.openPlano[key] ? "open" : "";
    const head = rows[0] || {};
    const nome = this.contaNome(head.conta) || "Conta sem descrição no plano financeiro";
    const tag = (r) => {
      if (r.clara) {
        const extra = r.level !== "ok" && r.why ? `<div class="rydoo-why">${this.esc(r.why)}</div>` : "";
        return `<span class="rydoo-tag rydoo-tag-clara">Cartão Clara</span><div class="rydoo-why">Não gera reembolso</div>${extra}`;
      }
      const label = r.level === "ok" ? "Ok" : (r.level === "revisar" ? "Revisar" : "Divergente");
      return `<span class="rydoo-tag rydoo-tag-${r.level}">${label}</span>${r.why ? `<div class="rydoo-why">${this.esc(r.why)}</div>` : ""}`;
    };
    const lines = rows.slice().sort((a, b) => this.dateKey(a.data).localeCompare(this.dateKey(b.data))).map((r) => `<tr class="rydoo-row-${r.level}">
      <td>${this.esc(r.data)}</td>
      <td>${this.esc(r.estabelecimento || "—")}</td>
      <td>${this.esc(r.categoria || "—")}</td>
      <td>${this.esc(r.comentario || "")}</td>
      <td>${tag(r)}</td>
      <td style="text-align:right;white-space:nowrap;">${this.esc(this.money(r.valor))}</td>
    </tr>${this.editorLinha(r)}`).join("");
    return `<details class="rydoo-plano" ${open} ontoggle="RydooApp.onToggle('plano', decodeURIComponent('${arg}'), this.open)">
      <summary>
        <span class="rydoo-user-main"><strong>${this.esc(head.conta || conta)}</strong><span class="rydoo-why">${this.esc(nome)}</span></span>
        <span class="rydoo-sum">${this.esc(this.money(this.somaReembolso(rows)))}</span>
      </summary>
      <div class="rydoo-plano-body">
        <table class="rydoo-lines">
          <thead><tr>
            <td>Data</td><td>Estabelecimento</td><td>Categoria</td><td>Comentário</td><td>Classificação</td><td style="text-align:right;">Valor</td>
          </tr></thead>
          <tbody>${lines}</tbody>
        </table>
      </div>
    </details>`;
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
    this.state.prepMsg = "Conferindo reembolsos anteriores…";
    this.paintHint();
    this.renderList();
    try {
      const hist = await this.lerHistorico();
      if (this._prepGen !== gen) return;
      this._historico = hist;
      this.classify(this.state.rows, hist);
      await this.salvarImportacao();
      if (this._prepGen !== gen) return;
      this.state.prepMsg = "Lendo o plano financeiro…";
      this.paintHint();
      await this.loadAccounts();
      try { await this.loadCostCenters(); } catch (e) {}
      if (this._prepGen !== gen) return;
      this.renderList();
      await this.loadCreditors((msg) => {
        if (this._prepGen !== gen) return;
        this.state.prepMsg = msg;
        this.paintHint();
      });
      if (this._prepGen !== gen) return;
      this.state.groups = this.buildGroups();
      await this.marcarTitulosGerados();
      if (this._prepGen !== gen) return;
      this.state.prepMsg = "Lendo e guardando os dados bancários…";
      this.paintHint();
      this.renderList();
      await this.loadBanks(this.state.groups);
      if (this._prepGen !== gen) return;
      this.state.preparing = false;
      this.state.prepMsg = "";
      this.paintHint();
      this.renderList();
    } catch (e) {
      if (this._prepGen !== gen) return;
      this.state.preparing = false;
      this.state.prepMsg = (e && e.message) ? e.message : "Não consegui buscar os credores.";
      this.paintHint();
      this.renderList();
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
    this._contaOpcoes = null;
  },

  async loadCostCenters() {
    if (this._costCenters && this._costCenters.length) return;
    let list = [];
    if (window.SiengeAPI && typeof SiengeAPI.getCostCenters === "function") {
      list = await SiengeAPI.getCostCenters();
    } else {
      const res = await siengeFetchWithRetry("/cost-centers?limit=200&offset=0");
      list = (res && res.results) || [];
    }
    this._costCenters = (list || []).map((c) => ({
      id: String(c.id != null ? c.id : ""),
      name: String(c.name || c.costCenterName || "").trim()
    })).filter((c) => c.id);
  },

  contaOpcoes() {
    if (this._contaOpcoes) return this._contaOpcoes;
    const map = this._accounts || {};
    const seen = {};
    const out = [];
    Object.keys(map).forEach((k) => {
      const bare = String(k).replace(/\./g, "");
      if (!bare || seen[bare]) return;
      seen[bare] = true;
      out.push({ id: k.indexOf(".") >= 0 ? k : this.dottedCode(bare), name: map[k] });
    });
    out.sort((a, b) => String(a.id).localeCompare(String(b.id), "pt"));
    this._contaOpcoes = out;
    return out;
  },

  editorLinha(r) {
    if (!r || r.clara || (r.level !== "revisar" && r.level !== "divergente")) return "";
    const idx = this.state.rows.indexOf(r);
    if (idx < 0) return "";
    const atualCc = this.ccIdOf(r);
    const ccs = (this._costCenters || []).slice();
    if (atualCc && !ccs.some((c) => c.id === atualCc)) ccs.unshift({ id: atualCc, name: String(r.cc || "") });
    const ccOpts = [`<option value="">Centro de custo</option>`].concat(ccs.map((c) => {
      const sel = c.id === atualCc ? "selected" : "";
      const label = c.name && c.name !== c.id ? (c.id + " — " + c.name) : c.id;
      return `<option value="${this.esc(c.id)}" ${sel}>${this.esc(label)}</option>`;
    })).join("");
    const contaAtual = this.contaKey(r.conta);
    return `<tr class="rydoo-edit"><td colspan="6"><div class="rydoo-edit-row">
      <label>Centro de custo<select class="form-control" onclick="event.stopPropagation()" onchange="RydooApp.editarLinha(${idx}, 'cc', this.value)">${ccOpts}</select></label>
      <label>Plano financeiro<input class="form-control" list="rydoo-contas" value="${this.esc(contaAtual)}" placeholder="Código da conta" onclick="event.stopPropagation()" onchange="RydooApp.editarLinha(${idx}, 'conta', this.value)"></label>
    </div></td></tr>`;
  },

  editarLinha(index, field, value) {
    const r = this.state.rows[Number(index)];
    if (!r) return;
    const raw = String(value || "").trim();
    if (!raw) return;
    if (field === "cc") {
      const hit = (this._costCenters || []).find((c) => c.id === raw);
      r.cc = hit && hit.name ? (hit.id + " — " + hit.name) : raw;
    } else if (field === "conta") {
      r.conta = raw.split("—")[0].trim() || raw;
      r.hierConta = r.conta;
    }
    this.classify(this.state.rows, this._historico || new Set());
    this.renderKpis();
    this.renderList();
  },

  marcar(pessoa, on) {
    if (!this.state.picked) this.state.picked = {};
    if (on) this.state.picked[pessoa] = true;
    else delete this.state.picked[pessoa];
  },

  elegiveis() {
    const byUser = new Map();
    (this.state.rows || []).forEach((r) => {
      const pessoa = r.pessoa || "(sem nome)";
      if (!byUser.has(pessoa)) byUser.set(pessoa, []);
      byUser.get(pessoa).push(r);
    });
    const out = [];
    byUser.forEach((rows, pessoa) => {
      const g = (this.state.groups || []).find((x) => x.pessoa === pessoa);
      const alertas = rows.some((r) => r.reembolsa !== false && r.level !== "ok");
      const pronto = g && g.creditor && this.colaborador(g.creditor) && this.somaReembolso(rows) > 0 && !this.state.preparing && !g.billId && !alertas;
      if (pronto) out.push(pessoa);
    });
    return out;
  },

  marcarTodos() {
    const lista = this.elegiveis();
    if (!this.state.picked) this.state.picked = {};
    const todos = lista.length && lista.every((p) => this.state.picked[p]);
    lista.forEach((p) => {
      if (todos) delete this.state.picked[p];
      else this.state.picked[p] = true;
    });
    this.renderList();
  },

  setJob(label, pct) {
    this.state.job = { label: label, pct: Math.max(0, Math.min(100, pct || 0)) };
    const box = document.getElementById("rydoo-job");
    if (!box) return;
    box.hidden = false;
    const lab = box.querySelector(".rydoo-job-label");
    const bar = box.querySelector(".rydoo-job-bar");
    if (lab) lab.textContent = label;
    if (bar) bar.style.width = this.state.job.pct + "%";
  },

  clearJob() {
    this.state.job = null;
    const box = document.getElementById("rydoo-job");
    if (box) box.hidden = true;
  },

  auditar(entry) {
    if (!window.AuditService || typeof AuditService.logEvent !== "function") return;
    try {
      AuditService.logEvent(Object.assign({ module: "Rydoo", action: "Gerar título" }, entry || {}));
    } catch (e) {}
  },

  async loadCreditors(onProgress) {
    const cached = await this.lerColaboradores();
    if (cached.length) {
      this._creditors = cached;
      const age = Date.now() - (this._colabAt || 0);
      if (age > 12 * 60 * 60 * 1000) this.atualizarColaboradores(null, true);
      return;
    }
    await this.atualizarColaboradores(onProgress, false);
  },

  pessoaFisica(c) {
    if (!c) return false;
    const t = this.fold(c.personType || c.type || "");
    if (t.indexOf("jurid") >= 0 || t === "j" || t === "pj") return false;
    if (t.indexOf("fisic") >= 0 || t === "f" || t === "pf") return true;
    const cpf = String(c.cpf || "").replace(/\D/g, "");
    const cnpj = String(c.cnpj || "").replace(/\D/g, "");
    const doc = String(c.registerNumber || c.cpfCnpj || "").replace(/\D/g, "");
    if (cnpj.length === 14 || doc.length === 14) return false;
    return cpf.length === 11 || doc.length === 11;
  },

  normalizarCredor(c) {
    return {
      id: c.id,
      name: c.name || "",
      tradeName: c.tradeName || "",
      employee: c.employee,
        personType: c.personType || c.type || "",
        cpf: c.cpf || "",
        cnpj: c.cnpj || "",
        registerNumber: c.registerNumber || c.cpfCnpj || "",
      active: c.active === true || c.active === "S" || c.active === "true"
    };
  },

  async atualizarColaboradores(onProgress, silent) {
    const all = [];
    let offset = 0;
    let total = null;
    do {
      const res = await siengeFetchWithRetry("/creditors?limit=200&offset=" + offset);
      const results = (res && res.results) || [];
      if (total == null) total = (res && res.resultSetMetadata && res.resultSetMetadata.count) || results.length;
      results.forEach((c) => {
        const row = this.normalizarCredor(c);
        if (this.colaborador(row)) all.push(row);
      });
      offset += 200;
      if (onProgress) onProgress("Lendo credores " + Math.min(offset, total) + " de " + total + "…");
      if (!results.length) break;
      if (offset < total) await new Promise((r) => setTimeout(r, 200));
    } while (offset < total);
    this._creditors = all;
    this._colabAt = Date.now();
    await this.salvarColaboradores(all);
    if (silent && this.state.rows.length && !this.state.preparing) {
      const prev = this.state.groups || [];
      this.state.groups = this.buildGroups();
      prev.forEach((old) => {
        const next = this.state.groups.find((g) => g.pessoa === old.pessoa);
        if (!next || !old.bank) return;
        next.bank = old.bank;
        next.banks = old.banks;
        next.bankStatus = old.bankStatus;
        next.billId = old.billId;
      });
      this.renderList();
    }
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
    if (!c) return false;
    const emp = c.employee === "S" || c.employee === true || c.employee === "true" || c.employee === 1 || c.employee === "1";
    return !!(emp && this.pessoaFisica(c));
  },

  soma(rows) {
    return rows.reduce((a, r) => a + (Number.isFinite(r.valor) ? r.valor : 0), 0);
  },

  somaReembolso(rows) {
    return (rows || []).reduce((a, r) => a + (r && r.reembolsa !== false && Number.isFinite(r.valor) ? r.valor : 0), 0);
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
    this.renderList();
    await this.loadBank(g);
    this.renderList();
  },

  async logoJpeg() {
    if (this._logoJpeg) return this._logoJpeg;
    const img = new Image();
    img.src = "i.ntegr.a/logo-moura-leite.svg";
    await img.decode();
    const maxW = 280;
    const scale = Math.min(1, maxW / img.width);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const bin = atob(canvas.toDataURL("image/jpeg", 0.86).split(",")[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const wide = w / h > 1.6;
    this._logoJpeg = { bytes: bytes, w: w, h: h, dw: wide ? 168 : 78, dh: (wide ? 168 : 78) * (h / w) };
    return this._logoJpeg;
  },

  async baixarPdf(pessoa) {
    let g = (this.state.groups || []).find((x) => x.pessoa === pessoa);
    const rows = this.state.rows.filter((r) => (r.pessoa || "(sem nome)") === pessoa && r.reembolsa !== false);
    if (!rows.length) {
      alert("Não há despesas reembolsáveis para este colaborador. Cartão Clara não gera reembolso.");
      return;
    }
    if (!g) g = { pessoa: pessoa, rows: rows };
    else g = Object.assign({}, g, { rows: rows });
    let logo = null;
    try { logo = await this.logoJpeg(); } catch (e) { logo = null; }
    const bytes = this.montarPdf(g, logo);
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

  pdfBytes(parts) {
    let n = 0;
    parts.forEach((p) => { n += p.length; });
    const out = new Uint8Array(n);
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  },

  pdfDocument(contents, image) {
    const ascii = (s) => new TextEncoder().encode(s);
    const nPages = contents.length || 1;
    const streams = contents.length ? contents : ["BT /F1 12 Tf 40 800 Td (vazio) Tj ET"];
    const imageObj = image ? 5 : 0;
    const pageStart = image ? 6 : 5;
    const contentStart = pageStart + nPages;
    const objects = [];
    const push = (body) => objects.push(typeof body === "string" ? ascii(body) : body);
    const kids = streams.map((_, i) => (pageStart + i) + " 0 R").join(" ");
    push("<< /Type /Catalog /Pages 2 0 R >>");
    push("<< /Type /Pages /Count " + nPages + " /Kids [" + kids + "] >>");
    push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    if (image) {
      const head = ascii("<< /Type /XObject /Subtype /Image /Width " + image.w + " /Height " + image.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + image.bytes.length + " >>\nstream\n");
      const foot = ascii("\nendstream");
      push(this.pdfBytes([head, image.bytes, foot]));
    }
    const xobj = image ? " /XObject << /Im1 " + imageObj + " 0 R >>" : "";
    streams.forEach((stream, i) => {
      push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>" + xobj + " >> /Contents " + (contentStart + i) + " 0 R >>");
    });
    streams.forEach((stream) => {
      push("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
    });
    const parts = [ascii("%PDF-1.4\n")];
    let len = parts[0].length;
    const offsets = [0];
    objects.forEach((body, i) => {
      offsets.push(len);
      const head = ascii((i + 1) + " 0 obj\n");
      const tail = ascii("\nendobj\n");
      parts.push(head, body, tail);
      len += head.length + body.length + tail.length;
    });
    let xref = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
    for (let i = 1; i <= objects.length; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    xref += "trailer << /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + len + "\n%%EOF";
    parts.push(ascii(xref));
    return this.pdfBytes(parts);
  },

  montarPdf(g, logo) {
    const pages = [];
    let ops = [];
    let y = 800;
    const left = 40;
    const right = 555;
    const nome = String((g.creditor && g.creditor.name) || g.pessoa || "").trim();
    const comp = this.competencia(g.rows);
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
      text(nome + " — continuação", left, y, 9, true, green);
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

    if (logo && logo.dw && logo.dh) {
      const dw = logo.dw;
      const dh = logo.dh;
      ops.push("q");
      ops.push(dw.toFixed(2) + " 0 0 " + dh.toFixed(2) + " " + left.toFixed(2) + " " + (y - dh + 8).toFixed(2) + " cm");
      ops.push("/Im1 Do");
      ops.push("Q");
      y -= dh + 6;
    }
    const center = (str, yy, size, bold, color) => {
      const x = Math.max(left, (595 - String(str).length * size * 0.5) / 2);
      text(str, x, yy, size, bold, color);
    };
    center("Relatório de despesas", y, 16, true, ink);
    y -= 18;
    wrap(nome, 12, 460).forEach((line) => {
      center(line, y, 12, true, ink);
      y -= 16;
    });
    if (comp) {
      center(comp, y, 11, false, muted);
      y -= 16;
    }
    y -= 8;
    const grupo = this.mode(g.rows, "grupo", "");
    const filial = this.mode(g.rows, "filial", "");
    let ry = y;
    const meta = [
      ["De:", grupo || filial || "—"],
      ["Data do relatório:", dataRel],
      ["Colaborador:", nome]
    ];
    meta.forEach((pair) => {
      text(pair[0], left, ry, 9, true, ink);
      const lines = wrap(pair[1], 9, 360);
      lines.forEach((line, i) => text(line, 150, ry - i * 11, 9, false, ink));
      ry -= Math.max(12, lines.length * 11);
    });
    y = ry - 8;
    textRight("Resumido por centro de custo", right, y, 8, false, muted);
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

    const byCc = new Map();
    g.rows.forEach((r) => {
      const cc = r.cc || "(sem centro de custo)";
      if (!byCc.has(cc)) byCc.set(cc, []);
      byCc.get(cc).push(r);
    });
    let seq = 0;
    Array.from(byCc.keys()).sort((a, b) => this.fold(a).localeCompare(this.fold(b), "pt")).forEach((cc) => {
      const ccRows = byCc.get(cc);
      need(24);
      ops.push(green + " rg");
      ops.push(left.toFixed(2) + " " + (y - 5).toFixed(2) + " " + (right - left).toFixed(2) + " 16 re f");
      text("Centro de custo  " + cc, left + 6, y, 9, true, "1 1 1");
      textRight(this.money(this.soma(ccRows)) + " BRL", right - 6, y, 9, true, "1 1 1");
      y -= 22;
      const bands = new Map();
      ccRows.forEach((r) => {
        const key = (r.categoria || "") + "\0" + this.contaKey(r.conta);
        if (!bands.has(key)) bands.set(key, []);
        bands.get(key).push(r);
      });
      bands.forEach((rows) => {
      rows.sort((a, b) => this.dateKey(a.data).localeCompare(this.dateKey(b.data)));
      const head = rows[0];
      const nome = this.contaNome(head.conta) || head.categoria || "Sem categoria";
      const label = nome + (head.conta ? " (" + head.conta + ")" : "");
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
    return this.pdfDocument(pages, logo);
  },

  fb() {
    const db = window.firebaseDb;
    const fx = window.firebaseCollections;
    if (!db || !fx || !fx.doc || !fx.setDoc || !fx.getDoc || !fx.getDocs || !fx.collection) return null;
    return { db: db, fx: fx };
  },

  async lerColaboradores() {
    const fb = this.fb();
    if (!fb) return [];
    try {
      const snap = await fb.fx.getDoc(fb.fx.doc(fb.db, "rydoo_meta", "colaboradores"));
      if (!snap.exists()) return [];
      const data = snap.data() || {};
      this._colabAt = data.updatedAt ? Date.parse(data.updatedAt) : 0;
      const items = Array.isArray(data.items) ? data.items : [];
      return items.filter((c) => this.colaborador(c));
    } catch (e) {
      return [];
    }
  },

  async salvarColaboradores(list) {
    const fb = this.fb();
    if (!fb) return;
    const items = list.map((c) => ({
      id: c.id,
      name: c.name || "",
      tradeName: c.tradeName || "",
      employee: c.employee === true || c.employee === "S" || c.employee === "true" ? "S" : c.employee,
      personType: c.personType || "",
      cpf: c.cpf || "",
      cnpj: c.cnpj || "",
      registerNumber: c.registerNumber || "",
      active: !!c.active
    }));
    await fb.fx.setDoc(fb.fx.doc(fb.db, "rydoo_meta", "colaboradores"), {
      updatedAt: new Date().toISOString(),
      count: items.length,
      items: items
    });
  },

  async lerHistorico() {
    if (this._historico) return this._historico;
    const set = new Set();
    const fb = this.fb();
    if (!fb) {
      this._historico = set;
      return set;
    }
    try {
      const snap = await fb.fx.getDocs(fb.fx.collection(fb.db, "rydoo_arquivos"));
      snap.forEach((d) => {
        const chaves = (d.data() || {}).chaves;
        if (Array.isArray(chaves)) chaves.forEach((k) => { if (k) set.add(k); });
      });
    } catch (e) {}
    this._historico = set;
    return set;
  },

  async salvarImportacao() {
    const fb = this.fb();
    const rows = this.state.rows || [];
    const chaves = [];
    rows.forEach((r) => {
      const chave = r._chave || this.chaveLancamento(r);
      if (!chave || chave === "|||") return;
      chaves.push(chave);
      if (this._historico) this._historico.add(chave);
    });
    if (fb) {
      try {
        await fb.fx.setDoc(fb.fx.doc(fb.db, "rydoo_arquivos", String(Date.now())), {
          fileName: this.state.fileName || "",
          importedAt: new Date().toISOString(),
          linhas: rows.length,
          chaves: chaves
        });
      } catch (e) {}
    }
    const buf = this._excelBuffer;
    const storage = window.firebaseStorage;
    const fx = window.firebaseCollections;
    if (buf && storage && fx && fx.ref && fx.uploadBytes) {
      try {
        const safe = String(this.state.fileName || "rydoo.xlsx").replace(/[^\w.\-]+/g, "_");
        const storageRef = fx.ref(storage, "rydoo/excels/" + Date.now() + "-" + safe);
        await fx.uploadBytes(storageRef, new Blob([buf]), {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
      } catch (e) {}
    }
  },

  async marcarTitulosGerados() {
    const fb = this.fb();
    if (!fb) return;
    for (const g of this.state.groups || []) {
      if (!g.creditor) continue;
      const id = this.tituloDocId(g);
      if (!id) continue;
      try {
        const snap = await fb.fx.getDoc(fb.fx.doc(fb.db, "rydoo_titulos", id));
        if (snap.exists()) {
          const data = snap.data() || {};
          g.billId = data.billId || g.billId;
          g.bankSent = !!data.bankSent;
        }
      } catch (e) {}
    }
  },

  tituloDocId(g) {
    if (!g || !g.creditor) return "";
    const comp = this.competencia(g.rows || []).replace(/\./g, "");
    return String(g.creditor.id) + "_" + (comp || "sem");
  },

  mesNome(comp) {
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const m = String(comp || "").match(/^(\d{2})\.(\d{4})$/);
    if (!m) return comp || "";
    return (meses[Number(m[1]) - 1] || m[1]) + " " + m[2];
  },

  ccIdOf(r) {
    const m = String((r && r.cc) || "").match(/(\d+)/);
    return m ? m[1] : "";
  },

  hojeIso() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  siengeAuth() {
    const c = window.SIENGE_CONFIG;
    if (!c || !c.user) return "";
    return "Basic " + btoa(c.user + ":" + c.pass);
  },

  siengeUrl(path) {
    const base = (window.SIENGE_CONFIG && window.SIENGE_CONFIG.baseUrl) || "/api/sienge-proxy";
    return String(base).replace(/\/$/, "") + path;
  },

  async siengeJson(path, options) {
    const res = await fetch(this.siengeUrl(path), Object.assign({
      headers: { Authorization: this.siengeAuth(), Accept: "application/json" }
    }, options || {}));
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    if (!res.ok) {
      const msg = body && (body.message || body.clientMessage || body.developerMessage);
      throw new Error(msg || (typeof body === "string" && body) || ("Sienge " + res.status));
    }
    return { res: res, body: body };
  },

  async empresaDoReembolso(rows) {
    const totals = {};
    rows.forEach((r) => {
      if (r.reembolsa === false) return;
      const id = this.ccIdOf(r);
      if (!id) return;
      totals[id] = (totals[id] || 0) + (Number(r.valor) || 0);
    });
    const ccId = Object.keys(totals).sort((a, b) => totals[b] - totals[a])[0];
    if (!ccId) throw new Error("Nenhum centro de custo para identificar a empresa.");
    let company = "";
    try {
      if (window.SiengeAPI && typeof SiengeAPI.getCostCenters === "function") {
        const list = await SiengeAPI.getCostCenters();
        const cc = (list || []).find((c) => String(c.id) === String(ccId));
        company = cc && (cc.companyId || cc.idCompany || (cc.company && cc.company.id) || "");
      }
    } catch (e) {}
    if (!company) {
      const raw = await siengeFetchWithRetry("/cost-centers/" + encodeURIComponent(ccId));
      company = raw && (raw.companyId || raw.idCompany || (raw.company && raw.company.id) || "");
    }
    const n = parseInt(company, 10);
    if (!n) throw new Error("Não encontrei a empresa do centro de custo " + ccId + ".");
    return n;
  },

  async departamentoTesouraria() {
    let list = [];
    if (window.SiengeAPI && typeof SiengeAPI.getDepartments === "function") {
      list = await SiengeAPI.getDepartments();
    } else {
      const res = await siengeFetchWithRetry("/departments?limit=200&offset=0");
      list = (res && res.results) || [];
    }
    const nome = (d) => this.fold(d.name || d.departmentName || "");
    const found = (list || []).find((d) => nome(d) === "tesouraria")
      || (list || []).find((d) => nome(d).indexOf("tesouraria") >= 0);
    const id = found && (found.id != null ? found.id : found.departmentId);
    const n = parseInt(id, 10);
    if (!n) throw new Error("Não encontrei o departamento Tesouraria no Sienge.");
    return n;
  },

  orcamento(rows) {
    const map = new Map();
    rows.forEach((r) => {
      if (r.reembolsa === false) return;
      const cc = parseInt(this.ccIdOf(r), 10);
      const conta = String(r.conta || "").replace(/\./g, "").trim();
      if (!cc || !conta) return;
      const k = cc + "|" + conta;
      map.set(k, (map.get(k) || 0) + (Number(r.valor) || 0));
    });
    const parts = [];
    map.forEach((valor, k) => {
      if (valor > 0) {
        const bits = k.split("|");
        parts.push({ costCenterId: parseInt(bits[0], 10), paymentCategoriesId: bits[1], valor: valor });
      }
    });
    const base = parts.reduce((a, p) => a + p.valor, 0);
    if (!base) return [];
    let acc = 0;
    return parts.map((p, i) => {
      let perc = i === parts.length - 1
        ? Math.round((100 - acc) * 10000) / 10000
        : Math.round((p.valor / base) * 100 * 10000) / 10000;
      acc += perc;
      return { costCenterId: p.costCenterId, paymentCategoriesId: p.paymentCategoriesId, percentage: perc };
    });
  },

  formaPagamento(bank) {
    const pf = String((bank && (bank.paymentForm || bank.paymentTypeName || bank.paymentType)) || "").toUpperCase();
    if (pf.indexOf("PIX") >= 0) return "pix";
    if (pf.indexOf("CONCESS") >= 0) return "boleto-concessionaria";
    if (pf.indexOf("BOLETO") >= 0) return "boleto-bancario";
    if (pf.indexOf("TRANSFER") >= 0 || pf.indexOf("TED") >= 0 || pf.indexOf("DOC") >= 0 || pf === "BANK-TRANSFER") return "bank-transfer";
    if (bank && (bank.accountNumber || bank.account)) return "bank-transfer";
    return "";
  },

  async enviarDadosBancarios(billId, bank, creditorName) {
    const logs = [];
    const pForm = this.formaPagamento(bank);
    if (!pForm) {
      logs.push("Credor sem dados bancários para enviar.");
      return { ok: false, logs: logs };
    }
    if (pForm === "boleto-bancario" || pForm === "boleto-concessionaria") {
      logs.push("A forma " + pForm + " não traz código de barras no cadastro do credor.");
      return { ok: false, logs: logs };
    }
    const inst = await this.siengeJson("/bills/" + encodeURIComponent(billId) + "/installments");
    const body = inst.body || {};
    const list = body.results || body.data || (Array.isArray(body) ? body : []);
    if (!list.length) {
      logs.push("Nenhuma parcela encontrada para o título " + billId + ".");
      return { ok: false, logs: logs };
    }
    const installmentId = list[0].installmentNumber || list[0].id || 1;
    const headers = {
      Authorization: this.siengeAuth(),
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (pForm === "pix") {
      logs.push("PATCH PIX na parcela " + installmentId + ".");
      await this.siengeJson("/bills/" + encodeURIComponent(billId) + "/installments/" + encodeURIComponent(installmentId) + "/payment-information/pix", {
        method: "PATCH",
        headers: headers,
        body: JSON.stringify({
          paymentTypeId: 17,
          isUsingCreditorData: "S",
          notes: "Pagamento via PIX (Chave padrão do Credor)"
        })
      });
      logs.push("Forma de pagamento atualizada para PIX.");
      return { ok: true, logs: logs };
    }
    const isCC = bank.accountType === "Conta corrente" || bank.accountType === "CHECKING" || bank.accountType === "C";
    const accTypeChar = isCC ? "C" : "P";
    const accTypeLabel = isCC ? "Conta corrente" : "Conta poupança";
    let ag = String(bank.agency || bank.branchNumber || "").trim();
    let agNum = ag;
    let agDig = "";
    if (ag.indexOf("-") >= 0) {
      const parts = ag.split("-");
      agNum = parts[0];
      agDig = parts[1] || "";
    }
    const bankCode = String(bank.bank || bank.bankCode || "").padStart(3, "0");
    const bankName = bank.bankName || bank.nameOfBank || "";
    const bankStr = bankName ? (bankCode + "-" + bankName) : bankCode;
    const agStr = agDig ? (agNum + "-" + agDig) : (agNum + "-");
    const accNumStr = String(bank.accountNumber || bank.account || "");
    const digit = bank.checkDigit || bank.accountDigit || "";
    const accDigStr = digit ? ("-" + digit) : "";
    const favStr = String(bank.nameOfRecipient || bank.beneficiaryName || creditorName || "");
    const notesText = "Banco: " + bankStr + "\nAgência: " + agStr + "\n" + accTypeLabel + ": " + accNumStr + accDigStr + "\nFavorecido: " + favStr;
    logs.push("PATCH Transferência na parcela " + installmentId + ".");
    await this.siengeJson("/bills/" + encodeURIComponent(billId) + "/installments/" + encodeURIComponent(installmentId) + "/payment-information/bank-transfer", {
      method: "PATCH",
      headers: headers,
      body: JSON.stringify({
        paymentTypeId: 5,
        beneficiaryAccountType: accTypeChar,
        beneficiaryBankCode: bankCode,
        beneficiaryBankBranchNumber: String(agNum),
        beneficiaryBankBranchDigit: agDig ? String(agDig) : "",
        beneficiaryAccountNumber: accNumStr,
        beneficiaryAccountDigit: digit ? String(digit) : "",
        beneficiaryName: favStr,
        notes: notesText
      })
    });
    logs.push("Forma de pagamento atualizada para Transferência.");
    return { ok: true, logs: logs };
  },

  async reenviarBanco(pessoa) {
    const g = (this.state.groups || []).find((x) => x.pessoa === pessoa);
    if (!g || !g.billId) return;
    if (!g.bank) {
      alert("Este credor não tem conta bancária no cadastro.");
      return;
    }
    this.setJob("Enviando dados bancários do título " + g.billId + "…", 40);
    const logs = ["Título " + g.billId + " já existente. Reenvio dos dados bancários."];
    try {
      const banco = await this.enviarDadosBancarios(g.billId, g.bank, g.creditor && g.creditor.name);
      banco.logs.forEach((line) => logs.push(line));
      if (!banco.ok) throw new Error(banco.logs.join(" "));
      g.bankSent = true;
      await this.guardarTitulo(g, g.billId, "", "", 0, { bankSent: true });
      this.setJob("Dados bancários enviados no título " + g.billId + ".", 100);
      this.auditar({
        status: "ok",
        summary: "Dados bancários enviados no título " + g.billId + " de " + pessoa,
        titleId: String(g.billId),
        customerLabel: pessoa,
        endpoint: "/bills/" + g.billId + "/installments/payment-information",
        method: "PATCH",
        details: { pessoa: pessoa, creditorId: g.creditor && g.creditor.id, log: logs }
      });
      this.renderList();
    } catch (e) {
      const msg = (e && e.message) ? e.message : "Não consegui enviar os dados bancários.";
      logs.push(msg);
      this.auditar({
        status: "erro",
        summary: "Falha ao enviar dados bancários do título " + g.billId,
        titleId: String(g.billId),
        customerLabel: pessoa,
        method: "PATCH",
        details: { pessoa: pessoa, log: logs }
      });
      this.clearJob();
      alert(msg);
    }
  },

  async gerarMarcados() {
    const lista = this.elegiveis().filter((p) => this.state.picked && this.state.picked[p]);
    if (!lista.length) {
      alert("Marque os colaboradores sem alerta. Quem ainda está em revisão fica de fora.");
      return;
    }
    const ok = window.confirm("Gerar " + lista.length + " título(s) no Sienge?");
    if (!ok) return;
    const erros = [];
    for (let i = 0; i < lista.length; i++) {
      const pessoa = lista[i];
      this.setJob("Gerando títulos no Sienge · " + (i + 1) + " de " + lista.length + " · " + pessoa, Math.round((i / lista.length) * 100));
      const res = await this.gerarTitulo(pessoa, { skipConfirm: true, silent: true, bulk: true, bulkIndex: i, bulkTotal: lista.length });
      if (!res || !res.ok) erros.push(pessoa + ": " + ((res && res.error) || "falha"));
      else if (this.state.picked) delete this.state.picked[pessoa];
    }
    this.setJob(erros.length ? ("Geração concluída com " + erros.length + " falha(s).") : ("Títulos gerados no Sienge · " + lista.length + " de " + lista.length), 100);
    this.auditar({
      status: erros.length ? "erro" : "ok",
      summary: "Geração em massa de " + lista.length + " título(s) Rydoo" + (erros.length ? " · " + erros.length + " falha(s)" : ""),
      details: { pessoas: lista, erros: erros }
    });
    this.renderList();
    if (erros.length) alert(erros.join("\n"));
  },

  async gerarTitulo(pessoa, opts) {
    const options = opts || {};
    const g = (this.state.groups || []).find((x) => x.pessoa === pessoa);
    const rows = this.state.rows.filter((r) => (r.pessoa || "(sem nome)") === pessoa);
    const fail = (msg) => {
      if (!options.silent) alert(msg);
      return { ok: false, error: msg };
    };
    if (!g || !g.creditor) return fail("Valide o credor colaborador antes de gerar o título.");
    if (!this.colaborador(g.creditor)) return fail("O título só é gerado para colaborador pessoa física.");
    const reembolso = rows.filter((r) => r.reembolsa !== false);
    if (reembolso.some((r) => r.level !== "ok")) return fail("Ainda há despesas para revisar. O título fica disponível quando não houver alerta.");
    const total = Math.round(this.somaReembolso(rows) * 100) / 100;
    if (!(total > 0)) return fail("Não há valor reembolsável. Cartão Clara não gera título.");
    if (g.billId) return fail("Este reembolso já tem o título " + g.billId + ".");
    const comp = this.competencia(rows);
    const docNum = "Reembolso " + (comp || "");
    const obs = "Reembolso Despesas Mensais referente " + this.mesNome(comp);
    if (!options.skipConfirm) {
      const ok = window.confirm("Gerar o título " + docNum + " de " + this.money(total) + " para " + (g.creditor.name || pessoa) + " no Sienge?");
      if (!ok) return { ok: false, error: "cancelado" };
    }
    const logs = [];
    const basePct = options.bulk ? Math.round((options.bulkIndex / options.bulkTotal) * 100) : 0;
    const step = (label, pct) => {
      logs.push(label);
      if (options.bulk) this.setJob("Gerando títulos no Sienge · " + (options.bulkIndex + 1) + " de " + options.bulkTotal + " · " + label, Math.max(basePct, pct));
      else this.setJob(label, pct);
    };
    g.billBusy = true;
    this.renderList();
    let billId = "";
    try {
      step("Criando título de " + pessoa + "…", options.bulk ? basePct + 5 : 20);
      const debtorId = await this.empresaDoReembolso(reembolso);
      const departmentId = await this.departamentoTesouraria();
      const hoje = this.hojeIso();
      const payload = {
        debtorId: debtorId,
        creditorId: parseInt(g.creditor.id, 10),
        documentIdentificationId: "REEM",
        documentNumber: docNum,
        issueDate: hoje,
        installmentsNumber: 1,
        indexId: 0,
        baseDate: hoje,
        dueDate: hoje,
        billDate: hoje,
        totalInvoiceAmount: total,
        notes: obs,
        discount: 0,
        budgetCategories: this.orcamento(reembolso),
        departmentsCost: [{ departmentId: departmentId, percentage: 100 }],
        buildingsCost: [],
        taxes: [],
        units: []
      };
      const created = await this.siengeJson("/bills", {
        method: "POST",
        headers: {
          Authorization: this.siengeAuth(),
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      billId = created.body && (created.body.id || created.body.billId);
      if (!billId) {
        const loc = created.res.headers.get("Location") || created.res.headers.get("location") || "";
        const last = loc.split("/").filter(Boolean).pop();
        if (last && !isNaN(parseInt(last, 10))) billId = last;
      }
      if (!billId) {
        const busca = await siengeFetchWithRetry("/bills?startDate=" + hoje + "&endDate=" + hoje + "&debtorId=" + debtorId + "&creditorId=" + parseInt(g.creditor.id, 10));
        const found = ((busca && busca.results) || []).find((b) => String(b.documentNumber) === docNum);
        if (found && found.id) billId = found.id;
      }
      if (!billId) throw new Error("O Sienge criou o título, mas não devolveu o número.");
      g.billId = String(billId);
      logs.push("Título criado. Sienge ID: " + billId);
      let bankOk = false;
      let bankMsg = "";
      step("Enviando dados bancários do título " + billId + "…", options.bulk ? basePct + 12 : 55);
      try {
        const banco = await this.enviarDadosBancarios(billId, g.bank, g.creditor.name);
        banco.logs.forEach((line) => logs.push(line));
        bankOk = banco.ok;
        if (!bankOk) bankMsg = banco.logs.join(" ");
      } catch (e) {
        bankMsg = (e && e.message) ? e.message : "Falha ao enviar os dados bancários.";
        logs.push(bankMsg);
      }
      g.bankSent = bankOk;
      step("Anexando PDF do título " + billId + "…", options.bulk ? basePct + 18 : 80);
      await this.anexarPdf(g, rows, billId);
      logs.push("PDF anexado.");
      await this.guardarTitulo(g, billId, docNum, obs, total, { bankSent: bankOk });
      g.billBusy = false;
      if (!options.bulk) this.setJob("Título " + billId + " gerado no Sienge.", 100);
      this.renderList();
      this.auditar({
        status: bankOk ? "ok" : "erro",
        summary: "Título " + billId + " gerado para " + pessoa + (bankOk ? ", com dados bancários." : ". Dados bancários não enviados."),
        titleId: String(billId),
        customerLabel: (g.creditor && g.creditor.name) || pessoa,
        endpoint: "/bills",
        method: "POST",
        details: {
          pessoa: pessoa,
          creditorId: g.creditor.id,
          documentNumber: docNum,
          total: total,
          bankSent: bankOk,
          log: logs
        }
      });
      if (!options.silent) {
        alert(bankOk
          ? ("Título " + billId + " gerado no Sienge, com dados bancários e PDF.")
          : ("Título " + billId + " gerado, mas os dados bancários não foram enviados. " + bankMsg));
      }
      return { ok: true, billId: String(billId), bankSent: bankOk, error: bankOk ? "" : bankMsg };
    } catch (e) {
      g.billBusy = false;
      this.renderList();
      const msg = (e && e.message) ? e.message : "Não consegui gerar o título no Sienge.";
      logs.push(msg);
      if (!options.bulk) this.clearJob();
      this.auditar({
        status: "erro",
        summary: "Falha ao gerar título de " + pessoa,
        titleId: billId ? String(billId) : "",
        customerLabel: pessoa,
        endpoint: "/bills",
        method: "POST",
        details: { pessoa: pessoa, log: logs }
      });
      if (!options.silent) alert(msg);
      return { ok: false, error: msg, billId: billId ? String(billId) : "" };
    }
  },

  async anexarPdf(g, rows, billId) {
    const grupo = Object.assign({}, g, { rows: rows.filter((r) => r.reembolsa !== false) });
    let logo = null;
    try { logo = await this.logoJpeg(); } catch (e) { logo = null; }
    const bytes = this.montarPdf(grupo, logo);
    const comp = this.competencia(grupo.rows).replace(".", "-") || "reembolso";
    const nome = "reembolso-" + comp + ".pdf";
    const file = new Blob([bytes], { type: "application/pdf" });
    const form = new FormData();
    form.append("file", file, nome);
    const res = await fetch(this.siengeUrl("/bills/" + encodeURIComponent(billId) + "/attachments?description=" + encodeURIComponent(nome)), {
      method: "POST",
      headers: { Authorization: this.siengeAuth() },
      body: form
    });
    if (!res.ok) {
      let msg = "";
      try { msg = await res.text(); } catch (e) {}
      throw new Error("O título " + billId + " foi criado, mas o PDF não subiu. " + msg);
    }
  },

  async guardarTitulo(g, billId, docNum, obs, total, extra) {
    const fb = this.fb();
    if (!fb) return;
    const id = this.tituloDocId(g);
    if (!id) return;
    const data = Object.assign({
      billId: String(billId),
      pessoa: g.pessoa,
      creditorId: g.creditor && g.creditor.id,
      bankSent: !!(extra && extra.bankSent)
    }, extra || {});
    if (docNum) {
      data.documentNumber = docNum;
      data.createdAt = new Date().toISOString();
    }
    if (obs) data.notes = obs;
    if (total) data.total = total;
    if (extra && extra.bankSent) data.bankSentAt = new Date().toISOString();
    await fb.fx.setDoc(fb.fx.doc(fb.db, "rydoo_titulos", id), data, { merge: true });
  }
};

window.RydooApp = RydooApp;
document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "rydoo") RydooApp.init();
});
