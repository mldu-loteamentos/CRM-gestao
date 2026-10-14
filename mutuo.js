// Mútuo — contas de mútuo por empresa, fora do fluxo de caixa diário.
window.MutuoApp = {
  companies: [],
  companyIds: [],
  empOpen: false,
  empQuery: "",
  picked: false,
  loading: false,
  progress: "",
  pct: 0,
  error: "",
  grupos: [],
  abertos: {},
  sortAcc: { key: "nome", dir: "asc" },
  sortMov: { key: "data", dir: "desc" },
  _gen: 0,

  hoje() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  },

  inicioMes() {
    return this.hoje().slice(0, 8) + "01";
  },

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  fmtDate(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—";
  },

  norm(v) {
    return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
  },

  semAcento(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  },

  ehMutuo(raw) {
    const type = raw && raw.accountType;
    const typeId = String((type && typeof type === "object" ? type.id : (raw && raw.accountTypeId)) || "").trim().toUpperCase();
    const desc = this.semAcento((type && typeof type === "object" ? (type.description || type.name) : type) || (raw && raw.accountKind) || "");
    const nome = this.semAcento([raw && raw.accountName, raw && raw.name, raw && raw.description].filter(Boolean).join(" "));
    return typeId === "M" || /MUTUO/.test(desc) || /MUTUO/.test(nome);
  },

  saldoDe(row) {
    if (typeof caixaBalance === "function") return caixaBalance(row);
    const n = Number(row && (row.amount != null ? row.amount : row.balance));
    return Number.isFinite(n) ? n : 0;
  },

  valorMov(m) {
    const raw = Number(m.bankMovementAmount) || 0;
    if (raw <= 0) return raw;
    const norm = (v) => (v == null || typeof v === "object") ? "" : this.semAcento(v);
    const tipo = norm(m.bankMovementOperationType || m.operationType);
    if (/^(S|D)$/.test(tipo) || /DEBIT|SAIDA/.test(tipo)) return -raw;
    if (/^(E|C)$/.test(tipo) || /CREDIT|ENTRADA/.test(tipo)) return raw;
    const op = norm(m.bankMovementOperationName);
    if (/PAGAMENTO|PAGTO|DEBITO|TARIFA|SAIDA/.test(op)) return -raw;
    if (/RECEBIMENTO|CREDITO|ENTRADA/.test(op)) return raw;
    return raw;
  },

  async ensureCompanies() {
    if (this.companies.length) return;
    const local = (window.AppState && AppState.companies) || [];
    if (local.length) {
      this.companies = local.map((c) => ({ id: String(c.id), name: c.name || c.tradeName || "" }));
      return;
    }
    if (window.SiengeApiService && typeof SiengeApiService.getCompanies === "function") {
      try {
        const list = await SiengeApiService.getCompanies(false);
        const rows = Array.isArray(list) ? list : ((list && list.results) || []);
        this.companies = rows.map((c) => ({ id: String(c.id), name: c.name || c.tradeName || "" }));
      } catch (e) {
        this.companies = [];
      }
    }
  },

  gerida(id) {
    if (window.FluxoCaixaDiarioApp && typeof FluxoCaixaDiarioApp.empresaGerida === "function") {
      return FluxoCaixaDiarioApp.empresaGerida(id);
    }
    return true;
  },

  geridas() {
    return (this.companies || []).filter((c) => this.gerida(c.id));
  },

  escolhidas() {
    const todas = this.geridas();
    if (!this.picked) return todas;
    const set = new Set(this.companyIds.map(String));
    return todas.filter((c) => set.has(String(c.id)));
  },

  async mapaLimite(itens, limite, fn) {
    const out = new Array(itens.length);
    let cursor = 0;
    const workers = new Array(Math.min(limite, itens.length)).fill(0).map(async () => {
      while (cursor < itens.length) {
        const i = cursor++;
        out[i] = await fn(itens[i], i);
      }
    });
    await Promise.all(workers);
    return out;
  },

  async carregar() {
    const gen = ++this._gen;
    this.loading = true;
    this.error = "";
    this.progress = "Lendo as contas de mútuo…";
    this.pct = 15;
    this.render();
    await this.ensureCompanies();
    if (this._gen !== gen) return;
    const alvos = this.escolhidas();
    if (!alvos.length) {
      this.grupos = [];
      this.loading = false;
      this.progress = "";
      this.render();
      return;
    }
    const svc = window.SiengeApiService;
    if (!svc || typeof svc.getCheckingAccounts !== "function" || typeof svc.getAccountBalances !== "function") {
      this.error = "A consulta de contas do Sienge não está disponível.";
      this.loading = false;
      this.render();
      return;
    }
    const hoje = this.hoje();
    const partes = await this.mapaLimite(alvos, 4, async (co) => {
      let contas = [];
      let saldos = [];
      try {
        const res = await svc.getCheckingAccounts(co.id, { allStatuses: true });
        contas = (res && res.results) || [];
      } catch (e) { contas = []; }
      try {
        saldos = await svc.getAccountBalances(hoje, { companyId: co.id });
      } catch (e) { saldos = []; }
      return { co, contas, saldos: Array.isArray(saldos) ? saldos : [] };
    });
    if (this._gen !== gen) return;
    this.pct = 55;
    this.progress = "Lendo o movimento do mês…";
    this.render();
    const grupos = [];
    partes.forEach((p) => {
      if (!p) return;
      const saldoPorNum = {};
      (p.saldos || []).forEach((row) => {
        const num = this.norm(row.accountNumber || row.number);
        if (!num) return;
        saldoPorNum[num] = this.saldoDe(row);
      });
      const contas = (p.contas || []).filter((raw) => this.ehMutuo(raw)).map((raw) => {
        const numero = String(raw.accountNumber || raw.number || "").trim();
        const nome = String(raw.accountName || raw.name || raw.description || numero || "Mútuo").trim();
        const status = String(raw.accountStatus || "ENABLED").toUpperCase();
        const saldo = saldoPorNum[this.norm(numero)] || 0;
        let banco = "";
        if (window.RelacionamentoApp && typeof RelacionamentoApp._bancoDaConta === "function") {
          const info = RelacionamentoApp._bancoDaConta(raw);
          banco = (info && info.bancoLabel) || "";
        }
        return { numero, nome, saldo, banco, status };
      }).filter((c) => c.status !== "DISABLED" || Math.abs(c.saldo) >= 0.005);
      if (!contas.length) return;
      grupos.push({
        id: String(p.co.id),
        nome: String(p.co.name || ""),
        contas,
        saldo: contas.reduce((s, c) => s + c.saldo, 0),
        movs: []
      });
    });
    const ini = this.inicioMes();
    await this.mapaLimite(grupos, 3, async (g) => {
      let list = [];
      try {
        list = await svc.getBankMovements(ini, hoje, { companyId: g.id });
      } catch (e) { list = []; }
      const nums = new Set(g.contas.map((c) => this.norm(c.numero)));
      const nomes = {};
      g.contas.forEach((c) => { nomes[this.norm(c.numero)] = c.nome; });
      g.movs = (Array.isArray(list) ? list : []).map((m) => {
        const conta = String(m.accountNumber || "").trim();
        return {
          data: String(m.bankMovementDate || "").slice(0, 10),
          conta,
          nome: nomes[this.norm(conta)] || conta,
          historico: String(m.historic || m.history || m.bankMovementHistoricName || m.bankMovementOperationName || m.documentIdentificationName || "").trim(),
          valor: this.valorMov(m)
        };
      }).filter((m) => m.data && nums.has(this.norm(m.conta)) && Math.abs(m.valor) >= 0.005);
    });
    if (this._gen !== gen) return;
    grupos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || Number(a.id) - Number(b.id));
    this.grupos = grupos;
    this.loading = false;
    this.progress = "";
    this.pct = 100;
    this.render();
  },

  toggleGrupo(id) {
    const key = String(id);
    this.abertos[key] = !this.abertos[key];
    this.render();
  },

  toggleSort(scope, key) {
    const st = scope === "mov" ? this.sortMov : this.sortAcc;
    if (st.key === key) st.dir = st.dir === "asc" ? "desc" : "asc";
    else {
      st.key = key;
      st.dir = key === "data" || key === "saldo" || key === "valor" ? "desc" : "asc";
    }
    this.render();
  },

  ordenar(lista, scope) {
    const st = scope === "mov" ? this.sortMov : this.sortAcc;
    const dir = st.dir === "desc" ? -1 : 1;
    const valor = (row) => {
      if (st.key === "saldo" || st.key === "valor") return Number(row.saldo != null ? row.saldo : row.valor) || 0;
      if (st.key === "data") return String(row.data || "");
      if (st.key === "numero" || st.key === "conta") return String(row.numero || row.conta || "");
      if (st.key === "banco") return String(row.banco || "");
      if (st.key === "historico") return String(row.historico || "");
      return String(row.nome || "");
    };
    return lista.slice().sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
    });
  },

  th(scope, key, label) {
    return `<th onclick="MutuoApp.toggleSort('${scope}','${key}')" style="cursor:pointer;user-select:none;">${this.esc(label)} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
  },

  corpoEmpresa(g) {
    const contas = this.ordenar(g.contas, "acc");
    const movs = this.ordenar(g.movs, "mov");
    const linhas = contas.map((c) => `<tr>
      <td>${this.esc(c.nome)}</td>
      <td>${this.esc(c.numero || "—")}</td>
      <td>${c.banco ? this.esc(c.banco) : "—"}</td>
      <td class="${c.saldo < 0 ? "mut-neg" : ""}">${this.money(c.saldo)}</td>
    </tr>`).join("");
    const dets = movs.length ? movs.map((m) => `<tr>
      <td>${this.fmtDate(m.data)}</td>
      <td>${this.esc(m.nome || m.conta || "—")}</td>
      <td>${this.esc(m.historico || "—")}</td>
      <td class="${m.valor < 0 ? "mut-neg" : ""}">${this.money(m.valor)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="mut-vazio">Sem movimento em ${this.esc(this.mesLabel())}.</td></tr>`;
    return `<div class="mut-corpo">
      <table class="mut-tab">
        <thead><tr>${this.th("acc", "nome", "Conta")}${this.th("acc", "numero", "C/C")}${this.th("acc", "banco", "Banco")}${this.th("acc", "saldo", "Saldo hoje")}</tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <h3>Movimento de ${this.esc(this.mesLabel())}</h3>
      <div class="mut-movs">
        <table class="mut-tab">
          <thead><tr>${this.th("mov", "data", "Data")}${this.th("mov", "conta", "Conta")}${this.th("mov", "historico", "Histórico")}${this.th("mov", "valor", "Valor")}</tr></thead>
          <tbody>${dets}</tbody>
        </table>
      </div>
    </div>`;
  },

  mesLabel() {
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const p = this.hoje().split("-");
    return (meses[Number(p[1]) - 1] || "") + " de " + p[0];
  },

  render() {
    const root = document.getElementById("mutuo-root");
    if (!root) return;
    const itens = this.geridas().map((c) => ({
      id: String(c.id),
      label: c.id + " - " + String(c.name || "").toUpperCase()
    })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
    const selected = this.picked ? this.companyIds.map(String) : itens.map((i) => i.id);
    const filtro = window.MlEmpresaFilter ? MlEmpresaFilter.html({
      id: "mut-emp",
      label: "Empresas",
      items: itens,
      selectedIds: selected,
      open: this.empOpen,
      query: this.empQuery,
      emptyMeansAll: false
    }) : "";
    const total = this.grupos.reduce((s, g) => s + g.saldo, 0);
    const nContas = this.grupos.reduce((s, g) => s + g.contas.length, 0);
    const carga = this.loading ? `<div class="ml-load">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-status-text">${this.esc(this.progress || "Carregando…")}</div>
      <div class="ml-load-track"><div class="loading-progress-bar" style="width:${Math.max(8, this.pct)}%"></div></div>
    </div>` : "";
    const vazio = !this.loading && !this.grupos.length
      ? `<p class="mut-vazio">${this.picked && !this.companyIds.length ? "Selecione ao menos uma empresa." : "Nenhuma conta de mútuo nas empresas selecionadas."}</p>`
      : "";
    const cards = this.grupos.map((g) => {
      const aberto = !!this.abertos[g.id];
      const nConta = g.contas.length;
      const corpo = aberto ? this.corpoEmpresa(g) : "";
      return `<section class="mut-card${aberto ? " mut-aberto" : ""}">
        <button type="button" class="mut-emp" aria-expanded="${aberto ? "true" : "false"}" onclick="MutuoApp.toggleGrupo('${this.esc(g.id)}')">
          <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}"></i>
          <span class="mut-emp-nome">
            <strong>${this.esc(g.id + " - " + g.nome.toUpperCase())}</strong>
            <span>${nConta} ${nConta === 1 ? "conta" : "contas"}</span>
          </span>
          <b class="${g.saldo < 0 ? "mut-neg" : ""}">${this.money(g.saldo)}</b>
        </button>
        ${corpo}
      </section>`;
    }).join("");
    const kpis = this.grupos.length ? `<div class="mut-kpis">
        <div><span>Saldo de mútuo</span><strong class="${total < 0 ? "mut-neg" : ""}">${this.money(total)}</strong></div>
        <div><span>Empresas</span><strong>${this.grupos.length}</strong></div>
        <div><span>Contas</span><strong>${nContas}</strong></div>
      </div>` : "";
    root.innerHTML = `<div class="mut-page">
      <p class="mut-nota">Saldo de hoje das contas de mútuo das empresas geridas pelo grupo. Essas contas não entram no fluxo de caixa diário. Abra a empresa para ver as contas e o movimento de ${this.esc(this.mesLabel())}.</p>
      <div class="mut-tools">
        ${filtro}
        ${kpis}
      </div>
      ${this.error ? `<p class="mut-erro">${this.esc(this.error)}</p>` : ""}
      ${carga}
      ${vazio}
      ${cards ? `<div class="mut-grupo">${cards}</div>` : ""}
    </div>`;
    if (window.MlEmpresaFilter) {
      MlEmpresaFilter.bind("mut-emp", {
        toggleOpen: () => { this.empOpen = !this.empOpen; this.render(); },
        setQuery: (q) => { this.empQuery = q; this.render(); },
        toggleId: (id, on) => {
          const todas = this.geridas().map((c) => String(c.id));
          let ids = this.picked ? this.companyIds.map(String) : todas.slice();
          if (on) { if (ids.indexOf(String(id)) < 0) ids.push(String(id)); }
          else ids = ids.filter((x) => x !== String(id));
          this.companyIds = ids;
          this.picked = true;
          this.carregar();
        },
        selectAll: () => {
          this.companyIds = this.geridas().map((c) => String(c.id));
          this.picked = true;
          this.carregar();
        },
        selectNone: () => {
          this.companyIds = [];
          this.picked = true;
          this.grupos = [];
          this.loading = false;
          this.render();
        }
      });
    }
    if (window.lucide) lucide.createIcons();
  },

  init() {
    if (this._busy) return;
    this._busy = true;
    this.carregar().finally(() => { this._busy = false; });
  }
};
