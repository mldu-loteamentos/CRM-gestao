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

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  siengeGet(path) {
    if (typeof window.siengeFetchWithRetry !== "function") return Promise.resolve(null);
    const req = window.siengeFetchWithRetry(path, 1);
    req.catch(function () {});
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), 12000); });
    return Promise.race([req.catch(() => null), timeout]).finally(() => clearTimeout(timer));
  },

  isWebroInst(inst) {
    const id = inst && inst.conditionTypeId;
    if (id == null || id === "") return false;
    return typeof window.paymentConditionIsWebro === "function" && window.paymentConditionIsWebro(String(id)) === true;
  },

  async findClienteBill(emp, unit, clientName) {
    const name = String(clientName || "").trim();
    const wantUnit = this.unitKey(unit);
    if (!name || !wantUnit) return null;
    const query = name.split(/\s+/).slice(0, 3).join(" ");
    const data = await this.siengeGet("/customers?name=" + encodeURIComponent(query) + "&limit=15");
    const customers = (data && data.results) || [];
    const wantName = this.fold(name);
    for (let i = 0; i < customers.length && i < 6; i++) {
      const c = customers[i];
      const id = c && (c.id != null ? c.id : c.customerId);
      if (!id) continue;
      const cname = this.fold(c.name || "");
      if (wantName && cname && cname !== wantName && cname.indexOf(wantName) < 0 && wantName.indexOf(cname) < 0) continue;
      const bills = await this.siengeGet("/accounts-receivable/receivable-bills?customerId=" + encodeURIComponent(id) + "&limit=40");
      const list = (bills && bills.results) || [];
      const hit = list.find((b) => {
        if (this.unitKey(b && b.unityName) !== wantUnit) return false;
        const code = String((b && b.enterpriseCode) || "");
        if (emp && code && code !== String(emp) && this.enterpriseId(b.enterpriseName) !== String(emp)) return false;
        const doc = String((b && (b.documentId || b.documentIdentificationId)) || "").toUpperCase();
        return !doc || doc === "CT";
      });
      if (hit) return hit;
    }
    return null;
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

  saldoParcela(inst) {
    if (!inst) return null;
    const raw = inst.currentBalance != null ? inst.currentBalance : inst.balanceDue;
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },

  dataBaixaParcela(inst) {
    const recs = Array.isArray(inst && inst.receipts) ? inst.receipts : [];
    const dates = recs.map((rec) => String(rec.date || rec.receiptDate || rec.paymentDate || "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    dates.sort();
    return dates.length ? dates[dates.length - 1] : "";
  },

  parcelaBaixada(inst) {
    if (!inst) return false;
    const sit = inst.installmentSituation;
    if (Number(sit) === 2 || String(sit) === "2") return true;
    const recs = Array.isArray(inst.receipts) ? inst.receipts : [];
    if (recs.some((rec) => Number(rec.value || rec.receiptValue || rec.netReceipt || rec.netReceiptValue || 0) > 0.009)) return true;
    if (this.dataBaixaParcela(inst)) return true;
    const saldo = this.saldoParcela(inst);
    return saldo != null && saldo <= 0.009;
  },

  clienteFromInst(inst, billId) {
    const num = inst.installmentId != null ? inst.installmentId : inst.id;
    return {
      titulo: String(billId),
      parcela: String(billId) + "/" + String(num),
      baixada: this.parcelaBaixada(inst),
      dataBaixa: this.dataBaixaParcela(inst)
    };
  },

  async loadClienteParcelas(emp, unit, clientName) {
    const bill = await this.findClienteBill(emp, unit, clientName);
    const billId = bill && (bill.receivableBillId || bill.id);
    if (!billId) return null;
    let list = [];
    const instRes = await this.siengeGet("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId) + "/installments?limit=200");
    list = (instRes && instRes.results) || (Array.isArray(instRes) ? instRes : []);
    const histById = {};
    try {
      const hist = await this.siengeGet("/bulk-data/v1/customer-extract-history?startDueDate=1996-01-01&endDueDate=2045-01-01&billReceivableId=" + encodeURIComponent(billId) + "&documentsId=CT&includeRemadeInstallments=false&includeCanceledInstallments=false&includeRevokedInstallments=false&includeRenegotiatedDischarge=false");
      const rows = (hist && (hist.data || hist.results)) || [];
      const first = Array.isArray(rows) ? rows[0] : null;
      ((first && first.installments) || []).forEach((inst) => {
        const id = inst && (inst.installmentId != null ? inst.installmentId : inst.id);
        if (id != null) histById[String(id)] = inst;
      });
    } catch (e) {}
    const merged = list.map((inst) => {
      const id = String(inst && (inst.installmentId != null ? inst.installmentId : inst.id));
      const hist = histById[id] || {};
      const receipts = (Array.isArray(hist.receipts) && hist.receipts.length) ? hist.receipts : (inst.receipts || []);
      return Object.assign({}, hist, inst, { receipts: receipts });
    });
    const byDue = {};
    const webro = [];
    merged.forEach((inst) => {
      const due = String(inst && inst.dueDate || "").slice(0, 10);
      const row = this.clienteFromInst(inst, billId);
      row.due = due;
      row.webro = this.isWebroInst(inst);
      row.documento = String((bill && bill.documentNumber) || "");
      if (row.webro) webro.push(row);
      if (!due) return;
      const prev = byDue[due];
      if (!prev || (row.webro && !prev.webro) || (row.baixada && !prev.baixada && row.webro === prev.webro)) byDue[due] = row;
    });
    webro.sort((a, b) => String(a.due).localeCompare(String(b.due)));
    return { byDue: byDue, webro: webro, billId: String(billId), documento: String((bill && bill.documentNumber) || "") };
  },

  recalcRecebidos() {
    let aReceber = 0;
    let recebido = 0;
    (this.state.contratos || []).forEach((r) => {
      let ar = 0;
      let rec = 0;
      this.mouraProgramacao(r).forEach((p) => {
        const v = Number(p.valor) || 0;
        if (p.pago) rec += v;
        else ar += v;
      });
      r.aReceber = Math.round(ar * 100) / 100;
      r.recebido = Math.round(rec * 100) / 100;
      aReceber += r.aReceber;
      recebido += r.recebido;
    });
    this.state.totais.aReceber = Math.round(aReceber * 100) / 100;
    this.state.totais.recebido = Math.round(recebido * 100) / 100;
  },

  async vincularParcelasCliente() {
    const rows = this.state.contratos || [];
    const jobs = [];
    const seen = {};
    rows.forEach((r) => {
      const emp = this.enterpriseId(r.empreendimento);
      const unit = String(r.unidade || "").trim();
      const client = String(r.pagador || "").trim();
      if (!unit || !client) {
        this.mouraProgramacao(r).forEach((p) => { p.clienteBusca = true; p.cliente = null; });
        return;
      }
      const key = (emp || "") + "|" + this.unitKey(unit) + "|" + this.fold(client);
      if (seen[key]) return;
      seen[key] = true;
      jobs.push({ key: key, emp: emp, unit: unit, client: client });
    });
    const resolved = {};
    let cursor = 0;
    let done = 0;
    const apply = () => {
      rows.forEach((r) => {
        const emp = this.enterpriseId(r.empreendimento);
        const unit = String(r.unidade || "").trim();
        const client = String(r.pagador || "").trim();
        const pack = unit && client ? resolved[(emp || "") + "|" + this.unitKey(unit) + "|" + this.fold(client)] : null;
        if (pack === undefined) return;
        const moura = this.mouraProgramacao(r).slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
        const webro = (pack && pack.webro) || [];
        const used = {};
        moura.forEach((p) => {
          const due = String(p.vencimento || "").slice(0, 10);
          p.clienteBusca = true;
          let cliente = null;
          if (pack && pack.byDue && pack.byDue[due] && pack.byDue[due].webro) cliente = pack.byDue[due];
          if (!cliente) {
            let best = -1;
            let bestDays = 46;
            webro.forEach((w, i) => {
              if (used[i]) return;
              const days = Math.abs((Date.parse(String(w.due).slice(0, 10) + "T12:00:00") || 0) - (Date.parse(due + "T12:00:00") || 0)) / 86400000;
              if (days <= 45 && days < bestDays) {
                bestDays = days;
                best = i;
              }
            });
            if (best >= 0) cliente = webro[best];
          }
          if (!cliente && pack && pack.byDue) cliente = pack.byDue[due] || null;
          if (cliente) {
            const idx = webro.indexOf(cliente);
            if (idx >= 0) used[idx] = true;
          }
          p.cliente = cliente;
          if (p.cliente && p.cliente.baixada) {
            p.pago = true;
            p.situacao = "Recebido";
          }
        });
      });
    };
    const run = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try { resolved[job.key] = await this.loadClienteParcelas(job.emp, job.unit, job.client); }
        catch (e) { resolved[job.key] = null; }
        done += 1;
        apply();
        if (!this.state.loading && (done % 2 === 0 || done === jobs.length)) this.render();
      }
    };
    await Promise.all([run(), run(), run()]);
    apply();
    this.recalcRecebidos();
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
