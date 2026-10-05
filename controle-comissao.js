/**
 * Comercial · Controle de comissão
 * Comissão a receber da Moura Leite por contrato (CV CRM).
 */
const ControleComissaoApp = {
  state: {
    inited: false,
    loading: false,
    consulted: false,
    error: "",
    aviso: "",
    competencia: "",
    de: "",
    ate: "",
    totais: { contratos: 0, parcelas: 0, aReceber: 0, recebido: 0 },
    contratos: [],
    series: [],
    abertos: {}
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  money(n) {
    const v = Number(n) || 0;
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  fmtDate(raw) {
    const s = String(raw || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
    return s || "—";
  },

  sitClass(p) {
    if (p && p.pago) return "ccom-sit-pago";
    const t = String((p && p.situacao) || "").toUpperCase();
    if (t.indexOf("PROGRAM") >= 0) return "ccom-sit-prog";
    return "";
  },

  defaultCompetencia() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  },

  apiUrl(path) {
    const host = window.location.hostname;
    const isLocal = !host || host === "localhost" || host === "127.0.0.1";
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const origin = isLocal ? ("http://localhost:" + port) : "";
    return origin + path;
  },

  onField(field, val) {
    this.state[field] = val;
  },

  isMouraNome(nome) {
    const compact = String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!compact) return false;
    if (compact === "MOURALEITE") return true;
    if (compact.indexOf("MOURALEITE") < 0) return false;
    const rest = compact.replace(/IMOBILIARIA|IMOB|IMO|LTDA|EIRELI|SPE|DESENVOLVIMENTO|URBANIZACAO|INCORPORADORA|EMPREENDIMENTOS|HOLDING/g, "");
    return rest === "MOURALEITE";
  },

  mouraProgramacao(r) {
    return (r && r.programacao || []).filter((p) => this.isMouraNome(p && p.beneficiario));
  },

  comissaoTip(r) {
    const detsAll = r.beneficiariosDetalhe && r.beneficiariosDetalhe.length
      ? r.beneficiariosDetalhe
      : String(r.beneficiarios || "").split(",").map((n) => n.trim()).filter(Boolean).map((nome) => ({ nome, valor: null }));
    const dets = detsAll.filter((d) => this.isMouraNome(d.nome));
    if (!dets.length) return "";
    const lines = dets.map((d) => {
      const val = d.valor == null ? "" : this.money(d.valor);
      return `<div class="ccom-tip-row"><span>${this.esc(d.nome)}</span><strong>${this.esc(val)}</strong></div>`;
    }).join("");
    return `<div class="ccom-tip-box">${lines}</div>`;
  },

  cssKey(id) {
    const key = String(id == null ? "" : id);
    return window.CSS && CSS.escape ? CSS.escape(key) : key.replace(/"/g, "");
  },

  toggle(id) {
    const key = String(id == null ? "" : id);
    const open = !this.state.abertos[key];
    this.state.abertos[key] = open;
    const sel = this.cssKey(key);
    document.querySelectorAll('[data-ccom-key="' + sel + '"]').forEach((btn) => {
      btn.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll('[data-ccom-parc="' + sel + '"]').forEach((row) => {
      row.hidden = !open;
    });
  },

  enterpriseId(nome) {
    const nums = String(nome || "").match(/\d{4,6}/g) || [];
    return nums.length ? nums[nums.length - 1] : "";
  },

  unitKey(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  nfsMap() {
    try {
      const raw = JSON.parse(localStorage.getItem("crm_comissao_nfs_v1") || "{}");
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch (e) {
      return {};
    }
  },

  nfsKey(r, p) {
    return String((r && r.contrato) || "") + "|" + String((p && p.vencimento) || "").slice(0, 10);
  },

  nfsTitulo(key) {
    const hit = this.nfsMap()[key];
    return hit && hit.titulo ? String(hit.titulo) : "";
  },

  salvarNfsTitulo(key, value) {
    const map = this.nfsMap();
    const titulo = String(value || "").replace(/\D/g, "");
    if (!titulo) delete map[key];
    else map[key] = { titulo: titulo, at: new Date().toISOString() };
    const raw = JSON.stringify(map);
    try {
      const setter = window._originalSetItem || localStorage.setItem.bind(localStorage);
      setter.call(localStorage, "crm_comissao_nfs_v1", raw);
    } catch (e) {}
    if (typeof window.forceUploadLocalConfig === "function") {
      window.forceUploadLocalConfig(true).catch(() => {});
    }
  },

  clienteCell(p) {
    if (!p || !p.clienteBusca) return `<td class="ccom-cli"><span>Buscando no Sienge…</span></td>`;
    const c = p.cliente;
    if (!c) return `<td class="ccom-cli"><span>Parcela do cliente não encontrada</span></td>`;
    if (c.baixada) {
      const quando = c.dataBaixa ? " em " + this.fmtDate(c.dataBaixa) : "";
      return `<td class="ccom-cli ccom-cli-ok"><strong>${this.esc(c.parcela)}</strong><span>Baixada${this.esc(quando)}. A Webro recebeu ${this.esc(this.money(p.valor))}. Repassar à Moura Leite.</span></td>`;
    }
    return `<td class="ccom-cli"><strong>${this.esc(c.parcela)}</strong><span>Em aberto no Sienge</span></td>`;
  },

  nfsCell(r, p) {
    const key = this.nfsKey(r, p);
    const val = this.nfsTitulo(key);
    const precisa = p && p.cliente && p.cliente.baixada && !val;
    return `<td class="ccom-nfs"><input type="text" inputmode="numeric" class="ccom-nfs-input${precisa ? " is-needed" : ""}" data-ccom-nfs="${this.esc(key)}" value="${this.esc(val)}" placeholder="Título da NFS" onchange="ControleComissaoApp.salvarNfsTitulo(this.dataset.ccomNfs, this.value)"></td>`;
  },

  parcLinha(r, p, comNome) {
    const first = comNome
      ? this.esc(p.beneficiario || "—")
      : this.esc((p.indice || 1) + "/" + (p.total || 1));
    return `<tr>
      <td>${first}</td>
      <td>${this.esc(this.fmtDate(p.vencimento))}</td>
      <td><span class="ccom-sit ${this.sitClass(p)}">${this.esc(p.situacao || "—")}</span></td>
      <td class="ccom-num">${this.esc(this.money(p.valor))}</td>
      ${this.clienteCell(p)}
      ${this.nfsCell(r, p)}
    </tr>`;
  },

  parcRow(r, open) {
    const list = this.mouraProgramacao(r);
    const groups = [];
    list.forEach((p) => {
      const nome = p.beneficiario || "—";
      const last = groups[groups.length - 1];
      if (last && last.nome === nome) last.itens.push(p);
      else groups.push({ nome, itens: [p] });
    });
    const parcelada = groups.some((g) => g.itens.length > 1);
    const head = parcelada
      ? `<tr><th>Parcela</th><th>Vencimento</th><th>Situação</th><th class="ccom-num">Valor</th><th>Parcela do cliente</th><th>Título NFS</th></tr>`
      : `<tr><th>Beneficiário</th><th>Vencimento</th><th>Situação</th><th class="ccom-num">Valor</th><th>Parcela do cliente</th><th>Título NFS</th></tr>`;
    const body = parcelada
      ? groups.map((g) => {
        const label = g.itens.length === 1 ? "1 parcela" : (g.itens.length + " parcelas");
        const titulo = `<tr class="ccom-parc-ben"><td colspan="6">${this.esc(g.nome)} <span>${label}</span></td></tr>`;
        return titulo + g.itens.map((p) => this.parcLinha(r, p, false)).join("");
      }).join("")
      : list.map((p) => this.parcLinha(r, p, true)).join("");
    const soma = list.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    return `<tr class="ccom-parc-row" data-ccom-parc="${this.esc(r.contrato)}" ${open ? "" : "hidden"}>
      <td colspan="7">
        <table class="ccom-parc-table">
          <thead>${head}</thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td colspan="3">Total</td><td class="ccom-num">${this.esc(this.money(soma))}</td><td colspan="2"></td></tr></tfoot>
        </table>
      </td>
    </tr>`;
  },

  rowHtml(r) {
    const tip = this.comissaoTip(r);
    const prog = this.mouraProgramacao(r);
    const open = !!this.state.abertos[String(r.contrato)];
    const key = this.esc(r.contrato || "");
    const total = this.esc(this.money(r.comissaoTotal || r.valor || 0));
    const comissao = prog.length
      ? `<button type="button" class="ccom-key${open ? " is-open" : ""}" data-ccom-key="${key}" aria-expanded="${open ? "true" : "false"}" aria-label="Parcelas da comissão" onclick="ControleComissaoApp.toggle(this.dataset.ccomKey)"><span class="ccom-chev" aria-hidden="true"></span><span>${total}</span></button>`
      : total;
    return `<tr>
      <td class="ccom-td-id">${this.esc(r.contrato || "—")}</td>
      <td>${this.esc(r.empreendimento || "—")}</td>
      <td>${this.esc(r.unidade || "—")}</td>
      <td>${this.esc(r.pagador || "—")}</td>
      <td class="ccom-num ccom-tip">${comissao}${tip}</td>
      <td class="ccom-num">${this.esc(this.money(r.aReceber))}</td>
      <td class="ccom-num">${this.esc(this.money(r.recebido))}</td>
    </tr>${prog.length ? this.parcRow(r, open) : ""}`;
  },

  async consultar() {
    const ym = this.state.competencia || this.defaultCompetencia();
    this.state.competencia = ym;
    this.state.loading = true;
    this.state.consulted = true;
    this.state.error = "";
    this.render();
    try {
      const res = await fetch(this.apiUrl("/api/controle-comissao?competencia=" + encodeURIComponent(ym)));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.state.error = data.error || data.mensagem || ("Erro " + res.status + " ao consultar o CV.");
        this.state.contratos = [];
        this.state.totais = { contratos: 0, parcelas: 0, aReceber: 0, recebido: 0 };
      } else {
        this.state.totais = data.totais || { contratos: 0, parcelas: 0, aReceber: 0, recebido: 0 };
        this.state.contratos = data.contratos || [];
        this.state.series = data.seriesComissao || [];
        this.state.de = data.de || "";
        this.state.ate = data.ate || "";
        this.state.aviso = data.aviso || "";
      }
    } catch (e) {
      this.state.error = "Não foi possível consultar o CV CRM. " + (e && e.message ? e.message : "");
      this.state.contratos = [];
    }
    this.state.loading = false;
    this.render();
    this.vincularParcelasCliente();
  },

  async loadClienteParcelas(emp, unit) {
    if (typeof window.siengeFetchWithRetry !== "function") return null;
    const data = await window.siengeFetchWithRetry("/units?enterpriseId=" + encodeURIComponent(emp) + "&name=" + encodeURIComponent(unit) + "&limit=50");
    const units = (data && data.results) || [];
    const want = this.unitKey(unit);
    const found = units.find((x) => this.unitKey(x && x.name) === want);
    if (!found) return null;
    let billId = found.receivableBillId || "";
    const contractId = found.contractId || found.salesContractId || (found.currentSalesContract && found.currentSalesContract.id);
    if (!billId && contractId) {
      const sc = await window.siengeFetchWithRetry("/sales-contracts/" + encodeURIComponent(contractId));
      billId = (sc && (sc.receivableBillId || sc.billReceivableId)) || "";
    }
    if (!billId) return null;
    const instRes = await window.siengeFetchWithRetry("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId) + "/installments?limit=200");
    const list = (instRes && instRes.results) || (Array.isArray(instRes) ? instRes : []);
    const byDue = {};
    list.forEach((inst) => {
      const due = String(inst && inst.dueDate || "").slice(0, 10);
      if (!due || byDue[due]) return;
      const recs = Array.isArray(inst.receipts) ? inst.receipts : [];
      const baixa = recs.map((rec) => String(rec.paymentDate || rec.receiptDate || rec.date || "").slice(0, 10)).filter(Boolean).sort().pop() || "";
      const sit = String(inst.installmentSituation || "");
      const cb = inst.currentBalance;
      const baixada = sit === "2" || (!!baixa && (cb == null || Number(cb) <= 0.009)) || (cb != null && Number(cb) <= 0.009 && recs.length > 0);
      const num = inst.installmentNumber != null ? inst.installmentNumber : inst.installmentId;
      byDue[due] = {
        titulo: String(billId),
        parcela: String(billId) + "/" + String(num),
        baixada: !!baixada,
        dataBaixa: baixa
      };
    });
    return { byDue: byDue };
  },

  async vincularParcelasCliente() {
    const rows = this.state.contratos || [];
    const jobs = [];
    const seen = {};
    rows.forEach((r) => {
      const emp = this.enterpriseId(r.empreendimento);
      const unit = String(r.unidade || "").trim();
      if (!emp || !unit) return;
      const key = emp + "|" + this.unitKey(unit);
      if (seen[key]) return;
      seen[key] = true;
      jobs.push({ key: key, emp: emp, unit: unit });
    });
    const resolved = {};
    let cursor = 0;
    const run = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try { resolved[job.key] = await this.loadClienteParcelas(job.emp, job.unit); }
        catch (e) { resolved[job.key] = null; }
      }
    };
    await Promise.all([run(), run(), run()]);
    rows.forEach((r) => {
      const emp = this.enterpriseId(r.empreendimento);
      const unit = String(r.unidade || "").trim();
      const pack = emp && unit ? resolved[emp + "|" + this.unitKey(unit)] : null;
      (r.programacao || []).forEach((p) => {
        if (!this.isMouraNome(p.beneficiario)) return;
        const due = String(p.vencimento || "").slice(0, 10);
        p.clienteBusca = true;
        p.cliente = pack && pack.byDue ? (pack.byDue[due] || null) : null;
      });
    });
    if (!this.state.loading) this.render();
  },

  render() {
    const root = document.getElementById("controle-comissao-root");
    if (!root) return;
    const s = this.state;
    if (!s.competencia) s.competencia = this.defaultCompetencia();
    const rows = s.contratos || [];
    root.innerHTML = `
      <div class="ccom-page">
        <div class="search-filter-panel tvig-params ccom-params">
          <h3 class="tvig-section-title">Parâmetros da consulta</h3>
          <div class="ccom-filters">
            <div class="tvig-filter-slot tvig-comp-slot">
              <label class="tvig-comp-label" for="ccom-comp">Mês de referência</label>
              <input type="month" id="ccom-comp" class="tvig-comp-input" value="${this.esc(s.competencia)}"
                onchange="ControleComissaoApp.onField('competencia', this.value)">
            </div>
            <div class="tvig-filter-actions">
              <button type="button" class="btn btn-primary ccom-consult" ${s.loading ? "disabled" : ""} onclick="ControleComissaoApp.consultar()">
                <i data-lucide="search" style="width:14px;"></i> ${s.loading ? "Consultando…" : "Consultar"}
              </button>
            </div>
          </div>
        </div>
        ${s.error ? `<div class="tvig-empty">${this.esc(s.error)}</div>` : ""}
        ${s.aviso && !s.error ? `<div class="ccom-aviso">${this.esc(s.aviso)}</div>` : ""}
        ${s.loading ? `<div class="tvig-empty">Buscando comissões no CV CRM…</div>` : ""}
        ${!s.loading && !s.error && rows.length ? `
          <div class="ccom-kpis">
            <div class="ccom-kpi"><span>Contratos</span><strong>${s.totais.contratos || 0}</strong></div>
            <div class="ccom-kpi"><span>Moura Leite a receber</span><strong>${this.esc(this.money(s.totais.aReceber))}</strong></div>
            <div class="ccom-kpi"><span>Moura Leite recebido</span><strong>${this.esc(this.money(s.totais.recebido))}</strong></div>
          </div>
          <h3 class="tvig-section-title">Comissão por contrato</h3>
          <div class="crm-card ccom-card">
            <div class="crm-scroll-table ccom-table-wrap">
              <table class="custom-table ccom-table">
                <thead>
                  <tr>
                    <th>Contrato / Reserva</th>
                    <th>Empreendimento</th>
                    <th>Unidade</th>
                    <th>Pagador</th>
                    <th class="ccom-num">Comissão</th>
                    <th class="ccom-num">Moura Leite a receber</th>
                    <th class="ccom-num">Moura Leite recebido</th>
                  </tr>
                </thead>
                <tbody>${rows.map((r) => this.rowHtml(r)).join("")}</tbody>
              </table>
            </div>
          </div>` : ""}
        ${!s.loading && !s.error && !rows.length ? `<div class="tvig-empty">${s.consulted ? "Nenhuma comissão encontrada nesta competência." : "Use <strong>Consultar</strong> para ver a comissão a receber por contrato."}</div>` : ""}
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  init() {
    const root = document.getElementById("controle-comissao-root");
    if (!root) return;
    if (!this.state.inited) {
      this.state.competencia = this.defaultCompetencia();
      this.state.inited = true;
    }
    this.render();
  }
};

window.ControleComissaoApp = ControleComissaoApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "controle-comissao") ControleComissaoApp.init();
});
