// DFC do orçamento 2027. A visão de receitas (OrcamentoApp) não passa por aqui.
const OrcamentoDfcApp = {
  LS: "crm_orcamento_dfc_2027",
  LS_SALDO: "orc_dfc_balancete_v1",
  MESES: ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],
  selectedCompanyIds: [],
  selectedCcIds: [],
  companyDropOpen: false,
  companyQuery: "",
  ccDropOpen: false,
  ccQuery: "",
  expanded: new Set(),
  _expandInited: false,
  _custom: null,
  _pronto: false,
  busy: false,
  erro: "",

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) < 0.005) return "—";
    const abs = Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? "-" + abs : abs;
  },

  mil(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) < 0.5) return "—";
    const milhar = v / 1000;
    const abs = Math.abs(milhar);
    const texto = abs >= 100
      ? Math.round(abs).toLocaleString("pt-BR")
      : abs.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    return v < 0 ? "-" + texto : texto;
  },

  pct(orc, real) {
    const b = Number(real) || 0;
    if (Math.abs(b) < 0.005) return "—";
    const p = ((Number(orc) || 0) - b) / Math.abs(b) * 100;
    const texto = Math.abs(p) >= 10
      ? Math.round(p).toLocaleString("pt-BR")
      : p.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    return (p > 0 ? "+" : "") + texto + "%";
  },

  celCmp(orc, real, prev, sep, chave) {
    const o = Number(orc) || 0;
    const b = Number(real) || 0;
    const d = o - b;
    const titulo = (prev ? "Previsão 2026 " : "2026 ") + this.money(b) + " · Orçado 2027 " + this.money(o) + " · Variação " + this.money(d);
    const neg = d < -0.005 ? " orc-dfc-neg" : "";
    const edge = sep ? " orc-dfc-sep" : "";
    const abre = chave && !prev;
    const cls2026 = [edge.trim(), abre ? "orc-dfc-abre" : ""].filter(Boolean).join(" ");
    const marca = abre ? ` data-orc-2026="${this.esc(chave)}"` : "";
    const dica = this.esc(titulo + (abre ? " · Ver lançamentos" : ""));
    return `<td class="${cls2026}"${marca} title="${dica}">${this.money(b)}</td><td title="${this.esc(titulo)}">${this.money(o)}</td><td class="${(neg + edge).trim()}" title="${this.esc(titulo)}">${this.money(d)}</td><td title="${this.esc(titulo)}">${this.pct(o, b)}</td>`;
  },

  norm(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  },

  garantir() {
    if (this._pronto) return;
    this._pronto = true;
    try {
      const raw = localStorage.getItem(this.LS);
      if (!raw) return;
      const pack = JSON.parse(raw);
      if (pack && Array.isArray(pack.lines) && pack.lines.length) this._custom = pack;
    } catch (e) {}
  },

  origem() {
    this.garantir();
    if (this._custom && Array.isArray(this._custom.lines) && this._custom.lines.length) return this._custom;
    return window.ORCAMENTO_DFC_2027 || { fileName: "", lines: [] };
  },

  lines() {
    return this.origem().lines || [];
  },

  empresas() {
    const map = new Map();
    this.lines().forEach((l) => {
      const id = String(l.e || "");
      if (!id || map.has(id)) return;
      map.set(id, String(l.enome || ""));
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  },

  empreendimentos() {
    const emp = new Set(this.selectedCompanyIds.map(String));
    const map = new Map();
    this.lines().forEach((l) => {
      if (emp.size && !emp.has(String(l.e))) return;
      const id = String(l.cc || "");
      if (!id || map.has(id)) return;
      map.set(id, String(l.en || ""));
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  },

  linhasFiltradas() {
    const emp = new Set(this.selectedCompanyIds.map(String));
    const cc = new Set(this.selectedCcIds.map(String));
    return this.lines().filter((l) => {
      if (emp.size && !emp.has(String(l.e))) return false;
      if (cc.size && !cc.has(String(l.cc))) return false;
      return true;
    });
  },

  podarCentros() {
    const vivos = new Set(this.empreendimentos().map((c) => String(c.id)));
    this.selectedCcIds = this.selectedCcIds.filter((id) => vivos.has(String(id)));
  },

  z12() {
    return Array(12).fill(0);
  },

  /* Primeiro mês (0 = jan) que entra como forecast. Em outubro de 2026, janeiro a setembro é realizado. */
  corteForecast() {
    const hoje = new Date();
    if (hoje.getFullYear() > 2026) return 12;
    if (hoje.getFullYear() < 2026) return 0;
    return hoje.getMonth();
  },

  textoCorte() {
    const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const corte = this.corteForecast();
    if (corte <= 0) return "2026 entra como forecast.";
    if (corte >= 12) return "2026 entra pelo realizado do ano.";
    return "Até " + nomes[corte - 1] + " entra o realizado. De " + nomes[corte] + " a dezembro entra o forecast.";
  },

  chaveConta(code) {
    return String(code || "").replace(/\s/g, "");
  },

  empresaDoArquivo(arq) {
    const n = Number(arq && arq.empresa) || 0;
    if (n) return String(n);
    const app = window.ResultadoCaixaApp;
    const rotulo = (arq && (arq.rotulo || arq.nome)) || "";
    if (app && typeof app.empresaId === "function") {
      const id = app.empresaId(rotulo);
      if (id) return String(id);
    }
    const m = String(rotulo).match(/(\d+)\s*$/);
    return m ? String(Number(m[1])) : "";
  },

  empresaCabe(arq) {
    const emp = new Set(this.selectedCompanyIds.map(String));
    if (!emp.size) return true;
    return emp.has(this.empresaDoArquivo(arq));
  },

  ccCabe(cc) {
    if (!this.selectedCcIds.length) return true;
    const id = String(cc || "");
    const dig = id.replace(/\D/g, "");
    return this.selectedCcIds.some((s) => {
      const sid = String(s);
      return sid === id || (dig && sid.replace(/\D/g, "") === dig);
    });
  },

  arquivos2026() {
    const app = window.ResultadoCaixaApp;
    const acervo = (app && app.acervo) || {};
    const lista = [];
    const meses = acervo.meses || {};
    Object.keys(meses).filter((k) => k.indexOf("2026-") === 0).sort().forEach((k) => {
      const arquivos = (meses[k] && meses[k].arquivos) || {};
      Object.keys(arquivos).forEach((nome) => {
        if (arquivos[nome]) lista.push(arquivos[nome]);
      });
    });
    const ant = acervo.anterior && acervo.anterior["2026"];
    Object.keys((ant && ant.arquivos) || {}).forEach((nome) => {
      if (ant.arquivos[nome]) lista.push(ant.arquivos[nome]);
    });
    return lista;
  },

  somarBase(arr, i, v) {
    if (!arr || i < 0 || i > 11) return;
    arr[i] += Number(v) || 0;
  },

  base2026() {
    const corte = this.corteForecast();
    this._corte = corte;
    const grupos = {};
    const contas = {};
    const ccs = {};
    const bag = (map, key) => map[key] || (map[key] = this.z12());
    const groups = (this.visaoDfc().groups || []);
    const byId = {};
    const porCodigo = {};
    groups.forEach((g) => {
      byId[g.id] = g;
      const m = String(g.name || "").match(/^(\d{2}(?:\.\d{2})*)/);
      if (m && g.type === "resultado") porCodigo[m[1]] = g.id;
    });
    const gidDe = (code, nome, node) => {
      if (node && byId[node]) return node;
      const direto = this.grupoDaConta(code, nome);
      if (direto) return direto;
      const bruto = this.chaveConta(code);
      return porCodigo[bruto] || "";
    };
    const por = (gid, code, cc, i, v) => {
      if (!gid || !v) return;
      const chave = this.chaveConta(code);
      const dig = chave.replace(/\D/g, "");
      this.somarBase(bag(grupos, gid), i, v);
      if (chave) this.somarBase(bag(contas, gid + "|" + chave), i, v);
      if (dig && dig !== chave) this.somarBase(bag(contas, gid + "|" + dig), i, v);
      const ccId = String(cc || "").replace(/\D/g, "") || String(cc || "");
      if (chave) this.somarBase(bag(ccs, gid + "|" + chave + "|" + ccId), i, v);
      if (dig) this.somarBase(bag(ccs, gid + "|" + dig + "|" + ccId), i, v);
    };
    let arquivos = 0;
    (this._lancamentos2026 || []).forEach((c) => {
      if (this.selectedCompanyIds.length && this.selectedCompanyIds.map(String).indexOf(String(c.companyId)) < 0) return;
      if (!this.ccCabe(c.cc)) return;
      por(c.gid, c.code, c.cc, c.i, c.v);
    });
    const app = window.ResultadoCaixaApp;
    const forecasts = (app && app.forecasts) || {};
    const fluxo = typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : null;
    for (let i = corte; i < 12; i++) {
      const ym = "2026-" + String(i + 1).padStart(2, "0");
      const doc = forecasts[ym];
      if (!doc) continue;
      const lista = [];
      const porArq = doc.porArquivo;
      if (porArq && typeof porArq === "object" && !Array.isArray(porArq) && Object.keys(porArq).length) {
        Object.keys(porArq).forEach((nome) => lista.push(porArq[nome]));
      } else if (doc.contas) lista.push(doc);
      lista.forEach((arq) => {
        if (!this.empresaCabe(arq)) return;
        if (arq && (arq.empresa || arq.contas)) arquivos += 1;
        Object.keys(arq.contas || {}).forEach((cc) => {
          if (!this.ccCabe(cc)) return;
          Object.keys(arq.contas[cc] || {}).forEach((code) => {
            const info = arq.contas[cc][code] || {};
            const gid = gidDe(code, info.nome, "");
            const meses = info.meses || {};
            let valor = Number(meses[ym]);
            if (!Number.isFinite(valor)) {
              const cel = meses[ym] || meses[String(i + 1)];
              valor = cel && typeof cel === "object" ? Number(cel.r != null ? cel.r : cel.o) : Number(cel);
            }
            valor = Number(valor) || 0;
            const node = byId[gid];
            if (valor && node && fluxo && typeof fluxo.signedAmount === "function") {
              valor = fluxo.signedAmount(node, code, info.nome || "", valor);
            }
            por(gid, code, cc, i, valor);
          });
        });
      });
    }
    this._basePronta = this._caixaEstado === "ok" || arquivos > 0;
    return { grupos: grupos, contas: contas, ccs: ccs, corte: corte };
  },

  fimRealizado2026() {
    const corte = this.corteForecast();
    if (corte <= 0) return "";
    if (corte >= 12) return "2026-12-31";
    const d = new Date(2026, corte, 0);
    return "2026-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  notaCaixa(texto) {
    this._caixaMsg = texto || "";
    const el = document.querySelector(".orc-dfc-caixa-msg");
    if (el) el.textContent = this._caixaMsg;
  },

  docRealizado(companyId, parte) {
    const base = "c" + String(companyId || "").replace(/\D/g, "");
    return parte == null ? base : base + "__p" + parte;
  },

  docExiste(snap) {
    return !!(snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists));
  },

  async lerRealizadoSalvo(fim, empresas) {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    const out = {};
    if (!fx || !db || !fim || typeof fx.getDoc !== "function") return out;
    const lerUm = async (emp) => {
      const snap = await fx.getDoc(fx.doc(db, "dfc_realizado", this.docRealizado(emp)));
      if (!this.docExiste(snap)) return;
      const x = snap.data() || {};
      if (String(x.fim || "") !== String(fim)) return;
      let texto = x.payload || "";
      if (Array.isArray(x.partes) && x.partes.length) {
        const blocos = await Promise.all(x.partes.map(async (pid) => {
          const p = await fx.getDoc(fx.doc(db, "dfc_realizado", pid));
          return this.docExiste(p) ? String((p.data() || {}).texto || "") : null;
        }));
        if (blocos.some((b) => b == null)) return;
        texto = blocos.join("");
      }
      let cru = [];
      try { cru = JSON.parse(texto || "[]"); } catch (e) { cru = []; }
      if (!Array.isArray(cru)) return;
      out[String(emp)] = cru.map((r) => ({
        companyId: String(emp),
        gid: r[0],
        code: r[1],
        cc: r[2],
        i: r[3],
        v: Number(r[4]) || 0
      }));
    };
    try {
      await Promise.all((empresas || []).map((emp) => lerUm(emp).catch(() => {})));
    } catch (e) {}
    return out;
  },

  async salvarRealizadoEmpresa(companyId, fim, rows) {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || !companyId) return false;
    const compacto = (rows || []).map((r) => [r.gid, r.code, r.cc, r.i, Math.round((Number(r.v) || 0) * 100) / 100]);
    const texto = JSON.stringify(compacto);
    const id = this.docRealizado(companyId);
    const LIM = 400000;
    const ids = [];
    if (texto.length > LIM) {
      for (let i = 0, n = 0; i < texto.length; i += LIM, n++) {
        const pid = this.docRealizado(companyId, n);
        ids.push(pid);
        await fx.setDoc(fx.doc(db, "dfc_realizado", pid), { tipo: "parte", pai: id, texto: texto.slice(i, i + LIM) });
      }
    }
    await fx.setDoc(fx.doc(db, "dfc_realizado", id), {
      empresa: String(companyId),
      fim: fim,
      em: new Date().toISOString(),
      n: compacto.length,
      payload: ids.length ? "" : texto,
      partes: ids
    });
    for (let n = ids.length; n < 20; n++) {
      fx.deleteDoc(fx.doc(db, "dfc_realizado", this.docRealizado(companyId, n))).catch(function () {});
    }
    return true;
  },

  async lerMovimentos(fim, empresas, aviso) {
    const api = window.SiengeApiService;
    if (!api || typeof api.getBankMovements !== "function") {
      throw new Error("A consulta de caixa e banco não está disponível.");
    }
    const partes = new Array((empresas || []).length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < empresas.length) {
        const i = cursor++;
        const id = empresas[i];
        if (typeof aviso === "function") aviso(id);
        const data = await api.getBankMovements("2026-01-01", fim, { selectionType: "M", companyId: id });
        partes[i] = (data || []).map((m) => Object.assign({}, m, { companyId: (m && m.companyId) || id }));
      }
    };
    const n = Math.min(3, empresas.length);
    await Promise.all(Array.from({ length: n }, () => worker()));
    let movs = partes.reduce((acc, rows) => acc.concat(rows || []), []);
    if (typeof window.siengeDedupeBankMovements === "function") movs = window.siengeDedupeBankMovements(movs);
    return movs;
  },

  async garantirMovimentos2026() {
    const fim = this.fimRealizado2026();
    const empresas = this.empresas().map((e) => String(e.id)).filter(Boolean);
    const chave = empresas.slice().sort().join(",") + "|" + fim;
    if (this._movsProntos && this._movChave === chave && Array.isArray(this._movs2026)) return;
    const fluxo = window.FluxoCaixaApp;
    if (fluxo && typeof fluxo.ensureCategories === "function") {
      try { await fluxo.ensureCategories(); } catch (e) {}
    }
    this._movs2026 = await this.lerMovimentos(fim, empresas);
    this._movsProntos = true;
    this._movChave = chave;
    this._itens2026 = null;
  },

  gidsDoNo(id) {
    const groups = (this.visaoDfc().groups) || [];
    const ids = new Set();
    const walk = (gid) => {
      if (!gid || ids.has(gid)) return;
      ids.add(gid);
      groups.filter((g) => g && g.parentId === gid).forEach((ch) => walk(ch.id));
    };
    walk(id);
    return ids;
  },

  itens2026() {
    if (this._itens2026) return this._itens2026;
    const fluxo = window.FluxoCaixaApp;
    const grupos = (fluxo && fluxo.visao && fluxo.visao() && fluxo.visao().groups) || this.visaoDfc().groups || [];
    const byId = {};
    grupos.forEach((g) => { if (g && g.id) byId[g.id] = g; });
    const corte = this.corteForecast();
    const itens = [];
    (this._movs2026 || []).forEach((mov) => {
      const factor = fluxo && typeof fluxo.factorForCompany === "function" ? fluxo.factorForCompany(mov.companyId) : 1;
      if (!fluxo || factor <= 0) return;
      fluxo.allocate(mov, factor).forEach((a) => {
        if (!a) return;
        const gid = this.grupoDaConta(a.categoryId, a.categoryName);
        const node = gid && byId[gid];
        if (!node) return;
        const amount = fluxo.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov);
        const i = Number(String(a.month || "").slice(5, 7)) - 1;
        if (!(i >= 0) || i >= corte || !amount) return;
        itens.push(Object.assign({}, a, { amount: amount, signedAmount: amount, nodeId: gid, i: i, companyId: mov.companyId || a.companyId }));
      });
    });
    this._itens2026 = itens;
    return itens;
  },

  itensDaCelula(row, mesIdx) {
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    const gids = row.drillConta ? new Set([row.drillGid]) : this.gidsDoNo(row.drillGid);
    const emp = new Set(this.selectedCompanyIds.map(String));
    const conta = this.chaveConta(row.drillConta || "");
    const contaDig = conta.replace(/\D/g, "");
    const ccWant = row.drillCc ? (String(row.drillCc).replace(/\D/g, "") || String(row.drillCc)) : "";
    return this.itens2026().filter((it) => {
      if (emp.size && !emp.has(String(it.companyId || ""))) return false;
      if (!this.ccCabe(it.costCenterId)) return false;
      if (!gids.has(it.nodeId)) return false;
      if (mesIdx == null) {
        if (!(it.i >= 0 && it.i < corte)) return false;
      } else if (it.i !== mesIdx) return false;
      if (conta) {
        const a = this.chaveConta(it.categoryId);
        const ad = a.replace(/\D/g, "");
        if (a !== conta && ad !== contaDig && a.indexOf(conta + ".") !== 0) return false;
      }
      if (ccWant) {
        const bruto = String(it.costCenterId || "").trim();
        const got = bruto.replace(/\D/g, "") || (bruto || "—");
        if (got !== ccWant) return false;
      }
      return true;
    }).sort((a, b) => String((a.mov && (a.mov.paymentDate || a.mov.bankMovementDate)) || a.month || "").localeCompare(String((b.mov && (b.mov.paymentDate || b.mov.bankMovementDate)) || b.month || "")));
  },

  avisoDrill(texto, erro) {
    const fluxo = window.FluxoCaixaApp;
    if (fluxo && typeof fluxo.closeDrill === "function") fluxo.closeDrill();
    const overlay = document.createElement("div");
    overlay.id = "fc-drill-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:16px;";
    overlay.onclick = (e) => { if (e.target === overlay && fluxo) fluxo.closeDrill(); };
    const miolo = erro
      ? `<div style="padding:22px;color:#b91c1c;font-weight:700;">${this.esc(texto)}</div><div style="padding:0 22px 22px;"><button type="button" class="btn btn-fechar" onclick="FluxoCaixaApp.closeDrill()">Fechar</button></div>`
      : `<div class="ml-load" style="padding:28px 36px;">
          <div class="loading-spinner" aria-hidden="true"></div>
          <div class="loading-status-text">${this.esc(texto)}</div>
          <div class="ml-load-track"><div class="loading-progress-bar" style="width:40%"></div></div>
        </div>`;
    overlay.innerHTML = `<div style="background:#fff;border-radius:12px;min-width:320px;max-width:480px;box-shadow:0 20px 50px rgba(0,0,0,0.25);">${miolo}</div>`;
    document.body.appendChild(overlay);
  },

  async abrirCelula2026(chave) {
    const fluxo = window.FluxoCaixaApp;
    if (!fluxo || typeof fluxo.mostrarDrill !== "function") return;
    const pedacos = String(chave || "").split("||");
    const mes = pedacos.pop();
    const id = pedacos.join("||");
    const row = (this._linhasDfc || []).find((r) => r.id === id);
    if (!row) return;
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    const mesIdx = mes === "t" ? null : Number(mes);
    if (mesIdx != null && (!(mesIdx >= 0) || mesIdx >= corte)) return;
    const fim = this.fimRealizado2026();
    const nomeMes = mesIdx == null
      ? "realizado de 2026"
      : (this.MESES[mesIdx] || "") + "/2026";
    let totalLinha = 0;
    if (mesIdx == null) {
      for (let i = 0; i < corte; i++) totalLinha += Number((row.base || [])[i]) || 0;
    } else totalLinha = Number((row.base || [])[mesIdx]) || 0;
    const pintar = () => {
      const itens = this.itensDaCelula(row, mesIdx);
      fluxo._drillReplayFn = pintar;
      fluxo._drillComparado = false;
      fluxo.mostrarDrill({
        title: row.name,
        subtitle: "Lançamentos de " + nomeMes,
        total: totalLinha
      }, itens, "2026-01-01", fim || "2026-12-31");
    };
    if (!(this._movsProntos && Array.isArray(this._movs2026))) {
      this.avisoDrill("Lendo os lançamentos de 2026 no caixa e banco…");
    }
    try {
      await this.garantirMovimentos2026();
      pintar();
    } catch (e) {
      this.avisoDrill((e && e.message) || "Não consegui ler os lançamentos de 2026.", true);
    }
  },

  async buscarCaixa2026() {
    const fluxo = window.FluxoCaixaApp;
    const api = window.SiengeApiService;
    const fim = this.fimRealizado2026();
    const empresas = this.empresas().map((e) => String(e.id)).filter(Boolean);
    if (!fim || !empresas.length) {
      this._lancamentos2026 = [];
      this._caixaEstado = "vazio";
      return;
    }
    if (!fluxo || !api || typeof api.getBankMovements !== "function" || typeof fluxo.allocate !== "function") {
      this._caixaErro = "A consulta de caixa e banco não está disponível.";
      this._caixaEstado = "erro";
      return;
    }
    const chave = empresas.slice().sort().join(",") + "|" + fim;
    if (this._caixaChave === chave && Array.isArray(this._lancamentos2026)) {
      this._caixaEstado = this._lancamentos2026.length ? "ok" : "vazio";
      return;
    }
    let salvos = {};
    try { salvos = await this.lerRealizadoSalvo(fim, empresas); } catch (e) { salvos = {}; }
    const faltam = empresas.filter((id) => !Object.prototype.hasOwnProperty.call(salvos, id));
    if (!faltam.length) {
      this._lancamentos2026 = empresas.reduce((acc, id) => acc.concat(salvos[id] || []), []);
      this._caixaChave = chave;
      this._caixaEstado = this._lancamentos2026.length ? "ok" : "vazio";
      this._caixaErro = "";
      this._caixaAviso = "";
      return;
    }
    if (typeof fluxo.ensureCategories === "function") {
      try { await fluxo.ensureCategories(); } catch (e) {}
    }
    const grupos = (fluxo.visao && fluxo.visao() && fluxo.visao().groups) || this.visaoDfc().groups || [];
    const byId = {};
    grupos.forEach((g) => { if (g && g.id) byId[g.id] = g; });
    const corte = this.corteForecast();
    let feitas = 0;
    const movs = await this.lerMovimentos(fim, faltam, (id) => {
      feitas += 1;
      this.notaCaixa("Lendo o realizado de 2026 no caixa e banco · empresa " + id + " · " + feitas + " de " + faltam.length);
    });
    const lista = [];
    movs.forEach((mov) => {
      const factor = typeof fluxo.factorForCompany === "function" ? fluxo.factorForCompany(mov.companyId) : 1;
      if (factor <= 0) return;
      fluxo.allocate(mov, factor).forEach((a) => {
        if (!a) return;
        const gid = this.grupoDaConta(a.categoryId, a.categoryName);
        const node = gid && byId[gid];
        if (!node) return;
        const valor = fluxo.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov);
        const i = Number(String(a.month || "").slice(5, 7)) - 1;
        if (!(i >= 0) || i >= corte || !valor) return;
        lista.push({
          companyId: String(mov.companyId || a.companyId || ""),
          gid: gid,
          code: a.categoryId,
          cc: a.costCenterId,
          i: i,
          v: valor
        });
      });
    });
    const porEmp = {};
    lista.forEach((r) => {
      const id = String(r.companyId || "");
      if (!porEmp[id]) porEmp[id] = [];
      porEmp[id].push(r);
    });
    let falhaNuvem = false;
    await Promise.all(faltam.map((id) => this.salvarRealizadoEmpresa(id, fim, porEmp[id] || []).catch(() => { falhaNuvem = true; })));
    const todos = [];
    empresas.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(salvos, id)) todos.push.apply(todos, salvos[id] || []);
      else todos.push.apply(todos, porEmp[id] || []);
    });
    this._lancamentos2026 = todos;
    if (faltam.length === empresas.length) {
      this._movs2026 = movs;
      this._movsProntos = true;
      this._movChave = chave;
      this._itens2026 = null;
    }
    this._caixaChave = chave;
    this._caixaEstado = todos.length ? "ok" : "vazio";
    this._caixaErro = "";
    this._caixaAviso = falhaNuvem ? "O realizado de 2026 até " + fim.split("-").reverse().join("/") + " entrou na tela, mas não ficou salvo." : "";
  },

  acharBase(map, gid, code, cc) {
    const chave = this.chaveConta(code);
    const dig = chave.replace(/\D/g, "");
    const ccId = cc == null ? "" : (String(cc).replace(/\D/g, "") || String(cc));
    const chaves = cc == null
      ? [gid + "|" + chave, dig ? gid + "|" + dig : ""]
      : [gid + "|" + chave + "|" + ccId, dig ? gid + "|" + dig + "|" + ccId : ""];
    for (let i = 0; i < chaves.length; i++) {
      if (chaves[i] && map[chaves[i]]) return map[chaves[i]];
    }
    return null;
  },

  visaoDfc() {
    if (typeof FluxoCaixaApp !== "undefined" && typeof FluxoCaixaApp.visao === "function") {
      return FluxoCaixaApp.visao() || { groups: [] };
    }
    let visoes = [];
    try { visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]") || []; } catch (e) { visoes = []; }
    return visoes.find((v) => v.id === "dfc_default") || { groups: [] };
  },

  /** Nó da visão DFC em que a conta está alocada. A alocação salva vale antes do palpite pelo nome. */
  grupoDaConta(conta, nome) {
    const dotted = String(conta || "").trim();
    const key = dotted.replace(/\D/g, "");
    const plano = typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null;
    const visao = this.visaoDfc();
    const ignored = new Set();
    (visao.ignoredAccounts || []).forEach((id) => {
      const sid = String(id || "").trim();
      if (!sid) return;
      ignored.add(sid);
      const nk = sid.replace(/\D/g, "");
      if (nk) ignored.add(nk);
    });
    if (ignored.has(dotted) || (key && ignored.has(key))) return null;
    if (plano && typeof plano._idMatchesPrefix === "function" && plano._idMatchesPrefix(dotted, "2.03.05")) {
      return "g_05_02";
    }
    let found = null;
    (visao.groups || []).forEach((g) => {
      if (!g || g.type !== "resultado") return;
      (g.accounts || []).forEach((id) => {
        const sid = String(id || "").trim();
        const nk = sid.replace(/\D/g, "");
        if (sid === dotted || (key && nk && nk === key)) found = g.id;
      });
    });
    if (found) return found;
    if (plano && typeof plano.suggestGroup === "function") {
      return plano.suggestGroup({ id: dotted, name: nome });
    }
    return null;
  },

  montar(opts) {
    const aberto = !!(opts && opts.aberto);
    const plano = typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null;
    const fluxo = typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : null;
    const base = this.base2026();
    const tpl = (plano && typeof plano.dfcTemplateGroups === "function" ? plano.dfcTemplateGroups() : []).map((g) => ({
      ...g,
      months: Array(12).fill(0),
      base: Array(12).fill(0),
      accs: new Map()
    }));
    const byId = {};
    tpl.forEach((g) => { byId[g.id] = g; });
    const fora = new Map();
    this.linhasFiltradas().forEach((l) => {
      const gid = this.grupoDaConta(l.conta, l.cn);
      const g = gid ? byId[gid] : null;
      if (!g || g.type !== "resultado") {
        const key = String(l.conta || "") + "|" + String(l.cn || "");
        const cur = fora.get(key) || { conta: l.conta, cn: l.cn, total: 0 };
        (l.m || []).forEach((v) => { cur.total += Number(v) || 0; });
        fora.set(key, cur);
        return;
      }
      let acc = g.accs.get(l.conta);
      if (!acc) {
        const achado = this.acharBase(base.contas, gid, l.conta);
        acc = { conta: l.conta, cn: l.cn, months: Array(12).fill(0), base: achado ? achado.slice() : Array(12).fill(0), ccs: new Map() };
        g.accs.set(l.conta, acc);
      }
      const ccId = String(l.cc || "").trim() || "—";
      let cc = acc.ccs.get(ccId);
      if (!cc) {
        const achadoCc = this.acharBase(base.ccs, gid, l.conta, ccId);
        cc = { id: ccId, name: String(l.en || "").trim(), months: Array(12).fill(0), base: achadoCc ? achadoCc.slice() : Array(12).fill(0) };
        acc.ccs.set(ccId, cc);
      } else if (!cc.name && l.en) {
        cc.name = String(l.en).trim();
      }
      (l.m || []).forEach((v, i) => {
        if (i > 11) return;
        const s = fluxo && typeof fluxo.signedAmount === "function"
          ? fluxo.signedAmount(g, l.conta, l.cn, v)
          : (Number(v) || 0);
        acc.months[i] += s;
        cc.months[i] += s;
        g.months[i] += s;
      });
    });

    const depth = (g) => {
      let d = 0;
      let cur = g;
      while (cur && cur.parentId && byId[cur.parentId]) {
        d += 1;
        cur = byId[cur.parentId];
      }
      return d;
    };
    tpl.forEach((g) => {
      if (g.type === "resultado" && base.grupos[g.id]) g.base = base.grupos[g.id].slice();
    });
    tpl.filter((g) => g.type !== "formula").sort((a, b) => depth(b) - depth(a)).forEach((g) => {
      tpl.filter((c) => c.parentId === g.id && c.type !== "formula").forEach((ch) => {
        ch.months.forEach((v, i) => { g.months[i] += v; });
        ch.base.forEach((v, i) => { g.base[i] += v; });
      });
    });
    const sum = (ids, campo) => {
      const months = Array(12).fill(0);
      ids.forEach((id) => {
        const n = byId[id];
        if (!n) return;
        (n[campo] || []).forEach((v, i) => { months[i] += v; });
      });
      return months;
    };
    const apply = (id, parts) => {
      if (!byId[id]) return;
      byId[id].months = sum(parts, "months");
      byId[id].base = sum(parts, "base");
    };
    apply("g_03", ["g_04", "g_05"]);
    apply("g_06", ["g_01", "g_02", "g_03"]);
    apply("g_08", ["g_06", "g_07"]);
    apply("g_10", ["g_08", "g_09"]);
    apply("g_12", ["g_10", "g_11"]);

    if (!this._expandInited) {
      tpl.filter((g) => !g.parentId).forEach((g) => this.expanded.add(g.id));
      this._expandInited = true;
    }

    const rows = [];
    const walk = (node, level) => {
      const children = tpl.filter((g) => g.parentId === node.id);
      const accs = [...node.accs.values()]
        .filter((a) => a.months.some((v) => Math.abs(v) >= 0.005))
        .sort((a, b) => String(a.conta).localeCompare(String(b.conta), "pt-BR", { numeric: true }));
      const hasKids = children.length > 0 || accs.length > 0;
      const total = node.months.reduce((a, b) => a + b, 0);
      const baseTotal = (node.base || []).reduce((a, b) => a + b, 0);
      rows.push({
        id: node.id,
        name: node.name,
        type: node.type,
        level,
        hasKids,
        isAccount: false,
        months: node.months,
        base: node.base,
        total,
        baseTotal,
        drillGid: node.id,
        drillConta: "",
        drillCc: ""
      });
      if (!aberto && !this.expanded.has(node.id)) return;
      children.forEach((ch) => walk(ch, level + 1));
      accs.forEach((a) => {
        const accId = "acc:" + node.id + ":" + a.conta;
        const ccs = [...(a.ccs ? a.ccs.values() : [])]
          .filter((c) => c.months.some((v) => Math.abs(v) >= 0.005))
          .sort((x, y) => String(x.id).localeCompare(String(y.id), "pt-BR", { numeric: true }));
        rows.push({
          id: accId,
          name: a.conta + " " + (a.cn || ""),
          type: "conta",
          level: level + 1,
          hasKids: ccs.length > 0,
          isAccount: true,
          isCc: false,
          months: a.months,
          base: a.base || Array(12).fill(0),
          total: a.months.reduce((x, y) => x + y, 0),
          baseTotal: (a.base || []).reduce((x, y) => x + y, 0),
          drillGid: node.id,
          drillConta: a.conta,
          drillCc: ""
        });
        if (!aberto && (!ccs.length || !this.expanded.has(accId))) return;
        ccs.forEach((c) => {
          const label = c.id === "—" ? "Sem centro de custo" : (c.name ? c.id + " - " + c.name : c.id);
          rows.push({
            id: accId + ":" + c.id,
            name: label,
            type: "cc",
            level: level + 2,
            hasKids: false,
            isAccount: false,
            isCc: true,
            months: c.months,
            base: c.base || Array(12).fill(0),
            total: c.months.reduce((x, y) => x + y, 0),
            baseTotal: (c.base || []).reduce((x, y) => x + y, 0),
            drillGid: node.id,
            drillConta: a.conta,
            drillCc: c.id
          });
        });
      });
    };
    tpl.filter((g) => !g.parentId).forEach((g) => walk(g, 0));
    const foraLista = [...fora.values()]
      .filter((x) => Math.abs(x.total) >= 0.005)
      .sort((a, b) => String(a.conta).localeCompare(String(b.conta), "pt-BR", { numeric: true }));
    return { rows, fora: foraLista };
  },

  toggle(id) {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.paintBody();
  },

  render(root) {
    this.garantir();
    const src = this.origem();
    root.innerHTML = `
      <div class="orc-dfc-page">
        ${typeof OrcamentoApp !== "undefined" ? OrcamentoApp.abasHtml() : ""}
        <p class="orc-dfc-lead">Orçamento de 2027 contra o DFC de 2026, em reais. ${this.textoCorte()} O realizado vem do caixa e banco.</p>
        <div class="orc-dfc-tools">
          <div id="orc-dfc-emp-box"></div>
          <div id="orc-dfc-cc-box"></div>
          <button type="button" class="btn btn-sm btn-excel" id="orc-dfc-excel" title="Exportar a tabela atual para Excel">
            <i data-lucide="download" style="width:14px;height:14px;"></i> Excel
          </button>
          <button type="button" class="orc-dfc-up" id="orc-dfc-up"><i data-lucide="upload"></i> Subir Excel 2027</button>
          <input id="orc-dfc-file" type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
          <button type="button" class="orc-dfc-base" id="orc-dfc-base" ${this._custom ? "" : "hidden"}>Base original</button>
          <span class="orc-dfc-meta" id="orc-dfc-meta"></span>
        </div>
        <div class="orc-dfc-layout">
          <div id="orc-dfc-body"></div>
          <aside id="orc-dfc-fora"></aside>
        </div>
      </div>`;
    this.paintMeta(src);
    this.paintEmp();
    this.paintCc();
    this.paintBody();
    const up = document.getElementById("orc-dfc-up");
    const file = document.getElementById("orc-dfc-file");
    if (up && file) up.addEventListener("click", () => file.click());
    if (file) file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (f) this.lerArquivo(f);
    });
    const baseBtn = document.getElementById("orc-dfc-base");
    if (baseBtn) baseBtn.addEventListener("click", () => this.voltarBase());
    const excelBtn = document.getElementById("orc-dfc-excel");
    if (excelBtn) excelBtn.addEventListener("click", () => this.exportExcel());
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    this.carregarBase();
  },

  async lerForecastsSalvos(app) {
    if (!app) return;
    const mesesFc = ["2026-10", "2026-11", "2026-12"];
    const jaTem = app.forecasts && mesesFc.some((ym) => {
      const doc = app.forecasts[ym];
      if (!doc) return false;
      const por = doc.porArquivo;
      return (por && typeof por === "object" && Object.keys(por).length) || (doc.contas && Object.keys(doc.contas).length);
    });
    if (jaTem) return;
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || typeof fx.query !== "function" || typeof fx.where !== "function") return;
    const snap = await fx.getDocs(fx.query(fx.collection(db, "resultado_caixa"), fx.where("tipo", "==", "forecast")));
    const nuvem = {};
    snap.forEach((docSnap) => {
      const id = docSnap.id || "";
      const x = docSnap.data() || {};
      if (x.tipo !== "forecast" && id.indexOf("fc-") !== 0) return;
      const ym = String(x.competencia || id.replace(/^fc-/, ""));
      if (!/^\d{4}-\d{2}$/.test(ym)) return;
      const por = x.porArquivo;
      const jaPartido = por && typeof por === "object" && !Array.isArray(por) && Object.keys(por).length;
      nuvem[ym] = {
        arquivos: x.arquivos || [],
        em: x.em || "",
        contas: x.contas || {},
        nomes: x.nomes || {},
        porArquivo: jaPartido ? por : null
      };
    });
    if (!Object.keys(nuvem).length) return;
    app.forecasts = nuvem;
    if (typeof app.normalizarForecastsMemoria === "function") app.normalizarForecastsMemoria();
    if (typeof app.gravarForecastLocal === "function") app.gravarForecastLocal();
  },

  async carregarBase() {
    const token = (this._bToken = (this._bToken || 0) + 1);
    this._caixaEstado = "lendo";
    this._caixaErro = "";
    this.notaCaixa("Lendo o realizado de 2026 salvo…");
    const app = window.ResultadoCaixaApp;
    if (app && typeof app.lerLocal === "function" && !(app.forecasts && Object.keys(app.forecasts).length)) {
      try { app.lerLocal(); } catch (e) {}
    }
    if (document.getElementById("orc-dfc-body")) this.paintBody();
    const forecastP = this.lerForecastsSalvos(app);
    try {
      await this.buscarCaixa2026();
    } catch (e) {
      this._caixaEstado = "erro";
      this._caixaErro = (e && e.message) || "Falha ao ler o realizado de 2026 no caixa e banco.";
    }
    if (token !== this._bToken) return;
    if (document.getElementById("orc-dfc-body")) this.paintBody();
    try { await forecastP; } catch (e) {}
    if (token !== this._bToken) return;
    if (document.getElementById("orc-dfc-body")) this.paintBody();
  },

  empresasDoSaldo() {
    const todas = this.empresas();
    const sel = this.selectedCompanyIds.map(String);
    return sel.length ? todas.filter((e) => sel.indexOf(String(e.id)) >= 0) : todas;
  },

  chaveSaldos() {
    const ids = this.empresasDoSaldo().map((e) => String(e.id)).sort().join(",");
    return ids + "|" + this.corteForecast();
  },

  /* Dia 0 do mês seguinte: 0 = 31/12/2025, 1 = 31/01/2026. */
  dataSaldo(ano, mes) {
    const d = new Date(ano, mes, 0);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  },

  dataBr(iso) {
    const p = String(iso || "").split("-");
    if (p.length < 3) return iso || "";
    return p[2] + "/" + p[1] + "/" + p[0];
  },

  valorSaldo(b) {
    const list = [b && b.amount, b && b.balance, b && b.balanceAmount, b && b.currentBalance, b && b.lastBalance, b && b.lastBalanceAmount, b && b.availableAmount, b && b.availableBalance, b && b.value];
    for (let i = 0; i < list.length; i++) {
      const n = Number(list[i]);
      if (Number.isFinite(n)) return n;
    }
    return null;
  },

  /* Caixa e equivalentes do balancete (1.1.01), sem a Terracotta. No saldo de contas, a conta corrente entra e a aplicação fica de fora. */
  ehContaAnalise(c) {
    if (!c || !c.analitica) return false;
    const cod = String(c.numero || "");
    const nome = this.norm((c.nome || "") + " " + cod);
    if (cod.indexOf("1.1.01.03.016") === 0 || cod.indexOf("1.01.01.03.016") === 0) return false;
    if (nome.indexOf("TERRACOTTA") >= 0) return false;
    if (c.origem === "contas") return !/INVEST|APLIC/.test(nome);
    return cod.indexOf("1.1.01") === 0 || cod.indexOf("1.01.01") === 0;
  },

  diaSeguinte(iso) {
    const p = String(iso || "").split("-").map(Number);
    const d = new Date(p[0], (p[1] || 1) - 1, (p[2] || 1) + 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  },

  sinalBalancete(valor, tipo) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return null;
    const t = String(tipo || "").trim().toUpperCase();
    if (t.indexOf("C") === 0) return -Math.abs(n);
    if (t.indexOf("D") === 0) return Math.abs(n);
    return n;
  },

  /* Mês que termina na data do saldo: o saldo final é o saldo de fechamento desse dia. */
  periodoDoSaldo(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    if (p.length < 3 || !p[0] || !p[1]) return { ini: String(iso || "").slice(0, 10), fim: String(iso || "").slice(0, 10) };
    return { ini: p[0] + "-" + p[1] + "-01", fim: p[0] + "-" + p[1] + "-" + p[2] };
  },

  linhaBalancete(b, fechamento) {
    if (!b || typeof b !== "object") return { codigo: "", nome: "", valor: null };
    const conta = b.account && typeof b.account === "object" ? b.account : null;
    const codigo = String(
      b.accountId ||
      (conta && (conta.id || conta.code || conta.accountId)) ||
      (typeof b.account === "string" ? b.account : "") ||
      b.code || ""
    ).trim();
    const nome = String(
      b.accountName ||
      (conta && (conta.name || conta.description || conta.accountName)) ||
      b.name || b.description || b.accountDescription || codigo
    ).trim();
    let valor = null;
    if (fechamento) {
      if (b.balance != null && b.balance !== "") valor = this.sinalBalancete(b.balance, b.balanceType);
      else if (b.balanceCarriedForward != null && b.balanceCarriedForward !== "") {
        valor = this.sinalBalancete(b.balanceCarriedForward, b.balanceCarriedForwardType || b.balanceType);
      } else {
        const ant = this.sinalBalancete(b.previousBalance, b.previousBalanceType);
        const deb = Number(b.debitBalance != null ? b.debitBalance : b.debit);
        const cred = Number(b.creditBalance != null ? b.creditBalance : b.credit);
        if (ant != null) valor = ant + (Number.isFinite(deb) ? deb : 0) - (Number.isFinite(cred) ? cred : 0);
      }
    } else {
      const temAnterior = b.previousBalance != null && b.previousBalance !== "";
      const bruto = temAnterior ? b.previousBalance : (b.balanceCarriedForward != null ? b.balanceCarriedForward : b.balance);
      const tipo = temAnterior ? (b.previousBalanceType || b.balanceType) : (b.balanceCarriedForwardType || b.balanceType);
      valor = this.sinalBalancete(bruto, tipo);
    }
    return { codigo: codigo, nome: nome, valor: valor };
  },

  linhaConta(b) {
    if (!b || typeof b !== "object") return { codigo: "", nome: "", valor: null };
    const codigo = String(b.accountNumber || b.number || b.account || "").trim();
    const nome = String(b.accountName || b.name || b.description || codigo).trim();
    return { codigo: codigo, nome: nome, valor: this.valorSaldo(b) };
  },

  contasEscolhidas() {
    if (!Array.isArray(this._saldoSel)) {
      try { this._saldoSel = JSON.parse(localStorage.getItem(this.LS_SALDO) || "null"); } catch (e) { this._saldoSel = null; }
    }
    const todas = (this._saldoContas || []).filter((c) => this.ehContaAnalise(c)).map((c) => c.chave);
    if (!Array.isArray(this._saldoSel)) return todas;
    const set = new Set((this._saldoContas || []).map((c) => c.chave));
    const salvas = this._saldoSel.map(String);
    const vigentes = salvas.filter((k) => set.has(k));
    if (vigentes.length) return vigentes;
    if (salvas.length && set.size) return todas;
    return salvas;
  },

  somaSaldo(data) {
    const mapa = (this._saldoMap && this._saldoMap[data]) || {};
    const set = this.contasEscolhidas();
    let t = 0;
    set.forEach((k) => { t += Number(mapa[k]) || 0; });
    return t;
  },

  resultadoMes(i) {
    const base = this.base2026();
    const arr = (base.grupos && (base.grupos.g_10 || base.grupos.g_12)) || [];
    return Number(arr[i]) || 0;
  },

  pedirSaldos() {
    const chave = this.chaveSaldos();
    if (this._saldoChave === chave && (this._saldoEstado === "ok" || this._saldoEstado === "lendo")) return;
    this.carregarSaldos();
  },

  async carregarSaldos() {
    const api = window.SiengeApiService;
    const empresas = this.empresasDoSaldo();
    const corte = this.corteForecast();
    const chave = this.chaveSaldos();
    const token = (this._sToken = (this._sToken || 0) + 1);
    this._saldoChave = chave;
    if (!empresas.length || corte <= 0) {
      this._saldoEstado = "vazio";
      this._saldoContas = [];
      this._saldoMap = {};
      this.atualizarSaldosDom();
      return;
    }
    if (!api || (typeof api.getTrialBalance !== "function" && typeof api.getAccountBalances !== "function")) {
      this._saldoEstado = "erro";
      this._saldoErro = "A consulta do saldo de caixa não está disponível.";
      return;
    }
    this._saldoEstado = "lendo";
    this._saldoErro = "";
    this._saldoFonte = "";
    this.atualizarSaldosDom();
    const datas = [];
    for (let i = 0; i <= corte; i++) datas.push(this.dataSaldo(2026, i));
    try {
      const mapa = {};
      const porConta = new Map();
      const jobs = [];
      const fontes = new Set();
      empresas.forEach((emp) => datas.forEach((dt) => jobs.push({ emp: String(emp.id), dt: dt })));
      let cursor = 0;
      const self = this;
      let falha = null;
      const worker = async () => {
        while (cursor < jobs.length) {
          const job = jobs[cursor++];
          const per = self.periodoDoSaldo(job.dt);
          let linhas = [];
          let origem = "balancete";
          if (typeof api.getTrialBalance === "function") {
            try {
              const lista = await api.getTrialBalance(job.emp, per.ini, per.fim);
              (lista || []).forEach((b) => {
                const linha = self.linhaBalancete(b, true);
                if (linha.codigo && linha.valor != null) linhas.push(linha);
              });
            } catch (e) {
              falha = e;
              linhas = [];
            }
          }
          const temCaixa = linhas.some((l) => l.codigo.indexOf("1.1.01") === 0 || l.codigo.indexOf("1.01.01") === 0);
          if (!temCaixa && typeof api.getAccountBalances === "function") {
            try {
              const contas = await api.getAccountBalances(job.dt, { companyId: job.emp, showLast: true });
              const alt = [];
              (contas || []).forEach((b) => {
                const linha = self.linhaConta(b);
                if (linha.codigo && linha.valor != null) alt.push(linha);
              });
              if (alt.length) {
                linhas = alt;
                origem = "contas";
              }
            } catch (e) {
              falha = falha || e;
            }
          }
          if (!linhas.length) continue;
          fontes.add(origem);
          const dia = mapa[job.dt] || (mapa[job.dt] = {});
          linhas.forEach((linha) => {
            const k = job.emp + "|" + linha.codigo;
            dia[k] = linha.valor;
            if (!porConta.has(k)) {
              porConta.set(k, { chave: k, empresa: job.emp, numero: linha.codigo, nome: linha.nome, analitica: true, origem: origem === "contas" ? "contas" : "" });
            }
          });
        }
      };
      const n = Math.min(3, jobs.length || 1);
      await Promise.all(Array.from({ length: n }, () => worker()));
      if (token !== this._sToken) return;
      if (!porConta.size && falha) throw falha;
      const porEmpresa = {};
      porConta.forEach((c) => {
        if (c.origem === "contas") return;
        if (!porEmpresa[c.empresa]) porEmpresa[c.empresa] = [];
        porEmpresa[c.empresa].push(c.numero);
      });
      porConta.forEach((c) => {
        if (c.origem === "contas") { c.analitica = true; return; }
        const irmas = porEmpresa[c.empresa] || [];
        c.analitica = !irmas.some((o) => o !== c.numero && o.indexOf(c.numero + ".") === 0);
      });
      const caixa = [];
      porConta.forEach((c) => {
        if (!c.analitica) return;
        if (c.origem === "contas") { caixa.push(c); return; }
        const cod = c.numero;
        if (cod.indexOf("1.1.01") === 0 || cod.indexOf("1.01.01") === 0) caixa.push(c);
      });
      const lista = caixa.length ? caixa : Array.from(porConta.values()).filter((c) => c.analitica);
      lista.sort((a, b) => String(a.numero).localeCompare(String(b.numero), "pt-BR", { numeric: true }));
      this._saldoFonte = fontes.has("balancete") && fontes.has("contas") ? "misto" : (fontes.has("contas") ? "contas" : "balancete");
      this._saldoContas = lista;
      this._saldoMap = mapa;
      this._saldoEstado = lista.length ? "ok" : "vazio";
    } catch (e) {
      if (token !== this._sToken) return;
      this._saldoEstado = "erro";
      const st = Number(e && e.status);
      this._saldoErro = st === 422
        ? "O Sienge recusou a consulta do balancete."
        : ((e && e.message) || "Não consegui ler o balancete de verificação.");
    }
    this.atualizarSaldosDom();
  },

  atualizarSaldosDom() {
    const foot = document.getElementById("orc-dfc-saldo-foot");
    if (foot) foot.innerHTML = this.htmlSaldos();
    const box = document.getElementById("orc-dfc-saldos");
    if (box) box.innerHTML = this.quadroSaldos();
    this.ligarSaldos(document.getElementById("orc-dfc-body"));
  },

  mesSaldo() {
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    let mes = Number(this._saldoMes);
    if (!(mes >= 0) || mes >= corte) mes = 0;
    return mes;
  },

  verSaldoMes(i) {
    this._saldoMes = Number(i) || 0;
    this.atualizarSaldosDom();
  },

  abrirEscolhaSaldos() {
    this._saldoPicker = !this._saldoPicker;
    this.atualizarSaldosDom();
  },

  toggleSaldoConta(chave, on) {
    const set = new Set(this.contasEscolhidas());
    if (on) set.add(String(chave));
    else set.delete(String(chave));
    this._saldoSel = Array.from(set);
    try { localStorage.setItem(this.LS_SALDO, JSON.stringify(this._saldoSel)); } catch (e) {}
    this._saldoPicker = true;
    this.atualizarSaldosDom();
  },

  htmlSaldos() {
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    const span = 1 + (this.MESES.length + 1) * 4;
    if (this._saldoEstado === "lendo") {
      return `<tr class="orc-dfc-saldo"><td colspan="${span}">Lendo o saldo das contas…</td></tr>`;
    }
    if (this._saldoEstado === "erro") {
      return `<tr class="orc-dfc-saldo"><td colspan="${span}">${this.esc(this._saldoErro || "Não consegui ler o saldo das contas.")}</td></tr>`;
    }
    if (this._saldoEstado === "vazio") {
      return `<tr class="orc-dfc-saldo"><td colspan="${span}">O balancete não devolveu o saldo de caixa no fim do mês.</td></tr>`;
    }
    if (this._saldoEstado !== "ok" || corte <= 0) return "";
    const vazio = `<td class="orc-dfc-sep">—</td><td></td><td></td><td></td>`;
    const cel = (i, valor, escolhe) => {
      if (i >= corte) return vazio;
      const on = this.mesSaldo() === i ? " is-on" : "";
      const btn = escolhe
        ? `<button type="button" class="orc-dfc-saldo-btn${on}" data-saldo-mes="${i}">${this.money(valor)}</button>`
        : this.money(valor);
      return `<td class="orc-dfc-sep">${btn}</td><td></td><td></td><td></td>`;
    };
    const fatia = (i) => {
      const ini = this.somaSaldo(this.dataSaldo(2026, i));
      const fim = this.somaSaldo(this.dataSaldo(2026, i + 1));
      return { ini: ini, fim: fim, variacao: fim - ini };
    };
    const linha = (nome, campo, abre) => {
      const cells = this.MESES.map((_, i) => i >= corte ? vazio : cel(i, fatia(i)[campo], campo !== "variacao")).join("");
      const ultimo = corte - 1;
      const a = fatia(0).ini;
      const b = fatia(ultimo).fim;
      const tot = campo === "ini" ? a : (campo === "fim" ? b : b - a);
      const label = abre
        ? `<button type="button" class="orc-dfc-saldo-abre" data-saldo-abrir="1">Saldo inicial</button>`
        : nome;
      return `<tr class="orc-dfc-saldo"><td>${label}</td>${cells}<td class="orc-dfc-sep">${this.money(tot)}</td><td></td><td></td><td></td></tr>`;
    };
    const rodape = linha("", "ini", true) + linha("Saldo final", "fim", false) + linha("Variação", "variacao", false);
    return rodape;
  },

  quadroSaldos() {
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    if (this._saldoEstado !== "ok" || corte <= 0) return "";
    const mes = this.mesSaldo();
    const iniData = this.dataSaldo(2026, mes);
    const fimData = this.dataSaldo(2026, mes + 1);
    const mapaIni = (this._saldoMap && this._saldoMap[iniData]) || {};
    const mapaFim = (this._saldoMap && this._saldoMap[fimData]) || {};
    const escolhidas = new Set(this.contasEscolhidas());
    const varias = this.empresasDoSaldo().length > 1;
    const linhas = (this._saldoContas || []).filter((c) => escolhidas.has(c.chave)).map((c) => {
      const a = Number(mapaIni[c.chave]) || 0;
      const b = Number(mapaFim[c.chave]) || 0;
      const nome = (varias ? c.empresa + " · " : "") + c.numero + (c.nome && c.nome !== c.numero ? " " + c.nome : "");
      return { nome: nome, ini: a, fim: b, variacao: b - a };
    }).sort((x, y) => String(x.nome).localeCompare(String(y.nome), "pt"));
    const tot = linhas.reduce((s, r) => ({ ini: s.ini + r.ini, fim: s.fim + r.fim, variacao: s.variacao + r.variacao }), { ini: 0, fim: 0, variacao: 0 });
    const corpo = linhas.map((r) => `<tr><td>${this.esc(r.nome)}</td><td>${this.money(r.ini)}</td><td>${this.money(r.fim)}</td><td class="${r.variacao < -0.005 ? "orc-dfc-neg" : ""}">${this.money(r.variacao)}</td></tr>`).join("");
    const checks = this._saldoPicker ? (this._saldoContas || []).map((c) => {
      const on = escolhidas.has(c.chave);
      const nome = (varias ? c.empresa + " · " : "") + c.numero + (c.nome && c.nome !== c.numero ? " " + c.nome : "");
      return `<label class="orc-dfc-conta${this.ehContaAnalise(c) ? "" : " is-fora"}"><input type="checkbox" data-saldo-conta="${this.esc(c.chave)}" ${on ? "checked" : ""}> ${this.esc(nome)}</label>`;
    }).join("") : "";
    const resultado = this.resultadoMes(mes);
    return `<section class="orc-dfc-quadro">
      ${this._saldoPicker ? `<div class="orc-dfc-checks"><p>Contas de caixa. A marca inicial deixa a Terracotta e as aplicações de fora. Vale para todos os meses.</p>${checks || "<span>Nenhuma conta de caixa voltou da consulta.</span>"}</div>` : ""}
      <h3>Contas em ${this.MESES[mes]} de 2026</h3>
      <p>Início em ${this.dataBr(iniData)} e fim em ${this.dataBr(fimData)}, ${this._saldoFonte === "contas" ? "pelo saldo das contas correntes" : (this._saldoFonte === "misto" ? "pelo balancete societário e, onde ele não respondeu, pelo saldo das contas correntes" : "pelo balancete de verificação societário")}. A variação é o saldo final menos o saldo inicial. A geração do resultado deste mês no DFC foi ${this.money(resultado)}.</p>
      <div class="orc-dfc-scroll orc-dfc-quadro-scroll">
        <table class="orc-dfc-table orc-dfc-quadro-tab">
          <thead><tr><th>Conta</th><th>Saldo em ${this.dataBr(iniData)}</th><th>Saldo em ${this.dataBr(fimData)}</th><th>Variação</th></tr></thead>
          <tbody>${corpo || `<tr><td colspan="4">Nenhuma conta marcada. Clique em Saldo inicial para escolher.</td></tr>`}</tbody>
          <tfoot><tr><td>Total</td><td>${this.money(tot.ini)}</td><td>${this.money(tot.fim)}</td><td class="${tot.variacao < -0.005 ? "orc-dfc-neg" : ""}">${this.money(tot.variacao)}</td></tr></tfoot>
        </table>
      </div>
    </section>`;
  },

  ligarSaldos(raiz) {
    const box = raiz || document.getElementById("orc-dfc-body");
    if (!box) return;
    const self = this;
    box.querySelectorAll("[data-saldo-mes]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        self.verSaldoMes(btn.getAttribute("data-saldo-mes"));
      });
    });
    box.querySelectorAll("[data-saldo-abrir]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        self.abrirEscolhaSaldos();
      });
    });
    box.querySelectorAll("[data-saldo-conta]").forEach((inp) => {
      inp.addEventListener("change", () => self.toggleSaldoConta(inp.getAttribute("data-saldo-conta"), inp.checked));
    });
  },

  paintMeta(src) {
    const el = document.getElementById("orc-dfc-meta");
    if (!el) return;
    const pack = src || this.origem();
    const n = (pack.lines || []).length;
    const nome = pack.fileName || "Base 2027";
    const extra = this._custom ? " · arquivo enviado" : "";
    el.textContent = n ? (nome + " · " + n.toLocaleString("pt-BR") + " lançamentos" + extra) : "Nenhum orçamento carregado.";
  },

  paintEmp() {
    const box = document.getElementById("orc-dfc-emp-box");
    if (!box || !window.MlEmpresaFilter) return;
    const items = this.empresas();
    box.innerHTML = MlEmpresaFilter.html({
      id: "orc-dfc-emp",
      label: "Empresas",
      items,
      selectedIds: this.selectedCompanyIds.map(String),
      open: this.companyDropOpen,
      query: this.companyQuery,
      emptyMeansAll: true
    });
    MlEmpresaFilter.bind("orc-dfc-emp", {
      toggleOpen: () => {
        this.companyDropOpen = !this.companyDropOpen;
        if (this.companyDropOpen) {
          this.ccDropOpen = false;
          this.paintCc();
        }
        this.paintEmp();
      },
      setQuery: (q) => {
        this.companyQuery = q || "";
        const list = document.getElementById("orc-dfc-emp-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-dfc-emp",
            items,
            selectedIds: this.selectedCompanyIds,
            query: this.companyQuery
          });
        }
      },
      toggleId: (id, on) => {
        const sid = String(id);
        if (on) {
          if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid);
        } else {
          this.selectedCompanyIds = this.selectedCompanyIds.filter((x) => x !== sid);
        }
        this.companyDropOpen = true;
        this.podarCentros();
        this.paintEmp();
        this.paintCc();
        this.paintBody();
      },
      selectAll: () => {
        this.selectedCompanyIds = items.map((c) => c.id);
        this.companyDropOpen = true;
        this.podarCentros();
        this.paintEmp();
        this.paintCc();
        this.paintBody();
      },
      selectNone: () => {
        this.selectedCompanyIds = [];
        this.companyDropOpen = true;
        this.podarCentros();
        this.paintEmp();
        this.paintCc();
        this.paintBody();
      }
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  paintCc() {
    const box = document.getElementById("orc-dfc-cc-box");
    if (!box || !window.MlEmpresaFilter) return;
    const items = this.empreendimentos();
    box.innerHTML = MlEmpresaFilter.html({
      id: "orc-dfc-cc",
      label: "Empreendimentos",
      items,
      selectedIds: this.selectedCcIds.map(String),
      open: this.ccDropOpen,
      query: this.ccQuery,
      emptyMeansAll: true,
      nouns: {
        singular: "empreendimento",
        plural: "empreendimentos",
        none: "Nenhum empreendimento",
        noMatch: "Nenhum empreendimento com esse nome."
      }
    });
    MlEmpresaFilter.bind("orc-dfc-cc", {
      toggleOpen: () => {
        this.ccDropOpen = !this.ccDropOpen;
        if (this.ccDropOpen) {
          this.companyDropOpen = false;
          this.paintEmp();
        }
        this.paintCc();
      },
      setQuery: (q) => {
        this.ccQuery = q || "";
        const list = document.getElementById("orc-dfc-cc-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-dfc-cc",
            items,
            selectedIds: this.selectedCcIds,
            query: this.ccQuery,
            nouns: { singular: "empreendimento", noMatch: "Nenhum empreendimento com esse nome." }
          });
        }
      },
      toggleId: (id, on) => {
        const sid = String(id);
        if (on) {
          if (!this.selectedCcIds.includes(sid)) this.selectedCcIds.push(sid);
        } else {
          this.selectedCcIds = this.selectedCcIds.filter((x) => x !== sid);
        }
        this.ccDropOpen = true;
        this.paintCc();
        this.paintBody();
      },
      selectAll: () => {
        this.selectedCcIds = items.map((c) => c.id);
        this.ccDropOpen = true;
        this.paintCc();
        this.paintBody();
      },
      selectNone: () => {
        this.selectedCcIds = [];
        this.ccDropOpen = true;
        this.paintCc();
        this.paintBody();
      }
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  paintBody() {
    const body = document.getElementById("orc-dfc-body");
    const foraEl = document.getElementById("orc-dfc-fora");
    if (!body) return;
    if (this.busy) {
      body.innerHTML = `
        <div class="ml-load orc-dfc-load">
          <div class="loading-spinner" aria-hidden="true"></div>
          <div class="loading-status-text">Lendo o Excel do orçamento…</div>
          <div class="ml-load-track"><div class="loading-progress-bar" style="width:45%"></div></div>
        </div>`;
      if (foraEl) foraEl.innerHTML = "";
      return;
    }
    if (!this.lines().length) {
      body.innerHTML = `<div class="orc-dfc-erro">${this.esc(this.erro || "Suba o Excel do orçamento 2027 para montar o DFC.")}</div>`;
      if (foraEl) foraEl.innerHTML = "";
      return;
    }
    const { rows, fora } = this.montar();
    this._linhasDfc = rows;
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    const h1 = this.MESES.map((m, i) => `<th colspan="4" class="orc-dfc-mes${i % 2 ? " is-alt" : ""}">${m}</th>`).join("") + `<th colspan="4" class="orc-dfc-mes">Total</th>`;
    const sub = (rotulo) => `<th class="orc-dfc-sep">${rotulo}</th><th>2027</th><th>Var R$</th><th>Var %</th>`;
    const h2 = this.MESES.map((_, i) => sub(i >= corte ? "Prev" : "2026")).join("") + sub("2026");
    const trs = rows.map((r) => {
      const cls = [
        r.isAccount ? "orc-dfc-acc" : "",
        r.isCc ? "orc-dfc-cc" : "",
        r.type === "formula" ? "orc-dfc-formula" : "",
        r.type === "total_n1" ? "orc-dfc-n1" : "",
        r.id === "g_08" ? "orc-dfc-fcf" : "",
        r.id === "g_03" ? "orc-dfc-saida-forte" : "",
        (r.id === "g_02" || r.id === "g_04" || r.id === "g_05") ? "orc-dfc-saida" : ""
      ].filter(Boolean).join(" ");
      const ico = r.hasKids
        ? `<i data-lucide="${this.expanded.has(r.id) ? "chevron-down" : "chevron-right"}"></i>`
        : `<i class="orc-dfc-no"></i>`;
      const base = r.base || [];
      const cells = r.months.map((v, i) => this.celCmp(v, base[i], i >= corte, true, i < corte ? (r.id + "||" + i) : "")).join("");
      const click = r.hasKids ? ` data-dfc-id="${this.esc(r.id)}"` : "";
      return `<tr class="${cls}"${click}>
        <td style="padding-left:${6 + r.level * 8}px">${ico}<span>${this.esc(r.name)}</span></td>
        ${cells}
        ${this.celCmp(r.total, r.baseTotal, false, true, corte > 0 ? (r.id + "||t") : "")}
      </tr>`;
    }).join("");
    let avisoBase = "";
    if (this._caixaEstado === "lendo") avisoBase = `<div class="orc-dfc-erro orc-dfc-caixa-msg">${this.esc(this._caixaMsg || "Lendo o realizado de 2026 no caixa e banco…")}</div>`;
    else if (this._caixaEstado === "erro") avisoBase = `<div class="orc-dfc-erro">${this.esc(this._caixaErro || "Falha ao ler o realizado de 2026 no caixa e banco.")}</div>`;
    else if (this._caixaEstado === "vazio") avisoBase = `<div class="orc-dfc-erro">O caixa e banco não devolveu movimento realizado em 2026 para essas empresas.</div>`;
    else if (this._caixaAviso) avisoBase = `<div class="orc-dfc-erro">${this.esc(this._caixaAviso)}</div>`;
    const aviso = this.erro ? `<div class="orc-dfc-erro">${this.esc(this.erro)}</div>` : "";
    body.innerHTML = `
      ${aviso}
      ${avisoBase}
      <div class="orc-dfc-scroll">
        <table class="orc-dfc-table orc-dfc-cmp">
          <thead><tr><th rowspan="2">Conta</th>${h1}</tr><tr>${h2}</tr></thead>
          <tbody>${trs}</tbody>
          <tfoot id="orc-dfc-saldo-foot">${this.htmlSaldos()}</tfoot>
        </table>
      </div>
      <div id="orc-dfc-saldos">${this.quadroSaldos()}</div>`;
    body.querySelectorAll("[data-dfc-id]").forEach((tr) => {
      tr.addEventListener("click", () => this.toggle(tr.getAttribute("data-dfc-id")));
    });
    body.querySelectorAll("[data-orc-2026]").forEach((td) => {
      td.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.abrirCelula2026(td.getAttribute("data-orc-2026"));
      });
    });
    this.ligarSaldos(body);
    this.pedirSaldos();
    if (foraEl) {
      if (!fora.length) {
        foraEl.innerHTML = "";
        foraEl.hidden = true;
      } else {
        foraEl.hidden = false;
        foraEl.innerHTML = `
          <div class="orc-dfc-alerta">
            <strong>Contas fora do DFC</strong>
            <p>Estas contas do Excel não têm lugar na visão e ficaram de fora da soma.</p>
            <ul>
              ${fora.map((f) => `<li><b>${this.esc(f.conta)}</b> ${this.esc(f.cn)}<span>${this.money(f.total)}</span></li>`).join("")}
            </ul>
          </div>`;
      }
    }
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  },

  async lerArquivo(file) {
    this.erro = "";
    this.busy = true;
    this.paintBody();
    try {
      const buf = await file.arrayBuffer();
      const lines = await this.parseExcel(buf);
      if (!lines.length) throw new Error("O Excel não tem lançamentos com valor na aba de importação.");
      this._custom = { fileName: file.name, savedAt: Date.now(), lines };
      try { localStorage.setItem(this.LS, JSON.stringify(this._custom)); } catch (e) {}
      this.selectedCompanyIds = [];
      this.selectedCcIds = [];
      this._expandInited = false;
      this.expanded = new Set();
    } catch (err) {
      this.erro = (err && err.message) ? err.message : "Não consegui ler esse Excel.";
    }
    this.busy = false;
    const base = document.getElementById("orc-dfc-base");
    if (base) base.hidden = !this._custom;
    this.paintMeta();
    this.paintEmp();
    this.paintCc();
    this._caixaChave = "";
    this.paintBody();
    this.carregarBase();
  },

  voltarBase() {
    this._custom = null;
    this.erro = "";
    try { localStorage.removeItem(this.LS); } catch (e) {}
    this.selectedCompanyIds = [];
    this.selectedCcIds = [];
    this._expandInited = false;
    this.expanded = new Set();
    const base = document.getElementById("orc-dfc-base");
    if (base) base.hidden = true;
    this.paintMeta();
    this.paintEmp();
    this.paintCc();
    this._caixaChave = "";
    this.paintBody();
    this.carregarBase();
  },

  cellText(cell) {
    if (!cell || cell.value == null) return "";
    let v = cell.value;
    if (v && typeof v === "object") {
      if (v.result != null) v = v.result;
      else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text || "").join("");
      else if (v.text != null) v = v.text;
      else v = "";
    }
    return String(v == null ? "" : v).trim();
  },

  cellNum(cell) {
    if (!cell || cell.value == null) return 0;
    let v = cell.value;
    if (v && typeof v === "object") {
      if (v.result != null) v = v.result;
      else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text || "").join("");
      else if (v.text != null) v = v.text;
    }
    if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
    const s = String(v || "").trim();
    if (!s) return 0;
    const n = s.indexOf(",") >= 0
      ? Number(s.replace(/\./g, "").replace(",", "."))
      : Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  },

  cabecalho(ws) {
    for (let r = 1; r <= 8; r++) {
      const row = ws.getRow(r);
      const map = {};
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const h = this.norm(this.cellText(cell));
        if (h) map[h] = col;
      });
      if (!map.EMPRESA || !map.CONTA || !map.JAN) continue;
      const meses = this.MESES.map((m) => map[m]);
      if (meses.some((c) => !c)) continue;
      return {
        row: r,
        emp: map.EMPRESA,
        cc: map.CODIGO || 0,
        en: map.DESCRICAO || 0,
        conta: map.CONTA,
        cn: map["DESCRICAO CONTA"] || 0,
        meses
      };
    }
    return null;
  },

  nomeAba(id, nome, used) {
    const limpo = String(nome || "EMPRESA").replace(/[:\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim();
    let base = String(id) + "-" + limpo;
    if (base.length > 31) base = base.slice(0, 31);
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suf = "-" + (n++);
      name = (base.slice(0, Math.max(1, 31 - suf.length)) + suf).slice(0, 31);
    }
    used.add(name.toLowerCase());
    return name;
  },

  pctNum(orc, real) {
    const b = Number(real) || 0;
    if (Math.abs(b) < 0.005) return null;
    return ((Number(orc) || 0) - b) / Math.abs(b);
  },

  preencherDfc(ws, inv, opts) {
    const rows = opts.rows || [];
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    const meses = this.MESES;
    const colunas = ["Conta"];
    meses.forEach((m, i) => {
      const rot = i >= corte ? "Prev" : "2026";
      colunas.push(m + " " + rot, m + " 2027", m + " Var R$", m + " Var %");
    });
    colunas.push("Total 2026", "Total 2027", "Total Var R$", "Total Var %");
    const last = colunas.length;
    const letra = (i) => inv.excelColLetter(i);
    ws.properties.showGridLines = false;
    ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", activeCell: "B5", showGridLines: false }];
    ws.columns = colunas.map((_, i) => ({ width: i === 0 ? 46 : 13 }));
    ws.mergeCells("A1:A2");
    ws.getRow(1).height = 28;
    ws.getRow(2).height = 22;
    ws.getRow(3).height = 8;
    ws.getRow(4).height = 20;
    const sub = opts.varias
      ? (opts.empresa.id + " - " + (opts.empresa.name || ""))
      : ("Orçamento 2027 contra o DFC de 2026 · " + this.textoCorte());
    const title = ws.getCell("A1");
    title.value = {
      richText: [
        { font: { name: "Calibri", size: 14, bold: true, color: { argb: "FF475569" } }, text: "DFC 2027\n" },
        { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: sub }
      ]
    };
    title.alignment = { vertical: "middle", wrapText: true, indent: 8 };
    if (opts.logo && opts.logo.dataUrl) {
      try {
        const img = ws.workbook.addImage({ base64: opts.logo.dataUrl, extension: opts.logo.extension || "png" });
        const px = Math.round(1.54 * 96 / 2.54);
        ws.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: px, height: px } });
      } catch (e) {}
    }
    const fim = this.fimRealizado2026();
    const ind = [
      ["Realizado até", fim ? fim.split("-").reverse().join("/") : "—"],
      ["Linhas", rows.length]
    ];
    ind.forEach((par, i) => {
      const col = 4 + i * 2;
      const c1 = ws.getCell(1, col);
      const c2 = ws.getCell(2, col);
      c1.value = par[0];
      c2.value = par[1];
      inv.excelPaint(c1, { font: { size: 8, bold: true, color: { argb: "FF94A3B8" } }, align: { horizontal: "right", vertical: "middle" } });
      inv.excelPaint(c2, { font: { size: 12, bold: true, color: { argb: "FF0F172A" } }, align: { horizontal: "right", vertical: "middle" } });
    });
    const head = ws.getRow(4);
    colunas.forEach((nome, i) => {
      const cell = head.getCell(i + 1);
      cell.value = nome;
      inv.excelPaint(cell, {
        font: { size: 9, bold: true, color: { argb: "FFFFFFFF" } },
        fill: "FF334155",
        align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
        border: true
      });
    });
    rows.forEach((r) => {
      const linha = ws.addRow([]);
      linha.outlineLevel = Math.max(0, Math.min(7, Number(r.level) || 0));
      const valores = [r.name];
      const bases = r.base || [];
      (r.months || []).forEach((orc, i) => {
        const real = Number(bases[i]) || 0;
        valores.push(real, Number(orc) || 0, (Number(orc) || 0) - real, this.pctNum(orc, real));
      });
      valores.push(Number(r.baseTotal) || 0, Number(r.total) || 0, (Number(r.total) || 0) - (Number(r.baseTotal) || 0), this.pctNum(r.total, r.baseTotal));
      let fill = "FFFFFFFF";
      let fontColor = "FF0F172A";
      let bold = false;
      if (r.type === "total_n1" || r.level === 0) { fill = "FF0C3D28"; fontColor = "FFFFFFFF"; bold = true; }
      else if (r.type === "formula") { fill = "FFECFDF5"; fontColor = "FF064E3B"; bold = true; }
      else if (r.isAccount) { fill = "FFF8FAFC"; bold = true; }
      else if (r.isCc) { fill = "FFE7F6EE"; fontColor = "FF105436"; }
      valores.forEach((v, i) => {
        const cell = linha.getCell(i + 1);
        const num = i > 0 && typeof v === "number";
        const pct = num && (i % 4 === 0);
        const zero = num && !pct && Math.abs(v) < 0.005;
        cell.value = pct ? v : (zero ? 0 : v);
        const cor = pct ? (v < 0 ? "FFB91C1C" : fontColor) : (zero ? "FF94A3B8" : (num && v < 0 ? "FFB91C1C" : fontColor));
        inv.excelPaint(cell, {
          font: { size: 9, bold: bold, color: { argb: cor } },
          fill: fill,
          align: { horizontal: i === 0 ? "left" : "right", vertical: "middle", indent: i === 0 ? Math.min(r.level || 0, 8) : 0 },
          border: true,
          numFmt: pct ? "0.0%" : (num ? "#,##0.00" : undefined)
        });
      });
    });
    const foot = ws.addRow([]);
    foot.height = 18;
    ws.mergeCells(foot.number, 1, foot.number, last);
    const rodape = foot.getCell(1);
    rodape.value = inv.generatedAtLabel(new Date());
    inv.excelPaint(rodape, { font: { size: 8, italic: true, color: { argb: "FF64748B" } }, align: { horizontal: "left", vertical: "middle" } });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: last } };
    return letra;
  },

  async exportExcel() {
    const inv = window.InvestimentoApp;
    if (!inv || typeof inv.ensureExcelJS !== "function") {
      this.erro = "O Excel ainda não carregou. Atualize a página e tente de novo.";
      this.paintBody();
      return;
    }
    if (!this.lines().length) {
      this.erro = "Suba o Excel do orçamento 2027 antes de exportar.";
      this.paintBody();
      return;
    }
    const empresas = this.empresas();
    const sel = this.selectedCompanyIds.map(String);
    const todas = !sel.length || sel.length >= empresas.length;
    const alvos = todas ? empresas : [{ id: "", name: sel.length === 1 ? ((empresas.find((e) => String(e.id) === sel[0]) || {}).name || "") : "Seleção" }];
    const ExcelJS = await inv.ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    const used = new Set();
    let logo = null;
    try { logo = await inv.logoDataUrl(); } catch (e) { logo = null; }
    const prev = this.selectedCompanyIds.slice();
    try {
      for (let i = 0; i < (todas ? empresas.length : 1); i++) {
        if (todas) this.selectedCompanyIds = [String(empresas[i].id)];
        const pack = this.montar({ aberto: true });
        const alvo = todas ? empresas[i] : alvos[0];
        const nome = todas ? this.nomeAba(alvo.id, alvo.name, used) : this.nomeAba("DFC", "2027", used);
        const ws = wb.addWorksheet(nome, { views: [{ showGridLines: false }] });
        this.preencherDfc(ws, inv, { empresa: alvo, rows: pack.rows, varias: todas, logo: logo });
      }
    } finally {
      this.selectedCompanyIds = prev;
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const fim = (this.fimRealizado2026() || "2026").replace(/-/g, "");
    a.download = "DFC-2027-" + fim + ".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  async parseExcel(buf) {
    if (typeof ExcelJS === "undefined") {
      throw new Error("O leitor de Excel ainda não carregou. Atualize a página e tente de novo.");
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    let sheet = null;
    let header = null;
    wb.worksheets.forEach((ws) => {
      if (sheet) return;
      if (this.norm(ws.name) !== "IMPORTACAO") return;
      const h = this.cabecalho(ws);
      if (h) { sheet = ws; header = h; }
    });
    if (!sheet) {
      wb.worksheets.forEach((ws) => {
        if (sheet) return;
        const h = this.cabecalho(ws);
        if (h) { sheet = ws; header = h; }
      });
    }
    if (!sheet || !header) {
      throw new Error("Não achei a planilha com as colunas EMPRESA, CONTA e os meses de janeiro a dezembro.");
    }
    const lines = [];
    sheet.eachRow((row, n) => {
      if (n <= header.row) return;
      const emp = this.cellText(row.getCell(header.emp));
      const conta = this.cellText(row.getCell(header.conta));
      if (!emp && !conta) return;
      const meses = header.meses.map((col) => this.cellNum(row.getCell(col)));
      if (!meses.some((v) => Math.abs(v) >= 0.005)) return;
      const corte = emp.match(/^(\d+)\s*-\s*(.*)$/);
      lines.push({
        e: corte ? corte[1] : emp,
        enome: corte ? String(corte[2] || "").trim() : emp,
        cc: header.cc ? this.cellText(row.getCell(header.cc)) : "",
        en: header.en ? this.cellText(row.getCell(header.en)) : "",
        conta,
        cn: header.cn ? this.cellText(row.getCell(header.cn)) : "",
        m: meses
      });
    });
    return lines;
  }
};
