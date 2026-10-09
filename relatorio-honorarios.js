function rhonEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rhonMoney(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rhonIso(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return "";
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}

function rhonBr(iso) {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
}

function rhonAppState() {
  return typeof AppState !== "undefined" ? AppState : (window.AppState || null);
}

function rhonCustomer(customerId) {
  const st = rhonAppState();
  const list = st && st.customers;
  let c = null;
  if (Array.isArray(list)) c = list.find((x) => String(x && x.id) === String(customerId)) || null;
  else if (list) c = list[customerId] || null;
  let name = String((c && (c.name || c.customerName || c.clientName)) || "").trim();
  let doc = String((c && (c.cpfCnpj || c.cpf || c.cnpj || c.document)) || "").trim();
  const txt = (id) => {
    const el = document.getElementById(id);
    const v = el ? String(el.textContent || "").trim() : "";
    return /^carregando/i.test(v) ? "" : v;
  };
  if (!name) name = txt("det-name");
  if (!doc) doc = txt("det-cpf");
  return { name, doc };
}

function rhonCompanyName(id) {
  if (id == null || id === "") return "";
  try {
    if (typeof getCompanyName === "function") return getCompanyName(id);
  } catch (e) {}
  return "Empresa #" + id;
}

function rhonEnterpriseName(id) {
  if (id == null || id === "") return "";
  try {
    if (window.AuditService && typeof AuditService.resolveEnterpriseName === "function") {
      return AuditService.resolveEnterpriseName(id) || "";
    }
  } catch (e) {}
  return "";
}

function rhonBoletoKey(billId, instIds, dueDate, genDate) {
  const ids = (instIds || []).map(String).sort().join(",");
  return [billId, ids, String(dueDate || "").slice(0, 10), genDate].join("|");
}

function rhonFindInst(list, id, number) {
  const arr = Array.isArray(list) ? list : [];
  return arr.find((i) => String(i.installmentId) === String(id))
    || (number != null ? arr.find((i) => String(i.installmentNumber) === String(number)) : null)
    || arr.find((i) => String(i.installmentNumber) === String(id))
    || null;
}

const HonorariosReport = {
  COLLECTION: "boletos_honorarios",
  _inited: false,
  comp: "",
  loading: false,
  progress: "",
  error: "",
  records: [],
  rows: [],
  companyIds: [],
  openEmp: false,
  qEmp: "",
  status: "todos",
  soHon: false,
  search: "",

  async record(ctx) {
    if (!window.firebaseDb || !window.firebaseCollections) return;
    const { doc, setDoc } = window.firebaseCollections;
    const st = rhonAppState();
    const insts = (st && st.currentContractInstallments) || [];
    const now = new Date();
    const genDate = rhonIso(now);
    const honPct = Number(ctx.honPct) || 0;
    const taxa = Number.isFinite(Number(ctx.taxa)) ? Number(ctx.taxa) : 1;
    const parcelas = (ctx.instIds || []).map((id) => {
      const inst = rhonFindInst(insts, id);
      const valorOriginal = Number(inst && (inst.value != null ? inst.value : inst.currentBalance)) || 0;
      const saldo = Number(inst && (inst.currentBalance != null ? inst.currentBalance : inst.value)) || 0;
      const dias = inst && typeof window.daysOverdueUntilTarget === "function"
        ? window.daysOverdueUntilTarget(inst, ctx.dueDate)
        : 0;
      const pack = typeof window.moraComHonorarios === "function"
        ? window.moraComHonorarios(saldo, dias, taxa, honPct)
        : { multa: 0, jurosPadrao: 0, honorarios: 0 };
      return {
        installmentId: String(id),
        installmentNumber: inst && inst.installmentNumber != null ? String(inst.installmentNumber) : "",
        conditionType: String((inst && inst.conditionType) || ""),
        dueDate: String((inst && inst.dueDate) || "").slice(0, 10),
        valorOriginal,
        saldo,
        dias,
        multa: Number(pack.multa) || 0,
        juros: Number(pack.jurosPadrao) || 0,
        honorarios: Number(pack.honorarios) || 0
      };
    });
    const sum = (k) => parcelas.reduce((s, p) => s + (Number(p[k]) || 0), 0);
    const cust = rhonCustomer(ctx.customerId);
    const u = (st && st.currentUser) || {};
    const terc = typeof window.isOperadorCobrancaTerceirizadoProfile === "function"
      && window.isOperadorCobrancaTerceirizadoProfile(u.profile_name);
    const id = String(ctx.billId) + "_" + now.getTime();
    const rec = {
      id,
      key: rhonBoletoKey(ctx.billId, ctx.instIds, ctx.dueDate, genDate),
      competencia: genDate.slice(0, 7),
      generatedAt: now.toISOString(),
      generatedDate: genDate,
      source: String(ctx.source || ""),
      author: u.name || window.LOGGED_USER_NAME || "",
      authorEmail: String(u.email || "").toLowerCase(),
      authorProfile: u.profile_name || "",
      terceirizado: !!terc,
      companyId: ctx.companyId != null ? String(ctx.companyId) : "",
      companyName: rhonCompanyName(ctx.companyId),
      enterpriseId: ctx.enterpriseId != null ? String(ctx.enterpriseId) : "",
      enterpriseName: rhonEnterpriseName(ctx.enterpriseId),
      unitId: ctx.unitId != null ? String(ctx.unitId) : "",
      unitName: String(ctx.unitName || ""),
      customerId: ctx.customerId != null ? String(ctx.customerId) : "",
      customerName: cust.name,
      customerDoc: cust.doc,
      billId: String(ctx.billId),
      contractNumber: String(ctx.contractNumber || ""),
      boletoDueDate: String(ctx.dueDate || "").slice(0, 10),
      finePct: Number(ctx.fine) || 0,
      interestPct: Number(ctx.interest) || 0,
      honorariosPct: honPct,
      taxa,
      parcelas,
      totais: {
        valorOriginal: sum("valorOriginal"),
        multa: sum("multa"),
        juros: sum("juros"),
        honorarios: sum("honorarios")
      }
    };
    await setDoc(doc(window.firebaseDb, this.COLLECTION, id), rec);
  },

  init() {
    if (!this.comp) this.comp = rhonIso(new Date()).slice(0, 7);
    if (!this._inited) {
      this._inited = true;
      this.bindCompanyFilter();
      this.load();
      return;
    }
    this.render();
  },

  async loadRecords(comp) {
    const { collection, getDocs, query, where } = window.firebaseCollections;
    const snap = await getDocs(query(collection(window.firebaseDb, this.COLLECTION), where("competencia", "==", comp)));
    const out = [];
    snap.forEach((d) => out.push(d.data() || {}));
    return out;
  },

  /** Boletos gerados antes do registro próprio: reconstruídos pela auditoria (BOLETO_GERADO). */
  async loadAuditRecords(comp, knownKeys) {
    const { collection, getDocs, query, where } = window.firebaseCollections;
    let snap;
    try {
      snap = await getDocs(query(collection(window.firebaseDb, "auditoria_logs"), where("action", "==", "BOLETO_GERADO")));
    } catch (e) {
      console.warn("[Honorários] auditoria", e);
      return [];
    }
    const out = [];
    snap.forEach((d) => {
      const a = d.data() || {};
      if (String(a.status || "ok") === "erro") return;
      const genDate = rhonIso(a.timestamp);
      if (!genDate || genDate.slice(0, 7) !== comp) return;
      const det = a.details || {};
      if (det.truncated) return;
      const billId = String(det.receivableBillId || a.titleId || "");
      const instIds = (det.installmentIds || []).map(String);
      if (!billId || !instIds.length) return;
      const key = rhonBoletoKey(billId, instIds, det.newDueDate, genDate);
      if (knownKeys.has(key)) return;
      knownKeys.add(key);
      const label = String(a.customerLabel || "");
      const nameFromLabel = label.includes("—") ? label.split("—").slice(1).join("—").trim() : "";
      const cust = a.customerId ? rhonCustomer(a.customerId) : { name: "", doc: "" };
      const fine = Number(det.finePercentage) || 0;
      out.push({
        id: "audit_" + (a.id || d.id),
        key,
        competencia: comp,
        generatedAt: a.timestamp,
        generatedDate: genDate,
        source: String(det.source || ""),
        author: a.user || "",
        authorEmail: a.userEmail || "",
        companyId: det.companyId != null ? String(det.companyId) : "",
        companyName: rhonCompanyName(det.companyId),
        enterpriseId: String(a.enterpriseId || det.enterpriseId || det.costCenterId || ""),
        enterpriseName: a.enterpriseName || rhonEnterpriseName(a.enterpriseId || det.enterpriseId),
        unitId: String(a.unitId || det.unitId || ""),
        unitName: String(a.unitName || det.unitName || ""),
        customerId: String(a.customerId || ""),
        customerName: nameFromLabel || cust.name,
        customerDoc: cust.doc,
        billId,
        contractNumber: String(det.contractNumber || ""),
        boletoDueDate: String(det.newDueDate || "").slice(0, 10),
        finePct: fine,
        interestPct: Number(det.interestPercentage) || 0,
        honorariosPct: Number(det.honorariosPct) || 0,
        taxa: fine > 0 ? fine / 2 : 0,
        parcelas: instIds.map((id) => ({ installmentId: id, pendingValues: true })),
        estimated: true
      });
    });
    return out;
  },

  async loadStatements(customerIds) {
    const map = {};
    const ids = [...new Set(customerIds.filter(Boolean).map(String))];
    let idx = 0;
    let done = 0;
    const worker = async () => {
      while (idx < ids.length) {
        const cid = ids[idx++];
        try {
          const res = window.SiengeApiService && typeof SiengeApiService.getCustomerFinancialStatements === "function"
            ? await SiengeApiService.getCustomerFinancialStatements(cid)
            : null;
          if (res) {
            const bills = typeof window.flattenFinancialStatementBills === "function"
              ? window.flattenFinancialStatementBills(res)
              : [];
            const byBill = {};
            bills.forEach((b) => {
              const bid = String(b.billReceivableId || b.receivableBillId || b.id || "");
              if (bid) byBill[bid] = (byBill[bid] || []).concat(b.installments || []);
            });
            map[cid] = byBill;
          }
        } catch (e) {
          console.warn("[Honorários] extrato", cid, e);
        }
        done += 1;
        this.progress = `Consultando pagamentos no Sienge: ${done} de ${ids.length} cliente(s)...`;
        this.renderProgress();
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, ids.length) }, worker));
    return map;
  },

  paymentInfo(inst, genDate) {
    const receipts = Array.isArray(inst.receipts) ? inst.receipts : [];
    const bal = inst.currentBalance != null ? Number(inst.currentBalance)
      : (inst.balanceDue != null ? Number(inst.balanceDue) : null);
    const settled = typeof installmentIsSettled === "function"
      ? installmentIsSettled(inst)
      : ((bal != null && bal <= 0.009) || receipts.length > 0);
    if (!settled) return { paid: false, paidAt: "", paidValue: 0 };
    const dated = receipts.map((r) => ({
      date: String(r.receiptDate || r.paymentDate || r.date || "").slice(0, 10),
      value: Number(r.receiptValue || r.netReceiptValue || r.value || 0) || 0
    }));
    const after = dated.filter((r) => r.date && r.date >= genDate);
    const use = after.length ? after : dated;
    const paidAt = use.reduce((m, r) => (r.date > m ? r.date : m), "");
    return { paid: true, paidAt, paidValue: use.reduce((s, r) => s + r.value, 0) };
  },

  buildRows(records, statements) {
    const today = rhonIso(new Date());
    const rows = [];
    records.forEach((rec) => {
      const stmt = statements[String(rec.customerId)] || null;
      const stInsts = stmt ? (stmt[String(rec.billId)] || []) : null;
      (rec.parcelas || []).forEach((p) => {
        const inst = stInsts ? rhonFindInst(stInsts, p.installmentId, p.installmentNumber || null) : null;
        let vals = p;
        if (p.pendingValues) {
          vals = { installmentId: p.installmentId, valorOriginal: 0, multa: 0, juros: 0, honorarios: 0, dueDate: "" };
          if (inst) {
            const orig = Number(inst.originalValue || inst.installmentValue || inst.value || 0) || 0;
            const bal = Number(inst.currentBalance);
            const base = Number.isFinite(bal) && bal > 0.009 ? bal : orig;
            const dueDate = String(inst.dueDate || "").slice(0, 10);
            const dias = typeof window.daysOverdueUntilTarget === "function"
              ? window.daysOverdueUntilTarget({ dueDate }, rec.boletoDueDate)
              : 0;
            const pack = typeof window.moraComHonorarios === "function"
              ? window.moraComHonorarios(base, dias, rec.taxa, rec.honorariosPct)
              : { multa: 0, jurosPadrao: 0, honorarios: 0 };
            vals = {
              installmentId: p.installmentId,
              installmentNumber: inst.installmentNumber != null ? String(inst.installmentNumber) : "",
              conditionType: String(inst.conditionType || inst.paymentConditionType || ""),
              dueDate,
              valorOriginal: orig,
              multa: Number(pack.multa) || 0,
              juros: Number(pack.jurosPadrao) || 0,
              honorarios: Number(pack.honorarios) || 0
            };
          }
        }
        let status = "aberto";
        let paidAt = "";
        let paidValue = 0;
        if (!stmt) status = "naoverificado";
        else if (!inst) status = "naolocalizada";
        else {
          const pay = this.paymentInfo(inst, rec.generatedDate);
          if (pay.paid) {
            status = "pago";
            paidAt = pay.paidAt;
            paidValue = pay.paidValue;
          } else if (rec.boletoDueDate && rec.boletoDueDate < today) {
            status = "vencido";
          }
        }
        const parcLabel = [vals.conditionType, vals.installmentNumber || vals.installmentId].filter(Boolean).join(" ");
        rows.push({
          recId: rec.id,
          companyId: String(rec.companyId || ""),
          companyName: rec.companyName || rhonCompanyName(rec.companyId),
          enterpriseId: String(rec.enterpriseId || ""),
          enterpriseName: rec.enterpriseName || rhonEnterpriseName(rec.enterpriseId),
          customerId: rec.customerId,
          customerName: rec.customerName || (rec.customerId ? "Cliente " + rec.customerId : ""),
          customerDoc: rec.customerDoc || "",
          billId: rec.billId,
          contractNumber: rec.contractNumber || "",
          unitName: rec.unitName || "",
          parcela: parcLabel,
          dueDate: vals.dueDate || "",
          boletoDueDate: rec.boletoDueDate || "",
          valorOriginal: Number(vals.valorOriginal) || 0,
          multa: Number(vals.multa) || 0,
          juros: Number(vals.juros) || 0,
          honorarios: Number(vals.honorarios) || 0,
          honorariosPct: Number(rec.honorariosPct) || 0,
          status,
          paidAt,
          paidValue,
          generatedAt: rec.generatedAt || "",
          author: rec.author || "",
          estimated: !!(rec.estimated || p.pendingValues)
        });
      });
    });
    return rows;
  },

  async load() {
    if (this.loading) return;
    if (!window.firebaseDb || !window.firebaseCollections) {
      this.error = "Firebase indisponível. Atualize a página.";
      this.render();
      return;
    }
    this.loading = true;
    this.error = "";
    this.progress = "Carregando boletos gerados...";
    this.render();
    try {
      const comp = this.comp;
      const records = await this.loadRecords(comp);
      const keys = new Set(records.map((r) => r.key).filter(Boolean));
      const fromAudit = await this.loadAuditRecords(comp, keys);
      const all = records.concat(fromAudit);
      const statements = await this.loadStatements(all.map((r) => r.customerId));
      if (comp !== this.comp) return;
      this.records = all;
      this.rows = this.buildRows(all, statements);
    } catch (e) {
      console.error("[Honorários] relatório", e);
      this.error = "Não foi possível carregar o relatório: " + (e && e.message ? e.message : e);
      this.rows = [];
    } finally {
      this.loading = false;
      this.progress = "";
      this.render();
    }
  },

  setComp(v) {
    const s = String(v || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(s) || s === this.comp) return;
    this.comp = s;
    this.rows = [];
    this.records = [];
    this.load();
  },

  setStatus(v) { this.status = v || "todos"; this.render(); },
  setSoHon(on) { this.soHon = !!on; this.render(); },
  setSearch(v) {
    this.search = String(v || "");
    clearTimeout(this._searchT);
    this._searchT = setTimeout(() => this.render(), 200);
  },

  empItems() {
    const map = {};
    this.rows.forEach((r) => {
      if (!r.companyId || map[r.companyId]) return;
      map[r.companyId] = { id: r.companyId, label: r.companyId + " - " + String(r.companyName || "").toUpperCase() };
    });
    return Object.values(map);
  },

  bindCompanyFilter() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    MlEmpresaFilter.bind("rhon-emp", {
      toggleOpen() { self.openEmp = !self.openEmp; self.render(); },
      close() { self.openEmp = false; self.render(); },
      setQuery(q) {
        self.qEmp = q || "";
        const box = document.getElementById("rhon-emp-list");
        if (box) box.innerHTML = MlEmpresaFilter.listHtml({ id: "rhon-emp", items: self.empItems(), selectedIds: self.companyIds, query: self.qEmp });
      },
      toggleId(id, on) {
        const sid = String(id);
        const set = new Set(self.companyIds);
        if (on) set.add(sid); else set.delete(sid);
        self.companyIds = [...set];
        self.render();
      },
      selectAll() { self.companyIds = self.empItems().map((x) => String(x.id)); self.render(); },
      selectNone() { self.companyIds = []; self.render(); }
    });
  },

  filtered() {
    const emp = new Set(this.companyIds);
    const q = this.search.trim().toLowerCase();
    return this.rows.filter((r) => {
      if (emp.size && !emp.has(r.companyId)) return false;
      if (this.soHon && !(r.honorarios > 0.004)) return false;
      if (this.status === "pago" && r.status !== "pago") return false;
      if (this.status === "aberto" && r.status === "pago") return false;
      if (this.status === "vencido" && r.status !== "vencido") return false;
      if (q) {
        const blob = [r.customerName, r.customerDoc, r.billId, r.contractNumber, r.unitName].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  },

  grouped(rows) {
    const byEmp = {};
    rows.forEach((r) => {
      const ek = r.companyId || "-";
      if (!byEmp[ek]) byEmp[ek] = { id: r.companyId, name: r.companyName, ccs: {} };
      const ck = r.enterpriseId || "-";
      if (!byEmp[ek].ccs[ck]) byEmp[ek].ccs[ck] = { id: r.enterpriseId, name: r.enterpriseName, rows: [] };
      byEmp[ek].ccs[ck].rows.push(r);
    });
    const num = (a, b) => (Number(a) || 0) - (Number(b) || 0) || String(a).localeCompare(String(b), "pt-BR", { numeric: true });
    return Object.values(byEmp).sort((a, b) => num(a.id, b.id)).map((e) => ({
      ...e,
      ccs: Object.values(e.ccs).sort((a, b) => num(a.id, b.id)).map((c) => ({
        ...c,
        rows: c.rows.sort((a, b) => String(a.customerName).localeCompare(String(b.customerName), "pt-BR")
          || num(a.billId, b.billId) || String(a.dueDate).localeCompare(String(b.dueDate)))
      }))
    }));
  },

  totals(rows) {
    return rows.reduce((t, r) => {
      t.valorOriginal += r.valorOriginal;
      t.multa += r.multa;
      t.juros += r.juros;
      t.honorarios += r.honorarios;
      if (r.status === "pago") t.honPagos += r.honorarios;
      return t;
    }, { valorOriginal: 0, multa: 0, juros: 0, honorarios: 0, honPagos: 0 });
  },

  statusHtml(r) {
    const map = {
      pago: ["Pago", "rhon-st-pago"],
      aberto: ["Em aberto", "rhon-st-aberto"],
      vencido: ["Vencido", "rhon-st-vencido"],
      naolocalizada: ["Não localizada", "rhon-st-nd"],
      naoverificado: ["Não verificado", "rhon-st-nd"]
    };
    const m = map[r.status] || map.aberto;
    const extra = r.status === "pago" && r.paidAt ? `<div class="rhon-paid-at">${rhonBr(r.paidAt)}</div>` : "";
    return `<span class="rhon-st ${m[1]}">${m[0]}</span>${extra}`;
  },

  statusLabel(r) {
    return ({ pago: "Pago", aberto: "Em aberto", vencido: "Vencido", naolocalizada: "Não localizada", naoverificado: "Não verificado" })[r.status] || "Em aberto";
  },

  renderProgress() {
    const el = document.getElementById("rhon-progress");
    if (el) el.textContent = this.progress;
  },

  tableHtml(rows) {
    if (!rows.length) {
      return `<div class="rhon-empty">${this.rows.length ? "Nenhum boleto com esses filtros." : "Nenhum boleto gerado nesta competência."}</div>`;
    }
    const sumCells = (t) => `
      <td class="rhon-num">${rhonMoney(t.valorOriginal)}</td>
      <td class="rhon-num">${rhonMoney(t.multa)}</td>
      <td class="rhon-num">${rhonMoney(t.juros)}</td>
      <td class="rhon-num">${rhonMoney(t.honorarios)}</td>`;
    const body = this.grouped(rows).map((e) => {
      const te = this.totals(e.ccs.flatMap((c) => c.rows));
      const ccHtml = e.ccs.map((c) => {
        const tc = this.totals(c.rows);
        const lines = c.rows.map((r) => `<tr>
          <td><div class="rhon-cli">${rhonEsc(r.customerName)}</div><div class="rhon-sub">${rhonEsc(r.customerDoc)}</div></td>
          <td>${rhonEsc(r.billId)}${r.unitName ? `<div class="rhon-sub">${rhonEsc(r.unitName)}</div>` : ""}</td>
          <td>${rhonEsc(r.parcela)}</td>
          <td>${rhonBr(r.dueDate)}</td>
          <td>${rhonBr(r.boletoDueDate)}</td>
          <td class="rhon-num">${rhonMoney(r.valorOriginal)}</td>
          <td class="rhon-num">${rhonMoney(r.multa)}</td>
          <td class="rhon-num">${rhonMoney(r.juros)}</td>
          <td class="rhon-num rhon-hon">${rhonMoney(r.honorarios)}${r.honorariosPct ? `<div class="rhon-sub">${String(r.honorariosPct).replace(".", ",")}%</div>` : ""}${r.estimated ? `<span class="rhon-est" title="Boleto anterior ao registro: valores calculados pela auditoria e pelo extrato do Sienge">estimado</span>` : ""}</td>
          <td>${this.statusHtml(r)}</td>
          <td><div>${rhonBr(rhonIso(r.generatedAt))}</div><div class="rhon-sub">${rhonEsc(r.author)}</div></td>
        </tr>`).join("");
        return `<tr class="rhon-cc"><td colspan="5">${rhonEsc([c.id, c.name].filter(Boolean).join(" - ") || "Sem centro de custo")}</td>${sumCells(tc)}<td colspan="2"></td></tr>${lines}`;
      }).join("");
      return `<tr class="rhon-emp"><td colspan="5">${rhonEsc([e.id, e.name].filter(Boolean).join(" - ") || "Sem empresa")}</td>${sumCells(te)}<td colspan="2"></td></tr>${ccHtml}`;
    }).join("");
    const t = this.totals(rows);
    return `<div class="rhon-wrap"><table class="rhon-table">
      <thead><tr>
        <th>Cliente</th><th>Título</th><th>Parcela</th><th>Vencimento</th><th>Venc. boleto</th>
        <th class="rhon-num">Valor original</th><th class="rhon-num">Multa</th><th class="rhon-num">Juros</th><th class="rhon-num">Honorários</th>
        <th>Status</th><th>Gerado em</th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="5">Total geral</td>${sumCells(t)}<td colspan="2"></td></tr></tfoot>
    </table></div>`;
  },

  render() {
    const root = document.getElementById("relatorios-cr-root");
    if (!root) return;
    this.injectCss();
    const prevWrap = root.querySelector(".rhon-wrap");
    const scroll = prevWrap ? { top: prevWrap.scrollTop, left: prevWrap.scrollLeft } : null;
    const searchFocused = document.activeElement && document.activeElement.id === "rhon-search";
    const rows = this.filtered();
    const t = this.totals(rows);
    const boletos = new Set(rows.map((r) => r.recId)).size;
    const pagas = rows.filter((r) => r.status === "pago").length;
    const filtro = window.MlEmpresaFilter ? MlEmpresaFilter.html({
      id: "rhon-emp",
      label: "EMPRESAS",
      items: this.empItems(),
      selectedIds: this.companyIds,
      open: this.openEmp,
      query: this.qEmp,
      emptyMeansAll: true
    }) : "";
    root.innerHTML = `
      <div class="rhon-page">
        <div class="rhon-head">
          <h2>Relatórios</h2>
          <p>Contas a receber</p>
        </div>
        <div class="rhon-body">
          <div class="rhon-tabs"><button type="button" class="rhon-tab is-active">Honorários</button></div>
          <div class="rhon-tools">
            <div class="ml-comp-slot">
              <label class="ml-comp-label" for="rhon-comp">Competência</label>
              <input type="month" id="rhon-comp" class="ml-comp-input" value="${rhonEsc(this.comp)}" ${this.loading ? "disabled" : ""}
                onchange="HonorariosReport.setComp(this.value)">
            </div>
            <button type="button" class="btn btn-primary rhon-btn" onclick="HonorariosReport.load()" ${this.loading ? "disabled" : ""}>
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Atualizar
            </button>
            <div class="rhon-emp-slot">${filtro}</div>
            <div class="rhon-field">
              <label for="rhon-status">Status</label>
              <select id="rhon-status" onchange="HonorariosReport.setStatus(this.value)">
                <option value="todos" ${this.status === "todos" ? "selected" : ""}>Todos</option>
                <option value="pago" ${this.status === "pago" ? "selected" : ""}>Pagos</option>
                <option value="aberto" ${this.status === "aberto" ? "selected" : ""}>Não pagos</option>
                <option value="vencido" ${this.status === "vencido" ? "selected" : ""}>Vencidos</option>
              </select>
            </div>
            <div class="rhon-field rhon-grow">
              <label for="rhon-search">Buscar</label>
              <input type="text" id="rhon-search" placeholder="Cliente, CPF, título ou unidade" value="${rhonEsc(this.search)}"
                oninput="HonorariosReport.setSearch(this.value)">
            </div>
            <label class="rhon-switch-line">
              <span class="moura-switch">
                <input type="checkbox" ${this.soHon ? "checked" : ""} onchange="HonorariosReport.setSoHon(this.checked)">
                <span class="moura-switch-track" aria-hidden="true"></span>
              </span>
              Só com honorários
            </label>
            <button type="button" class="btn btn-excel" onclick="HonorariosReport.exportExcel()" title="Exportar tabela atual para Excel" ${rows.length ? "" : "disabled"}>
              <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel
            </button>
          </div>
          ${this.error ? `<div class="rhon-error">${rhonEsc(this.error)}</div>` : ""}
          ${this.loading ? `<div class="rhon-loading"><div class="rhon-spin"></div><span id="rhon-progress">${rhonEsc(this.progress)}</span></div>` : `
          <div class="rhon-cards">
            <div class="rhon-card"><span>Boletos gerados</span><strong>${boletos}</strong></div>
            <div class="rhon-card"><span>Parcelas pagas</span><strong>${pagas} de ${rows.length}</strong></div>
            <div class="rhon-card"><span>Honorários gerados</span><strong>R$ ${rhonMoney(t.honorarios)}</strong></div>
            <div class="rhon-card rhon-card-main"><span>Honorários pagos (repasse)</span><strong>R$ ${rhonMoney(t.honPagos)}</strong></div>
          </div>
          ${this.tableHtml(rows)}`}
        </div>
      </div>`;
    if (scroll) {
      const w = root.querySelector(".rhon-wrap");
      if (w) { w.scrollTop = scroll.top; w.scrollLeft = scroll.left; }
    }
    if (searchFocused) {
      const s = document.getElementById("rhon-search");
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }
    if (window.lucide) lucide.createIcons();
  },

  exportExcel() {
    const rows = this.filtered();
    if (!rows.length) {
      alert("Não há boletos para exportar neste filtro.");
      return;
    }
    if (typeof XLSX === "undefined") {
      alert("A biblioteca XLSX não foi carregada. Atualize a página e tente novamente.");
      return;
    }
    const aoa = [[
      "Competência", "Empresa", "Centro de custo", "Cliente", "CPF/CNPJ", "Título", "Contrato", "Unidade", "Parcela",
      "Vencimento", "Vencimento do boleto", "Valor original", "Multa", "Juros", "Honorários (%)", "Honorários",
      "Status", "Pago em", "Valor recebido", "Gerado em", "Gerado por", "Estimado"
    ]];
    this.grouped(rows).forEach((e) => e.ccs.forEach((c) => c.rows.forEach((r) => {
      aoa.push([
        this.comp,
        [e.id, e.name].filter(Boolean).join(" - "),
        [c.id, c.name].filter(Boolean).join(" - "),
        r.customerName,
        r.customerDoc,
        r.billId,
        r.contractNumber,
        r.unitName,
        r.parcela,
        rhonBr(r.dueDate),
        rhonBr(r.boletoDueDate),
        Number(r.valorOriginal.toFixed(2)),
        Number(r.multa.toFixed(2)),
        Number(r.juros.toFixed(2)),
        r.honorariosPct || 0,
        Number(r.honorarios.toFixed(2)),
        this.statusLabel(r),
        rhonBr(r.paidAt),
        r.paidValue ? Number(r.paidValue.toFixed(2)) : "",
        rhonBr(rhonIso(r.generatedAt)),
        r.author,
        r.estimated ? "Sim" : ""
      ]);
    })));
    const t = this.totals(rows);
    aoa.push(["Total", "", "", "", "", "", "", "", "", "", "",
      Number(t.valorOriginal.toFixed(2)), Number(t.multa.toFixed(2)), Number(t.juros.toFixed(2)), "",
      Number(t.honorarios.toFixed(2)), "", "", "", "", "", ""]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Honorarios");
    XLSX.writeFile(wb, "relatorio_honorarios_" + this.comp + ".xlsx");
  },

  injectCss() {
    if (document.getElementById("rhon-css")) return;
    const st = document.createElement("style");
    st.id = "rhon-css";
    st.textContent = `
      #relatorios-cr-root { color:#0f172a; }
      #relatorios-cr-root .rhon-page { display:flex; flex-direction:column; height:calc(100vh - 85px); }
      #relatorios-cr-root .rhon-head { background:#105436; padding:16px 20px; border-radius:12px 12px 0 0; }
      #relatorios-cr-root .rhon-head h2 { margin:0; color:#fff; font-size:1.15rem; }
      #relatorios-cr-root .rhon-head p { margin:4px 0 0; color:rgba(255,255,255,.8); font-size:.75rem; }
      #relatorios-cr-root .rhon-body { flex:1; min-height:0; display:flex; flex-direction:column; background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:14px 16px; }
      #relatorios-cr-root .rhon-tabs { display:flex; gap:6px; border-bottom:1px solid #e2e8f0; margin-bottom:12px; }
      #relatorios-cr-root .rhon-tab { border:0; background:transparent; padding:8px 14px; font-weight:700; font-size:.82rem; color:#64748b; border-bottom:3px solid transparent; cursor:pointer; }
      #relatorios-cr-root .rhon-tab.is-active { color:#105436; border-bottom-color:#105436; }
      #relatorios-cr-root .rhon-tools { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin-bottom:12px; }
      #relatorios-cr-root .rhon-emp-slot { flex:0 0 260px; min-width:0; }
      #relatorios-cr-root .rhon-emp-slot .ml-emp-filter { width:100%; }
      #relatorios-cr-root .rhon-btn { height:38px; display:inline-flex; align-items:center; gap:6px; }
      #relatorios-cr-root .rhon-field { display:flex; flex-direction:column; gap:4px; }
      #relatorios-cr-root .rhon-field label { font-size:.8rem; font-weight:600; color:#475569; }
      #relatorios-cr-root .rhon-field select,
      #relatorios-cr-root .rhon-field input { height:38px; border:1px solid #cbd5e1; border-radius:6px; padding:0 10px; background:#fff; color:#0f172a; font-size:.85rem; }
      #relatorios-cr-root .rhon-grow { flex:1; min-width:200px; }
      #relatorios-cr-root .rhon-switch-line { display:flex; align-items:center; gap:8px; height:38px; font-size:.8rem; font-weight:600; color:#475569; cursor:pointer; white-space:nowrap; }
      #relatorios-cr-root .rhon-cards { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:10px; margin-bottom:12px; }
      #relatorios-cr-root .rhon-card { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; flex-direction:column; gap:4px; }
      #relatorios-cr-root .rhon-card span { font-size:.72rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.03em; }
      #relatorios-cr-root .rhon-card strong { font-size:1.05rem; color:#0f172a; font-variant-numeric:tabular-nums; }
      #relatorios-cr-root .rhon-card-main { border-left:4px solid #f37021; }
      #relatorios-cr-root .rhon-card-main strong { color:#105436; }
      #relatorios-cr-root .rhon-wrap { flex:1; min-height:0; overflow:auto; border:1px solid #e2e8f0; border-radius:8px; background:#fff; }
      #relatorios-cr-root .rhon-table { width:100%; border-collapse:separate; border-spacing:0; font-size:.8rem; font-variant-numeric:tabular-nums; }
      #relatorios-cr-root .rhon-table th { background:#105436; color:#fff; font-weight:600; text-align:left; padding:8px 10px; position:sticky; top:0; z-index:2; white-space:nowrap; }
      #relatorios-cr-root .rhon-table td { padding:7px 10px; border-bottom:1px solid #eef2f6; vertical-align:top; }
      #relatorios-cr-root .rhon-num { text-align:right !important; white-space:nowrap; }
      #relatorios-cr-root .rhon-emp td { background:#0c3d28; color:#fff; font-weight:700; }
      #relatorios-cr-root .rhon-cc td { background:#e7f6ee; color:#105436; font-weight:700; }
      #relatorios-cr-root .rhon-table tfoot td { background:#0c3d28; color:#fff; font-weight:800; position:sticky; bottom:0; }
      #relatorios-cr-root .rhon-cli { font-weight:600; }
      #relatorios-cr-root .rhon-sub { font-size:.7rem; color:#64748b; }
      #relatorios-cr-root .rhon-hon { font-weight:700; color:#105436; }
      #relatorios-cr-root .rhon-est { display:inline-block; margin-top:2px; font-size:.62rem; font-weight:700; color:#9a3412; background:#fff7ed; border:1px solid #fed7aa; border-radius:999px; padding:0 6px; }
      #relatorios-cr-root .rhon-st { display:inline-block; border-radius:999px; padding:2px 9px; font-size:.7rem; font-weight:700; white-space:nowrap; }
      #relatorios-cr-root .rhon-st-pago { background:#dcfce7; color:#105436; }
      #relatorios-cr-root .rhon-st-aberto { background:#f1f5f9; color:#475569; }
      #relatorios-cr-root .rhon-st-vencido { background:#ffedd5; color:#c2410c; }
      #relatorios-cr-root .rhon-st-nd { background:#f8fafc; color:#94a3b8; border:1px dashed #cbd5e1; }
      #relatorios-cr-root .rhon-paid-at { font-size:.7rem; color:#64748b; margin-top:2px; }
      #relatorios-cr-root .rhon-empty { padding:40px; text-align:center; color:#64748b; background:#fff; border:1px dashed #cbd5e1; border-radius:8px; }
      #relatorios-cr-root .rhon-error { padding:10px 12px; margin-bottom:12px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; border-radius:8px; font-size:.82rem; }
      #relatorios-cr-root .rhon-loading { display:flex; align-items:center; gap:10px; padding:30px; color:#475569; font-size:.85rem; }
      #relatorios-cr-root .rhon-spin { width:18px; height:18px; border:3px solid #cbd5e1; border-top-color:#105436; border-radius:50%; animation:spin 1s linear infinite; }
      @media (max-width: 900px) { #relatorios-cr-root .rhon-cards { grid-template-columns:repeat(2, minmax(0,1fr)); } }
    `;
    document.head.appendChild(st);
  }
};

window.HonorariosReport = HonorariosReport;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "relatorios-cr") HonorariosReport.init();
});
