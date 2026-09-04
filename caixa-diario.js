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
  totals: { previsto: 0, titulos: 0 },

  init() {
    if (!this.month) {
      const n = new Date();
      this.month = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
    }
    this.render();
    this.load();
  },

  async load() {
    this.loading = true;
    this.error = "";
    this.render();
    try {
      const units = await CaixaPosicaoStore.loadEstoqueUnits();
      const [y, m] = this.month.split("-").map(Number);
      const start = `${this.month}-01`;
      const last = new Date(y, m, 0).getDate();
      const end = `${this.month}-${String(last).padStart(2, "0")}`;
      const byDay = {};
      let titulos = 0;
      units.forEach((u) => {
        if (u.quitado || u.relFin === "quitado") return;
        const pmp = Number(u.pmp3m) || 0;
        const parc = Array.isArray(u.openParcelas) ? u.openParcelas : [];
        parc.forEach((p) => {
          if (!p || !p.due || p.overdue) return;
          const prev = caixaAddDays(p.due, pmp);
          if (prev < start || prev > end) return;
          if (!byDay[prev]) byDay[prev] = { date: prev, valor: 0, itens: [] };
          byDay[prev].valor += Number(p.val) || 0;
          byDay[prev].itens.push({
            unidade: u.name,
            cc: u.enterpriseId,
            cliente: u.customerName || "",
            cpf: u.customerDoc || "",
            vencimento: p.due,
            pmp,
            previsto: prev,
            valor: Number(p.val) || 0
          });
          titulos += 1;
        });
      });
      const days = [];
      for (let d = 1; d <= last; d++) {
        const iso = `${this.month}-${String(d).padStart(2, "0")}`;
        days.push(byDay[iso] || { date: iso, valor: 0, itens: [] });
      }
      this.days = days;
      this.totals = { previsto: days.reduce((s, x) => s + x.valor, 0), titulos };
      if (!units.some((u) => Array.isArray(u.openParcelas) && u.openParcelas.length)) {
        this.error = "Ainda não há parcelas abertas no estoque. Rode o batimento da Posição de estoque para calcular o PMP dos últimos 3 meses.";
      }
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.loading = false;
    this.render();
  },

  toggle(iso) {
    this.openDay = this.openDay === iso ? "" : iso;
    this.render();
  },

  render() {
    const root = document.getElementById("fluxo-caixa-diario-root");
    if (!root) return;
    const rows = this.days.map((d) => {
      const open = this.openDay === d.date;
      const kids = open ? d.itens.map((it) => `
        <tr style="background:#f8fafc;">
          <td></td>
          <td colspan="2" style="padding:6px 10px;font-size:0.78rem;">
            ${caixaEsc(it.cc)} / ${caixaEsc(it.unidade)} · ${caixaEsc(it.cliente || "—")}
            ${it.cpf ? ` · CPF ${caixaEsc(it.cpf)}` : ""}
            · venc. ${caixaFmtDate(it.vencimento)} + PMP ${it.pmp}d
          </td>
          <td style="text-align:right;padding:6px 10px;">${caixaMoney(it.valor)}</td>
        </tr>`).join("") : "";
      return `<tr>
        <td style="padding:8px 12px;"><button type="button" onclick="FluxoCaixaDiarioApp.toggle('${d.date}')" style="border:none;background:none;cursor:pointer;color:#64748b;">${d.itens.length ? (open ? "▾" : "▸") : "·"}</button></td>
        <td style="padding:8px 12px;font-weight:600;">${caixaFmtDate(d.date)}</td>
        <td style="padding:8px 12px;">${d.itens.length} parcela(s)</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:${d.valor ? "#105436" : "#94a3b8"};">${caixaMoney(d.valor)}</td>
      </tr>${kids}`;
    }).join("");
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 85px);">
        <div style="background:#105436;padding:16px 20px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;color:#fff;font-size:1.15rem;">Fluxo de caixa diário</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Previsão de recebimento = vencimento + PMP dos últimos 3 meses (ex.: PMP 5 → vence dia 10, entra no caixa dia 15).</p>
        </div>
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:14px 16px;overflow:auto;">
          <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap;">
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Mês
              <input type="month" value="${this.month}" onchange="FluxoCaixaDiarioApp.month=this.value;FluxoCaixaDiarioApp.load()"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <div style="font-size:0.85rem;color:#334155;">Previsto no mês: <strong>${caixaMoney(this.totals.previsto)}</strong> · ${this.totals.titulos} parcela(s)</div>
          </div>
          ${this.error ? `<div style="margin-bottom:10px;padding:10px;background:#fff7ed;color:#9a3412;border-radius:8px;font-size:0.82rem;">${caixaEsc(this.error)}</div>` : ""}
          ${this.loading ? `<p style="color:#64748b;">Montando a previsão…</p>` : `
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="background:#f8fafc;">
                <th style="width:36px;"></th>
                <th style="text-align:left;padding:8px 12px;">Dia (previsão de caixa)</th>
                <th style="text-align:left;padding:8px 12px;">Parcelas</th>
                <th style="text-align:right;padding:8px 12px;">Valor previsto</th>
              </tr></thead>
              <tbody>${rows || `<tr><td colspan="4" style="padding:24px;text-align:center;color:#94a3b8;">Sem previsão neste mês.</td></tr>`}</tbody>
            </table>
          </div>`}
        </div>
      </div>`;
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
