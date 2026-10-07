/**
 * Contas a Receber · Recebimentos Webro
 * Recebimentos dos últimos 30 dias com condição Parcela Webro,
 * cruzados com a comissão da Moura Leite no mesmo vencimento.
 */
const RecebimentosWebroApp = {
  state: {
    inited: false,
    loading: false,
    consulted: false,
    error: "",
    status: "",
    de: "",
    ate: "",
    rows: [],
    condicoes: [],
    webroSemComissao: 0,
    recebimentos: 0
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

  pad(n) {
    return String(n).padStart(2, "0");
  },

  iso(d) {
    return d.getFullYear() + "-" + this.pad(d.getMonth() + 1) + "-" + this.pad(d.getDate());
  },

  period() {
    const end = new Date();
    end.setHours(12, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return { start: this.iso(start), end: this.iso(end) };
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  unitKey(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  enterpriseId(nome) {
    const nums = String(nome || "").match(/\d{4,6}/g) || [];
    return nums.length ? nums[nums.length - 1] : "";
  },

  isoDue(raw) {
    const s = String(raw || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    return "";
  },

  isMouraNome(nome) {
    const compact = this.fold(nome);
    if (!compact) return false;
    if (compact === "MOURALEITE") return true;
    if (compact.indexOf("MOURALEITE") < 0) return false;
    const rest = compact.replace(/IMOBILIARIA|IMOB|IMO|LTDA|EIRELI|SPE|DESENVOLVIMENTO|URBANIZACAO|INCORPORADORA|EMPREENDIMENTOS|HOLDING/g, "");
    return rest === "MOURALEITE";
  },

  apiUrl(path) {
    const host = window.location.hostname;
    const isLocal = !host || host === "localhost" || host === "127.0.0.1";
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const origin = isLocal ? ("http://localhost:" + port) : "";
    return origin + path;
  },

  companyIds() {
    const pick = (map) => Object.entries(map || {})
      .filter(([id, c]) => id !== "_v2" && c && (c.cobranca_interna === 1 || c.cobranca_interna === true || c.cobranca_interna === "1"))
      .map(([, c]) => Number(c.company_id != null ? c.company_id : c.id))
      .filter((n) => Number.isFinite(n));
    try {
      if (window.EmpresasState && window.EmpresasState.customFields) {
        const ids = pick(window.EmpresasState.customFields);
        if (ids.length) return [...new Set(ids)];
      }
      const raw = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}");
      const ids = pick(raw);
      if (ids.length) return [...new Set(ids)];
    } catch (e) {}
    return [1, 2, 3, 6, 13, 28, 32];
  },

  webroCodes() {
    if (window.CondicoesPagamentoApp && typeof window.CondicoesPagamentoApp.loadFlagsFromLocal === "function") {
      try { window.CondicoesPagamentoApp.loadFlagsFromLocal(); } catch (e) {}
    }
    const flags = (window.CondicoesPagamentoApp && window.CondicoesPagamentoApp.flags) || {};
    return Object.keys(flags).filter((id) => flags[id] && flags[id].parcelaWebro === true);
  },

  isWebroCode(code) {
    const raw = String(code || "").trim();
    if (!raw) return false;
    if (typeof window.paymentConditionIsWebro === "function" && window.paymentConditionIsWebro(raw)) return true;
    if (typeof window.installmentConditionKey === "function" && typeof window.paymentConditionIsWebro === "function") {
      const key = window.installmentConditionKey({ conditionType: raw, paymentTerm: raw, paymentConditionType: raw });
      if (key && window.paymentConditionIsWebro(key)) return true;
    }
    return false;
  },

  conditionFromItem(item) {
    if (!item) return "";
    const term = item.paymentTerm || item.paymentCondition || item.conditionType || item.paymentConditionType;
    if (term && typeof term === "object") {
      return String(term.id || term.code || term.paymentTermId || term.description || "").trim();
    }
    if (term) return String(term).trim();
    return String(item.paymentTermId || item.conditionTypeId || item.installmentCondition || "").trim();
  },

  receiptHits(item, start, end) {
    const hits = [];
    const push = (r) => {
      if (!r) return;
      const op = String(r.operationTypeId != null ? r.operationTypeId : (r.typeId != null ? r.typeId : ""));
      if (op && op !== "2") return;
      const dt = String(r.paymentDate || r.receiptDate || r.date || "").slice(0, 10);
      if (!dt || dt < start || dt > end) return;
      const amount = Number(r.netAmount != null ? r.netAmount : (r.grossAmount != null ? r.grossAmount : (r.value != null ? r.value : r.receiptValue)));
      hits.push({ date: dt, amount: Number.isFinite(amount) ? amount : 0 });
    };
    (item.receipts || []).forEach(push);
    (item.receiptsCategories || []).forEach((cat) => (cat.receipts || []).forEach(push));
    if (!hits.length) {
      const dt = String(item.paymentDate || item.receiptDate || "").slice(0, 10);
      if (dt && dt >= start && dt <= end) {
        const amount = Number(item.receiptNetAmount || item.netAmount || item.receivedAmount || 0);
        hits.push({ date: dt, amount: Number.isFinite(amount) ? amount : 0 });
      }
    }
    return hits;
  },

  chunks(startIso, endIso) {
    const out = [];
    const cur = new Date(startIso + "T12:00:00");
    const end = new Date(endIso + "T12:00:00");
    while (cur <= end) {
      const chunkEnd = new Date(cur);
      chunkEnd.setDate(chunkEnd.getDate() + 9);
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());
      out.push({ start: this.iso(cur), end: this.iso(chunkEnd) });
      cur.setTime(chunkEnd.getTime());
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  },

  costCenterOf(item) {
    const cats = [];
    (item.receiptsCategories || []).forEach((c) => cats.push(c));
    (item.receipts || []).forEach((r) => {
      (r.bankMovements || []).forEach((bm) => {
        (bm.financialCategories || []).forEach((c) => cats.push(c));
      });
    });
    const cat = cats.find((c) => c && c.costCenterId) || null;
    return {
      id: String((cat && cat.costCenterId) || item.costCenterId || item.enterpriseId || "").trim(),
      name: String((cat && cat.costCenterName) || item.costCenterName || item.projectName || item.enterpriseName || "").trim()
    };
  },

  rowFromIncome(item, paidOn, valorRecebido) {
    const doc = String(item.documentIdentificationId || "").toUpperCase();
    if (doc && doc !== "CT") return null;
    const billId = item.billId || item.billReceivableId || item.receivableBillId || "";
    const installmentId = item.installmentId || item.installmentNumber || "";
    const unit = item.mainUnit || item.unitName || item.unit || "";
    const cc = this.costCenterOf(item);
    return {
      billId: billId ? String(billId) : "",
      installmentId: installmentId ? String(installmentId) : "",
      condition: this.conditionFromItem(item),
      due: this.isoDue(item.dueDate || item.originalDueDate),
      paidOn: paidOn,
      unit: String(unit || "").trim(),
      project: cc.id,
      projectName: cc.name,
      client: String(item.clientName || item.customerName || "").trim(),
      valorRecebido: Number(valorRecebido) || 0
    };
  },

  async enrich(row) {
    const known = row.condition && this.isWebroCode(row.condition);
    const rejected = row.condition && !this.isWebroCode(row.condition);
    if (rejected) return null;
    if (known && row.due && (row.unit || row.client)) return row;
    if (!row.billId || typeof window.siengeFetchWithRetry !== "function") return known ? row : null;
    const instRes = await window.siengeFetchWithRetry(
      "/accounts-receivable/receivable-bills/" + encodeURIComponent(row.billId) + "/installments?limit=200"
    );
    const list = (instRes && instRes.results) || (Array.isArray(instRes) ? instRes : []);
    const inst = list.find((i) => {
      const id = String(i && (i.installmentId != null ? i.installmentId : i.installmentNumber));
      return row.installmentId && id === String(row.installmentId);
    }) || (list.length === 1 ? list[0] : null);
    if (!inst) return known ? row : null;
    const code = (typeof window.installmentConditionKey === "function")
      ? window.installmentConditionKey(inst)
      : this.conditionFromItem(inst);
    if (!this.isWebroCode(code)) return null;
    row.condition = code || row.condition;
    row.due = this.isoDue(inst.dueDate || row.due);
    return row;
  },

  async loadIncome(start, end, onStep) {
    const companies = this.companyIds();
    const parts = this.chunks(start, end);
    const jobs = [];
    companies.forEach((id) => parts.forEach((p) => jobs.push({ id: id, start: p.start, end: p.end })));
    const seen = new Set();
    const rows = [];
    let done = 0;
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      done += 1;
      if (onStep) onStep("Buscando recebimentos " + done + " de " + jobs.length + "…");
      let data = [];
      try {
        const res = await window.SiengeApiService.getBulkIncome(job.start, job.end, job.id);
        data = (res && res.data) || [];
      } catch (e) {
        data = [];
      }
      data.forEach((item) => {
        const hits = this.receiptHits(item, start, end);
        if (!hits.length) return;
        const paidOn = hits.map((h) => h.date).sort().pop();
        const valor = hits.filter((h) => h.date === paidOn).reduce((s, h) => s + h.amount, 0);
        const row = this.rowFromIncome(item, paidOn, valor);
        if (!row) return;
        const key = row.billId + "|" + row.installmentId + "|" + row.paidOn;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push(row);
      });
    }
    return rows;
  },

  async loadComissoes(startIso) {
    const start = new Date(startIso + "T12:00:00");
    start.setMonth(start.getMonth() - 24);
    const de = "01/" + this.pad(start.getMonth() + 1) + "/" + start.getFullYear();
    const today = new Date();
    const ate = this.pad(today.getDate()) + "/" + this.pad(today.getMonth() + 1) + "/" + today.getFullYear();
    const res = await fetch(this.apiUrl("/api/controle-comissao?de=" + encodeURIComponent(de) + "&ate=" + encodeURIComponent(ate) + "&nfs=0"));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.mensagem || ("Erro " + res.status + " ao consultar as comissões."));
    return data.contratos || [];
  },

  indexComissoes(contratos) {
    const byEmp = new Map();
    const byName = new Map();
    const byUnit = new Map();
    (contratos || []).forEach((r) => {
      const emp = this.enterpriseId(r.empreendimento);
      const unit = this.unitKey(r.unidade);
      const name = this.fold(r.pagador);
      (r.programacao || []).forEach((p) => {
        if (!this.isMouraNome(p && p.beneficiario)) return;
        const due = this.isoDue(p.vencimento);
        if (!due) return;
        const item = {
          contrato: r.contrato || "",
          empreendimento: r.empreendimento || "",
          unidade: r.unidade || "",
          pagador: r.pagador || "",
          vencimento: due,
          valor: Number(p.valor) || 0
        };
        const put = (map, key) => {
          if (!key) return;
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(item);
        };
        if (emp && unit) put(byEmp, emp + "|" + unit + "|" + due);
        if (unit) put(byUnit, unit + "|" + due);
        if (name) put(byName, name + "|" + due);
      });
    });
    return { byEmp: byEmp, byUnit: byUnit, byName: byName };
  },

  pick(list) {
    if (!list || !list.length) return null;
    return list[0];
  },

  match(row, index) {
    const due = row.due;
    if (!due) return null;
    const emp = String(row.project || "").replace(/\D/g, "");
    const empFromName = this.enterpriseId(row.projectName);
    const unit = this.unitKey(row.unit);
    const name = this.fold(row.client);
    const empKey = (id) => (id && unit) ? index.byEmp.get(id + "|" + unit + "|" + due) : null;
    return this.pick(empKey(emp))
      || this.pick(empKey(empFromName))
      || this.pick(name ? index.byName.get(name + "|" + due) : null)
      || this.pick(unit ? index.byUnit.get(unit + "|" + due) : null);
  },

  async consultar() {
    if (this.state.loading) return;
    const period = this.period();
    this.state.loading = true;
    this.state.consulted = true;
    this.state.error = "";
    this.state.status = "Buscando recebimentos dos últimos 30 dias…";
    this.state.de = period.start;
    this.state.ate = period.end;
    this.state.rows = [];
    this.state.condicoes = [];
    this.state.webroSemComissao = 0;
    this.state.recebimentos = 0;
    this.render();
    try {
      const codes = this.webroCodes();
      if (!codes.length) {
        throw new Error("Nenhuma condição está marcada como Parcela Webro. Marque os tipos em Comercial, Condições de pagamento.");
      }
      if (!window.SiengeApiService || typeof window.SiengeApiService.getBulkIncome !== "function") {
        throw new Error("A consulta ao Sienge não está disponível nesta tela.");
      }
      const income = await this.loadIncome(period.start, period.end, (msg) => {
        this.state.status = msg;
        this.render();
      });
      this.state.recebimentos = income.length;
      const webro = [];
      const cache = new Map();
      for (let i = 0; i < income.length; i++) {
        if (i % 8 === 0) {
          this.state.status = "Conferindo parcelas Webro " + (i + 1) + " de " + income.length + "…";
          this.render();
        }
        const row = income[i];
        const cacheKey = row.billId + "|" + row.installmentId;
        let kept = cache.get(cacheKey);
        if (kept === undefined) {
          try { kept = await this.enrich(row); }
          catch (e) { kept = null; }
          cache.set(cacheKey, kept);
        } else if (kept) {
          kept = Object.assign({}, kept, { paidOn: row.paidOn, valorRecebido: row.valorRecebido });
        }
        if (kept && kept.due) webro.push(kept);
      }
      this.state.status = "Cruzando com a comissão da Moura Leite…";
      this.render();
      const contratos = await this.loadComissoes(period.start);
      const index = this.indexComissoes(contratos);
      const listed = [];
      let sem = 0;
      webro.forEach((row) => {
        const hit = this.match(row, index);
        const comissao = hit && hit.valor > 0 ? hit : null;
        if (!comissao) sem += 1;
        listed.push({
          empreendimento: (comissao && comissao.empreendimento) || row.projectName || row.project,
          contrato: comissao ? comissao.contrato : "",
          unidade: (comissao && comissao.unidade) || row.unit,
          cliente: row.client || (comissao && comissao.pagador) || "",
          vencimento: row.due,
          pagoEm: row.paidOn,
          condicao: row.condition,
          valorRecebido: Number(row.valorRecebido) || 0,
          valor: comissao ? comissao.valor : 0,
          situacao: comissao ? "Liberar" : "Sem comissão"
        });
      });
      listed.sort((a, b) => String(b.pagoEm).localeCompare(String(a.pagoEm)) || String(a.empreendimento).localeCompare(String(b.empreendimento), "pt-BR"));
      this.state.rows = listed;
      this.state.webroSemComissao = sem;
      this.state.condicoes = codes.slice().sort();
      this.state.status = "";
    } catch (e) {
      this.state.error = e && e.message ? e.message : "Não foi possível montar os recebimentos Webro.";
      this.state.status = "";
    }
    this.state.loading = false;
    this.render();
  },

  async exportExcel() {
    const rows = this.state.rows || [];
    if (!rows.length) {
      alert("Não há recebimento Webro para exportar neste período.");
      return;
    }
    const ExcelJS = window.ExcelJS;
    if (!ExcelJS) {
      alert("Não foi possível gerar o Excel. Recarregue a página.");
      return;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    const ws = wb.addWorksheet("Recebimentos Webro");
    ws.columns = [
      { header: "Empreendimento", key: "empreendimento", width: 42 },
      { header: "Unidade", key: "unidade", width: 16 },
      { header: "Cliente", key: "cliente", width: 36 },
      { header: "Condição", key: "condicao", width: 14 },
      { header: "Vencimento", key: "vencimento", width: 16 },
      { header: "Recebido em", key: "pagoEm", width: 16 },
      { header: "Valor recebido", key: "valorRecebido", width: 18 },
      { header: "Contrato CV", key: "contrato", width: 16 },
      { header: "Comissão a liberar", key: "valor", width: 20 },
      { header: "Situação", key: "situacao", width: 18 }
    ];
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF105436" } };
    head.alignment = { vertical: "middle" };
    rows.forEach((r) => {
      const line = ws.addRow({
        empreendimento: r.empreendimento,
        unidade: r.unidade,
        cliente: r.cliente,
        condicao: r.condicao,
        vencimento: this.fmtDate(r.vencimento),
        pagoEm: this.fmtDate(r.pagoEm),
        valorRecebido: Number(r.valorRecebido) || 0,
        contrato: r.contrato,
        valor: Number(r.valor) || 0,
        situacao: r.situacao
      });
      line.getCell(7).numFmt = "#,##0.00";
      line.getCell(9).numFmt = "#,##0.00";
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Recebimentos_Webro_" + (this.state.ate || this.iso(new Date())) + ".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  render() {
    const root = document.getElementById("recebimentos-webro-root");
    if (!root) return;
    const s = this.state;
    const period = (s.de && s.ate) ? (this.fmtDate(s.de) + " a " + this.fmtDate(s.ate)) : "";
    const rows = s.rows || [];
    const recebido = rows.reduce((sum, r) => sum + (Number(r.valorRecebido) || 0), 0);
    const comissao = rows.reduce((sum, r) => sum + (Number(r.valor) || 0), 0);
    const comCount = rows.filter((r) => Number(r.valor) > 0).length;
    const condicoes = (s.condicoes || []).join(", ");
    root.innerHTML = `
      <div class="ccom-page">
        <div class="search-filter-panel tvig-params ccom-params">
          <h3 class="tvig-section-title">Recebimentos Webro</h3>
          <p class="rweb-note">Primeiro entram os recebimentos dos últimos 30 dias cuja condição está marcada como Parcela Webro em Comercial, Condições de pagamento. Depois, pelo empreendimento e pela unidade, a tela procura no CV CRM a comissão da Moura Leite no mesmo vencimento para liberar.</p>
          <div class="ccom-filters">
            <div class="tvig-filter-actions">
              <button type="button" class="btn btn-primary ccom-consult" ${s.loading ? "disabled" : ""} onclick="RecebimentosWebroApp.consultar()">
                <i data-lucide="search" style="width:14px;"></i> ${s.loading ? "Consultando…" : "Consultar"}
              </button>
              <button type="button" class="btn btn-primary ccom-consult" ${s.loading || !rows.length ? "disabled" : ""} onclick="RecebimentosWebroApp.exportExcel()">
                <i data-lucide="file-spreadsheet" style="width:14px;"></i> Gerar Excel
              </button>
            </div>
          </div>
          ${period ? `<p class="rweb-note">Período: ${this.esc(period)}${condicoes ? " · Condições Webro: " + this.esc(condicoes) : ""}</p>` : ""}
        </div>
        ${s.error ? `<div class="tvig-empty">${this.esc(s.error)}</div>` : ""}
        ${s.loading ? `<div class="tvig-empty">${this.esc(s.status || "Buscando recebimentos Webro…")}</div>` : ""}
        ${!s.loading && !s.error && s.consulted && rows.length ? `
          <div class="ccom-kpis">
            <div class="ccom-kpi"><span>Recebimentos Webro</span><strong>${rows.length}</strong></div>
            <div class="ccom-kpi"><span>Valor recebido</span><strong>${this.esc(this.money(recebido))}</strong></div>
            <div class="ccom-kpi"><span>Com comissão a liberar</span><strong>${comCount}</strong></div>
            <div class="ccom-kpi"><span>Comissão a liberar</span><strong>${this.esc(this.money(comissao))}</strong></div>
            <div class="ccom-kpi"><span>Sem comissão neste vencimento</span><strong>${s.webroSemComissao || 0}</strong></div>
          </div>
          <div class="crm-card ccom-card">
            <div class="crm-scroll-table ccom-table-wrap">
              <table class="custom-table ccom-table">
                <thead>
                  <tr>
                    <th>Empreendimento</th>
                    <th>Unidade</th>
                    <th>Cliente</th>
                    <th>Condição</th>
                    <th>Vencimento</th>
                    <th>Recebido em</th>
                    <th class="ccom-num">Valor recebido</th>
                    <th>Contrato CV</th>
                    <th class="ccom-num">Comissão</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>${rows.map((r) => `<tr>
                  <td>${this.esc(r.empreendimento || "—")}</td>
                  <td>${this.esc(r.unidade || "—")}</td>
                  <td>${this.esc(r.cliente || "—")}</td>
                  <td class="ccom-td-id">${this.esc(r.condicao || "—")}</td>
                  <td>${this.esc(this.fmtDate(r.vencimento))}</td>
                  <td>${this.esc(this.fmtDate(r.pagoEm))}</td>
                  <td class="ccom-num">${this.esc(this.money(r.valorRecebido))}</td>
                  <td class="ccom-td-id">${this.esc(r.contrato || "—")}</td>
                  <td class="ccom-num">${Number(r.valor) > 0 ? this.esc(this.money(r.valor)) : "—"}</td>
                  <td><span class="ccom-sit ${Number(r.valor) > 0 ? "ccom-sit-pago" : "ccom-sit-prog"}">${this.esc(r.situacao || "—")}</span></td>
                </tr>`).join("")}</tbody>
              </table>
            </div>
          </div>` : ""}
        ${!s.loading && !s.error && s.consulted && !rows.length ? `<div class="tvig-empty">Nenhum recebimento com condição Parcela Webro nestes 30 dias.</div>` : ""}
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  init() {
    const root = document.getElementById("recebimentos-webro-root");
    if (!root) return;
    this.state.inited = true;
    this.render();
  }
};

window.RecebimentosWebroApp = RecebimentosWebroApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "recebimentos-webro") RecebimentosWebroApp.init();
});
