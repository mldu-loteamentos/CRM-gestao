function caixaAddDays(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + Number(n || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function caixaMoney(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function caixaEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function caixaBalance(b) {
  if (!b) return null;
  const list = [b.amount, b.balance, b.balanceAmount, b.currentBalance, b.lastBalance, b.lastBalanceAmount, b.availableAmount, b.availableBalance, b.value];
  for (let i = 0; i < list.length; i++) {
    if (list[i] == null || list[i] === "") continue;
    const n = Number(String(list[i]).replace(/\./g, "").replace(",", "."));
    const raw = Number(list[i]);
    if (Number.isFinite(raw)) return raw;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function caixaFormaPagamento(billId, parcela) {
  if (typeof window.siengeFetchWithRetry !== "function") return null;
  const id = parcela || 1;
  const kinds = ["bank-transfer", "pix", "boleto-bancario", "boleto-concessionaria"];
  for (let i = 0; i < kinds.length; i++) {
    try {
      const data = await window.siengeFetchWithRetry(
        "/bills/" + encodeURIComponent(billId) + "/installments/" + encodeURIComponent(id) + "/payment-information/" + kinds[i],
        1
      );
      if (data && typeof data === "object") return { kind: kinds[i], data: data };
    } catch (e) {}
  }
  return null;
}

function caixaFormaHtml(payment, item) {
  if (payment && payment.data) {
    const d = payment.data;
    if (payment.kind === "pix") {
      return `<p><strong>Forma:</strong> PIX</p><p>${caixaEsc(d.notes || "Chave do credor")}</p>`;
    }
    if (payment.kind === "boleto-bancario" || payment.kind === "boleto-concessionaria") {
      return `<p><strong>Forma:</strong> ${payment.kind === "boleto-concessionaria" ? "Boleto de concessionária" : "Boleto"}</p><p>${caixaEsc(d.notes || d.digitableNumber || d.barCode || "")}</p>`;
    }
    const banco = [d.beneficiaryBankCode, d.beneficiaryBankName].filter(Boolean).join(" — ");
    const ag = [d.beneficiaryBankBranchNumber, d.beneficiaryBankBranchDigit].filter(Boolean).join("-");
    const conta = [d.beneficiaryAccountNumber, d.beneficiaryAccountDigit].filter(Boolean).join("-");
    const tipo = d.beneficiaryAccountType === "P" ? "Poupança" : "Conta corrente";
    return `<p><strong>Forma:</strong> Transferência</p>
      <p><strong>Banco:</strong> ${caixaEsc(banco || "—")}</p>
      <p><strong>Agência:</strong> ${caixaEsc(ag || "—")}</p>
      <p><strong>${caixaEsc(tipo)}:</strong> ${caixaEsc(conta || "—")}</p>
      <p><strong>Favorecido:</strong> ${caixaEsc(d.beneficiaryName || "—")}</p>
      ${d.notes ? `<pre style="white-space:pre-wrap;font-family:inherit;margin:8px 0 0;">${caixaEsc(d.notes)}</pre>` : ""}`;
  }
  if (item && (item.tipoBaixa || item.conta || item.operacao)) {
    return `<p><strong>Programação na consulta:</strong> ${caixaEsc([item.tipoBaixa, item.operacao, item.conta].filter(Boolean).join(" · "))}</p>`;
  }
  return `<p>O pagamento ainda não está programado neste título.</p>`;
}

function caixaFmtDate(iso) {
  if (!iso) return "—";
  const p = String(iso).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}

function caixaSlim(u, date) {
  const present = u.presentDebitBalance != null ? Number(u.presentDebitBalance) : Number(u.outstandingBalance || 0);
  return {
    d: date,
    uid: String(u.id || ""),
    un: u.name || "",
    cc: String(u.enterpriseId || ""),
    cn: u.enterpriseName || "",
    cid: u.customerId != null ? String(u.customerId) : "",
    cpf: String(u.customerDoc || "").replace(/\D/g, ""),
    nome: u.customerName || "",
    rec: Number(u.receivedAmount) || 0,
    ven: Number(u.kpiVencidas) || 0,
    av: Number(u.kpiAVencer) || 0,
    vp: Number.isFinite(present) ? present : 0,
    pmp: Number(u.pmp3m) || 0,
    st: u.relFin || (u.quitado ? "quitado" : ""),
    parc: Array.isArray(u.openParcelas) ? u.openParcelas.slice(0, 18) : []
  };
}

const CaixaPosicaoStore = {
  FB: "caixa_posicao",
  CHUNK: 120,

  fbReady() {
    return !!(window.firebaseDb && window.firebaseCollections);
  },

  async loadEstoqueUnits() {
    if (window.EstoqueComercialApp) {
      if (!EstoqueComercialApp.state.units.length) await EstoqueComercialApp.init();
      if (EstoqueComercialApp.state.units.length) return EstoqueComercialApp.state.units;
    }
    if (!this.fbReady()) return [];
    const { collection, getDocs } = window.firebaseCollections;
    const snap = await getDocs(collection(window.firebaseDb, "estoque_comercial"));
    const units = [];
    snap.forEach((d) => {
      if (d.id === "_meta" || d.id === "_batimento_state") return;
      const data = d.data() || {};
      if (Array.isArray(data.units)) units.push(...data.units);
    });
    return units;
  },

  async saveFromUnits(units, date) {
    if (!this.fbReady()) throw new Error("Firebase indisponível.");
    const { doc, setDoc } = window.firebaseCollections;
    const rows = (units || [])
      .filter((u) => {
        const code = String(u.commercialStock || "").toUpperCase();
        return code === "V" || code === "O" || u.contractId || u.contractNumber;
      })
      .map((u) => caixaSlim(u, date));
    const nChunks = Math.max(1, Math.ceil(rows.length / this.CHUNK) || 1);
    const writes = [];
    for (let c = 0; c < nChunks; c++) {
      writes.push(setDoc(doc(window.firebaseDb, this.FB, `${date}_${c}`), {
        date, chunk: c, rows: rows.slice(c * this.CHUNK, (c + 1) * this.CHUNK), updatedAt: new Date().toISOString()
      }));
    }
    writes.push(setDoc(doc(window.firebaseDb, this.FB, "_meta"), {
      lastDate: date, chunks: nChunks, count: rows.length, updatedAt: new Date().toISOString()
    }, { merge: true }));
    await Promise.all(writes);
    return rows;
  },

  async loadDate(date) {
    if (!this.fbReady() || !date) return [];
    const { collection, getDocs } = window.firebaseCollections;
    const snap = await getDocs(collection(window.firebaseDb, this.FB));
    const rows = [];
    snap.forEach((d) => {
      if (d.id === "_meta") return;
      const data = d.data() || {};
      if (String(data.date) === String(date) && Array.isArray(data.rows)) rows.push(...data.rows);
    });
    return rows;
  },

  async listDates() {
    if (!this.fbReady()) return [];
    const { collection, getDocs } = window.firebaseCollections;
    const snap = await getDocs(collection(window.firebaseDb, this.FB));
    const set = new Set();
    snap.forEach((d) => {
      if (d.id === "_meta") return;
      const data = d.data() || {};
      if (data.date) set.add(String(data.date));
    });
    return [...set].sort().reverse();
  }
};

const FluxoCaixaDiarioApp = {
  month: "",
  loading: false,
  error: "",
  days: [],
  openDay: "",
  totals: { saldo: 0, entrar: 0, pagar: 0, titulos: 0 },
  companyIds: [],
  companies: [],
  openEmp: false,
  qEmp: "",
  accounts: [],
  progress: "",
  detail: null,
  _gen: 0,

  init() {
    if (!this.month) {
      const n = new Date();
      this.month = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
    }
    this.render();
    this.load();
  },

  monthBounds() {
    const [y, m] = String(this.month || "").split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
      start: `${this.month}-01`,
      end: `${this.month}-${String(last).padStart(2, "0")}`,
      last
    };
  },

  companyWanted(id) {
    if (!this.companyIds.length) return true;
    return this.companyIds.indexOf(String(id || "")) >= 0;
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

  async ensureCcCompany() {
    if (this._ccCompany) return;
    const map = {};
    let list = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    if (!list.length && window.SiengeApiService && typeof SiengeApiService.getCostCenters === "function") {
      try { list = await SiengeApiService.getCostCenters(); } catch (e) { list = []; }
    }
    (list || []).forEach((c) => {
      const id = String(c.id || "");
      const co = c.companyId || c.idCompany || (c.company && c.company.id);
      if (id && co != null && co !== "") map[id] = String(co);
    });
    this._ccCompany = map;
  },

  companyName(id) {
    const hit = this.companies.find((c) => String(c.id) === String(id));
    return hit ? hit.name : (id ? ("Empresa " + id) : "");
  },

  empItems() {
    return this.companies.map((c) => ({
      id: String(c.id),
      name: String(c.name || "").toUpperCase(),
      label: c.id + " - " + String(c.name || "").toUpperCase()
    }));
  },

  paintProgress() {
    const el = document.getElementById("cxd-progress");
    if (!el) return;
    el.textContent = this.progress || "";
    el.hidden = !this.progress;
  },

  async load() {
    const gen = (this._gen || 0) + 1;
    this._gen = gen;
    this.loading = true;
    this.error = "";
    this.days = [];
    this.accounts = [];
    this.progress = "Lendo recebimentos e saldo…";
    this.render();
    try {
      await this.ensureCompanies();
      await this.ensureCcCompany();
      if (this._gen !== gen) return;
      const bounds = this.monthBounds();
      const units = await CaixaPosicaoStore.loadEstoqueUnits();
      if (this._gen !== gen) return;
      const byDay = {};
      const ensure = (iso) => {
        if (!byDay[iso]) byDay[iso] = { date: iso, entrar: 0, pagar: 0, itens: [], pagarItens: [] };
        return byDay[iso];
      };
      let titulos = 0;
      units.forEach((u) => {
        if (u.quitado || u.relFin === "quitado") return;
        const companyId = this._ccCompany[String(u.enterpriseId || "")] || "";
        if (!this.companyWanted(companyId)) return;
        const pmp = Number(u.pmp3m) || 0;
        const parc = Array.isArray(u.openParcelas) ? u.openParcelas : [];
        parc.forEach((p) => {
          if (!p || !p.due || p.overdue) return;
          const prev = caixaAddDays(p.due, pmp);
          if (prev < bounds.start || prev > bounds.end) return;
          const day = ensure(prev);
          const valor = Number(p.val) || 0;
          day.entrar += valor;
          day.itens.push({
            unidade: u.name,
            cc: u.enterpriseId,
            cliente: u.customerName || "",
            cpf: u.customerDoc || "",
            vencimento: p.due,
            pmp,
            previsto: prev,
            valor
          });
          titulos += 1;
        });
      });
      const days = [];
      for (let d = 1; d <= bounds.last; d++) {
        const iso = `${this.month}-${String(d).padStart(2, "0")}`;
        days.push(byDay[iso] || { date: iso, entrar: 0, pagar: 0, itens: [], pagarItens: [] });
      }
      this.days = days;
      this.totals = {
        saldo: 0,
        entrar: days.reduce((s, x) => s + x.entrar, 0),
        pagar: 0,
        titulos
      };
      this.loading = false;
      this.render();
      await this.loadBalances(gen);
      if (this._gen !== gen) return;
      await this.loadPayables(gen, bounds);
    } catch (e) {
      if (this._gen !== gen) return;
      this.error = e.message || String(e);
      this.loading = false;
      this.progress = "";
      this.render();
    }
  },

  async loadBalances(gen) {
    this.progress = "Lendo o saldo das contas…";
    this.paintProgress();
    const today = new Date().toISOString().slice(0, 10);
    let rows = [];
    if (window.SiengeApiService && typeof SiengeApiService.getAccountBalances === "function") {
      if (this.companyIds.length) {
        const chunks = await Promise.all(this.companyIds.map((id) => SiengeApiService.getAccountBalances(today, { companyId: id })));
        chunks.forEach((list) => { if (Array.isArray(list)) rows.push.apply(rows, list); });
      } else {
        rows = await SiengeApiService.getAccountBalances(today) || [];
      }
    }
    if (this._gen !== gen) return;
    const accounts = [];
    const seen = {};
    (rows || []).forEach((b) => {
      const companyId = String(b.companyId || b.company || "");
      if (!this.companyWanted(companyId)) return;
      const number = String(b.accountNumber || b.number || "").trim();
      const amount = caixaBalance(b);
      if (amount == null) return;
      const key = companyId + "|" + number + "|" + String(b.balanceDate || "");
      if (seen[key]) return;
      seen[key] = true;
      accounts.push({
        companyId,
        company: this.companyName(companyId),
        number,
        name: b.accountName || b.name || number || "Conta",
        amount
      });
    });
    accounts.sort((a, b) => String(a.companyId).localeCompare(String(b.companyId), "pt") || String(a.name).localeCompare(String(b.name), "pt"));
    this.accounts = accounts;
    this.totals.saldo = accounts.reduce((s, a) => s + a.amount, 0);
    this.progress = "Buscando o que será pago…";
    this.render();
  },

  async loadPayables(gen, bounds) {
    const app = window.ComprasControleApp || window.ComprasPrevisoesApp;
    if (!app || typeof app.outcomeRange !== "function" || typeof app.transform !== "function") {
      this.progress = "";
      this.error = this.error || "O módulo de compras não está disponível para ler os títulos a pagar.";
      this.render();
      return;
    }
    const prevNote = app.noteProgress;
    app.noteProgress = (text) => {
      this.progress = text;
      this.paintProgress();
    };
    let rows = [];
    try {
      const targets = this.companyIds.length ? this.companyIds.slice() : [""];
      const bills = [];
      for (let i = 0; i < targets.length; i++) {
        if (this._gen !== gen) return;
        this.progress = "Buscando contas a pagar · " + (i + 1) + " de " + targets.length;
        this.paintProgress();
        const part = await app.outcomeRange(bounds.start, bounds.end, targets[i]);
        if (Array.isArray(part)) bills.push.apply(bills, part);
      }
      rows = app.transform({ data: bills }) || [];
    } finally {
      app.noteProgress = prevNote;
    }
    if (this._gen !== gen) return;
    const seen = {};
    const pay = [];
    rows.forEach((r) => {
      if (!r || r.pago || r.substituido) return;
      if (r.natureza !== "programado" && r.natureza !== "previsao") return;
      const due = String(r.vencimento || "").slice(0, 10);
      if (!due || due < bounds.start || due > bounds.end) return;
      if (!this.companyWanted(r.companyId)) return;
      const key = r.titulo + "|" + (r.parcela || "") + "|" + due;
      if (seen[key]) return;
      seen[key] = true;
      const saldo = Number(r.saldo);
      const valor = Number.isFinite(saldo) && saldo > 0 ? saldo : (Number(r.valor) || 0);
      if (!(valor > 0)) return;
      pay.push({
        key,
        date: due,
        valor,
        titulo: r.titulo,
        parcela: r.parcela || "",
        credor: r.credor || "",
        documento: r.documento || "",
        docId: r.docId || "",
        docNome: r.docNome || "",
        companyId: r.companyId || "",
        plano: r.plano || "",
        ccNome: r.ccNome || "",
        natureza: r.natureza,
        tipoBaixa: r.tipoBaixa || "",
        conta: r.conta || "",
        operacao: r.operacao || ""
      });
    });
    const byDay = {};
    this.days.forEach((d) => { byDay[d.date] = d; d.pagar = 0; d.pagarItens = []; });
    pay.forEach((item) => {
      const day = byDay[item.date];
      if (!day) return;
      day.pagar += item.valor;
      day.pagarItens.push(item);
    });
    this.totals.pagar = pay.reduce((s, x) => s + x.valor, 0);
    this.progress = "";
    this.render();
  },

  toggle(iso) {
    this.openDay = this.openDay === iso ? "" : iso;
    this.render();
  },

  bindCompanyFilter() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    MlEmpresaFilter.bind("cxd-emp", {
      toggleOpen() {
        self.openEmp = !self.openEmp;
        self.render();
      },
      setQuery(q) {
        self.qEmp = q || "";
        const box = document.getElementById("cxd-emp-list");
        if (box && window.MlEmpresaFilter) {
          box.innerHTML = MlEmpresaFilter.listHtml({
            id: "cxd-emp",
            items: self.empItems(),
            selectedIds: self.companyIds,
            query: self.qEmp
          });
        }
      },
      toggleId(id, on) {
        const sid = String(id);
        if (on) {
          if (self.companyIds.indexOf(sid) < 0) self.companyIds.push(sid);
        } else {
          self.companyIds = self.companyIds.filter((x) => x !== sid);
        }
        self.openEmp = true;
        self.load();
      },
      selectAll() {
        self.companyIds = self.companies.map((c) => String(c.id));
        self.openEmp = true;
        self.load();
      },
      selectNone() {
        self.companyIds = [];
        self.openEmp = true;
        self.load();
      }
    });
  },

  async openTitulo(key) {
    let item = null;
    this.days.some((d) => {
      item = (d.pagarItens || []).find((p) => p.key === key) || null;
      return !!item;
    });
    if (!item) return;
    this.detail = { loading: true, error: "", item, bill: null, attachments: [], payment: null };
    this.render();
    try {
      const billId = item.titulo;
      const bill = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(billId), 1);
      let attachments = [];
      if (window.ComprasPrevisoesApp && typeof ComprasPrevisoesApp.anexosDoTitulo === "function") {
        try { attachments = await ComprasPrevisoesApp.anexosDoTitulo(billId); } catch (e) { attachments = []; }
      }
      const payment = await caixaFormaPagamento(billId, item.parcela || 1);
      if (!this.detail || this.detail.item.key !== key) return;
      this.detail.loading = false;
      this.detail.bill = bill || null;
      this.detail.attachments = attachments;
      this.detail.payment = payment;
      this.render();
    } catch (e) {
      if (!this.detail || this.detail.item.key !== key) return;
      this.detail.loading = false;
      this.detail.error = (e && e.message) ? e.message : "Não consegui abrir o título.";
      this.render();
    }
  },

  closeTitulo() {
    this.detail = null;
    this.render();
  },

  async baixarAnexo(billId, attachmentId, name) {
    const base = (window.SIENGE_CONFIG && window.SIENGE_CONFIG.baseUrl) || "/api/sienge-proxy";
    const path = "/bills/" + encodeURIComponent(billId) + "/attachments/" + encodeURIComponent(attachmentId);
    const headers = {};
    if (typeof getBasicAuthHeader === "function") headers.Authorization = getBasicAuthHeader();
    try {
      const res = await fetch(base + path, { headers });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name || ("titulo-" + billId + ".pdf");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      alert("Não foi possível baixar o anexo deste título.");
    }
  },

  detailHtml() {
    const det = this.detail;
    if (!det) return "";
    const item = det.item || {};
    const bill = det.bill || {};
    const credor = bill.creditorName || item.credor || "—";
    const doc = [item.docId || bill.documentIdentificationId, item.documento || bill.documentNumber].filter(Boolean).join(" ");
    const anexos = (det.attachments || []).map((a) => `
      <button type="button" class="btn btn-outline btn-sm" style="height:32px;" onclick="FluxoCaixaDiarioApp.baixarAnexo('${caixaEsc(item.titulo)}','${caixaEsc(a.id)}','${caixaEsc(a.name || "anexo.pdf")}')">${caixaEsc(a.description || a.name || "Anexo")}</button>
    `).join("");
    return `<div style="position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)FluxoCaixaDiarioApp.closeTitulo()">
      <div style="background:#fff;border-radius:12px;width:min(720px,96vw);max-height:86vh;overflow:auto;padding:18px 20px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <h3 style="margin:0;color:#105436;">Título ${caixaEsc(item.titulo)}${item.parcela ? " · parcela " + caixaEsc(item.parcela) : ""}</h3>
          <button type="button" class="btn btn-cancel btn-sm" onclick="FluxoCaixaDiarioApp.closeTitulo()">Fechar</button>
        </div>
        ${det.loading ? `<p style="color:#64748b;">Abrindo título, anexos e forma de pagamento…</p>` : ""}
        ${det.error ? `<p style="color:#b91c1c;">${caixaEsc(det.error)}</p>` : ""}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-top:12px;font-size:0.86rem;">
          <div><span style="color:#64748b;">Credor</span><div style="font-weight:700;">${caixaEsc(credor)}</div></div>
          <div><span style="color:#64748b;">Documento</span><div style="font-weight:700;">${caixaEsc(doc || "—")}</div></div>
          <div><span style="color:#64748b;">Empresa</span><div>${caixaEsc(this.companyName(item.companyId) || item.companyId || "—")}</div></div>
          <div><span style="color:#64748b;">Vencimento</span><div>${caixaFmtDate(item.date)}</div></div>
          <div><span style="color:#64748b;">Valor a pagar</span><div style="font-weight:700;color:#c2410c;">${caixaMoney(item.valor)}</div></div>
          <div><span style="color:#64748b;">Situação</span><div>${item.natureza === "previsao" ? "Previsão" : "Programado"}</div></div>
          <div><span style="color:#64748b;">Centro de custo</span><div>${caixaEsc(item.ccNome || "—")}</div></div>
          <div><span style="color:#64748b;">Plano financeiro</span><div>${caixaEsc(item.plano || "—")}</div></div>
        </div>
        ${bill.notes ? `<p style="margin:12px 0 0;font-size:0.84rem;"><strong>Observação:</strong> ${caixaEsc(bill.notes)}</p>` : ""}
        <h4 style="margin:16px 0 6px;color:#105436;font-size:0.92rem;">Forma de pagamento programada</h4>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:0.86rem;">${det.loading ? "" : caixaFormaHtml(det.payment, item)}</div>
        <h4 style="margin:16px 0 6px;color:#105436;font-size:0.92rem;">Anexos</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${anexos || `<span style="color:#64748b;font-size:0.84rem;">Este título não tem anexo.</span>`}</div>
      </div>
    </div>`;
  },

  render() {
    const root = document.getElementById("fluxo-caixa-diario-root");
    if (!root) return;
    const hoje = new Date().toISOString().slice(0, 10);
    let running = this.totals.saldo || 0;
    let entrarFrente = 0;
    let pagarFrente = 0;
    const rows = this.days.map((d) => {
      const futuro = d.date >= hoje;
      if (futuro) {
        running += (d.entrar || 0) - (d.pagar || 0);
        entrarFrente += d.entrar || 0;
        pagarFrente += d.pagar || 0;
      }
      const saldoDia = futuro ? running : null;
      const open = this.openDay === d.date;
      const has = (d.itens && d.itens.length) || (d.pagarItens && d.pagarItens.length);
      const entradas = open ? (d.itens || []).map((it) => `
        <tr style="background:#f3faf6;">
          <td></td>
          <td colspan="3" style="padding:6px 10px;font-size:0.78rem;">
            <span style="color:#105436;font-weight:700;">Entrada</span>
            · ${caixaEsc(it.cc)} / ${caixaEsc(it.unidade)} · ${caixaEsc(it.cliente || "—")}
            ${it.cpf ? ` · CPF ${caixaEsc(it.cpf)}` : ""}
            · venc. ${caixaFmtDate(it.vencimento)} + PMP ${it.pmp}d
          </td>
          <td style="text-align:right;padding:6px 10px;color:#105436;">${caixaMoney(it.valor)}</td>
        </tr>`).join("") : "";
      const saidas = open ? (d.pagarItens || []).map((it) => `
        <tr style="background:#fffaf6;cursor:pointer;" onclick="FluxoCaixaDiarioApp.openTitulo('${caixaEsc(it.key)}')">
          <td></td>
          <td colspan="3" style="padding:6px 10px;font-size:0.78rem;">
            <span style="color:#c2410c;font-weight:700;">${it.natureza === "previsao" ? "Previsão" : "A pagar"}</span>
            · tít. ${caixaEsc(it.titulo)}${it.parcela ? "/" + caixaEsc(it.parcela) : ""}
            · ${caixaEsc(it.credor || "—")}
            · ${caixaEsc(it.docId || "")} ${caixaEsc(it.documento || "")}
          </td>
          <td style="text-align:right;padding:6px 10px;color:#c2410c;">${caixaMoney(it.valor)}</td>
        </tr>`).join("") : "";
      return `<tr>
        <td style="padding:8px 12px;"><button type="button" onclick="FluxoCaixaDiarioApp.toggle('${d.date}')" style="border:none;background:none;cursor:pointer;color:#64748b;">${has ? (open ? "▾" : "▸") : "·"}</button></td>
        <td style="padding:8px 12px;font-weight:600;">${caixaFmtDate(d.date)}</td>
        <td style="padding:8px 12px;text-align:right;color:${d.entrar ? "#105436" : "#94a3b8"};">${caixaMoney(d.entrar || 0)}</td>
        <td style="padding:8px 12px;text-align:right;color:${d.pagar ? "#c2410c" : "#94a3b8"};">${caixaMoney(d.pagar || 0)}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:${saldoDia == null ? "#94a3b8" : (saldoDia < 0 ? "#b91c1c" : "#105436")};">${saldoDia == null ? "—" : caixaMoney(saldoDia)}</td>
      </tr>${entradas}${saidas}`;
    }).join("");
    const contas = (this.accounts || []).slice(0, 12).map((a) => `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;min-width:180px;">
        <div style="font-size:0.72rem;color:#64748b;">${caixaEsc(a.company || "Conta")} · ${caixaEsc(a.number || "")}</div>
        <div style="font-weight:700;">${caixaEsc(a.name)}</div>
        <div style="color:${a.amount < 0 ? "#b91c1c" : "#105436"};font-weight:700;">${caixaMoney(a.amount)}</div>
      </div>`).join("");
    const filtro = window.MlEmpresaFilter ? MlEmpresaFilter.html({
      id: "cxd-emp",
      label: "EMPRESAS",
      items: this.empItems(),
      selectedIds: this.companyIds,
      open: this.openEmp,
      query: this.qEmp,
      emptyMeansAll: true
    }) : "";
    const posicao = (this.totals.saldo || 0) + entrarFrente - pagarFrente;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 85px);">
        <div style="background:#105436;padding:16px 20px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;color:#fff;font-size:1.15rem;">Fluxo de caixa diário</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Saldo de hoje, o que entra (vencimento + PMP) e o que será pago no módulo de compras. Clique no título a pagar para ver anexos e a forma de pagamento.</p>
        </div>
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:14px 16px;overflow:auto;">
          <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap;">
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Mês
              <input type="month" value="${this.month}" onchange="FluxoCaixaDiarioApp.month=this.value;FluxoCaixaDiarioApp.load()"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            ${filtro}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;min-width:150px;"><div style="font-size:0.72rem;color:#64748b;">Saldo atual</div><strong style="color:#105436;">${caixaMoney(this.totals.saldo || 0)}</strong></div>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;min-width:150px;"><div style="font-size:0.72rem;color:#64748b;">A entrar no mês</div><strong style="color:#105436;">${caixaMoney(this.totals.entrar || 0)}</strong></div>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;min-width:150px;"><div style="font-size:0.72rem;color:#64748b;">A pagar no mês</div><strong style="color:#c2410c;">${caixaMoney(this.totals.pagar || 0)}</strong></div>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;min-width:170px;"><div style="font-size:0.72rem;color:#64748b;">Posição projetada</div><strong style="color:${posicao < 0 ? "#b91c1c" : "#105436"};">${caixaMoney(posicao)}</strong></div>
          </div>
          ${contas ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">${contas}${(this.accounts || []).length > 12 ? `<div style="align-self:center;color:#64748b;font-size:0.78rem;">+ ${(this.accounts.length - 12)} contas</div>` : ""}</div>` : ""}
          <p id="cxd-progress" style="margin:0 0 10px;color:#105436;font-size:0.8rem;font-weight:600;" ${this.progress ? "" : "hidden"}>${caixaEsc(this.progress || "")}</p>
          ${this.error ? `<div style="margin-bottom:10px;padding:10px;background:#fff7ed;color:#9a3412;border-radius:8px;font-size:0.82rem;">${caixaEsc(this.error)}</div>` : ""}
          ${this.loading ? `<p style="color:#64748b;">Montando o fluxo…</p>` : `
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="background:#f8fafc;color:#105436;">
                <th style="width:36px;"></th>
                <th style="text-align:left;padding:8px 12px;">Dia</th>
                <th style="text-align:right;padding:8px 12px;">A entrar</th>
                <th style="text-align:right;padding:8px 12px;">A pagar</th>
                <th style="text-align:right;padding:8px 12px;">Saldo projetado</th>
              </tr></thead>
              <tbody>${rows || `<tr><td colspan="5" style="padding:24px;text-align:center;color:#94a3b8;">Sem movimento neste mês.</td></tr>`}</tbody>
            </table>
          </div>`}
        </div>
      </div>
      ${this.detailHtml()}`;
    this.bindCompanyFilter();
    if (window.lucide) lucide.createIcons();
  }
};

const ResultadoCaixaApp = {
  date: "",
  compareDate: "",
  loading: false,
  saving: false,
  error: "",
  rows: [],
  compare: [],
  dates: [],

  init() {
    if (!this.date) this.date = new Date().toISOString().slice(0, 10);
    this.render();
    this.refresh();
  },

  async refresh() {
    this.loading = true;
    this.error = "";
    this.render();
    try {
      this.dates = await CaixaPosicaoStore.listDates();
      this.rows = await CaixaPosicaoStore.loadDate(this.date);
      this.compare = this.compareDate ? await CaixaPosicaoStore.loadDate(this.compareDate) : [];
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.loading = false;
    this.render();
  },

  async gravarHoje() {
    this.saving = true;
    this.error = "";
    this.render();
    try {
      const units = await CaixaPosicaoStore.loadEstoqueUnits();
      const today = (window.EstoqueComercialApp && typeof EstoqueComercialApp.todayStr === "function")
        ? EstoqueComercialApp.todayStr()
        : new Date().toISOString().slice(0, 10);
      await CaixaPosicaoStore.saveFromUnits(units, today);
      this.date = today;
      await this.refresh();
    } catch (e) {
      this.error = e.message || String(e);
      this.saving = false;
      this.render();
    }
  },

  sum(list, k) {
    return (list || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  },

  render() {
    const root = document.getElementById("resultado-caixa-root");
    if (!root) return;
    const rec = this.sum(this.rows, "rec");
    const ven = this.sum(this.rows, "ven");
    const av = this.sum(this.rows, "av");
    const vp = this.sum(this.rows, "vp");
    const rec2 = this.sum(this.compare, "rec");
    const ven2 = this.sum(this.compare, "ven");
    const av2 = this.sum(this.compare, "av");
    const vp2 = this.sum(this.compare, "vp");
    const dateOpts = this.dates.map((d) => `<option value="${d}" ${d === this.compareDate ? "selected" : ""}>${caixaFmtDate(d)}</option>`).join("");
    const body = this.rows.slice(0, 400).map((r) => `
      <tr>
        <td>${caixaEsc(r.cc)} / ${caixaEsc(r.un)}</td>
        <td>${caixaEsc(r.nome || "—")}</td>
        <td>${caixaEsc(r.cpf || "—")}</td>
        <td style="text-align:right;">${caixaMoney(r.rec)}</td>
        <td style="text-align:right;">${caixaMoney(r.ven)}</td>
        <td style="text-align:right;">${caixaMoney(r.av)}</td>
        <td style="text-align:right;">${caixaMoney(r.vp)}</td>
        <td style="text-align:right;">${r.pmp} d</td>
      </tr>`).join("");
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 85px);">
        <div style="background:#105436;padding:16px 20px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;color:#fff;font-size:1.15rem;">Resultado de caixa</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Posição diária no Firebase: unidade, cliente, CPF, recebido, vencido, a vencer e valor presente. O cron das 6:30 grava após o batimento.</p>
        </div>
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:14px 16px;overflow:auto;">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Posição
              <input type="date" value="${this.date}" onchange="ResultadoCaixaApp.date=this.value;ResultadoCaixaApp.refresh()"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Comparar com
              <select onchange="ResultadoCaixaApp.compareDate=this.value;ResultadoCaixaApp.refresh()"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
                <option value="">Nenhuma</option>${dateOpts}
              </select>
            </label>
            <button class="btn btn-primary" onclick="ResultadoCaixaApp.gravarHoje()" ${this.saving ? "disabled" : ""}>${this.saving ? "Gravando…" : "Gravar posição de hoje"}</button>
          </div>
          ${this.error ? `<div style="margin-bottom:10px;padding:10px;background:#fef2f2;color:#b91c1c;border-radius:8px;font-size:0.82rem;">${caixaEsc(this.error)}</div>` : ""}
          <div class="est-stock-kpis" style="margin-bottom:12px;">
            <div class="est-fin-card is-ok"><label>Recebido</label><strong>${caixaMoney(rec)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(rec2)}</small>` : ""}</div>
            <div class="est-fin-card is-warn"><label>Vencido</label><strong>${caixaMoney(ven)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(ven2)}</small>` : ""}</div>
            <div class="est-fin-card"><label>A vencer / a pagar</label><strong>${caixaMoney(av)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(av2)}</small>` : ""}</div>
            <div class="est-fin-card"><label>Valor presente</label><strong>${caixaMoney(vp)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(vp2)}</small>` : ""}</div>
          </div>
          ${this.loading ? `<p style="color:#64748b;">Carregando posição…</p>` : `
          <div class="table-container crm-scroll-table" style="max-height:52vh;background:#fff;border-radius:8px;">
            <table class="custom-table">
              <thead><tr>
                <th>Unidade</th><th>Cliente</th><th>CPF</th>
                <th>Recebido</th><th>Vencido</th><th>A vencer</th><th>Valor presente</th><th>PMP 3m</th>
              </tr></thead>
              <tbody>${body || `<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">Sem posição nesta data. Grave hoje ou aguarde o batimento das 6:30.</td></tr>`}</tbody>
            </table>
          </div>
          ${this.rows.length > 400 ? `<p style="font-size:0.8rem;color:#64748b;">Exibindo 400 de ${this.rows.length} contratos.</p>` : ""}`}
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }
};

window.CaixaPosicaoStore = CaixaPosicaoStore;
window.FluxoCaixaDiarioApp = FluxoCaixaDiarioApp;
window.ResultadoCaixaApp = ResultadoCaixaApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "fluxo-caixa-diario") FluxoCaixaDiarioApp.init();
  if (e.detail === "resultado-caixa") ResultadoCaixaApp.init();
});
