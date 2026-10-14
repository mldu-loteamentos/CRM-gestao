// DFC do orçamento 2027. A visão de receitas (OrcamentoApp) não passa por aqui.
const OrcamentoDfcApp = {
  LS: "crm_orcamento_dfc_2027",
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

  montar() {
    const plano = typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null;
    const fluxo = typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : null;
    const tpl = (plano && typeof plano.dfcTemplateGroups === "function" ? plano.dfcTemplateGroups() : []).map((g) => ({
      ...g,
      months: Array(12).fill(0),
      accs: new Map()
    }));
    const byId = {};
    tpl.forEach((g) => { byId[g.id] = g; });
    const fora = new Map();
    this.linhasFiltradas().forEach((l) => {
      const gid = plano && typeof plano.suggestGroup === "function"
        ? plano.suggestGroup({ id: l.conta, name: l.cn })
        : null;
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
        acc = { conta: l.conta, cn: l.cn, months: Array(12).fill(0) };
        g.accs.set(l.conta, acc);
      }
      (l.m || []).forEach((v, i) => {
        if (i > 11) return;
        const s = fluxo && typeof fluxo.signedAmount === "function"
          ? fluxo.signedAmount(g, l.conta, l.cn, v)
          : (Number(v) || 0);
        acc.months[i] += s;
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
    tpl.filter((g) => g.type !== "formula").sort((a, b) => depth(b) - depth(a)).forEach((g) => {
      tpl.filter((c) => c.parentId === g.id && c.type !== "formula").forEach((ch) => {
        ch.months.forEach((v, i) => { g.months[i] += v; });
      });
    });
    const sum = (ids) => {
      const months = Array(12).fill(0);
      ids.forEach((id) => {
        const n = byId[id];
        if (!n) return;
        n.months.forEach((v, i) => { months[i] += v; });
      });
      return months;
    };
    const apply = (id, parts) => {
      if (byId[id]) byId[id].months = sum(parts);
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
      rows.push({
        id: node.id,
        name: node.name,
        type: node.type,
        level,
        hasKids,
        isAccount: false,
        months: node.months,
        total
      });
      if (!this.expanded.has(node.id)) return;
      children.forEach((ch) => walk(ch, level + 1));
      accs.forEach((a) => {
        rows.push({
          id: "acc:" + node.id + ":" + a.conta,
          name: a.conta + " " + (a.cn || ""),
          type: "conta",
          level: level + 1,
          hasKids: false,
          isAccount: true,
          months: a.months,
          total: a.months.reduce((x, y) => x + y, 0)
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
        <p class="orc-dfc-lead">Orçamento de 2027 no demonstrativo de fluxo de caixa. Receita entra positiva e despesa entra negativa, no mesmo critério do Fluxo de Caixa.</p>
        <div class="orc-dfc-tools">
          <div id="orc-dfc-emp-box"></div>
          <div id="orc-dfc-cc-box"></div>
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
    const base = document.getElementById("orc-dfc-base");
    if (base) base.addEventListener("click", () => this.voltarBase());
    if (window.lucide && lucide.createIcons) lucide.createIcons();
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
    const head = this.MESES.map((m) => `<th>${m}</th>`).join("");
    const trs = rows.map((r) => {
      const cls = [
        r.isAccount ? "orc-dfc-acc" : "",
        r.type === "formula" ? "orc-dfc-formula" : "",
        r.type === "total_n1" ? "orc-dfc-n1" : ""
      ].filter(Boolean).join(" ");
      const ico = r.hasKids
        ? `<i data-lucide="${this.expanded.has(r.id) ? "chevron-down" : "chevron-right"}"></i>`
        : `<i class="orc-dfc-no"></i>`;
      const cells = r.months.map((v) => `<td class="${v < -0.005 ? "orc-dfc-neg" : ""}">${this.money(v)}</td>`).join("");
      const click = r.hasKids ? ` data-dfc-id="${this.esc(r.id)}"` : "";
      return `<tr class="${cls}"${click}>
        <td style="padding-left:${12 + r.level * 16}px">${ico}<span>${this.esc(r.name)}</span></td>
        ${cells}
        <td class="${r.total < -0.005 ? "orc-dfc-neg" : ""}">${this.money(r.total)}</td>
      </tr>`;
    }).join("");
    const aviso = this.erro ? `<div class="orc-dfc-erro">${this.esc(this.erro)}</div>` : "";
    body.innerHTML = `
      ${aviso}
      <div class="orc-dfc-scroll">
        <table class="orc-dfc-table">
          <thead><tr><th>Conta</th>${head}<th>Total</th></tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`;
    body.querySelectorAll("[data-dfc-id]").forEach((tr) => {
      tr.addEventListener("click", () => this.toggle(tr.getAttribute("data-dfc-id")));
    });
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
    this.paintBody();
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
    this.paintBody();
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
