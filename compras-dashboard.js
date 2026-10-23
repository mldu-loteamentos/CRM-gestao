/**
 * Compras · Dashboard.
 * Conta o documento pela data em que entrou no Sienge (registeredDate).
 * O prazo de pagamento é o vencimento menos a emissão, ponderado pelo valor.
 */
const ComprasDashboardApp = {
  state: {
    inited: false,
    loading: false,
    loaded: false,
    error: "",
    etapa: "",
    pct: 8,
    aviso: "",
    titles: [],
    deptKey: "",
    updatedAt: null
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  },

  isoToday() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  isoDate(v) {
    const s = String(v == null ? "" : v).trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  },

  shiftMonth(iso, delta) {
    const y = Number(String(iso).slice(0, 4));
    const m = Number(String(iso).slice(5, 7)) - 1;
    const d = new Date(y, m + delta, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01";
  },

  addDays(iso, days) {
    const s = this.isoDate(iso);
    const d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  dayDiff(issue, registered) {
    const a = this.isoDate(issue);
    const b = this.isoDate(registered);
    if (!a || !b) return null;
    const da = Date.parse(a + "T12:00:00");
    const db = Date.parse(b + "T12:00:00");
    if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
    return Math.round((db - da) / 86400000);
  },

  fmtInt(n) {
    return Number(n || 0).toLocaleString("pt-BR");
  },

  fmtDays(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  },

  stamp(d) {
    if (!d) return "—";
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear()
      + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  },

  fmtBr(iso) {
    const s = this.isoDate(iso);
    if (!s) return "—";
    return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
  },

  windows() {
    const today = this.isoToday();
    const histStart = this.shiftMonth(today, -12);
    const avgStart = this.shiftMonth(today, -3);
    return { today, histStart, avgStart };
  },

  access() {
    const app = window.ComprasPrevisoesApp;
    if (!app || typeof app.accessibleDepartments !== "function") return null;
    return app.accessibleDepartments();
  },

  injectCss() {
    const prev = document.getElementById("cdash-style");
    if (prev) prev.remove();
    const style = document.createElement("style");
    style.id = "cdash-style";
    style.textContent = `
      .cdash { color: #334155; }
      .cdash-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
      .cdash-field { display: flex; align-items: center; gap: 8px; font-size: 0.78rem; font-weight: 700; color: #64748b; }
      .cdash-field select { height: 36px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; padding: 0 10px; font-size: 0.85rem; color: #334155; min-width: 180px; }
      .cdash-side { display: flex; align-items: center; gap: 12px; margin-left: auto; }
      .cdash-when { font-size: 0.75rem; color: #94a3b8; }
      .cdash-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0 0 10px; }
      .cdash-kpi { text-align: left; padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
      .cdash-kpi span { display: block; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #64748b; }
      .cdash-kpi strong { display: block; font-size: 1.65rem; font-weight: 650; color: #0f172a; line-height: 1.15; margin-top: 4px; }
      .cdash-kpi em { display: block; margin-top: 4px; font-style: normal; font-size: 0.78rem; color: #64748b; }
      .cdash-cap { font-size: 0.75rem; color: #94a3b8; margin: 0 0 14px; }
      .cdash-block h3 { text-align: center; font-size: 0.95rem; font-weight: 600; color: #64748b; margin: 8px 0 10px; }
      .cdash-bars { display: flex; align-items: flex-end; gap: 6px; height: 168px; }
      .cdash-bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 0; height: 100%; }
      .cdash-bar b { font-size: 0.68rem; color: #475569; font-weight: 650; }
      .cdash-bar .col { width: 70%; background: #6b7280; border-radius: 1px 1px 0 0; margin-top: 3px; }
      .cdash-bar small, .cdash-bar em { font-size: 0.68rem; color: #64748b; font-style: normal; line-height: 1.15; }
      .cdash-bar em { min-height: 0.8rem; }
      .cdash-area { width: 100%; height: 180px; display: block; }
      .cdash-gauge-wrap { text-align: center; }
      .cdash-gauge-wrap h3 { margin: 0; font-size: 0.95rem; color: #64748b; font-weight: 600; }
      .cdash-gauge-wrap p { margin: 2px 0 0; font-size: 0.78rem; color: #94a3b8; }
      .cdash-gauge { width: min(100%, 340px); height: auto; }
      .cdash-gauge-num { font-size: 2rem; font-weight: 650; fill: #334155; }
      .cdash-gauge-sub { font-size: 0.72rem; fill: #94a3b8; }
      .cdash-table-wrap { max-height: 420px; overflow: auto; border-top: 1px solid #e2e8f0; }
      .cdash-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .cdash-table th { text-align: left; font-weight: 600; color: #64748b; padding: 8px 6px; position: sticky; top: 0; background: #fff; }
      .cdash-table th.num, .cdash-table td.num { text-align: right; }
      .cdash-table td { padding: 5px 6px; border-top: 1px solid #f1f5f9; }
      .cdash-table tr.total td { font-weight: 750; border-top: 1px solid #cbd5e1; }
      .cdash-time { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
      .cdash-time i { display: block; height: 14px; background: #f43f5e; border-radius: 2px; min-width: 2px; }
      .cdash-msg { padding: 28px 8px; text-align: center; color: #64748b; }
      .cdash-load { padding: 36px 0; }
      .cdash-btn { height: 36px; border: 1px solid #105436; background: #105436; color: #fff; border-radius: 6px; font-weight: 700; padding: 0 14px; cursor: pointer; }
      @media (max-width: 800px) { .cdash-kpis { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  },

  deptOf(bill) {
    const list = Array.isArray(bill && bill.departamentsCosts) ? bill.departamentsCosts : [];
    return list.map((dep) => {
      const id = dep && (dep.id != null ? dep.id : (dep.departmentId != null ? dep.departmentId : dep.departamentId));
      return {
        id: id != null ? String(id) : "",
        name: String((dep && dep.name) || "").trim()
      };
    }).filter((d) => d.id || d.name);
  },

  tipoNota(code, name) {
    const c = this.fold(code).replace(/[^A-Z0-9]/g, "");
    const n = this.fold(name);
    if (c.indexOf("NFSE") === 0 || c === "NFS" || c.indexOf("NFS") === 0 || n.indexOf("SERVIC") >= 0) return "NFS";
    if (c.indexOf("NFE") === 0 || (n.indexOf("ELETRON") >= 0 && n.indexOf("SERVIC") < 0)) return "NFE";
    return "";
  },

  collect(payload, bag) {
    const bills = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const doc = String(bill.documentIdentificationId || "").trim().toUpperCase();
      const nome = String(bill.documentIdentificationName || "").trim();
      const amount = Number(bill.originalAmount != null ? bill.originalAmount : (bill.balanceAmount != null ? bill.balanceAmount : bill.amount));
      bag.push({
        id: String(bill.billId),
        parcela: bill.installmentId != null ? String(bill.installmentId) : "",
        doc: doc || "—",
        tipo: this.tipoNota(doc, nome),
        issue: this.isoDate(bill.issueDate),
        registered: this.isoDate(bill.registeredDate),
        due: this.isoDate(bill.dueDate),
        amount: Number.isFinite(amount) ? amount : 0,
        depts: this.deptOf(bill)
      });
    });
  },

  dedupe(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = row.id + "|" + row.parcela + "|" + row.due;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          id: row.id,
          parcela: row.parcela,
          doc: row.doc,
          tipo: row.tipo,
          issue: row.issue,
          registered: row.registered,
          due: row.due,
          amount: row.amount,
          depts: row.depts.slice()
        });
        return;
      }
      if (!prev.issue && row.issue) prev.issue = row.issue;
      if (!prev.registered && row.registered) prev.registered = row.registered;
      if (row.registered && prev.registered && row.registered < prev.registered) prev.registered = row.registered;
      if (!prev.due && row.due) prev.due = row.due;
      if (!prev.tipo && row.tipo) prev.tipo = row.tipo;
      if (!(prev.amount > 0) && row.amount > 0) prev.amount = row.amount;
      row.depts.forEach((d) => {
        const mark = d.id + "|" + this.fold(d.name);
        if (!prev.depts.some((x) => (x.id + "|" + this.fold(x.name)) === mark)) prev.depts.push(d);
      });
    });
    return [...map.values()].map((row) => {
      row.prazo = this.dayDiff(row.issue, row.due);
      return row;
    });
  },

  payloadRows(payload) {
    return (payload && payload.data) || (Array.isArray(payload) ? payload : []);
  },

  CACHE: "compras_dashboard_cache",
  LOOKBACK: 400,

  /* Últimos 30 dias saem da API. O que é anterior já está no Firebase. */
  corte() {
    const today = this.isoToday();
    const apiFrom = this.addDays(today, -29);
    return { today, apiFrom, histEnd: this.addDays(apiFrom, -1), anoIni: "2025-01-01" };
  },

  compactar(row) {
    return [
      row.id, row.parcela || "", row.doc || "", row.tipo || "",
      row.issue || "", row.registered || "", row.due || "", Number(row.amount) || 0,
      (row.depts || []).map((d) => (d.id || "") + "\t" + (d.name || "")).join("\n")
    ];
  },

  expandir(a) {
    if (!Array.isArray(a) || a[0] == null) return null;
    const depts = String(a[8] || "").split("\n").filter(Boolean).map((s) => {
      const t = s.split("\t");
      return { id: t[0] || "", name: t[1] || "" };
    });
    return {
      id: String(a[0]),
      parcela: String(a[1] || ""),
      doc: String(a[2] || ""),
      tipo: String(a[3] || ""),
      issue: this.isoDate(a[4]),
      registered: this.isoDate(a[5]),
      due: this.isoDate(a[6]),
      amount: Number(a[7]) || 0,
      depts
    };
  },

  fb() {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || typeof fx.getDocs !== "function" || typeof fx.setDoc !== "function") return null;
    return { fx, db };
  },

  async lerTudo() {
    const fb = this.fb();
    if (!fb) return null;
    const snap = await fb.fx.getDocs(fb.fx.collection(fb.db, this.CACHE));
    const docs = {};
    snap.forEach((d) => { docs[d.id] = d.data() || {}; });
    const meta = docs._meta || {};
    const meses = {};
    Object.keys(docs).forEach((id) => {
      if (id === "_meta" || id.indexOf("~") >= 0) return;
      const doc = docs[id];
      let texto = doc.payload || "";
      const n = Number(doc.partes) || 0;
      if (n) {
        texto = "";
        for (let i = 0; i < n; i++) texto += (docs[id + "~" + i] && docs[id + "~" + i].texto) || "";
      }
      let cru = [];
      try { cru = JSON.parse(texto || "[]"); } catch (e) { cru = []; }
      meses[id] = (Array.isArray(cru) ? cru : []).map((item) => this.expandir(item)).filter((r) => r && r.registered);
    });
    return { cobertoAte: this.isoDate(meta.cobertoAte), meses };
  },

  async salvarMes(mes, rows) {
    const fb = this.fb();
    if (!fb) return;
    const texto = JSON.stringify((rows || []).map((r) => this.compactar(r)));
    const LIM = 350000;
    const partes = [];
    if (texto.length > LIM) {
      for (let i = 0, n = 0; i < texto.length; i += LIM, n++) {
        const pid = mes + "~" + n;
        partes.push(pid);
        await fb.fx.setDoc(fb.fx.doc(fb.db, this.CACHE, pid), { tipo: "parte", mes, texto: texto.slice(i, i + LIM) });
      }
    }
    await fb.fx.setDoc(fb.fx.doc(fb.db, this.CACHE, mes), {
      mes,
      em: new Date().toISOString(),
      n: (rows || []).length,
      partes: partes.length,
      payload: partes.length ? "" : texto
    });
  },

  async salvarMeta(cobertoAte) {
    const fb = this.fb();
    if (!fb) return;
    await fb.fx.setDoc(fb.fx.doc(fb.db, this.CACHE, "_meta"), {
      cobertoAte: cobertoAte,
      em: new Date().toISOString()
    }, { merge: true });
  },

  async mesclar(rows, desde, ate) {
    const porMes = new Map();
    (rows || []).forEach((r) => {
      if (!r.registered || r.registered < desde || r.registered > ate) return;
      const mes = r.registered.slice(0, 7);
      if (!porMes.has(mes)) porMes.set(mes, []);
      porMes.get(mes).push(r);
    });
    for (const [mes, lista] of porMes) {
      const cache = this._cacheMeses || {};
      const antigo = cache[mes] || [];
      const fica = antigo.filter((r) => r.registered < desde || r.registered > ate);
      const junto = this.dedupe(fica.concat(lista));
      cache[mes] = junto;
      this._cacheMeses = cache;
      await this.salvarMes(mes, junto);
    }
  },

  async buscarIntervalo(start, end, rotulo) {
    const bag = [];
    const ini = new Date(start + "T12:00:00");
    const fim = new Date(end + "T12:00:00");
    const total = Math.max(1, Math.round((fim - ini) / 86400000));
    let cursor = start;
    while (cursor <= end) {
      const sliceEnd = this.addDays(cursor, 89);
      const ate = sliceEnd > end ? end : sliceEnd;
      const feito = new Date(cursor + "T12:00:00");
      this.state.etapa = rotulo;
      this.state.pct = Math.max(8, Math.min(92, Math.round(((feito - ini) / 86400000) / total * 100)));
      this.render();
      const payload = await this.fetchOutcome(cursor, ate, 0);
      this.collect(payload, bag);
      cursor = this.addDays(ate, 1);
    }
    return bag;
  },

  async fetchOutcome(start, end, depth) {
    const endpoint = "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=I&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
    try {
      return await window.siengeFetchWithRetry(endpoint, 1);
    } catch (err) {
      const st = Number(err && err.status);
      const pesado = st === 500 || st === 502 || st === 503 || st === 504 || st === 507;
      const a = new Date(String(start).slice(0, 10) + "T12:00:00");
      const b = new Date(String(end).slice(0, 10) + "T12:00:00");
      const dias = Math.round((b - a) / 86400000);
      if (!pesado || depth > 10 || !(dias >= 14)) {
        if (st === 502) throw new Error("O Sienge não respondeu ao contas a pagar (502). Atualize de novo.");
        throw err;
      }
      const meio = new Date(a.getTime() + Math.floor((b - a) / 2));
      const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const esqFim = iso(meio);
      const dir = new Date(meio.getTime());
      dir.setDate(dir.getDate() + 1);
      const dirIni = iso(dir);
      if (esqFim <= start || dirIni > end) throw err;
      const left = await this.fetchOutcome(start, esqFim, depth + 1);
      const right = await this.fetchOutcome(dirIni, end, depth + 1);
      return { data: this.payloadRows(left).concat(this.payloadRows(right)) };
    }
  },

  async load() {
    if (this.state.loading) return;
    this.state.loading = true;
    this.state.error = "";
    this.state.aviso = "";
    this.state.etapa = "Lendo o histórico no Firebase…";
    this.state.pct = 8;
    this.render();
    const corte = this.corte();
    try {
      if (typeof window.siengeFetchWithRetry !== "function") throw new Error("API Sienge indisponível.");
      let cache = null;
      try { cache = await this.lerTudo(); } catch (e) { cache = null; }
      this._cacheMeses = (cache && cache.meses) || {};
      const coberto = (cache && cache.cobertoAte) || "";
      let historico = [];
      Object.keys(this._cacheMeses).forEach((mes) => {
        this._cacheMeses[mes].forEach((r) => {
          if (r.registered >= corte.anoIni && r.registered <= corte.histEnd) historico.push(r);
        });
      });
      if (!coberto || coberto < corte.histEnd) {
        const gapIni = coberto && coberto >= corte.anoIni ? this.addDays(coberto, 1) : corte.anoIni;
        const rotulo = gapIni <= "2025-12-31"
          ? "Buscando 2025 e o restante de 2026 no Sienge…"
          : "Buscando o restante de 2026 no Sienge…";
        const bag = await this.buscarIntervalo(this.addDays(gapIni, -this.LOOKBACK), corte.histEnd, rotulo);
        const novos = this.dedupe(bag).filter((r) => r.registered >= gapIni && r.registered <= corte.histEnd);
        this.state.etapa = "Salvando o histórico no Firebase…";
        this.state.pct = 94;
        this.render();
        try {
          await this.mesclar(novos, gapIni, corte.histEnd);
          await this.salvarMeta(corte.histEnd);
        } catch (e) {
          console.warn("[Dashboard] histórico", e);
          this.state.aviso = "Consultei o Sienge, mas não consegui gravar o histórico no Firebase.";
        }
        historico = historico.filter((r) => r.registered < gapIni).concat(novos);
      }
      this.state.etapa = "Buscando os últimos 30 dias…";
      this.state.pct = 96;
      this.render();
      let frescos = [];
      try {
        const bag = await this.buscarIntervalo(this.addDays(corte.apiFrom, -this.LOOKBACK), corte.today, "Buscando os últimos 30 dias…");
        frescos = this.dedupe(bag).filter((r) => r.registered >= corte.apiFrom && r.registered <= corte.today);
        this.state.etapa = "Salvando os últimos 30 dias no Firebase…";
        this.state.pct = 98;
        this.render();
        await this.mesclar(frescos, corte.apiFrom, corte.today);
        await this.salvarMeta(corte.today);
      } catch (e) {
        this.state.aviso = (e && e.message) ? e.message : "Não consegui atualizar os últimos 30 dias no Sienge.";
        frescos = [];
      }
      this.state.titles = this.dedupe(historico.concat(frescos));
      this.state.updatedAt = new Date();
      this.state.loaded = true;
      this.state.pct = 100;
      if (!this.state.titles.length && this.state.aviso) this.state.error = this.state.aviso;
    } catch (e) {
      this.state.error = (e && e.message) ? e.message : "Falha ao buscar os títulos no Sienge.";
      this.state.titles = [];
    }
    this.state.loading = false;
    this.render();
  },

  titleVisible(row) {
    const access = this.access();
    if (!access) return true;
    const allowed = new Set(access.map((a) => String(a.id)));
    return row.depts.some((d) => allowed.has(d.id) || allowed.has(this.fold(d.name)));
  },

  titleInDept(row) {
    const key = String(this.state.deptKey || "");
    if (!key) return true;
    const folded = this.fold(key);
    return row.depts.some((d) => d.id === key || this.fold(d.id) === folded || this.fold(d.name) === folded);
  },

  scoped() {
    const win = this.windows();
    return (this.state.titles || []).filter((row) =>
      row.registered && row.registered >= win.histStart && row.registered <= win.today
      && this.titleVisible(row) && this.titleInDept(row)
    );
  },

  deptOptions() {
    const access = this.access();
    if (Array.isArray(access)) {
      return access.map((a) => ({ id: String(a.id), label: a.label || a.name || a.id }));
    }
    const map = new Map();
    (this.state.titles || []).forEach((row) => {
      row.depts.forEach((d) => {
        const id = d.id || this.fold(d.name);
        if (!id || map.has(id)) return;
        map.set(id, d.name || d.id);
      });
    });
    return [...map.entries()]
      .map(([id, label]) => ({ id, label: String(label).toUpperCase() }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  },

  pmp(rows) {
    const porDoc = new Map();
    (rows || []).forEach((row) => {
      if (row.prazo == null || !Number.isFinite(row.prazo)) return;
      if (!porDoc.has(row.id)) porDoc.set(row.id, { dias: [], amount: 0 });
      const item = porDoc.get(row.id);
      item.dias.push(row.prazo);
      if (row.amount > item.amount) item.amount = row.amount;
    });
    let peso = 0;
    let soma = 0;
    const soltos = [];
    porDoc.forEach((item) => {
      const medio = item.dias.reduce((a, b) => a + b, 0) / item.dias.length;
      if (item.amount > 0.009) {
        peso += item.amount;
        soma += item.amount * medio;
      } else soltos.push(medio);
    });
    if (peso > 0.009) return soma / peso;
    if (!soltos.length) return null;
    return soltos.reduce((a, b) => a + b, 0) / soltos.length;
  },

  documentos(rows) {
    return new Set((rows || []).map((r) => r.id)).size;
  },

  doTipo(rows, tipo) {
    return (rows || []).filter((r) => r.tipo === tipo);
  },

  deptRows(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
      const depts = row.depts.length ? row.depts : [{ id: "", name: "Sem departamento" }];
      depts.forEach((d) => {
        const id = d.id || this.fold(d.name) || "sem";
        if (!map.has(id)) map.set(id, { nome: (d.name || d.id || "Sem departamento").toUpperCase(), rows: [] });
        map.get(id).rows.push(row);
      });
    });
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },

  tabelaHtml(rows) {
    const linhas = this.deptRows(rows);
    const cel = (lista, tipo) => {
      const parte = this.doTipo(lista, tipo);
      return '<td class="num">' + this.fmtInt(this.documentos(parte)) + '</td><td class="num">' + this.fmtDays(this.pmp(parte)) + "</td>";
    };
    const corpo = linhas.map((l) =>
      "<tr><td>" + this.esc(l.nome) + "</td>" + cel(l.rows, "NFE") + cel(l.rows, "NFS") + "</tr>"
    ).join("");
    const total = '<tr class="total"><td>Total</td>' + cel(rows, "NFE") + cel(rows, "NFS") + "</tr>";
    return '<div class="cdash-table-wrap"><table class="cdash-table"><thead><tr>'
      + '<th>Departamento</th><th class="num">NFe</th><th class="num">PMP NFe</th><th class="num">NFS</th><th class="num">PMP NFS</th>'
      + "</tr></thead><tbody>" + corpo + total + "</tbody></table></div>";
  },

  render() {
    const root = document.getElementById("compras-dashboard-root");
    if (!root) return;
    this.injectCss();
    const win = this.windows();
    const options = this.deptOptions();
    const locked = Array.isArray(this.access()) && options.length <= 1;
    if (locked && options[0]) this.state.deptKey = options[0].id;
    const known = new Set(options.map((o) => o.id));
    if (this.state.deptKey && !known.has(this.state.deptKey)) this.state.deptKey = "";
    const select = '<select id="cdash-dept"' + (locked ? " disabled" : "") + ">"
      + (locked ? "" : '<option value="">Todos</option>')
      + options.map((o) => '<option value="' + this.esc(o.id) + '"' + (o.id === this.state.deptKey ? " selected" : "") + ">" + this.esc(o.label) + "</option>").join("")
      + "</select>";
    const hist = this.scoped();
    const nfe = this.doTipo(hist, "NFE");
    const nfs = this.doTipo(hist, "NFS");
    let body;
    const access = this.access();
    if (this.state.loading) {
      const pct = Math.max(8, Math.min(96, Number(this.state.pct) || 12));
      body = '<div class="ml-load cdash-load"><div class="loading-spinner" aria-hidden="true"></div>'
        + '<div class="loading-status-text">' + this.esc(this.state.etapa || "Buscando os títulos a pagar…") + "</div>"
        + '<div class="ml-load-track"><div class="loading-progress-bar" style="width:' + pct + '%"></div></div></div>';
    } else if (this.state.error) {
      body = '<div class="cdash-msg">' + this.esc(this.state.error) + "</div>";
    } else if (Array.isArray(access) && !access.length) {
      body = '<div class="cdash-msg">Seu usuário não tem departamento cadastrado.</div>';
    } else if (!hist.length) {
      body = '<div class="cdash-msg">Nenhum documento inserido de ' + this.fmtBr(win.histStart) + " até " + this.fmtBr(win.today) + ".</div>";
    } else {
      body = '<div class="cdash-kpis">'
        + '<div class="cdash-kpi"><span>Documentos inseridos</span><strong>' + this.fmtInt(this.documentos(hist)) + "</strong><em>" + this.fmtBr(win.histStart) + " a " + this.fmtBr(win.today) + "</em></div>"
        + '<div class="cdash-kpi"><span>NFe</span><strong>' + this.fmtInt(this.documentos(nfe)) + "</strong><em>Prazo médio " + this.fmtDays(this.pmp(nfe)) + " dias</em></div>"
        + '<div class="cdash-kpi"><span>NFS</span><strong>' + this.fmtInt(this.documentos(nfs)) + "</strong><em>Prazo médio " + this.fmtDays(this.pmp(nfs)) + " dias</em></div></div>"
        + '<p class="cdash-cap">Prazo: vencimento menos a emissão, ponderado pelo valor. Até ' + this.fmtBr(this.corte().histEnd) + ' a leitura é do Firebase. Os últimos 30 dias vêm do Sienge.</p>'
        + (this.state.aviso ? '<p class="cdash-cap">' + this.esc(this.state.aviso) + "</p>" : "")
        + this.tabelaHtml(hist);
    }
    root.innerHTML = '<div class="cdash">'
      + '<div class="cdash-top"><label class="cdash-field">Departamento ' + select + '</label>'
      + '<div class="cdash-side"><span class="cdash-when">Atualizado em ' + this.esc(this.stamp(this.state.updatedAt)) + '</span>'
      + '<button type="button" class="cdash-btn" id="cdash-refresh">Atualizar</button></div></div>'
      + body + "</div>";
    const dept = document.getElementById("cdash-dept");
    if (dept) dept.addEventListener("change", () => {
      this.state.deptKey = dept.value;
      this.render();
    });
    const refresh = document.getElementById("cdash-refresh");
    if (refresh) refresh.addEventListener("click", () => this.load());
  },

  init() {
    this.state.inited = true;
    this.render();
    if (!this.state.loaded && !this.state.loading) this.load();
  }
};

window.ComprasDashboardApp = ComprasDashboardApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "compras-dashboard" && window.ComprasDashboardApp) {
    ComprasDashboardApp.init();
  }
});
