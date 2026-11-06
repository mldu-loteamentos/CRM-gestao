const RegistroApp = {
  CHAVE: "crm_registro_cadastro_v1",
  /**
   * Volume na data da baixa: o recebido na data da quitação é pelo menos esta fração do total recebido no título.
   * Na carteira, a quitação ou fica acima de 60% (pagamento de uma vez) ou abaixo de 10% (última parcela normal).
   */
  VOLUME_MIN: 0.10,

  state: {
    linhas: [],
    arquivo: "",
    quando: "",
    ano: "ambos",
    empresas: [],
    empOpen: false,
    empQuery: "",
    sort: "obra",
    dir: 1,
    abertos: {},
    pronto: false
  },

  init() {
    if (!this.state.pronto) {
      this.lerLocal();
      this.state.pronto = true;
    }
    this.render();
    this.carregarPosicao();
  },

  /** A posição gravada no Firebase entra nesta aba. Não depende de a tela de estoque ter sido aberta aqui. */
  async carregarPosicao() {
    const app = window.EstoqueComercialApp;
    if (!app) return;
    if (app.state && Array.isArray(app.state.units) && app.state.units.length) return;
    this.state.carregandoPos = true;
    this.render();
    try {
      if (typeof app.loadCache === "function") {
        const local = app.loadCache();
        if (local && Array.isArray(local.units) && local.units.length) {
          if (typeof app.applyCache === "function") app.applyCache(local);
          return;
        }
      }
      if (typeof app.waitFirebase === "function") await app.waitFirebase(8000);
      if (typeof app.loadFirebase === "function") {
        const fb = await app.loadFirebase();
        if (fb && Array.isArray(fb.units) && fb.units.length && typeof app.applyCache === "function") {
          app.applyCache(fb);
          if (typeof app.saveCache === "function") app.saveCache();
        }
      }
    } catch (e) {
      this.state.avisoGravacao = "Não consegui ler a Posição de estoque gravada.";
    } finally {
      this.state.carregandoPos = false;
      this.render();
    }
  },

  lerLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.CHAVE) || "null");
      if (!raw || !Array.isArray(raw.linhas)) return;
      this.state.linhas = raw.linhas;
      this.state.arquivo = raw.arquivo || "";
      this.state.quando = raw.quando || "";
    } catch (e) {}
  },

  gravar() {
    const payload = {
      arquivo: this.state.arquivo,
      quando: this.state.quando,
      linhas: this.state.linhas
    };
    try {
      localStorage.setItem(this.CHAVE, JSON.stringify(payload));
      this.state.avisoGravacao = "";
    } catch (e) {
      this.state.avisoGravacao = "O arquivo ficou só nesta sessão: o navegador não teve espaço para guardá-lo.";
    }
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  headerish(s) {
    return String(s || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  },

  primeiroTexto(cells, desde) {
    for (let i = desde; i < (cells || []).length; i++) {
      const t = String(cells[i] == null ? "" : cells[i]).trim();
      if (t) return t;
    }
    return "";
  },

  partirRotulo(txt) {
    const s = String(txt || "").trim();
    const m = s.match(/^(\d+)\s*[-–]\s*(.+)$/);
    if (m) return { id: m[1], nome: m[2].trim() };
    const n = s.match(/^(\d+)/);
    return { id: n ? n[1] : "", nome: s };
  },

  /** F financiado, M registrado. C, outra letra ou vazio não informam o registro. */
  letraDe(reg) {
    const s = String(reg || "").trim().toUpperCase();
    if (!s) return "";
    const ch = s.charAt(0);
    if (ch === "F" || ch === "M") return ch;
    return "";
  },

  parseMatrix(matrix) {
    let empresa = "";
    let obra = "";
    let colR = -1;
    const linhas = [];
    (matrix || []).forEach((row) => {
      const cells = row || [];
      const a = this.headerish(cells[0]);
      if (a === "empresa") {
        empresa = this.primeiroTexto(cells, 1);
        return;
      }
      if (a === "empreendimento") {
        obra = this.primeiroTexto(cells, 1);
        return;
      }
      if (a === "unidade") {
        colR = cells.findIndex((c) => this.headerish(c) === "numero do registro");
        return;
      }
      if (!obra || colR < 0) return;
      const unidade = String(cells[0] == null ? "" : cells[0]).trim();
      if (!unidade || this.headerish(unidade) === "unidade") return;
      const emp = this.partirRotulo(empresa);
      const ob = this.partirRotulo(obra);
      if (!ob.id) return;
      linhas.push({
        empresaId: emp.id,
        empresa: emp.nome || empresa,
        obraId: ob.id,
        obra: ob.nome || obra,
        unidade: unidade,
        letra: this.letraDe(cells[colR])
      });
    });
    return linhas;
  },

  chaveUnidade(obraId, nome) {
    let clean = String(nome || "").trim();
    const id = String(obraId || "").replace(/\D/g, "");
    if (id && clean.startsWith(id + " - ")) clean = clean.slice(id.length + 3);
    else if (id && clean.startsWith(id + "-")) clean = clean.slice(id.length + 1);
    else if (id && clean.startsWith(id + " ")) clean = clean.slice(id.length + 1);
    return id + "|" + clean.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  },

  centros() {
    const listas = [];
    if (window.CentrosCustoState && Array.isArray(CentrosCustoState.costCenters) && CentrosCustoState.costCenters.length) {
      listas.push(CentrosCustoState.costCenters);
    }
    try {
      const raw = JSON.parse(localStorage.getItem("crm_cost_centers_data") || "[]");
      if (Array.isArray(raw) && raw.length) listas.push(raw);
    } catch (e) {}
    return listas;
  },

  empresaDoCentro(obraId) {
    const id = String(obraId || "").replace(/\D/g, "");
    if (!id) return "";
    const listas = this.centros();
    for (let i = 0; i < listas.length; i++) {
      const hit = listas[i].find((c) => c && String(c.id).replace(/\D/g, "") === id);
      if (hit) return String(hit.idCompany || hit.companyId || "").replace(/\D/g, "");
    }
    return "";
  },

  nomeEmpresa(id, fallback) {
    const n = String(id || "").replace(/\D/g, "");
    if (fallback) return fallback;
    if (!n) return "Sem empresa";
    if (typeof window.getCompanyName === "function") {
      const curto = window.getCompanyName(n, true);
      if (curto && !/^EMPRESA #/i.test(curto)) return curto;
    }
    return "Empresa " + n;
  },

  rotulo(id, nome) {
    const n = String(nome || "").trim();
    const num = String(id || "").replace(/\D/g, "");
    if (num && n && !n.startsWith(num + " - ") && !n.startsWith(num + " — ")) return num + " - " + n;
    return n || num || "—";
  },

  posicao() {
    const app = window.EstoqueComercialApp;
    if (!app) return { units: [], meta: null };
    if (app.state && Array.isArray(app.state.units) && app.state.units.length) {
      return {
        units: app.state.units,
        meta: {
          date: app.state.fetchedAt || app.state.batimentoDate || "",
          complete: app.state.complete,
          batimentoDone: app.state.batimentoDone
        }
      };
    }
    if (typeof app.loadCache === "function") {
      const data = app.loadCache();
      if (data && Array.isArray(data.units)) return { units: data.units, meta: data };
    }
    return { units: [], meta: null };
  },

  anosAtivos() {
    if (this.state.ano === "2025") return ["2025"];
    if (this.state.ano === "2026") return ["2026"];
    return ["2025", "2026"];
  },

  /**
   * Cruza lotes quitados da posição de estoque com a letra do cadastro.
   * Sem data de quitação o lote não entra no ano: o batimento ainda não fechou essa data.
   */
  cruzar(linhas, units, anos) {
    const mapa = new Map();
    (linhas || []).forEach((l) => {
      mapa.set(this.chaveUnidade(l.obraId, l.unidade), l);
    });
    const grupos = new Map();
    let semData = 0;
    const aceita = new Set(anos || []);
    (units || []).forEach((u) => {
      if (!u) return;
      if (u.relFin === "distratado") return;
      if (!(u.quitado || u.relFin === "quitado")) return;
      const iso = String(u.quitacaoDate || "").slice(0, 10);
      const ano = iso.slice(0, 4);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        semData += 1;
        return;
      }
      if (aceita.size && !aceita.has(ano)) return;
      const obraId = String(u.enterpriseId || "").replace(/\D/g, "");
      const hit = mapa.get(this.chaveUnidade(obraId, u.name));
      const letra = hit ? hit.letra : "";
      const empresaId = (hit && hit.empresaId) || this.empresaDoCentro(obraId);
      const empresa = this.nomeEmpresa(empresaId, hit && hit.empresa);
      const obra = (hit && hit.obra) || u.enterpriseName || obraId || "Sem empreendimento";
      const key = String(empresaId || "0") + "|" + (obraId || obra);
      let g = grupos.get(key);
      if (!g) {
        g = {
          key: key,
          empresaId: empresaId,
          empresa: empresa,
          obraId: obraId,
          obra: obra,
          quitados: 0,
          f: 0,
          m: 0,
          vazio: 0,
          fora: 0,
          fin: 0,
          prop: 0,
          conf: 0,
          itens: []
        };
        grupos.set(key, g);
      }
      g.quitados += 1;
      if (letra === "F") g.f += 1;
      else if (letra === "M") g.m += 1;
      else g.vazio += 1;
      if (!hit) g.fora += 1;
      const rec = this.recebidoNaQuitacao(u);
      const origem = letra === "F" ? (rec.volume ? "fin" : "conf") : "prop";
      g[origem] += 1;
      g.itens.push({
        unidade: u.name || (hit && hit.unidade) || "—",
        quando: iso,
        letra: letra,
        fora: !hit,
        valor: rec.valor,
        pct: rec.pct,
        origem: origem
      });
    });
    return { grupos: [...grupos.values()], semData: semData };
  },

  /** Valor recebido na data da quitação (gravado pelo batimento do estoque) e a fração do total recebido. */
  recebidoNaQuitacao(u) {
    if (!u || u.quitacaoValor == null) return { valor: null, pct: null, volume: false };
    const valor = Number(u.quitacaoValor) || 0;
    const total = Number(u.quitacaoRecebido) || 0;
    const pct = total > 0.009 ? valor / total : null;
    return { valor, pct, volume: pct != null && pct >= this.VOLUME_MIN };
  },

  origemTexto(item) {
    if (item.origem === "fin") return "Financiamento";
    if (item.origem === "prop") return "Recursos próprios";
    return item.valor == null ? "Conferir · sem valor da baixa" : "Conferir · F sem volume na baixa";
  },

  moeda(v) {
    if (v == null) return "—";
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  ordenar(lista) {
    const campo = this.state.sort || "obra";
    const dir = this.state.dir === -1 ? -1 : 1;
    const num = (v) => Number(String(v || "").replace(/\D/g, "")) || 0;
    return lista.slice().sort((a, b) => {
      let c = 0;
      if (campo === "empresa") c = num(a.empresaId) - num(b.empresaId) || String(a.empresa).localeCompare(String(b.empresa), "pt");
      else if (campo === "obra") c = num(a.obraId) - num(b.obraId) || String(a.obra).localeCompare(String(b.obra), "pt");
      else c = (Number(a[campo]) || 0) - (Number(b[campo]) || 0);
      if (!c) c = num(a.obraId) - num(b.obraId);
      return c * dir;
    });
  },

  toggleSort(campo) {
    if (this.state.sort === campo) this.state.dir = this.state.dir === 1 ? -1 : 1;
    else {
      this.state.sort = campo;
      this.state.dir = campo === "empresa" || campo === "obra" ? 1 : -1;
    }
    this.render();
  },

  setAno(ano) {
    this.state.ano = ano;
    this.state.abertos = {};
    this.render();
  },

  toggleGrupo(key) {
    const k = decodeURIComponent(String(key || ""));
    this.state.abertos[k] = !this.state.abertos[k];
    this.render();
  },

  async aoArquivo(input) {
    const file = input && input.files && input.files[0];
    if (input) input.value = "";
    if (!file) return;
    const root = document.getElementById("registro-root");
    if (root) {
      root.innerHTML = `<div class="ml-load"><div class="loading-spinner" aria-hidden="true"></div><div class="loading-status-text">Lendo o cadastro das unidades…</div><div class="ml-load-track"><div class="loading-progress-bar" style="width:40%"></div></div></div>`;
    }
    try {
      if (typeof XLSX === "undefined") throw new Error("A leitura de Excel não está disponível. Atualize a página.");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
      const linhas = this.parseMatrix(matrix);
      if (!linhas.length) {
        throw new Error("Este arquivo não é o relatório Unidades por Empreendimento (Dados Cadastrais). A coluna Número do registro não foi encontrada.");
      }
      this.state.linhas = linhas;
      this.state.arquivo = file.name;
      this.state.quando = new Date().toISOString();
      this.state.abertos = {};
      this.gravar();
    } catch (e) {
      alert(e.message || String(e));
    }
    this.render();
  },

  th(campo, rotulo) {
    return `<th onclick="RegistroApp.toggleSort('${campo}')" style="cursor:pointer;user-select:none;">${rotulo} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
  },

  situacao(item) {
    if (item.fora) return "Sem informação · não está no arquivo";
    if (item.letra === "F") return "Financiado";
    if (item.letra === "M") return "Registrado";
    return "Sem informação";
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    if (p.length !== 3) return "—";
    return p[2] + "/" + p[1] + "/" + p[0];
  },

  n(v) {
    return Number(v || 0).toLocaleString("pt-BR");
  },

  abasHtml() {
    const tabs = [
      { id: "2025", label: "2025", icon: "calendar" },
      { id: "2026", label: "2026", icon: "calendar" },
      { id: "ambos", label: "2025 e 2026", icon: "calendar-range" }
    ];
    const atual = this.state.ano || "ambos";
    return `<div class="ml-tabs" role="tablist" style="margin:0 0 12px;">${tabs.map((t) => `
      <button type="button" role="tab" class="ml-tab${atual === t.id ? " is-active" : ""}" aria-selected="${atual === t.id}" onclick="RegistroApp.setAno('${t.id}')">
        <i data-lucide="${t.icon}"></i> ${t.label}
      </button>`).join("")}</div>`;
  },

  itensEmpresa(grupos) {
    const map = new Map();
    (grupos || []).forEach((g) => {
      const id = String(g.empresaId || "");
      if (!id || map.has(id)) return;
      const nome = String(g.empresa || "").trim().toUpperCase();
      map.set(id, { id: id, name: nome, label: id + " - " + nome });
    });
    return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id));
  },

  bindFiltro(itens) {
    if (!window.MlEmpresaFilter) return;
    const app = this;
    MlEmpresaFilter.bind("reg-emp", {
      toggleOpen() {
        app.state.empOpen = !app.state.empOpen;
        app.render();
      },
      setQuery(q) {
        app.state.empQuery = q || "";
        const box = document.getElementById("reg-emp-list");
        if (!box) return;
        box.innerHTML = MlEmpresaFilter.listHtml({
          id: "reg-emp",
          items: itens,
          selectedIds: app.state.empresas,
          query: app.state.empQuery
        });
      },
      toggleId(id, on) {
        const sid = String(id);
        let sel = (app.state.empresas || []).map(String);
        if (on) { if (!sel.includes(sid)) sel.push(sid); }
        else sel = sel.filter((x) => x !== sid);
        if (sel.length && sel.length === itens.length) sel = [];
        app.state.empresas = sel;
        app.render();
      },
      selectAll() {
        app.state.empresas = itens.map((x) => x.id);
        app.render();
      },
      selectNone() {
        app.state.empresas = [];
        app.render();
      }
    });
  },

  exportExcel(grupos) {
    if (!grupos.length) {
      alert("Não há lotes quitados neste filtro para exportar.");
      return;
    }
    if (typeof XLSX === "undefined") {
      alert("A exportação para Excel não está disponível.");
      return;
    }
    const aoa = [["Empresa", "Empreendimento", "Quitados", "Financiado", "Registrado", "Sem informação", "Fora do arquivo", "Financiamento", "Recursos próprios", "Conferir"]];
    const unid = [["Empresa", "Empreendimento", "Unidade", "Quitação", "Situação", "Recebido na quitação", "% do recebido", "Origem"]];
    grupos.forEach((g) => {
      aoa.push([
        this.rotulo(g.empresaId, g.empresa),
        this.rotulo(g.obraId, g.obra),
        g.quitados,
        g.f,
        g.m,
        g.vazio,
        g.fora,
        g.fin,
        g.prop,
        g.conf
      ]);
      (g.itens || []).forEach((it) => {
        unid.push([
          this.rotulo(g.empresaId, g.empresa),
          this.rotulo(g.obraId, g.obra),
          it.unidade,
          this.dataBr(it.quando),
          this.situacao(it),
          it.valor == null ? "" : it.valor,
          it.pct == null ? "" : Math.round(it.pct * 100) / 100,
          this.origemTexto(it)
        ]);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registro");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(unid), "Unidades");
    const anos = this.anosAtivos().join("-");
    XLSX.writeFile(wb, "registro-quitados-" + anos + ".xlsx");
  },

  render() {
    const root = document.getElementById("registro-root");
    if (!root) return;
    const linhas = this.state.linhas || [];
    const pos = linhas.length ? this.posicao() : { units: [], meta: null };
    const cruz = linhas.length ? this.cruzar(linhas, pos.units, this.anosAtivos()) : { grupos: [], semData: 0 };
    let grupos = cruz.grupos;
    const itens = this.itensEmpresa(grupos);
    const sel = (this.state.empresas || []).map(String);
    if (sel.length) grupos = grupos.filter((g) => sel.includes(String(g.empresaId || "")));
    grupos = this.ordenar(grupos);
    const tot = grupos.reduce((a, g) => {
      a.quitados += g.quitados;
      a.f += g.f;
      a.m += g.m;
      a.vazio += g.vazio;
      a.fora += g.fora;
      a.fin += g.fin;
      a.prop += g.prop;
      a.conf += g.conf;
      return a;
    }, { quitados: 0, f: 0, m: 0, vazio: 0, fora: 0, fin: 0, prop: 0, conf: 0 });
    const pctMin = Math.round(this.VOLUME_MIN * 100);
    const obrasArq = new Set(linhas.map((l) => l.obraId)).size;
    const quando = this.state.quando ? this.dataBr(this.state.quando.slice(0, 10)) : "";
    const meta = pos.meta || {};
    const posData = this.dataBr(String(meta.batimentoDate || meta.date || "").slice(0, 10));
    const filtro = window.MlEmpresaFilter && itens.length
      ? MlEmpresaFilter.html({
        id: "reg-emp",
        label: "Empresas",
        items: itens,
        selectedIds: this.state.empresas,
        open: this.state.empOpen,
        query: this.state.empQuery,
        emptyMeansAll: true
      })
      : "";
    const avisoPos = !linhas.length ? ""
      : (this.state.carregandoPos
        ? `<p style="margin:0 0 12px;padding:10px 12px;border-radius:8px;background:#f8fafc;color:#334155;font-size:0.85rem;">Lendo a Posição de estoque gravada…</p>`
        : (!pos.units.length
        ? `<p style="margin:0 0 12px;padding:10px 12px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:0.85rem;">O cadastro foi lido, mas a Posição de estoque ainda não está neste navegador. Abra Posição de estoque e conclua o batimento para contar os quitados de 2025 e 2026.</p>`
        : (cruz.semData
          ? `<p style="margin:0 0 12px;padding:10px 12px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:0.85rem;">${this.n(cruz.semData)} lote(s) quitado(s) na Posição de estoque estão sem data de quitação e ficam de fora de 2025 e 2026. O batimento precisa gravar essa data.</p>`
          : "")));
    const corpo = !linhas.length
      ? `<p style="color:#64748b;padding:8px 0 0;">Nenhum arquivo enviado.</p>`
      : (!pos.units.length ? "" : `
        ${this.abasHtml()}
        <div class="est-stock-finance" style="margin-bottom:12px;">
          <div class="est-fin-card is-ok"><label>Quitados</label><strong>${this.n(tot.quitados)}</strong><small>Posição de estoque${posData !== "—" ? " · " + posData : ""}</small></div>
          <div class="est-fin-card"><label>Financiado</label><strong>${this.n(tot.f)}</strong><small>Letra F no número do registro</small></div>
          <div class="est-fin-card"><label>Registrado</label><strong>${this.n(tot.m)}</strong><small>Letra M no número do registro</small></div>
          <div class="est-fin-card is-warn"><label>Sem informação</label><strong>${this.n(tot.vazio)}</strong><small>${tot.fora ? this.n(tot.fora) + " não estão no arquivo" : "C, vazio ou ausente no arquivo"}</small></div>
        </div>
        <div class="est-stock-finance" style="margin-bottom:12px;">
          <div class="est-fin-card is-ok"><label>Quitado com financiamento</label><strong>${this.n(tot.fin)}</strong><small>Letra F e ao menos ${pctMin}% do recebido na data da quitação</small></div>
          <div class="est-fin-card"><label>Quitado com recursos próprios</label><strong>${this.n(tot.prop)}</strong><small>Quitação sem a letra F</small></div>
          <div class="est-fin-card is-warn"><label>Conferir</label><strong>${this.n(tot.conf)}</strong><small>Letra F sem volume na data da quitação</small></div>
        </div>
        <div class="cc-scroll">
          <table class="cc-table">
            <thead><tr>
              ${this.th("empresa", "Empresa")}
              ${this.th("obra", "Empreendimento")}
              ${this.th("quitados", "Quitados")}
              ${this.th("f", "Financiado")}
              ${this.th("m", "Registrado")}
              ${this.th("vazio", "Sem informação")}
              ${this.th("fin", "Financiamento")}
              ${this.th("prop", "Recursos próprios")}
              ${this.th("conf", "Conferir")}
            </tr></thead>
            <tbody>
              ${grupos.length ? grupos.map((g) => this.linhaHtml(g)).join("") : `<tr><td colspan="9" style="text-align:center;padding:24px;color:#64748b;">Nenhum lote quitado neste filtro.</td></tr>`}
            </tbody>
          </table>
        </div>`);
    root.innerHTML = `
      <div class="cc-page">
        <p style="margin:0 0 12px;color:#64748b;font-size:0.85rem;line-height:1.45;">Suba o relatório <strong>Unidades por Empreendimento (Dados Cadastrais)</strong> do Sienge. A letra no início de Número do registro classifica a unidade: <strong>F</strong> financiado, <strong>M</strong> registrado, <strong>C</strong> ou vazio sem informação. A contagem usa os lotes quitados da Posição de estoque. A origem dos recursos olha o valor recebido na data da quitação: com <strong>F</strong> e volume na baixa é financiamento; quitação sem <strong>F</strong> é recursos próprios.</p>
        <div class="cc-toolbar">
          <div class="cc-filters">${filtro}</div>
          <div class="cc-toolbar-actions">
            <label class="btn btn-primary" style="height:36px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;margin:0;">
              <i data-lucide="upload" style="width:14px;height:14px;"></i> Subir arquivo
              <input type="file" accept=".xlsx,.xls" hidden onchange="RegistroApp.aoArquivo(this)">
            </label>
            <button type="button" class="btn btn-excel" onclick="RegistroApp.exportarAtual()" title="Exportar tabela atual para Excel">
              <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel
            </button>
          </div>
        </div>
        ${linhas.length ? `<p style="margin:-4px 0 12px;font-size:0.8rem;color:#334155;">${this.esc(this.state.arquivo)} · ${this.n(linhas.length)} unidades · ${this.n(obrasArq)} empreendimentos${quando ? " · enviado em " + quando : ""}</p>` : ""}
        ${this.state.avisoGravacao ? `<p style="margin:0 0 12px;font-size:0.8rem;color:#9a3412;">${this.esc(this.state.avisoGravacao)}</p>` : ""}
        ${avisoPos}
        ${corpo}
      </div>`;
    this._grupos = grupos;
    this.bindFiltro(itens);
    if (window.lucide) window.lucide.createIcons();
  },

  linhaHtml(g) {
    const aberto = !!this.state.abertos[g.key];
    const fora = g.fora ? ` title="${this.n(g.fora)} não estão no arquivo"` : "";
    const itens = (g.itens || []).slice().sort((a, b) => String(a.unidade).localeCompare(String(b.unidade), "pt", { numeric: true }));
    const det = aberto ? `<tr><td colspan="9" style="background:#f8fafc;">
      <table class="cc-table" style="margin:4px 0;">
        <thead><tr><th>Unidade</th><th>Quitação</th><th>Situação</th><th>Recebido na quitação</th><th>Origem</th></tr></thead>
        <tbody>${itens.map((it) => `<tr>
          <td>${this.esc(it.unidade)}</td>
          <td>${this.esc(this.dataBr(it.quando))}</td>
          <td>${this.esc(this.situacao(it))}</td>
          <td>${this.esc(this.moeda(it.valor))}${it.pct != null ? ` <small style="color:#64748b;">(${Math.round(it.pct * 100)}% do recebido)</small>` : ""}</td>
          <td>${this.esc(this.origemTexto(it))}</td>
        </tr>`).join("")}</tbody>
      </table>
    </td></tr>` : "";
    return `<tr style="cursor:pointer;" onclick="RegistroApp.toggleGrupo('${encodeURIComponent(g.key)}')">
      <td>${this.esc(this.rotulo(g.empresaId, g.empresa))}</td>
      <td>${this.esc(this.rotulo(g.obraId, g.obra))}</td>
      <td class="is-center">${this.n(g.quitados)}</td>
      <td class="is-center">${this.n(g.f)}</td>
      <td class="is-center">${this.n(g.m)}</td>
      <td class="is-center"${fora}>${this.n(g.vazio)}</td>
      <td class="is-center">${this.n(g.fin)}</td>
      <td class="is-center">${this.n(g.prop)}</td>
      <td class="is-center">${this.n(g.conf)}</td>
    </tr>${det}`;
  },

  exportarAtual() {
    this.exportExcel(this._grupos || []);
  }
};

window.RegistroApp = RegistroApp;

if (typeof document !== "undefined") {
  document.addEventListener("tabChanged", (e) => {
    if (e.detail === "relacionamento_registro") RegistroApp.init();
  });
}
