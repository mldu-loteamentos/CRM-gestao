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
  expanded2: new Set(),
  _expand2Inited: false,
  visao: "1",
  _custom: null,
  _pronto: false,
  busy: false,
  erro: "",
  varRs: true,
  varPct: false,

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
      if (row.drillEmp && String(it.companyId || "") !== String(row.drillEmp)) return false;
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
    const set = this.visao === "2" ? this.expanded2 : this.expanded;
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.paintBody();
  },

  setVisao(id) {
    this.visao = id === "2" ? "2" : "1";
    const root = document.querySelector(".orc-dfc-page");
    if (root) {
      root.querySelectorAll("[data-dfc-visao]").forEach((btn) => {
        const on = btn.getAttribute("data-dfc-visao") === this.visao;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
    }
    this.paintBody();
  },

  /* Visão 2: receitas e impostos abrem em empresa, centro de custo, linha e plano.
     Custos (04) e despesas (05) abrem primeiro na linha (04.01, 05.01) e só depois na empresa. */
  montarVisao2(opts) {
    const aberto = !!(opts && opts.aberto);
    const fluxo = typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : null;
    const plano = typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null;
    const corte = this.corteForecast();
    this._corte = corte;
    const tpl = (plano && typeof plano.dfcTemplateGroups === "function" ? plano.dfcTemplateGroups() : []).map((g) => ({
      ...g,
      months: Array(12).fill(0),
      base: Array(12).fill(0)
    }));
    const byId = {};
    tpl.forEach((g) => { byId[g.id] = g; });
    const z = () => Array(12).fill(0);
    const folhas = new Map();
    const fora = new Map();
    const empNomes = new Map();
    const ccNomes = new Map();
    const contaNomes = new Map();
    this.empresas().forEach((e) => empNomes.set(String(e.id), String(e.name || "")));
    const ccIdDe = (cc) => {
      const bruto = String(cc == null ? "" : cc).trim();
      const dig = bruto.replace(/\D/g, "");
      return dig || bruto || "—";
    };
    const folha = (gid, emp, cc, conta) => {
      const k = gid + "\n" + emp + "\n" + cc + "\n" + conta;
      let f = folhas.get(k);
      if (!f) {
        f = { gid: gid, emp: emp, cc: cc, conta: conta, months: z(), base: z() };
        folhas.set(k, f);
      }
      return f;
    };
    const vivo = (m, b) => (m || []).some((v) => Math.abs(Number(v) || 0) >= 0.005) || (b || []).some((v) => Math.abs(Number(v) || 0) >= 0.005);
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
      const emp = String(l.e || "");
      const cc = ccIdDe(l.cc);
      const conta = String(l.conta || "");
      if (l.enome) empNomes.set(emp, String(l.enome).trim());
      if (l.en) ccNomes.set(cc, String(l.en).trim());
      if (l.cn) contaNomes.set(conta, String(l.cn).trim());
      const f = folha(gid, emp, cc, conta);
      (l.m || []).forEach((v, i) => {
        if (i > 11) return;
        const s = fluxo && typeof fluxo.signedAmount === "function"
          ? fluxo.signedAmount(g, l.conta, l.cn, v)
          : (Number(v) || 0);
        f.months[i] += s;
        g.months[i] += s;
      });
    });
    const empFiltro = new Set(this.selectedCompanyIds.map(String));
    (this._lancamentos2026 || []).forEach((c) => {
      const emp = String(c.companyId || "");
      if (empFiltro.size && !empFiltro.has(emp)) return;
      if (!this.ccCabe(c.cc)) return;
      const g = byId[c.gid];
      if (!g || g.type !== "resultado") return;
      const cc = ccIdDe(c.cc);
      const conta = String(c.code || "");
      const f = folha(c.gid, emp, cc, conta);
      const i = Number(c.i);
      if (i >= 0 && i < 12) {
        f.base[i] += Number(c.v) || 0;
        g.base[i] += Number(c.v) || 0;
      }
    });
    const app = window.ResultadoCaixaApp;
    const forecasts = (app && app.forecasts) || {};
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
        const emp = this.empresaDoArquivo(arq);
        Object.keys(arq.contas || {}).forEach((ccRaw) => {
          if (!this.ccCabe(ccRaw)) return;
          const cc = ccIdDe(ccRaw);
          Object.keys(arq.contas[ccRaw] || {}).forEach((code) => {
            const info = arq.contas[ccRaw][code] || {};
            const gid = this.grupoDaConta(code, info.nome);
            const g = gid ? byId[gid] : null;
            if (!g || g.type !== "resultado") return;
            const meses = info.meses || {};
            let valor = Number(meses[ym]);
            if (!Number.isFinite(valor)) {
              const cel = meses[ym] || meses[String(i + 1)];
              valor = cel && typeof cel === "object" ? Number(cel.r != null ? cel.r : cel.o) : Number(cel);
            }
            valor = Number(valor) || 0;
            if (valor && fluxo && typeof fluxo.signedAmount === "function") valor = fluxo.signedAmount(g, code, info.nome || "", valor);
            if (!valor) return;
            if (info.nome) contaNomes.set(String(code), String(info.nome));
            const f = folha(gid, emp, cc, String(code));
            f.base[i] += valor;
            g.base[i] += valor;
          });
        });
      });
    }
    const depth = (g) => {
      let d = 0;
      let cur = g;
      while (cur && cur.parentId && byId[cur.parentId]) {
        d += 1;
        cur = byId[cur.parentId];
      }
      return d;
    };
    tpl.filter((g) => g.type !== "formula").sort((a, b) => depth(b) - depth(a)).forEach((g) => {
      tpl.filter((c) => c.parentId === g.id && c.type !== "formula").forEach((ch) => {
        ch.months.forEach((v, i) => { g.months[i] += v; });
        ch.base.forEach((v, i) => { g.base[i] += v; });
      });
    });
    const sum = (ids, campo) => {
      const months = z();
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
    if (!this._expand2Inited) {
      tpl.filter((g) => !g.parentId && g.type !== "formula").forEach((g) => this.expanded2.add(g.id));
      tpl.filter((g) => (g.parentId === "g_04" || g.parentId === "g_05") && g.type === "resultado").forEach((g) => {
        this.expanded2.add((g.parentId) + "|l|" + g.id);
      });
      this._expand2Inited = true;
    }
    const lista = [...folhas.values()];
    const somaDe = (itens, campo) => {
      const m = z();
      itens.forEach((f) => (f[campo] || []).forEach((v, i) => { m[i] += Number(v) || 0; }));
      return m;
    };
    const tot = (m) => (m || []).reduce((a, b) => a + (Number(b) || 0), 0);
    const ordEmp = (a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) return na - nb;
      return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
    };
    const rows = [];
    const linhaDe = (parcial) => {
      const months = parcial.months;
      const baseMeses = parcial.base;
      rows.push(Object.assign({
        months: months,
        base: baseMeses,
        total: tot(months),
        baseTotal: tot(baseMeses),
        isAccount: false,
        isCc: false
      }, parcial));
    };
    tpl.filter((g) => !g.parentId).forEach((raiz) => {
      const formula = raiz.type === "formula";
      const alvos = raiz.type === "resultado"
        ? [raiz]
        : tpl.filter((g) => g.parentId === raiz.id && g.type === "resultado");
      const doGrupo = formula ? [] : lista.filter((f) => alvos.some((a) => a.id === f.gid) && vivo(f.months, f.base));
      linhaDe({
        id: raiz.id,
        name: raiz.name,
        type: raiz.type,
        kind: formula ? "formula" : "grupo",
        level: 0,
        hasKids: doGrupo.length > 0,
        months: raiz.months,
        base: raiz.base,
        drillGid: raiz.id,
        drillConta: "",
        drillCc: "",
        drillEmp: ""
      });
      if (formula || !doGrupo.length) return;
      if (!aberto && !this.expanded2.has(raiz.id)) return;
      const nomeEmpDe = (emp) => (emp ? emp + " - " : "") + (empNomes.get(emp) || "Sem empresa");
      const rotuloCcDe = (cc) => cc === "—" ? "Sem centro de custo" : ((ccNomes.get(cc) || "") ? cc + " - " + ccNomes.get(cc) : cc);
      const ordCc = (a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true });
      const pintarConta = (paiId, gid, itens, level, cc, emp) => {
        const contas = [...new Set(itens.map((f) => f.conta))].sort(ordCc);
        contas.forEach((conta) => {
          const daConta = itens.filter((f) => f.conta === conta);
          const nomeConta = contaNomes.get(conta) || "";
          linhaDe({
            id: paiId + "|a|" + conta,
            name: conta + (nomeConta ? " " + nomeConta : ""),
            type: "conta",
            kind: "conta",
            level: level,
            hasKids: false,
            isAccount: true,
            months: somaDe(daConta, "months"),
            base: somaDe(daConta, "base"),
            drillGid: gid,
            drillConta: conta,
            drillCc: cc,
            drillEmp: emp
          });
        });
      };
      const pintarEmpresas = (paiId, gid, itens, levelEmp, aposCc) => {
        const emps = [...new Set(itens.map((f) => f.emp))].sort(ordEmp);
        emps.forEach((emp) => {
          const daEmp = itens.filter((f) => f.emp === emp);
          const empId = paiId + "|e|" + emp;
          linhaDe({
            id: empId,
            name: nomeEmpDe(emp),
            type: "empresa",
            kind: "empresa",
            level: levelEmp,
            hasKids: true,
            months: somaDe(daEmp, "months"),
            base: somaDe(daEmp, "base"),
            drillGid: gid,
            drillConta: "",
            drillCc: "",
            drillEmp: emp
          });
          if (!aberto && !this.expanded2.has(empId)) return;
          const ccs = [...new Set(daEmp.map((f) => f.cc))].sort(ordCc);
          ccs.forEach((cc) => {
            const doCc = daEmp.filter((f) => f.cc === cc);
            const ccId = empId + "|c|" + cc;
            linhaDe({
              id: ccId,
              name: rotuloCcDe(cc),
              type: "cc",
              kind: "cc",
              level: levelEmp + 1,
              hasKids: true,
              isCc: true,
              months: somaDe(doCc, "months"),
              base: somaDe(doCc, "base"),
              drillGid: gid,
              drillConta: "",
              drillCc: cc,
              drillEmp: emp
            });
            if (!aberto && !this.expanded2.has(ccId)) return;
            aposCc(ccId, doCc, cc, emp);
          });
        });
      };
      if (raiz.id === "g_04" || raiz.id === "g_05") {
        alvos.forEach((linha) => {
          const daLinha = doGrupo.filter((f) => f.gid === linha.id);
          if (!daLinha.length) return;
          const linId = raiz.id + "|l|" + linha.id;
          linhaDe({
            id: linId,
            name: linha.name,
            type: "resultado",
            kind: "linha",
            level: 1,
            hasKids: true,
            months: somaDe(daLinha, "months"),
            base: somaDe(daLinha, "base"),
            drillGid: linha.id,
            drillConta: "",
            drillCc: "",
            drillEmp: ""
          });
          if (!aberto && !this.expanded2.has(linId)) return;
          pintarEmpresas(linId, linha.id, daLinha, 2, (ccId, doCc, cc, emp) => {
            pintarConta(ccId, linha.id, doCc, 4, cc, emp);
          });
        });
        return;
      }
      pintarEmpresas(raiz.id, raiz.id, doGrupo, 1, (ccId, doCc, cc, emp) => {
        if (raiz.type === "resultado") {
          pintarConta(ccId, raiz.id, doCc, 3, cc, emp);
          return;
        }
        alvos.forEach((linha) => {
          const daLinha = doCc.filter((f) => f.gid === linha.id);
          if (!daLinha.length) return;
          const linId = ccId + "|l|" + linha.id;
          linhaDe({
            id: linId,
            name: linha.name,
            type: "resultado",
            kind: "linha",
            level: 3,
            hasKids: true,
            months: somaDe(daLinha, "months"),
            base: somaDe(daLinha, "base"),
            drillGid: linha.id,
            drillConta: "",
            drillCc: cc,
            drillEmp: emp
          });
          if (!aberto && !this.expanded2.has(linId)) return;
          pintarConta(linId, linha.id, daLinha, 4, cc, emp);
        });
      });
    });
    const foraLista = [...fora.values()]
      .filter((x) => Math.abs(x.total) >= 0.005)
      .sort((a, b) => String(a.conta).localeCompare(String(b.conta), "pt-BR", { numeric: true }));
    return { rows: rows, fora: foraLista };
  },

  render(root) {
    this.garantir();
    const src = this.origem();
    root.innerHTML = `
      <div class="orc-dfc-page">
        ${typeof OrcamentoApp !== "undefined" ? OrcamentoApp.abasHtml() : ""}
        <p class="orc-dfc-lead">Janeiro a dezembro de 2026, o total, e depois janeiro a dezembro de 2027. A variação ao lado de cada mês de 2027 compara com o mesmo mês de 2026. O saldo final de 2026 é o saldo inicial de janeiro de 2027, e cada mês seguinte parte do saldo final do anterior. ${this.textoCorte()} O realizado vem do caixa e banco.</p>
        <div class="ml-tabs orc-dfc-visao" role="tablist">
          <button type="button" role="tab" class="ml-tab${this.visao === "2" ? "" : " is-active"}" data-dfc-visao="1" aria-selected="${this.visao === "2" ? "false" : "true"}"><i data-lucide="table-2"></i> Visão 1</button>
          <button type="button" role="tab" class="ml-tab${this.visao === "2" ? " is-active" : ""}" data-dfc-visao="2" aria-selected="${this.visao === "2" ? "true" : "false"}"><i data-lucide="building-2"></i> Visão 2</button>
        </div>
        <div class="orc-dfc-tools">
          <div id="orc-dfc-emp-box"></div>
          <div id="orc-dfc-cc-box"></div>
          <div class="orc-dfc-vars">
            <label class="moura-switch">
              <input type="checkbox" id="orc-dfc-var-rs" ${this.varRs ? "checked" : ""}>
              <span class="moura-switch-track" aria-hidden="true"></span>
              <span class="moura-switch-text">Variação R$</span>
            </label>
            <label class="moura-switch">
              <input type="checkbox" id="orc-dfc-var-pct" ${this.varPct ? "checked" : ""}>
              <span class="moura-switch-track" aria-hidden="true"></span>
              <span class="moura-switch-text">Variação %</span>
            </label>
          </div>
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
    const varRs = document.getElementById("orc-dfc-var-rs");
    const varPct = document.getElementById("orc-dfc-var-pct");
    if (varRs) varRs.addEventListener("change", () => { this.varRs = !!varRs.checked; this.paintBody(); });
    if (varPct) varPct.addEventListener("change", () => { this.varPct = !!varPct.checked; this.paintBody(); });
    root.querySelectorAll("[data-dfc-visao]").forEach((btn) => {
      btn.addEventListener("click", () => this.setVisao(btn.getAttribute("data-dfc-visao")));
    });
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
    /* A 21 entrou só com a carteira de 2027. Não tem saldo de caixa de 2026 e a consulta dela segura as outras. */
    const todas = this.empresas().filter((e) => String(e.id) !== "21");
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

  /* PAR, REAPROPFIN, 1-6 e 1-1 ficam num grupo à parte e não entram no saldo inicial nem no saldo final. */
  contaForaDoSaldo(c) {
    const bruto = String((c && (c.numero || c.chave)) || c || "");
    const num = bruto.indexOf("|") >= 0 ? bruto.split("|").slice(1).join("|") : bruto;
    const n = num.trim().toUpperCase().replace(/\s+/g, "").replace(/[–—−]/g, "-");
    return n === "PAR" || n === "REAPROPFIN" || n === "1-6" || n === "1-1";
  },

  /* Caixa e equivalentes do balancete (1.1.01), sem a Terracotta. No saldo de contas, a conta corrente entra e a aplicação fica de fora. */
  ehContaAnalise(c) {
    if (!c || !c.analitica) return false;
    if (this.contaForaDoSaldo(c)) return false;
    const cod = String(c.numero || "");
    const nome = this.norm((c.nome || "") + " " + cod);
    if (cod.indexOf("1.1.01.03.016") === 0 || cod.indexOf("1.01.01.03.016") === 0) return false;
    if (nome.indexOf("TERRACOTTA") >= 0) return false;
    if (c.origem === "contas") return !/INVEST|APLIC/.test(nome);
    return cod.indexOf("1.1.01") === 0 || cod.indexOf("1.01.01") === 0;
  },

  async carregarNomesConta(empresas) {
    const api = window.SiengeApiService;
    const map = {};
    if (!api || typeof api.getCheckingAccounts !== "function") return map;
    await Promise.all((empresas || []).map(async (emp) => {
      try {
        const res = await this.comPrazo(api.getCheckingAccounts(emp.id, { allStatuses: true }), 20000);
        ((res && res.results) || []).forEach((raw) => {
          const num = String(raw.accountNumber || raw.number || "").trim();
          const nome = String(raw.accountName || raw.name || raw.description || "").trim();
          if (!num || !nome || nome === num) return;
          const solto = num.toUpperCase().replace(/\s+/g, "").replace(/^0+/, "");
          map[String(emp.id) + "|" + num] = nome;
          if (!map[num]) map[num] = nome;
          if (solto && !map[solto]) map[solto] = nome;
        });
      } catch (e) {}
    }));
    return map;
  },

  rotuloConta(c, varias) {
    const num = String((c && c.numero) || "").trim();
    let nome = String((c && c.nome) || "").trim();
    const solto = num.toUpperCase().replace(/\s+/g, "").replace(/^0+/, "");
    const chave = String((c && c.empresa) || "") + "|" + num;
    const cadastro = (this._nomesConta && (this._nomesConta[c.chave] || this._nomesConta[chave] || this._nomesConta[num] || this._nomesConta[solto])) || "";
    if ((!nome || nome === num) && cadastro) nome = cadastro;
    const prefixo = varias ? String(c.empresa) + " · " : "";
    if (nome && nome !== num) return prefixo + num + " — " + nome;
    return prefixo + num;
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
    if (!b || typeof b !== "object") return { codigo: "", nome: "", valor: null, empresa: "" };
    const codigo = String(b.accountNumber || b.number || b.account || "").trim();
    const nome = String(b.accountName || b.name || b.description || codigo).trim();
    const empresa = String(
      b.companyId != null ? b.companyId : ((b.company && (b.company.id || b.company)) || "")
    ).replace(/\D/g, "");
    return { codigo: codigo, nome: nome, valor: this.valorSaldo(b), empresa: empresa };
  },

  contasEscolhidas() {
    if (!Array.isArray(this._saldoSel)) {
      try { this._saldoSel = JSON.parse(localStorage.getItem(this.LS_SALDO) || "null"); } catch (e) { this._saldoSel = null; }
    }
    const fora = (k) => this.contaForaDoSaldo(k);
    const todas = (this._saldoContas || []).filter((c) => this.ehContaAnalise(c)).map((c) => c.chave).filter((k) => !fora(k));
    if (!Array.isArray(this._saldoSel)) return todas;
    const set = new Set((this._saldoContas || []).map((c) => c.chave));
    const salvas = this._saldoSel.map(String).filter((k) => !fora(k));
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

  comPrazo(p, ms) {
    return new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        const err = new Error("A consulta do saldo demorou demais.");
        err.timeout = true;
        reject(err);
      }, ms);
      Promise.resolve(p).then((v) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      }, (e) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(e);
      });
    });
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
      this.atualizarSaldosDom();
      return;
    }
    this._saldoEstado = "lendo";
    this._saldoErro = "";
    this._saldoFonte = "";
    this._saldoFeitos = 0;
    this._saldoTotal = 0;
    this._saldoTimeouts = 0;
    this.atualizarSaldosDom();
    const nomesP = this.carregarNomesConta(empresas);
    const datas = [];
    for (let i = 0; i <= corte; i++) datas.push(this.dataSaldo(2026, i));
    try {
      const mapa = {};
      const porConta = new Map();
      const fontes = new Set();
      const queridas = new Set(empresas.map((e) => String(e.id)));
      this._saldoTotal = datas.length;
      let falha = null;
      const guardar = (emp, dt, linhas, origem) => {
        if (!linhas.length || !queridas.has(String(emp))) return;
        fontes.add(origem);
        const dia = mapa[dt] || (mapa[dt] = {});
        linhas.forEach((linha) => {
          const k = String(emp) + "|" + linha.codigo;
          dia[k] = linha.valor;
          if (!porConta.has(k)) {
            porConta.set(k, { chave: k, empresa: String(emp), numero: linha.codigo, nome: linha.nome, analitica: true, origem: origem === "contas" ? "contas" : "" });
          }
        });
      };
      const lerContas = async (dt, emp) => {
        const opt = { showLast: true, rethrow: true };
        if (emp) opt.companyId = emp;
        const contas = await this.comPrazo(api.getAccountBalances(dt, opt), 45000);
        const porEmp = new Map();
        let semEmpresa = false;
        (contas || []).forEach((b) => {
          const linha = this.linhaConta(b);
          if (!linha.codigo || linha.valor == null) return;
          const id = linha.empresa || (emp ? String(emp) : "");
          if (!id) { semEmpresa = true; return; }
          if (!queridas.has(id)) return;
          if (!porEmp.has(id)) porEmp.set(id, []);
          porEmp.get(id).push(linha);
        });
        return { porEmp: porEmp, semEmpresa: semEmpresa && !porEmp.size };
      };
      const datasVazias = [];
      if (typeof api.getAccountBalances === "function") {
        for (let i = 0; i < datas.length; i++) {
          if (token !== this._sToken) return;
          const dt = datas[i];
          try {
            const lido = await lerContas(dt, "");
            if (lido.semEmpresa || !lido.porEmp.size) datasVazias.push(dt);
            else {
              lido.porEmp.forEach((linhas, emp) => guardar(emp, dt, linhas, "contas"));
              const cobriu = empresas.every((e) => lido.porEmp.has(String(e.id)));
              if (!cobriu) datasVazias.push(dt);
            }
          } catch (e) {
            falha = e;
            datasVazias.push(dt);
          }
          this._saldoFeitos = i + 1;
          this.atualizarSaldosDom();
        }
      } else {
        datas.forEach((dt) => datasVazias.push(dt));
      }
      const faltam = [];
      datasVazias.forEach((dt) => {
        empresas.forEach((emp) => {
          const id = String(emp.id);
          const dia = mapa[dt] || {};
          const tem = Object.keys(dia).some((k) => k.indexOf(id + "|") === 0);
          if (!tem) faltam.push({ emp: id, dt: dt });
        });
      });
      if (faltam.length && typeof api.getAccountBalances === "function") {
        this._saldoTotal = datas.length + faltam.length;
        let cursor = 0;
        const self = this;
        const worker = async () => {
          while (cursor < faltam.length) {
            const job = faltam[cursor++];
            try {
              const lido = await lerContas(job.dt, job.emp);
              lido.porEmp.forEach((linhas, emp) => guardar(emp, job.dt, linhas, "contas"));
            } catch (e) {
              falha = falha || e;
            }
            self._saldoFeitos = (self._saldoFeitos || 0) + 1;
            if (self._saldoFeitos % 3 === 0) self.atualizarSaldosDom();
          }
        };
        const n = Math.min(2, faltam.length);
        await Promise.all(Array.from({ length: n }, () => worker()));
      }
      if (token !== this._sToken) return;
      if (!porConta.size && typeof api.getTrialBalance === "function") {
        let cursor = 0;
        const jobsBal = [];
        empresas.forEach((emp) => datas.forEach((dt) => jobsBal.push({ emp: String(emp.id), dt: dt })));
        const self = this;
        const workerBal = async () => {
          while (cursor < jobsBal.length && (self._saldoTimeouts || 0) < 3) {
            const job = jobsBal[cursor++];
            const per = self.periodoDoSaldo(job.dt);
            try {
              const lista = await self.comPrazo(api.getTrialBalance(job.emp, per.ini, per.fim), 30000);
              const linhas = [];
              (lista || []).forEach((b) => {
                const linha = self.linhaBalancete(b, true);
                if (linha.codigo && linha.valor != null) linhas.push(linha);
              });
              guardar(job.emp, job.dt, linhas, "balancete");
            } catch (e) {
              falha = falha || e;
              if (e && e.timeout) self._saldoTimeouts = (self._saldoTimeouts || 0) + 1;
            }
          }
        };
        await workerBal();
      }
      if (token !== this._sToken) return;
      if (!porConta.size && falha) {
        if (falha.timeout) throw new Error("O Sienge não respondeu o saldo das contas.");
        throw falha;
      }
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
      const nomesConta = await nomesP;
      if (token !== this._sToken) return;
      this._nomesConta = nomesConta;
      lista.forEach((c) => {
        const solto = String(c.numero || "").toUpperCase().replace(/\s+/g, "").replace(/^0+/, "");
        const extra = nomesConta[c.chave] || nomesConta[c.numero] || nomesConta[solto] || "";
        if (extra && (!c.nome || c.nome === c.numero)) c.nome = extra;
      });
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

  /* Realizado: saldo das contas marcadas. Forecast e 2027: saldo final do mês anterior mais a variação de caixa do mês. */
  serieSaldos() {
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    const g12 = (this._linhasDfc || []).find((r) => r.id === "g_12");
    const base = (g12 && g12.base) || [];
    const orc = (g12 && g12.months) || [];
    const y26 = [];
    for (let i = 0; i < 12; i++) {
      if (i < corte) {
        const ini = this.somaSaldo(this.dataSaldo(2026, i));
        const fim = this.somaSaldo(this.dataSaldo(2026, i + 1));
        y26.push({ ini: ini, fim: fim, variacao: fim - ini, previsto: false });
      } else {
        const ini = i === 0 ? this.somaSaldo(this.dataSaldo(2026, 0)) : y26[i - 1].fim;
        const variacao = Number(base[i]) || 0;
        y26.push({ ini: ini, fim: ini + variacao, variacao: variacao, previsto: true });
      }
    }
    const y27 = [];
    for (let i = 0; i < 12; i++) {
      const ini = i === 0 ? y26[11].fim : y27[i - 1].fim;
      const variacao = Number(orc[i]) || 0;
      y27.push({ ini: ini, fim: ini + variacao, variacao: variacao, previsto: true });
    }
    return { y26: y26, y27: y27 };
  },

  colsVar() {
    return (this.varRs ? 1 : 0) + (this.varPct ? 1 : 0);
  },

  htmlVars(orc, real) {
    const o = Number(orc) || 0;
    const b = Number(real) || 0;
    const d = o - b;
    const titulo = "2026 " + this.money(b) + " · 2027 " + this.money(o) + " · " + this.money(d) + " · " + this.pct(o, b);
    let html = "";
    if (this.varRs) {
      const neg = d < -0.005 ? " orc-dfc-neg" : "";
      html += `<td class="orc-dfc-vcol${neg}" title="${this.esc(titulo)}">${this.money(d)}</td>`;
    }
    if (this.varPct) {
      const neg = d < -0.005 && Math.abs(b) >= 0.005 ? " orc-dfc-neg" : "";
      html += `<td class="orc-dfc-vcol${neg}" title="${this.esc(titulo)}">${this.pct(o, b)}</td>`;
    }
    return html;
  },

  htmlSaldos() {
    const span = 1 + this.MESES.length + 1 + this.MESES.length * (1 + this.colsVar());
    if (this._saldoEstado === "lendo") {
      const n = Number(this._saldoFeitos) || 0;
      const t = Number(this._saldoTotal) || 0;
      const extra = t ? (" " + n + " de " + t) : "";
      return `<tr class="orc-dfc-saldo"><td colspan="${span}">Lendo o saldo das contas…${extra}</td></tr>`;
    }
    if (this._saldoEstado === "erro") {
      return `<tr class="orc-dfc-saldo"><td colspan="${span}">${this.esc(this._saldoErro || "Não consegui ler o saldo das contas.")}</td></tr>`;
    }
    if (this._saldoEstado === "vazio") {
      return `<tr class="orc-dfc-saldo"><td colspan="${span}">O balancete não devolveu o saldo de caixa no fim do mês.</td></tr>`;
    }
    if (this._saldoEstado !== "ok") return "";
    const serie = this.serieSaldos();
    const neg = (v) => (Number(v) < -0.005 ? " orc-dfc-neg" : "");
    const linha = (nome, campo, abre) => {
      const c26 = serie.y26.map((item, i) => {
        const valor = item[campo];
        const sep = i === 0 ? " orc-dfc-sep" : "";
        if (abre && !item.previsto) {
          const on = this.mesSaldo() === i ? " is-on" : "";
          return `<td class="${sep.trim()}${neg(valor)}"><button type="button" class="orc-dfc-saldo-btn${on}" data-saldo-mes="${i}">${this.money(valor)}</button></td>`;
        }
        return `<td class="${sep.trim()}${neg(valor)}">${this.money(valor)}</td>`;
      }).join("");
      const a = serie.y26[0].ini;
      const b = serie.y26[11].fim;
      const tot = campo === "ini" ? a : (campo === "fim" ? b : b - a);
      const c27 = serie.y27.map((item, i) => {
        const valor = item[campo];
        const sep = i === 0 ? " orc-dfc-sep" : "";
        return `<td class="${sep.trim()}${neg(valor)}">${this.money(valor)}</td>${this.htmlVars(valor, serie.y26[i][campo])}`;
      }).join("");
      const label = abre
        ? `<button type="button" class="orc-dfc-saldo-abre" data-saldo-abrir="1">Saldo inicial</button>`
        : nome;
      return `<tr class="orc-dfc-saldo"><td>${label}</td>${c26}<td class="orc-dfc-sep${neg(tot)}">${this.money(tot)}</td>${c27}</tr>`;
    };
    const folga = `<tr class="orc-dfc-saldo-gap"><td colspan="${span}"></td></tr>`;
    return folga + linha("", "ini", true) + linha("Saldo final", "fim", false) + linha("Variação", "variacao", false);
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
    const linhaDe = (c) => {
      const a = Number(mapaIni[c.chave]) || 0;
      const b = Number(mapaFim[c.chave]) || 0;
      return { nome: this.rotuloConta(c, varias), ini: a, fim: b, variacao: b - a };
    };
    const viva = (r) => Math.abs(r.ini) >= 0.005 || Math.abs(r.fim) >= 0.005;
    const ordem = (x, y) => String(x.nome).localeCompare(String(y.nome), "pt");
    const linhas = (this._saldoContas || []).filter((c) => escolhidas.has(c.chave) && !this.contaForaDoSaldo(c)).map(linhaDe).filter(viva).sort(ordem);
    const fora = (this._saldoContas || []).filter((c) => this.contaForaDoSaldo(c)).map(linhaDe).filter(viva).sort(ordem);
    const somar = (lista) => lista.reduce((s, r) => ({ ini: s.ini + r.ini, fim: s.fim + r.fim, variacao: s.variacao + r.variacao }), { ini: 0, fim: 0, variacao: 0 });
    const tot = somar(linhas);
    const totFora = somar(fora);
    const corpoDe = (lista) => lista.map((r) => `<tr><td>${this.esc(r.nome)}</td><td>${this.money(r.ini)}</td><td>${this.money(r.fim)}</td><td class="${r.variacao < -0.005 ? "orc-dfc-neg" : ""}">${this.money(r.variacao)}</td></tr>`).join("");
    const cabeca = `<thead><tr><th>Conta</th><th>Saldo em ${this.dataBr(iniData)}</th><th>Saldo em ${this.dataBr(fimData)}</th><th>Variação</th></tr></thead>`;
    const abertura = this.dataSaldo(2026, 0);
    const mapaAbertura = (this._saldoMap && this._saldoMap[abertura]) || {};
    const checks = this._saldoPicker ? (this._saldoContas || []).filter((c) => !this.contaForaDoSaldo(c)).map((c) => {
      const on = escolhidas.has(c.chave);
      const saldo = Number(mapaAbertura[c.chave]) || 0;
      return `<label class="orc-dfc-conta${this.ehContaAnalise(c) ? "" : " is-fora"}"><input type="checkbox" data-saldo-conta="${this.esc(c.chave)}" ${on ? "checked" : ""}> <span>${this.esc(this.rotuloConta(c, varias))}</span><b>${this.money(saldo)}</b></label>`;
    }).join("") : "";
    const resultado = this.resultadoMes(mes);
    const grupoFora = fora.length ? `<div class="orc-dfc-fora">
      <h3>Fora do saldo</h3>
      <p>PAR, REAPROPFIN, 1-6 e 1-1. Estes saldos não entram no saldo inicial nem no saldo final.</p>
      <div class="orc-dfc-scroll orc-dfc-quadro-scroll">
        <table class="orc-dfc-table orc-dfc-quadro-tab">
          ${cabeca}
          <tbody>${corpoDe(fora)}</tbody>
          <tfoot><tr class="orc-dfc-fora"><td>Total</td><td>${this.money(totFora.ini)}</td><td>${this.money(totFora.fim)}</td><td class="${totFora.variacao < -0.005 ? "orc-dfc-neg" : ""}">${this.money(totFora.variacao)}</td></tr></tfoot>
        </table>
      </div>
    </div>` : "";
    return `<section class="orc-dfc-quadro">
      ${this._saldoPicker ? `<div class="orc-dfc-checks"><p>Saldo inicial de 2026, em ${this.dataBr(abertura)}. Marque as contas que entram nessa apuração. Terracotta, aplicações, PAR, REAPROPFIN, 1-6 e 1-1 ficam de fora. O realizado dos meses seguintes usa as mesmas contas. No forecast, o saldo inicial é o saldo final do mês anterior e o saldo final soma a variação de caixa do mês. Em 2027, janeiro começa com o saldo final de dezembro de 2026 e cada mês seguinte parte do saldo final do anterior.</p>${checks || "<span>Nenhuma conta de caixa voltou da consulta.</span>"}</div>` : ""}
      <h3>Contas em ${this.MESES[mes]} de 2026</h3>
      <p>Início em ${this.dataBr(iniData)} e fim em ${this.dataBr(fimData)}, ${this._saldoFonte === "contas" ? "pelo saldo das contas correntes" : (this._saldoFonte === "misto" ? "pelo balancete societário e, onde ele não respondeu, pelo saldo das contas correntes" : "pelo balancete de verificação societário")}. A variação é o saldo final menos o saldo inicial. A geração do resultado deste mês no DFC foi ${this.money(resultado)}.</p>
      <div class="orc-dfc-scroll orc-dfc-quadro-scroll">
        <table class="orc-dfc-table orc-dfc-quadro-tab">
          ${cabeca}
          <tbody>${corpoDe(linhas) || `<tr><td colspan="4">Nenhuma conta marcada. Clique em Saldo inicial para escolher.</td></tr>`}</tbody>
          <tfoot><tr><td>Total</td><td>${this.money(tot.ini)}</td><td>${this.money(tot.fim)}</td><td class="${tot.variacao < -0.005 ? "orc-dfc-neg" : ""}">${this.money(tot.variacao)}</td></tr></tfoot>
        </table>
      </div>
      ${grupoFora}
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
    const { rows, fora } = this.visao === "2" ? this.montarVisao2() : this.montar();
    this._linhasDfc = rows;
    const corte = this._corte == null ? this.corteForecast() : this._corte;
    const extras = (this.varRs ? `<th class="orc-dfc-vcol">Var R$</th>` : "") + (this.varPct ? `<th class="orc-dfc-vcol">Var %</th>` : "");
    const h26 = this.MESES.map((m, i) => `<th${i === 0 ? " class=\"orc-dfc-sep\"" : ""} title="${i >= corte ? "Previsão de 2026" : "Realizado de 2026"}">${m}</th>`).join("") + `<th class="orc-dfc-sep">Total</th>`;
    const h27 = this.MESES.map((m, i) => `<th${i === 0 ? " class=\"orc-dfc-sep\"" : ""}>${m}</th>${extras}`).join("");
    const h1 = `<th colspan="13" class="orc-dfc-mes">2026</th><th colspan="${12 * (1 + this.colsVar())}" class="orc-dfc-mes is-alt">2027</th>`;
    const h2 = h26 + h27;
    const trs = rows.map((r) => {
      const cls = [
        r.isAccount ? "orc-dfc-acc" : "",
        r.isCc ? "orc-dfc-cc" : "",
        r.kind === "empresa" ? "orc-dfc-emp2" : "",
        r.kind === "linha" ? "orc-dfc-linha2" : "",
        r.type === "formula" ? "orc-dfc-formula" : "",
        r.type === "total_n1" ? "orc-dfc-n1" : "",
        r.id === "g_08" ? "orc-dfc-fcf" : "",
        r.id === "g_03" ? "orc-dfc-saida-forte" : "",
        (r.id === "g_02" || r.id === "g_04" || r.id === "g_05") ? "orc-dfc-saida" : ""
      ].filter(Boolean).join(" ");
      const ico = r.hasKids
        ? `<i data-lucide="${(this.visao === "2" ? this.expanded2 : this.expanded).has(r.id) ? "chevron-down" : "chevron-right"}"></i>`
        : `<i class="orc-dfc-no"></i>`;
      const base = r.base || [];
      const c26 = (r.months || []).map((v, i) => {
        const real = Number(base[i]) || 0;
        const chave = i < corte ? (r.id + "||" + i) : "";
        const abre = chave ? " orc-dfc-abre" : "";
        const marca = chave ? ` data-orc-2026="${this.esc(chave)}"` : "";
        const neg = real < -0.005 ? " orc-dfc-neg" : "";
        const sep = i === 0 ? " orc-dfc-sep" : "";
        const titulo = (i >= corte ? "Previsão " : "Realizado ") + this.money(real);
        return `<td class="${(sep + neg + abre).trim()}"${marca} title="${this.esc(titulo + (chave ? " · Ver lançamentos" : ""))}">${this.money(real)}</td>`;
      }).join("");
      const baseTotal = Number(r.baseTotal) || 0;
      const chaveTot = corte > 0 ? (r.id + "||t") : "";
      const tot26 = `<td class="orc-dfc-sep${baseTotal < -0.005 ? " orc-dfc-neg" : ""}${chaveTot ? " orc-dfc-abre" : ""}"${chaveTot ? ` data-orc-2026="${this.esc(chaveTot)}"` : ""} title="Total de 2026">${this.money(baseTotal)}</td>`;
      const c27 = (r.months || []).map((v, i) => {
        const n = Number(v) || 0;
        const sep = i === 0 ? " orc-dfc-sep" : "";
        return `<td class="${sep.trim()}${n < -0.005 ? " orc-dfc-neg" : ""}">${this.money(n)}</td>${this.htmlVars(n, base[i])}`;
      }).join("");
      const click = r.hasKids ? ` data-dfc-id="${this.esc(r.id)}"` : "";
      return `<tr class="${cls}"${click}>
        <td style="padding-left:${6 + r.level * 8}px">${ico}<span>${this.esc(r.name)}</span></td>
        ${c26}
        ${tot26}
        ${c27}
      </tr>`;
    }).join("");
    let avisoBase = "";
    if (this._caixaEstado === "lendo") avisoBase = `<div class="orc-dfc-erro orc-dfc-caixa-msg">${this.esc(this._caixaMsg || "Lendo o realizado de 2026 no caixa e banco…")}</div>`;
    else if (this._caixaEstado === "erro") avisoBase = `<div class="orc-dfc-erro">${this.esc(this._caixaErro || "Falha ao ler o realizado de 2026 no caixa e banco.")}</div>`;
    else if (this._caixaEstado === "vazio") avisoBase = `<div class="orc-dfc-erro">O caixa e banco não devolveu movimento realizado em 2026 para essas empresas.</div>`;
    else if (this._caixaAviso) avisoBase = `<div class="orc-dfc-erro">${this.esc(this._caixaAviso)}</div>`;
    const aviso = this.erro ? `<div class="orc-dfc-erro">${this.esc(this.erro)}</div>` : "";
    const notaVisao = this.visao === "2"
      ? `<p class="orc-dfc-lead">Visão 2: receitas e impostos abrem na empresa. Custos e despesas abrem primeiro na linha (04.01, 05.01) e depois na empresa. Centro de custo e plano financeiro abrem no clique.</p>`
      : "";
    body.innerHTML = `
      ${aviso}
      ${avisoBase}
      ${notaVisao}
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
    meses.forEach((m, i) => colunas.push(m + "/26" + (i >= corte ? " prev" : "")));
    colunas.push("Total 2026");
    meses.forEach((m) => {
      colunas.push(m + "/27");
      if (this.varRs) colunas.push(m + " Var R$");
      if (this.varPct) colunas.push(m + " Var %");
    });
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
    const sub = opts.visao2
      ? ("Visão 2 · receitas e impostos: empresa, centro de custo, linha e plano. Custos e despesas: linha, empresa, centro de custo e plano. " + this.textoCorte())
      : (opts.varias
      ? (opts.empresa.id + " - " + (opts.empresa.name || ""))
      : ("Orçamento 2027 contra o DFC de 2026 · " + this.textoCorte()));
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
      const kinds = ["text"];
      const bases = r.base || [];
      bases.forEach((real) => { valores.push(Number(real) || 0); kinds.push("num"); });
      while (valores.length < 13) { valores.push(0); kinds.push("num"); }
      valores.push(Number(r.baseTotal) || 0);
      kinds.push("num");
      (r.months || []).forEach((orc, i) => {
        const o = Number(orc) || 0;
        const b = Number(bases[i]) || 0;
        valores.push(o);
        kinds.push("num");
        if (this.varRs) { valores.push(o - b); kinds.push("num"); }
        if (this.varPct) { valores.push(this.pctNum(o, b)); kinds.push("pct"); }
      });
      let fill = "FFFFFFFF";
      let fontColor = "FF0F172A";
      let bold = false;
      if (r.kind === "empresa") { fill = "FF0C3D28"; fontColor = "FFFFFFFF"; bold = true; }
      else if (r.kind === "cc" || r.isCc) { fill = "FFE7F6EE"; fontColor = "FF105436"; bold = true; }
      else if (r.kind === "linha") { fill = "FFECFDF5"; fontColor = "FF064E3B"; bold = true; }
      else if (r.kind === "conta" || r.isAccount) { fill = "FFF8FAFC"; bold = true; }
      else if (r.type === "total_n1" || r.kind === "grupo" || r.level === 0) { fill = "FF0C3D28"; fontColor = "FFFFFFFF"; bold = true; }
      else if (r.type === "formula" || r.kind === "formula") { fill = "FFECFDF5"; fontColor = "FF064E3B"; bold = true; }
      valores.forEach((v, i) => {
        const cell = linha.getCell(i + 1);
        const kind = kinds[i] || "text";
        const pct = kind === "pct";
        const num = kind === "num" || pct;
        const zero = kind === "num" && Math.abs(Number(v) || 0) < 0.005;
        cell.value = pct ? (v == null ? null : v) : (zero ? 0 : v);
        const cor = (pct && v < 0) || (kind === "num" && !zero && Number(v) < 0) ? "FFB91C1C" : (zero ? "FF94A3B8" : fontColor);
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
      if (this.visao === "2") {
        const pack = this.montarVisao2({ aberto: true });
        const ws = wb.addWorksheet(this.nomeAba("DFC", "visao 2", used), { views: [{ showGridLines: false }] });
        this.preencherDfc(ws, inv, { empresa: { id: "", name: "Visão 2" }, rows: pack.rows, varias: false, visao2: true, logo: logo });
      } else for (let i = 0; i < (todas ? empresas.length : 1); i++) {
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
    a.download = "DFC-2027-" + (this.visao === "2" ? "visao-2-" : "") + fim + ".xlsx";
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
