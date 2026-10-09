/**
 * Contas a Receber · Scod
 * Teste de integração com a API da SCOD (IPTU): traz os proprietários e imóveis cadastrados
 * e cruza com os clientes do CRM pelo código Sienge que vem no nome, ex.: "FULANO(3058)".
 */
const ScodApp = {
  BASE: "/api/scod-proxy/v3",
  PAGE_API: 500,
  PAGE_UI: 100,
  state: {
    loading: false,
    status: "",
    error: "",
    consulted: false,
    clientes: [],
    imoveisTotal: 0,
    q: "",
    page: 0,
    open: {}
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  digits(s) {
    return String(s || "").replace(/\D/g, "");
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  },

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },

  // A SCOD devolve 429 (Too Many Attempts) quando recebe consultas demais por minuto.
  async getJson(path) {
    for (let tentativa = 1; ; tentativa++) {
      const res = await fetch(this.BASE + path, { headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      if (res.status === 429 && tentativa <= 6) {
        const ra = Number(res.headers.get("Retry-After"));
        const espera = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 10000 * tentativa;
        this.state.status = `A SCOD pediu uma pausa. Tentando de novo em ${Math.round(espera / 1000)}s…`;
        this.render();
        await this.sleep(espera);
        continue;
      }
      throw new Error((data && (data.error || data.message)) || ("SCOD " + res.status));
    }
  },

  async fetchAll(path, listKey, totalPagesKeys) {
    const sep = path.indexOf("?") >= 0 ? "&" : "?";
    const pageList = (data) => (Array.isArray(data[listKey]) ? data[listKey] : []);
    const load = (page) => this.getJson(`${path}${sep}pagina=${page}&qntporpagina=${this.PAGE_API}`);
    this.state.status = `Buscando ${listKey} na SCOD…`;
    this.render();
    const first = await load(1);
    const all = pageList(first).slice();
    // A SCOD pode limitar o tamanho da página (proprietários vêm de 50 em 50); vale o total que ela devolve.
    const pages = totalPagesKeys.map((k) => Number(first[k])).find((n) => Number.isFinite(n) && n > 0) || 1;
    for (let p = 2; p <= pages; p++) {
      this.state.status = `Buscando ${listKey} na SCOD (página ${p} de ${pages})…`;
      this.render();
      await this.sleep(400);
      all.push(...pageList(await load(p)));
    }
    return all;
  },

  splitNome(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^(.*?)\s*\((\d+)\)\s*$/);
    return m ? { nome: m[1].trim(), codigo: m[2] } : { nome: s, codigo: "" };
  },

  crmCustomer(codigo) {
    if (!codigo) return null;
    const store = (window.AppState && AppState.customers) || {};
    if (Array.isArray(store)) return store.find((c) => String(c && c.id) === String(codigo)) || null;
    return store[codigo] || store[Number(codigo)] || null;
  },

  crmStatus(cli) {
    const c = this.crmCustomer(cli.codigo);
    if (!c) return { key: "nao", label: cli.codigo ? "Não encontrado" : "Sem código Sienge" };
    const docCrm = this.digits(c.cpf || c.cnpj || c.cpfCnpj || c.document);
    if (docCrm && cli.documento && docCrm !== this.digits(cli.documento)) {
      return { key: "diverge", label: "Documento diverge", crmNome: c.name || "" };
    }
    return { key: "ok", label: "No CRM", crmNome: c.name || "" };
  },

  async consultar() {
    if (this.state.loading) return;
    Object.assign(this.state, { loading: true, error: "", status: "Conectando à SCOD…", open: {}, page: 0 });
    this.render();
    try {
      const donos = await this.fetchAll("/imovel/listar/proprietarios", "proprietarios", ["qtdTotalPaginas", "qnt_total_paginas"]);
      const imoveis = await this.fetchAll("/imovel/listar/imoveis", "imoveis", ["qnt_total_paginas", "qtdTotalPaginas"]);
      const byDono = new Map();
      imoveis.forEach((im) => {
        const k = String(im.id_proprietario || "");
        if (!byDono.has(k)) byDono.set(k, []);
        byDono.get(k).push(im);
      });
      this.state.clientes = donos.map((p) => {
        const parts = this.splitNome(p.nome);
        const lista = byDono.get(String(p.id)) || [];
        const cli = {
          id: p.id,
          nome: parts.nome,
          codigo: parts.codigo,
          documento: p.documento || "",
          imoveis: lista,
          grupos: [...new Set(lista.map((i) => i.grupo || i.centro_de_custo).filter(Boolean))],
          cidades: [...new Set(lista.map((i) => [i.cidade, i.estado].filter(Boolean).join("/")).filter(Boolean))],
          debito: lista.reduce((s, i) => s + (Number(i.valor_total) || 0), 0)
        };
        cli.crm = this.crmStatus(cli);
        return cli;
      }).sort((a, b) => this.fold(a.nome).localeCompare(this.fold(b.nome), "pt"));
      this.state.imoveisTotal = imoveis.length;
      this.state.consulted = true;
    } catch (e) {
      console.error("[Scod]", e);
      this.state.error = "Não foi possível consultar a SCOD: " + (e.message || e);
    } finally {
      this.state.loading = false;
      this.state.status = "";
      this.render();
    }
  },

  filtered() {
    const q = this.fold(this.state.q).trim();
    if (!q) return this.state.clientes;
    const qd = this.digits(q);
    return this.state.clientes.filter((c) => {
      if (this.fold(c.nome).includes(q) || String(c.codigo).includes(q)) return true;
      if (qd && this.digits(c.documento).includes(qd)) return true;
      return c.imoveis.some((i) => this.fold(`${i.inscricao} ${i.identificador} ${i.grupo} ${i.cidade}`).includes(q));
    });
  },

  setQuery(v) {
    this.state.q = v;
    this.state.page = 0;
    this.renderTable();
  },

  setPage(p) {
    this.state.page = p;
    this.renderTable();
  },

  toggle(id) {
    this.state.open[id] = !this.state.open[id];
    this.renderTable();
  },

  imoveisHtml(c) {
    if (!c.imoveis.length) return '<div class="scod-sub-empty">Nenhum imóvel vinculado a este proprietário.</div>';
    return `<table class="custom-table scod-sub"><thead><tr>
        <th>Identificador</th><th>Inscrição</th><th>Empreendimento</th><th>Quadra/Lote</th><th>Cidade</th>
        <th>Situação</th><th class="ccom-num">Valor venal</th><th class="ccom-num">Débito IPTU</th><th>Atualizado</th>
      </tr></thead><tbody>${c.imoveis.map((i) => `<tr>
        <td class="ccom-td-id">${this.esc(i.identificador || "—")}</td>
        <td class="ccom-td-id">${this.esc(i.inscricao || "—")}</td>
        <td>${this.esc(i.grupo || i.centro_de_custo || "—")}</td>
        <td>${this.esc([i.quadra, i.lote].filter(Boolean).join(" / ") || "—")}</td>
        <td>${this.esc([i.cidade, i.estado].filter(Boolean).join("/") || "—")}</td>
        <td>${this.esc(i.situacao || "—")}</td>
        <td class="ccom-num">${this.esc(this.money(i.valor_venal))}</td>
        <td class="ccom-num">${this.esc(this.money(i.valor_total))}</td>
        <td>${this.esc(String(i.ultima_atualizacao || "").slice(0, 10).split("-").reverse().join("/") || "—")}</td>
      </tr>`).join("")}</tbody></table>`;
  },

  renderTable() {
    const box = document.getElementById("scod-table");
    if (!box) return;
    const rows = this.filtered();
    const pages = Math.max(1, Math.ceil(rows.length / this.PAGE_UI));
    const page = Math.min(this.state.page, pages - 1);
    const slice = rows.slice(page * this.PAGE_UI, (page + 1) * this.PAGE_UI);
    if (!rows.length) {
      box.innerHTML = '<div class="tvig-empty">Nenhum cliente com esse filtro.</div>';
      return;
    }
    box.innerHTML = `<div class="crm-card ccom-card"><div class="crm-scroll-table ccom-table-wrap">
      <table class="custom-table ccom-table">
        <thead><tr>
          <th></th><th>Cliente</th><th>Cód. Sienge</th><th>Documento</th><th class="ccom-num">Imóveis</th>
          <th>Empreendimento</th><th>Cidade</th><th class="ccom-num">Débito IPTU</th><th>CRM</th>
        </tr></thead>
        <tbody>${slice.map((c) => {
          const open = !!this.state.open[c.id];
          return `<tr class="scod-row" onclick="ScodApp.toggle(${Number(c.id)})">
            <td><i data-lucide="${open ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i></td>
            <td><strong>${this.esc(c.nome)}</strong>${c.crm.crmNome && this.fold(c.crm.crmNome) !== this.fold(c.nome) ? `<div class="scod-muted">CRM: ${this.esc(c.crm.crmNome)}</div>` : ""}</td>
            <td class="ccom-td-id">${this.esc(c.codigo || "—")}</td>
            <td class="ccom-td-id">${this.esc(c.documento || "—")}</td>
            <td class="ccom-num">${c.imoveis.length}</td>
            <td>${this.esc(c.grupos.join(", ") || "—")}</td>
            <td>${this.esc(c.cidades.join(", ") || "—")}</td>
            <td class="ccom-num">${this.esc(this.money(c.debito))}</td>
            <td><span class="scod-tag scod-tag-${c.crm.key}">${this.esc(c.crm.label)}</span></td>
          </tr>${open ? `<tr class="scod-detail"><td></td><td colspan="8">${this.imoveisHtml(c)}</td></tr>` : ""}`;
        }).join("")}</tbody>
      </table></div></div>
      ${pages > 1 ? `<div class="scod-pager">
        <button type="button" class="btn btn-outline btn-sm" ${page === 0 ? "disabled" : ""} onclick="ScodApp.setPage(${page - 1})">Anterior</button>
        <span>Página ${page + 1} de ${pages} · ${rows.length} cliente(s)</span>
        <button type="button" class="btn btn-outline btn-sm" ${page >= pages - 1 ? "disabled" : ""} onclick="ScodApp.setPage(${page + 1})">Próxima</button>
      </div>` : ""}`;
    if (window.lucide) lucide.createIcons();
  },

  render() {
    const root = document.getElementById("scod-root");
    if (!root) return;
    const s = this.state;
    const cli = s.clientes;
    const count = (k) => cli.filter((c) => c.crm.key === k).length;
    const debito = cli.reduce((t, c) => t + c.debito, 0);
    root.innerHTML = `
      <style>
        #scod-root .scod-row { cursor: pointer; }
        #scod-root .scod-row:hover td { background: #f1f5f9; }
        #scod-root .scod-detail > td { background: #f8fafc; padding: 8px 12px; }
        #scod-root .scod-sub { font-size: 0.78rem; background: #fff; }
        #scod-root .scod-sub-empty { color: #64748b; font-size: 0.8rem; padding: 6px 0; }
        #scod-root .scod-muted { color: #64748b; font-size: 0.72rem; margin-top: 2px; }
        #scod-root .scod-tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
        #scod-root .scod-tag-ok { background: #dcfce7; color: #166534; }
        #scod-root .scod-tag-diverge { background: #ffedd5; color: #c2410c; }
        #scod-root .scod-tag-nao { background: #fee2e2; color: #b91c1c; }
        #scod-root .scod-pager { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 10px; font-size: 0.82rem; color: #475569; }
        #scod-root .scod-search { height: 38px; min-width: 320px; flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 12px; font-size: 0.88rem; }
      </style>
      <div class="ccom-page">
        <div class="search-filter-panel tvig-params ccom-params">
          <h3 class="tvig-section-title">Scod</h3>
          <p class="rweb-note">Teste de integração com a SCOD (IPTU). Traz os proprietários e imóveis cadastrados lá e confere cada um com os clientes do CRM pelo código Sienge que vem no nome.</p>
          <div class="ccom-filters" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <input type="search" class="scod-search" placeholder="Buscar cliente, código, CPF/CNPJ, inscrição ou empreendimento" value="${this.esc(s.q)}" oninput="ScodApp.setQuery(this.value)" ${s.consulted ? "" : "disabled"}>
            <div class="tvig-filter-actions">
              <button type="button" class="btn btn-primary ccom-consult" ${s.loading ? "disabled" : ""} onclick="ScodApp.consultar()">
                <i data-lucide="refresh-cw" style="width:14px;"></i> ${s.loading ? "Consultando…" : (s.consulted ? "Atualizar" : "Consultar SCOD")}
              </button>
            </div>
          </div>
        </div>
        ${s.error ? `<div class="tvig-empty">${this.esc(s.error)}</div>` : ""}
        ${s.loading ? `<div class="tvig-empty">${this.esc(s.status || "Consultando a SCOD…")}</div>` : ""}
        ${!s.loading && !s.error && !s.consulted ? `<div class="tvig-empty">Clique em Consultar SCOD para trazer os clientes cadastrados.</div>` : ""}
        ${!s.loading && s.consulted ? `
          <div class="ccom-kpis">
            <div class="ccom-kpi"><span>Clientes na SCOD</span><strong>${cli.length}</strong></div>
            <div class="ccom-kpi"><span>Imóveis</span><strong>${s.imoveisTotal}</strong></div>
            <div class="ccom-kpi"><span>Encontrados no CRM</span><strong>${count("ok")}</strong></div>
            <div class="ccom-kpi"><span>Documento diverge</span><strong>${count("diverge")}</strong></div>
            <div class="ccom-kpi"><span>Não encontrados</span><strong>${count("nao")}</strong></div>
            <div class="ccom-kpi"><span>Débito IPTU</span><strong>${this.esc(this.money(debito))}</strong></div>
          </div>
          <div id="scod-table"></div>` : ""}
      </div>`;
    if (!s.loading && s.consulted) this.renderTable();
    if (window.lucide) lucide.createIcons();
  },

  init() {
    if (!document.getElementById("scod-root")) return;
    this.render();
  }
};

window.ScodApp = ScodApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "scod") ScodApp.init();
});
