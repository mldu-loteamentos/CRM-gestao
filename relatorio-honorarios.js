function rhonEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rhonMoney(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rhonPct(part, whole) {
  const w = Number(whole) || 0;
  if (!w) return "—";
  return ((Number(part) || 0) / w * 100).toFixed(1).replace(".", ",") + "%";
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

function rhonFold(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
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

function rhonCity(enterpriseId, enterpriseName) {
  let key = "";
  let label = "";
  try {
    if (typeof window.extractCityFromCostCenter === "function") key = window.extractCityFromCostCenter(enterpriseId, enterpriseName) || "";
    if (key && typeof window.extractCityDisplayName === "function") label = window.extractCityDisplayName(enterpriseId, enterpriseName) || "";
  } catch (e) {}
  if (!key) {
    const head = String(enterpriseName || "").replace(/^(?:\d+\s*-\s*)+/, "").split(" - ")[0].trim();
    key = head;
  }
  key = rhonFold(key);
  return { key, label: String(label || key).toUpperCase() };
}

function rhonLateCharges(base, dias, taxa) {
  if (typeof window.computeLateCharges === "function") {
    const c = window.computeLateCharges(base, dias, taxa);
    return { multa: Number(c.multa) || 0, juros: Number(c.juros) || 0 };
  }
  const b = Number(base) || 0;
  const d = Number(dias) || 0;
  const t = Number.isFinite(Number(taxa)) ? Number(taxa) : 1;
  if (d < 1 || b <= 0 || t <= 0) return { multa: 0, juros: 0 };
  return { multa: b * 0.02 * t, juros: b * 0.01 * (d / 30) * t };
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
  /** Situação das parcelas de cada boleto no Sienge; pagos não são consultados de novo. */
  PAY_COLLECTION: "boletos_pagamentos",
  /** Primeira competência com geração de boletos registrada. */
  MIN_COMP: "2026-09",
  TABS: [
    { id: "honorarios", label: "Honorários" },
    { id: "desconto", label: "Desconto de juros" },
    { id: "ranking", label: "Ranking de recebimentos" }
  ],
  FILTERS: [
    { key: "emp", field: "companyId", label: "EMPRESAS", nouns: null },
    { key: "city", field: "cityKey", label: "CIDADES", nouns: { singular: "cidade", plural: "cidades", none: "Nenhuma cidade", noMatch: "Nenhuma cidade com esse nome." } },
    { key: "ent", field: "enterpriseId", label: "EMPREENDIMENTOS", nouns: { singular: "empreendimento", plural: "empreendimentos" } },
    { key: "op", field: "opKey", label: "OPERADOR", nouns: { singular: "operador", plural: "operadores" } }
  ],
  _inited: false,
  tab: "honorarios",
  comp: "",
  loading: false,
  progress: { label: "", done: 0, total: 0 },
  error: "",
  records: [],
  rows: [],
  sel: { emp: [], city: [], ent: [], op: [] },
  openF: "",
  qF: { emp: "", city: "", ent: "", op: "" },
  status: "todos",
  search: "",
  rankSort: { key: "recebido", dir: -1 },
  sync: null,

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
    if (!this._inited) {
      this._inited = true;
      this.bindFilters();
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
    this.setProgress("Buscando pagamentos no Sienge", 0, ids.length);
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
        this.setProgress("Buscando pagamentos no Sienge", done, ids.length);
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

  async loadPayCache(comp) {
    const { collection, getDocs, query, where } = window.firebaseCollections;
    const map = {};
    try {
      const snap = await getDocs(query(collection(window.firebaseDb, this.PAY_COLLECTION), where("competencia", "==", comp)));
      snap.forEach((d) => {
        const x = d.data() || {};
        if (x.recId) map[x.recId] = x;
      });
    } catch (e) {
      console.warn("[Honorários] pagamentos salvos", e);
    }
    return map;
  },

  /** Devolve quantos não foram salvos. */
  async savePayCache(docs) {
    if (!docs.length) return 0;
    const { doc, setDoc } = window.firebaseCollections;
    let i = 0;
    let failed = 0;
    const worker = async () => {
      while (i < docs.length) {
        const d = docs[i++];
        try {
          await setDoc(doc(window.firebaseDb, this.PAY_COLLECTION, String(d.recId).replace(/\//g, "_")), d);
        } catch (e) {
          failed += 1;
          console.warn("[Honorários] salvar pagamento", d.recId, e);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, docs.length) }, worker));
    return failed;
  },

  /** Retrato das parcelas do boleto no extrato do Sienge. */
  paySnapshot(rec, stmt, today) {
    const stInsts = stmt[String(rec.billId)] || [];
    const parcelas = (rec.parcelas || []).map((p) => {
      const inst = rhonFindInst(stInsts, p.installmentId, p.installmentNumber || null);
      if (!inst) return { installmentId: String(p.installmentId), found: false };
      const pay = this.paymentInfo(inst, rec.generatedDate);
      const bal = Number(inst.currentBalance);
      return {
        installmentId: String(p.installmentId),
        found: true,
        installmentNumber: inst.installmentNumber != null ? String(inst.installmentNumber) : "",
        conditionType: String(inst.conditionType || inst.paymentConditionType || ""),
        dueDate: String(inst.dueDate || "").slice(0, 10),
        originalValue: Number(inst.originalValue || inst.installmentValue || inst.value || 0) || 0,
        currentBalance: Number.isFinite(bal) ? bal : null,
        paid: !!pay.paid,
        paidAt: pay.paidAt || "",
        paidValue: Number(pay.paidValue) || 0
      };
    });
    return {
      recId: String(rec.id),
      competencia: rec.competencia || this.comp,
      customerId: String(rec.customerId || ""),
      billId: String(rec.billId || ""),
      checkedDate: today,
      checkedAt: new Date().toISOString(),
      allPaid: parcelas.length > 0 && parcelas.every((x) => x.paid),
      parcelas
    };
  },

  buildRows(records, cache) {
    const today = rhonIso(new Date());
    const rows = [];
    records.forEach((rec) => {
      const snapRec = cache[String(rec.id)] || null;
      const taxa = Number.isFinite(Number(rec.taxa)) ? Number(rec.taxa) : 1;
      const enterpriseName = rec.enterpriseName || rhonEnterpriseName(rec.enterpriseId);
      const city = rhonCity(rec.enterpriseId, enterpriseName);
      const opName = String(rec.author || rec.authorEmail || "Sem operador").trim().toUpperCase();
      const opKey = String(rec.authorEmail || "").toLowerCase().trim() || rhonFold(rec.author) || "-";
      (rec.parcelas || []).forEach((p) => {
        const snap = snapRec ? (snapRec.parcelas || []).find((x) => String(x.installmentId) === String(p.installmentId)) : null;
        const inst = snap && snap.found ? snap : null;
        let vals = p;
        let base = p.saldo != null ? Number(p.saldo) : Number(p.valorOriginal);
        let dias = p.dias;
        if (p.pendingValues) {
          vals = { installmentId: p.installmentId, valorOriginal: 0, multa: 0, juros: 0, honorarios: 0, dueDate: "" };
          base = 0;
          dias = 0;
          if (inst) {
            const orig = Number(inst.originalValue) || 0;
            const bal = inst.currentBalance == null ? NaN : Number(inst.currentBalance);
            base = Number.isFinite(bal) && bal > 0.009 ? bal : orig;
            const dueDate = String(inst.dueDate || "").slice(0, 10);
            dias = typeof window.daysOverdueUntilTarget === "function"
              ? window.daysOverdueUntilTarget({ dueDate }, rec.boletoDueDate)
              : 0;
            const pack = typeof window.moraComHonorarios === "function"
              ? window.moraComHonorarios(base, dias, taxa, rec.honorariosPct)
              : { multa: 0, jurosPadrao: 0, honorarios: 0 };
            vals = {
              installmentId: p.installmentId,
              installmentNumber: inst.installmentNumber || "",
              conditionType: inst.conditionType || "",
              dueDate,
              valorOriginal: orig,
              multa: Number(pack.multa) || 0,
              juros: Number(pack.jurosPadrao) || 0,
              honorarios: Number(pack.honorarios) || 0
            };
          }
        }
        const multa = Number(vals.multa) || 0;
        const juros = Number(vals.juros) || 0;
        let devido;
        if (Number.isFinite(Number(dias)) && Number(base) > 0) {
          devido = rhonLateCharges(base, dias, 1);
        } else {
          devido = taxa > 0 ? { multa: multa / taxa, juros: juros / taxa } : { multa, juros };
        }
        let status = "aberto";
        let paidAt = "";
        let paidValue = 0;
        if (!snapRec) status = "naoverificado";
        else if (!inst) status = "naolocalizada";
        else {
          if (inst.paid) {
            status = "pago";
            paidAt = inst.paidAt || "";
            paidValue = Number(inst.paidValue) || 0;
          } else if (rec.boletoDueDate && rec.boletoDueDate < today) {
            status = "vencido";
          }
        }
        const parcLabel = [vals.conditionType, vals.installmentNumber || vals.installmentId].filter(Boolean).join(" ");
        const valorOriginal = Number(vals.valorOriginal) || 0;
        const honorarios = Number(vals.honorarios) || 0;
        const encDevidos = devido.multa + devido.juros;
        rows.push({
          recId: rec.id,
          companyId: String(rec.companyId || ""),
          companyName: rec.companyName || rhonCompanyName(rec.companyId),
          enterpriseId: String(rec.enterpriseId || ""),
          enterpriseName,
          cityKey: city.key,
          cityName: city.label,
          customerId: rec.customerId,
          customerName: rec.customerName || (rec.customerId ? "Cliente " + rec.customerId : ""),
          customerDoc: rec.customerDoc || "",
          billId: rec.billId,
          contractNumber: rec.contractNumber || "",
          unitName: rec.unitName || "",
          parcela: parcLabel,
          dueDate: vals.dueDate || "",
          boletoDueDate: rec.boletoDueDate || "",
          dias: Math.max(0, Number(dias) || 0),
          valorOriginal,
          multa,
          juros,
          honorarios,
          honorariosPct: Number(rec.honorariosPct) || 0,
          multaDevida: devido.multa,
          jurosDevido: devido.juros,
          encDevidos,
          abono: Math.max(0, encDevidos - multa - juros),
          isencaoPct: Math.round(Math.min(1, Math.max(0, 1 - taxa)) * 100),
          valorBoleto: valorOriginal + multa + juros + honorarios,
          status,
          paidAt,
          paidValue,
          generatedAt: rec.generatedAt || "",
          author: rec.author || "",
          opKey,
          opName,
          estimated: !!(rec.estimated || p.pendingValues)
        });
      });
    });
    return rows;
  },

  /** force: reconsulta hoje os boletos ainda em aberto (pagos nunca voltam ao Sienge). */
  async load(force) {
    if (this.loading || !this.comp) return;
    if (!window.firebaseDb || !window.firebaseCollections) {
      this.error = "Firebase indisponível. Atualize a página.";
      this.render();
      return;
    }
    this.loading = true;
    this.error = "";
    this.progress = { label: "Buscando boletos gerados", done: 0, total: 0 };
    this.render();
    try {
      const comp = this.comp;
      const records = await this.loadRecords(comp);
      const keys = new Set(records.map((r) => r.key).filter(Boolean));
      const fromAudit = await this.loadAuditRecords(comp, keys);
      const all = this.onlyMine(records.concat(fromAudit));
      this.setProgress("Lendo pagamentos já conferidos", 0, 0);
      const cache = await this.loadPayCache(comp);
      const today = rhonIso(new Date());
      const need = all.filter((r) => {
        const c = cache[String(r.id)];
        if (!c) return true;
        if (c.allPaid) return false;
        return force || c.checkedDate !== today;
      });
      const statements = await this.loadStatements(need.map((r) => r.customerId));
      if (comp !== this.comp) return;
      const fresh = [];
      need.forEach((rec) => {
        const stmt = statements[String(rec.customerId)];
        if (!stmt) return;
        const snap = this.paySnapshot(rec, stmt, today);
        cache[snap.recId] = snap;
        fresh.push(snap);
      });
      this.setProgress("Salvando a consulta de hoje", 0, 0);
      const naoSalvos = await this.savePayCache(fresh);
      if (comp !== this.comp) return;
      this.records = all;
      this.rows = this.buildRows(all, cache);
      this.sync = {
        at: new Date().toISOString(),
        consultados: fresh.length,
        falhas: need.length - fresh.length,
        naoSalvos,
        pagos: all.filter((r) => cache[String(r.id)] && cache[String(r.id)].allPaid).length,
        total: all.length
      };
      this.pruneFilters();
    } catch (e) {
      console.error("[Honorários] relatório", e);
      this.error = "Não foi possível carregar o relatório: " + (e && e.message ? e.message : e);
      this.rows = [];
    } finally {
      this.loading = false;
      this.render();
    }
  },

  maxComp() {
    return rhonIso(new Date()).slice(0, 7);
  },

  setComp(v) {
    let s = String(v || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(s)) return;
    if (s < this.MIN_COMP) s = this.MIN_COMP;
    if (s > this.maxComp()) s = this.maxComp();
    const input = document.getElementById("rhon-comp");
    if (input && input.value !== s) input.value = s;
    if (s === this.comp) return;
    this.comp = s;
    this.rows = [];
    this.records = [];
    this.sync = null;
    this.load();
  },

  setTab(id) {
    if (this.tab === id) return;
    this.tab = id;
    this.openF = "";
    this.render();
  },

  terceirizadaUser() {
    const u = (window.AppState && AppState.currentUser) || null;
    if (!u) return null;
    if (typeof window.isCrmAdministrator === "function" && window.isCrmAdministrator(u)) return null;
    const terc = typeof window.isOperadorCobrancaTerceirizadoProfile === "function"
      && window.isOperadorCobrancaTerceirizadoProfile(u.profile_name);
    return terc ? u : null;
  },

  onlyMine(records) {
    const u = this.terceirizadaUser();
    if (!u) return records;
    const email = String(u.email || "").toLowerCase().trim();
    const name = String(u.name || "").trim().toUpperCase();
    return records.filter((r) => {
      const re = String(r.authorEmail || "").toLowerCase().trim();
      if (re) return !!email && re === email;
      return !!name && String(r.author || "").trim().toUpperCase() === name;
    });
  },

  setStatus(v) { this.status = v || "todos"; this.render(); },
  setSearch(v) {
    this.search = String(v || "");
    clearTimeout(this._searchT);
    this._searchT = setTimeout(() => this.render(), 200);
  },

  /** Linhas que passam pelos filtros anteriores ao da chave (empresa → cidade → empreendimento). */
  rowsBefore(key) {
    const order = this.FILTERS.map((f) => f.key);
    const stop = order.indexOf(key);
    const active = this.FILTERS.filter((f, i) => i < stop && f.key !== "op");
    return this.rows.filter((r) => active.every((f) => {
      const s = this.sel[f.key];
      return !s.length || s.includes(String(r[f.field]));
    }));
  },

  filterItems(key) {
    const src = key === "op" ? this.rows : this.rowsBefore(key);
    const map = {};
    src.forEach((r) => {
      let id;
      let label;
      if (key === "emp") { id = r.companyId; label = r.companyId + " - " + String(r.companyName || "").toUpperCase(); }
      else if (key === "city") { id = r.cityKey; label = r.cityName || "SEM CIDADE"; }
      else if (key === "ent") { id = r.enterpriseId; label = [r.enterpriseId, String(r.enterpriseName || "").toUpperCase()].filter(Boolean).join(" - "); }
      else { id = r.opKey; label = r.opName; }
      if (!id || map[id]) return;
      map[id] = { id: String(id), label };
    });
    const items = Object.values(map);
    if (key === "city" || key === "op") items.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return items;
  },

  pruneFilters() {
    this.FILTERS.forEach((f) => {
      const ok = new Set(this.filterItems(f.key).map((x) => x.id));
      this.sel[f.key] = this.sel[f.key].filter((id) => ok.has(id));
    });
  },

  bindFilters() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    this.FILTERS.forEach((f) => {
      const wid = "rhon-f-" + f.key;
      MlEmpresaFilter.bind(wid, {
        toggleOpen() { self.openF = self.openF === f.key ? "" : f.key; self.render(); },
        close() { if (self.openF === f.key) { self.openF = ""; self.render(); } },
        setQuery(q) {
          self.qF[f.key] = q || "";
          const box = document.getElementById(wid + "-list");
          if (box) box.innerHTML = MlEmpresaFilter.listHtml({ id: wid, items: self.filterItems(f.key), selectedIds: self.sel[f.key], query: self.qF[f.key], nouns: f.nouns });
        },
        toggleId(id, on) {
          const set = new Set(self.sel[f.key]);
          if (on) set.add(String(id)); else set.delete(String(id));
          self.sel[f.key] = [...set];
          self.pruneFilters();
          self.render();
        },
        selectAll() { self.sel[f.key] = self.filterItems(f.key).map((x) => x.id); self.pruneFilters(); self.render(); },
        selectNone() { self.sel[f.key] = []; self.pruneFilters(); self.render(); }
      });
    });
  },

  filterHtml(f) {
    if (!window.MlEmpresaFilter) return "";
    return MlEmpresaFilter.html({
      id: "rhon-f-" + f.key,
      label: f.label,
      items: this.filterItems(f.key),
      selectedIds: this.sel[f.key],
      open: this.openF === f.key,
      query: this.qF[f.key],
      nouns: f.nouns,
      emptyMeansAll: true
    });
  },

  /** Empresa, cidade, empreendimento e operador. */
  scopedRows() {
    return this.rows.filter((r) => this.FILTERS.every((f) => {
      const s = this.sel[f.key];
      return !s.length || s.includes(String(r[f.field]));
    }));
  },

  filtered() {
    const q = this.search.trim().toLowerCase();
    return this.scopedRows().filter((r) => {
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
      t.multaDevida += r.multaDevida;
      t.jurosDevido += r.jurosDevido;
      t.encDevidos += r.encDevidos;
      t.abono += r.abono;
      if (r.status === "pago") t.honPagos += r.honorarios;
      return t;
    }, { valorOriginal: 0, multa: 0, juros: 0, honorarios: 0, honPagos: 0, multaDevida: 0, jurosDevido: 0, encDevidos: 0, abono: 0 });
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

  setProgress(label, done, total) {
    this.progress = { label, done, total };
    const txt = document.getElementById("rhon-progress-text");
    const cnt = document.getElementById("rhon-progress-count");
    const bar = document.getElementById("rhon-progress-bar");
    if (txt) txt.textContent = label + "...";
    if (cnt) cnt.textContent = total ? `${done} de ${total} cliente(s)` : "";
    if (bar) {
      bar.classList.toggle("is-indeterminate", !total);
      bar.style.width = total ? Math.round(done / total * 100) + "%" : "";
    }
  },

  loadingHtml() {
    const p = this.progress;
    const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return `<div class="rhon-overlay">
      <div class="rhon-loader">
        <div class="rhon-spin"></div>
        <div class="rhon-loader-title" id="rhon-progress-text">${rhonEsc(p.label)}...</div>
        <div class="rhon-loader-sub">Boletos gerados e pagamentos da competência</div>
        <div class="rhon-track"><div id="rhon-progress-bar" class="rhon-fill${p.total ? "" : " is-indeterminate"}" style="${p.total ? `width:${pct}%` : ""}"></div></div>
        <div class="rhon-loader-count" id="rhon-progress-count">${p.total ? `${p.done} de ${p.total} cliente(s)` : ""}</div>
      </div>
    </div>`;
  },

  syncHtml() {
    const s = this.sync;
    if (!s || this.loading) return "";
    const hora = new Date(s.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const parts = [
      `${s.consultados} boleto(s) consultado(s) no Sienge às ${hora}`,
      `${s.pagos} de ${s.total} já pagos e salvos`
    ];
    if (s.falhas) parts.push(`${s.falhas} sem resposta do Sienge`);
    if (s.naoSalvos) parts.push(`${s.naoSalvos} não foram salvos no Firebase`);
    return `<div class="rhon-sync${s.falhas || s.naoSalvos ? " rhon-sync-warn" : ""}"><i data-lucide="database" style="width:13px;height:13px;"></i> ${parts.join(" · ")}</div>`;
  },

  emptyHtml(msg) {
    return `<div class="rhon-empty">${msg}</div>`;
  },

  groupRowsHtml(rows, lineHtml, sumHtml, lead, tail) {
    return this.grouped(rows).map((e) => {
      const ccHtml = e.ccs.map((c) => {
        const lines = c.rows.map(lineHtml).join("");
        return `<tr class="rhon-cc"><td colspan="${lead}">${rhonEsc([c.id, c.name].filter(Boolean).join(" - ") || "Sem centro de custo")}</td>${sumHtml(c.rows)}<td colspan="${tail}"></td></tr>${lines}`;
      }).join("");
      const all = e.ccs.flatMap((c) => c.rows);
      return `<tr class="rhon-emp"><td colspan="${lead}">${rhonEsc([e.id, e.name].filter(Boolean).join(" - ") || "Sem empresa")}</td>${sumHtml(all)}<td colspan="${tail}"></td></tr>${ccHtml}`;
    }).join("");
  },

  honTableHtml(rows) {
    if (!rows.length) return this.emptyHtml(this.rows.length ? "Nenhum boleto com esses filtros." : "Nenhum boleto gerado nesta competência.");
    const sumCells = (list) => {
      const t = this.totals(list);
      return `<td class="rhon-num">${rhonMoney(t.valorOriginal)}</td>
      <td class="rhon-num">${rhonMoney(t.multa)}</td>
      <td class="rhon-num">${rhonMoney(t.juros)}</td>
      <td class="rhon-num">${rhonMoney(t.honorarios)}</td>`;
    };
    const line = (r) => `<tr>
      <td><div class="rhon-cli">${rhonEsc(r.customerName)}</div><div class="rhon-sub">${rhonEsc(r.customerDoc)}</div></td>
      <td>${rhonEsc(r.billId)}${r.unitName ? `<div class="rhon-sub">${rhonEsc(r.unitName)}</div>` : ""}</td>
      <td>${rhonEsc(r.parcela)}</td>
      <td>${rhonBr(r.dueDate)}</td>
      <td>${rhonBr(r.boletoDueDate)}</td>
      <td class="rhon-num">${rhonMoney(r.valorOriginal)}</td>
      <td class="rhon-num">${rhonMoney(r.multa)}</td>
      <td class="rhon-num">${rhonMoney(r.juros)}</td>
      <td class="rhon-num rhon-hon">${rhonMoney(r.honorarios)}${r.honorariosPct ? `<div class="rhon-sub">${String(r.honorariosPct).replace(".", ",")}%</div>` : ""}</td>
      <td>${this.statusHtml(r)}</td>
      <td><div>${rhonBr(rhonIso(r.generatedAt))}</div><div class="rhon-sub">${rhonEsc(r.author)}</div></td>
    </tr>`;
    return `<div class="rhon-wrap"><table class="rhon-table">
      <thead><tr>
        <th>Cliente</th><th>Título</th><th>Parcela</th><th>Vencimento</th><th>Venc. boleto</th>
        <th class="rhon-num">Valor original</th><th class="rhon-num">Multa</th><th class="rhon-num">Juros</th><th class="rhon-num">Honorários</th>
        <th>Status</th><th>Gerado em</th>
      </tr></thead>
      <tbody>${this.groupRowsHtml(rows, line, sumCells, 5, 2)}</tbody>
      <tfoot><tr><td colspan="5">Total geral</td>${sumCells(rows)}<td colspan="2"></td></tr></tfoot>
    </table></div>`;
  },

  descTableHtml(rows) {
    if (!rows.length) return this.emptyHtml(this.rows.length ? "Nenhum boleto com esses filtros." : "Nenhum boleto gerado nesta competência.");
    const sumCells = (list) => {
      const t = this.totals(list);
      return `<td class="rhon-num">${rhonMoney(t.valorOriginal)}</td>
      <td class="rhon-num">${rhonMoney(t.multaDevida)}</td>
      <td class="rhon-num">${rhonMoney(t.jurosDevido)}</td>
      <td class="rhon-num">${rhonMoney(t.encDevidos)}</td>
      <td class="rhon-num">${rhonPct(t.abono, t.encDevidos)}</td>
      <td class="rhon-num">${rhonMoney(t.abono)}</td>
      <td class="rhon-num">${rhonMoney(t.multa + t.juros)}</td>`;
    };
    const line = (r) => `<tr>
      <td><div class="rhon-cli">${rhonEsc(r.customerName)}</div><div class="rhon-sub">${rhonEsc(r.customerDoc)}</div></td>
      <td>${rhonEsc(r.billId)}${r.unitName ? `<div class="rhon-sub">${rhonEsc(r.unitName)}</div>` : ""}</td>
      <td>${rhonEsc(r.parcela)}</td>
      <td>${rhonBr(r.dueDate)}</td>
      <td class="rhon-num">${r.dias}</td>
      <td class="rhon-num">${rhonMoney(r.valorOriginal)}</td>
      <td class="rhon-num">${rhonMoney(r.multaDevida)}</td>
      <td class="rhon-num">${rhonMoney(r.jurosDevido)}</td>
      <td class="rhon-num">${rhonMoney(r.encDevidos)}</td>
      <td class="rhon-num">${r.isencaoPct ? `<span class="rhon-isen">${r.isencaoPct}%</span>` : "0%"}</td>
      <td class="rhon-num${r.abono > 0.004 ? " rhon-abono" : ""}">${rhonMoney(r.abono)}</td>
      <td class="rhon-num">${rhonMoney(r.multa + r.juros)}</td>
      <td>${this.statusHtml(r)}</td>
      <td><div>${rhonBr(rhonIso(r.generatedAt))}</div><div class="rhon-sub">${rhonEsc(r.author)}</div></td>
    </tr>`;
    return `<div class="rhon-wrap"><table class="rhon-table">
      <thead><tr>
        <th>Cliente</th><th>Título</th><th>Parcela</th><th>Vencimento</th><th class="rhon-num">Dias atraso</th>
        <th class="rhon-num">Valor original</th><th class="rhon-num">Multa devida</th><th class="rhon-num">Juros devido</th>
        <th class="rhon-num">Encargos devidos</th><th class="rhon-num">Isenção</th><th class="rhon-num">Abono</th><th class="rhon-num">Encargos cobrados</th>
        <th>Status</th><th>Gerado em</th>
      </tr></thead>
      <tbody>${this.groupRowsHtml(rows, line, sumCells, 5, 2)}</tbody>
      <tfoot><tr><td colspan="5">Total geral</td>${sumCells(rows)}<td colspan="2"></td></tr></tfoot>
    </table></div>`;
  },

  ranking(rows) {
    const byOp = {};
    rows.forEach((r) => {
      const k = r.opKey || "-";
      if (!byOp[k]) byOp[k] = { key: k, name: r.opName, boletos: {}, parcelas: 0, gerado: 0, recebido: 0, devido: 0, abono: 0 };
      const o = byOp[k];
      if (!(r.recId in o.boletos)) o.boletos[r.recId] = true;
      if (r.status !== "pago") o.boletos[r.recId] = false;
      o.parcelas += 1;
      o.gerado += r.valorBoleto;
      o.recebido += r.paidValue;
      o.devido += r.encDevidos;
      o.abono += r.abono;
    });
    const list = Object.values(byOp).map((o) => {
      const flags = Object.values(o.boletos);
      const qtd = flags.length;
      const pagos = flags.filter(Boolean).length;
      return {
        key: o.key, name: o.name, qtd, pagos, parcelas: o.parcelas, gerado: o.gerado, recebido: o.recebido,
        devido: o.devido, abono: o.abono,
        pctPagos: qtd ? pagos / qtd : 0,
        pctDesc: o.devido ? o.abono / o.devido : 0
      };
    });
    const { key, dir } = this.rankSort;
    list.sort((a, b) => {
      if (key === "name") return dir * a.name.localeCompare(b.name, "pt-BR");
      return dir * ((a[key] || 0) - (b[key] || 0)) || a.name.localeCompare(b.name, "pt-BR");
    });
    return list;
  },

  toggleRankSort(key) {
    if (this.rankSort.key === key) this.rankSort.dir *= -1;
    else this.rankSort = { key, dir: key === "name" ? 1 : -1 };
    this.render();
  },

  rankCardsHtml(list) {
    const top = (field) => list.slice().sort((a, b) => (b[field] || 0) - (a[field] || 0))[0] || null;
    const qtd = list.reduce((s, o) => s + o.qtd, 0);
    const pagos = list.reduce((s, o) => s + o.pagos, 0);
    const mais = top("qtd");
    const receb = top("recebido");
    const desc = top("pctDesc");
    const who = (o, val) => o ? `<strong>${rhonEsc(o.name)}</strong><em>${val}</em>` : "<strong>—</strong>";
    return `<div class="rhon-cards">
      <div class="rhon-card rhon-card-main"><span>Boletos pagos</span><strong>${rhonPct(pagos, qtd)}</strong><em>${pagos} de ${qtd} boleto(s)</em></div>
      <div class="rhon-card"><span>Mais boletos gerados</span>${who(mais, mais ? mais.qtd + " boleto(s)" : "")}</div>
      <div class="rhon-card"><span>Maior recebimento</span>${who(receb && receb.recebido > 0 ? receb : null, receb ? "R$ " + rhonMoney(receb.recebido) : "")}</div>
      <div class="rhon-card rhon-card-warn"><span>Mais desconto concedido</span>${who(desc && desc.abono > 0 ? desc : null, desc ? rhonPct(desc.abono, desc.devido) + " · R$ " + rhonMoney(desc.abono) : "")}</div>
    </div>`;
  },

  rankTableHtml(list) {
    if (!list.length) return this.emptyHtml(this.rows.length ? "Nenhum boleto com esses filtros." : "Nenhum boleto gerado nesta competência.");
    const th = (key, label, num) => `<th class="${num ? "rhon-num " : ""}rhon-sort" onclick="HonorariosReport.toggleRankSort('${key}')">${label} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
    const tot = list.reduce((t, o) => {
      t.qtd += o.qtd; t.pagos += o.pagos; t.parcelas += o.parcelas; t.gerado += o.gerado;
      t.recebido += o.recebido; t.devido += o.devido; t.abono += o.abono;
      return t;
    }, { qtd: 0, pagos: 0, parcelas: 0, gerado: 0, recebido: 0, devido: 0, abono: 0 });
    const body = list.map((o, i) => `<tr>
      <td class="rhon-pos">${i + 1}º</td>
      <td class="rhon-cli">${rhonEsc(o.name)}</td>
      <td class="rhon-num">${o.qtd}</td>
      <td class="rhon-num">${o.pagos}</td>
      <td class="rhon-num"><div class="rhon-pbar-wrap"><div class="rhon-pbar"><span style="width:${Math.round(o.pctPagos * 100)}%"></span></div>${rhonPct(o.pagos, o.qtd)}</div></td>
      <td class="rhon-num">${o.parcelas}</td>
      <td class="rhon-num">${rhonMoney(o.gerado)}</td>
      <td class="rhon-num rhon-hon">${rhonMoney(o.recebido)}</td>
      <td class="rhon-num">${rhonMoney(o.devido)}</td>
      <td class="rhon-num${o.abono > 0.004 ? " rhon-abono" : ""}">${rhonMoney(o.abono)}</td>
      <td class="rhon-num${o.pctDesc > 0 ? " rhon-abono" : ""}">${rhonPct(o.abono, o.devido)}</td>
    </tr>`).join("");
    return `<div class="rhon-wrap"><table class="rhon-table">
      <thead><tr>
        <th>#</th>${th("name", "Operador")}${th("qtd", "Boletos gerados", 1)}${th("pagos", "Boletos pagos", 1)}${th("pctPagos", "% pagos", 1)}
        ${th("parcelas", "Parcelas", 1)}${th("gerado", "Valor gerado", 1)}${th("recebido", "Valor recebido", 1)}
        ${th("devido", "Encargos devidos", 1)}${th("abono", "Abono concedido", 1)}${th("pctDesc", "% desconto", 1)}
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="2">Total geral</td>
        <td class="rhon-num">${tot.qtd}</td><td class="rhon-num">${tot.pagos}</td><td class="rhon-num">${rhonPct(tot.pagos, tot.qtd)}</td>
        <td class="rhon-num">${tot.parcelas}</td><td class="rhon-num">${rhonMoney(tot.gerado)}</td><td class="rhon-num">${rhonMoney(tot.recebido)}</td>
        <td class="rhon-num">${rhonMoney(tot.devido)}</td><td class="rhon-num">${rhonMoney(tot.abono)}</td><td class="rhon-num">${rhonPct(tot.abono, tot.devido)}</td>
      </tr></tfoot>
    </table></div>`;
  },

  contentHtml() {
    if (this.loading) return this.loadingHtml();
    if (!this.comp) {
      return `<div class="rhon-start"><i data-lucide="calendar-search" style="width:34px;height:34px;"></i>
        <strong>Escolha a competência</strong><span>O relatório carrega os boletos gerados e os pagamentos do mês escolhido.</span></div>`;
    }
    if (this.tab === "ranking") {
      const list = this.ranking(this.scopedRows());
      return this.rankCardsHtml(list) + this.rankTableHtml(list);
    }
    const rows = this.filtered();
    const t = this.totals(rows);
    const boletos = new Set(rows.map((r) => r.recId)).size;
    if (this.tab === "desconto") {
      const comAbono = new Set(rows.filter((r) => r.abono > 0.004).map((r) => r.recId)).size;
      return `<div class="rhon-cards">
        <div class="rhon-card"><span>Encargos devidos</span><strong>R$ ${rhonMoney(t.encDevidos)}</strong><em>Multa R$ ${rhonMoney(t.multaDevida)} · Juros R$ ${rhonMoney(t.jurosDevido)}</em></div>
        <div class="rhon-card rhon-card-warn"><span>Abono concedido</span><strong>R$ ${rhonMoney(t.abono)}</strong><em>${rhonPct(t.abono, t.encDevidos)} dos encargos devidos</em></div>
        <div class="rhon-card"><span>Encargos cobrados</span><strong>R$ ${rhonMoney(t.multa + t.juros)}</strong></div>
        <div class="rhon-card"><span>Boletos com abono</span><strong>${comAbono} de ${boletos}</strong><em>${rhonPct(comAbono, boletos)} dos boletos</em></div>
      </div>${this.descTableHtml(rows)}`;
    }
    const pagas = rows.filter((r) => r.status === "pago").length;
    return `<div class="rhon-cards">
      <div class="rhon-card"><span>Boletos gerados</span><strong>${boletos}</strong></div>
      <div class="rhon-card"><span>Parcelas pagas</span><strong>${pagas} de ${rows.length}</strong></div>
      <div class="rhon-card"><span>Honorários gerados</span><strong>R$ ${rhonMoney(t.honorarios)}</strong></div>
      <div class="rhon-card rhon-card-main"><span>Honorários pagos (repasse)</span><strong>R$ ${rhonMoney(t.honPagos)}</strong></div>
    </div>${this.honTableHtml(rows)}`;
  },

  render() {
    const root = document.getElementById("relatorios-cr-root");
    if (!root) return;
    this.injectCss();
    const prevWrap = root.querySelector(".rhon-wrap");
    const scroll = prevWrap ? { top: prevWrap.scrollTop, left: prevWrap.scrollLeft } : null;
    const searchFocused = document.activeElement && document.activeElement.id === "rhon-search";
    const isRank = this.tab === "ranking";
    const canExport = !this.loading && this.rows.length > 0;
    const off = this.loading ? "disabled" : "";
    root.innerHTML = `
      <div class="rhon-page">
        <div class="rhon-head">
          <h2>Relatórios</h2>
          <p>Contas a receber</p>
        </div>
        <div class="rhon-body">
          <div class="rhon-tabs">${this.TABS.map((t) => `<button type="button" class="rhon-tab${this.tab === t.id ? " is-active" : ""}" onclick="HonorariosReport.setTab('${t.id}')">${t.label}</button>`).join("")}</div>
          <div class="rhon-tools">
            <div class="ml-comp-slot">
              <label class="ml-comp-label" for="rhon-comp">Competência</label>
              <input type="month" id="rhon-comp" class="ml-comp-input" value="${rhonEsc(this.comp)}" min="${this.MIN_COMP}" max="${this.maxComp()}" ${off}
                onchange="HonorariosReport.setComp(this.value)">
            </div>
            <button type="button" class="btn btn-primary rhon-btn" onclick="HonorariosReport.load(true)" title="Consultar de novo no Sienge os boletos ainda em aberto" ${this.loading || !this.comp ? "disabled" : ""}>
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Atualizar
            </button>
            ${this.FILTERS.map((f) => `<div class="rhon-f-slot rhon-f-${f.key}">${this.filterHtml(f)}</div>`).join("")}
            ${isRank ? "" : `<div class="rhon-field">
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
            </div>`}
            <button type="button" class="btn btn-excel" onclick="HonorariosReport.exportExcel()" title="Exportar tabela atual para Excel" ${canExport ? "" : "disabled"}>
              <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel
            </button>
          </div>
          ${this.error ? `<div class="rhon-error">${rhonEsc(this.error)}</div>` : ""}
          ${this.syncHtml()}
          <div class="rhon-content">${this.contentHtml()}</div>
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
    if (typeof XLSX === "undefined") {
      alert("A biblioteca XLSX não foi carregada. Atualize a página e tente novamente.");
      return;
    }
    let aoa;
    let sheet;
    if (this.tab === "ranking") {
      const list = this.ranking(this.scopedRows());
      if (!list.length) { alert("Não há boletos para exportar neste filtro."); return; }
      aoa = [["Posição", "Operador", "Boletos gerados", "Boletos pagos", "% pagos", "Parcelas", "Valor gerado", "Valor recebido", "Encargos devidos", "Abono concedido", "% desconto"]];
      list.forEach((o, i) => aoa.push([
        i + 1, o.name, o.qtd, o.pagos, Number((o.pctPagos * 100).toFixed(1)), o.parcelas,
        Number(o.gerado.toFixed(2)), Number(o.recebido.toFixed(2)), Number(o.devido.toFixed(2)),
        Number(o.abono.toFixed(2)), Number((o.pctDesc * 100).toFixed(1))
      ]));
      sheet = "Ranking";
    } else {
      const rows = this.filtered();
      if (!rows.length) { alert("Não há boletos para exportar neste filtro."); return; }
      const desc = this.tab === "desconto";
      aoa = [desc
        ? ["Competência", "Empresa", "Centro de custo", "Cidade", "Cliente", "CPF/CNPJ", "Título", "Unidade", "Parcela",
          "Vencimento", "Vencimento do boleto", "Dias de atraso", "Valor original", "Multa devida", "Juros devido",
          "Encargos devidos", "Isenção (%)", "Abono", "Encargos cobrados", "Status", "Gerado em", "Gerado por"]
        : ["Competência", "Empresa", "Centro de custo", "Cidade", "Cliente", "CPF/CNPJ", "Título", "Contrato", "Unidade", "Parcela",
          "Vencimento", "Vencimento do boleto", "Valor original", "Multa", "Juros", "Honorários (%)", "Honorários",
          "Status", "Pago em", "Valor recebido", "Gerado em", "Gerado por"]];
      this.grouped(rows).forEach((e) => e.ccs.forEach((c) => c.rows.forEach((r) => {
        const head = [this.comp, [e.id, e.name].filter(Boolean).join(" - "), [c.id, c.name].filter(Boolean).join(" - "), r.cityName, r.customerName, r.customerDoc, r.billId];
        aoa.push(desc
          ? head.concat([r.unitName, r.parcela, rhonBr(r.dueDate), rhonBr(r.boletoDueDate), r.dias,
            Number(r.valorOriginal.toFixed(2)), Number(r.multaDevida.toFixed(2)), Number(r.jurosDevido.toFixed(2)),
            Number(r.encDevidos.toFixed(2)), r.isencaoPct, Number(r.abono.toFixed(2)), Number((r.multa + r.juros).toFixed(2)),
            this.statusLabel(r), rhonBr(rhonIso(r.generatedAt)), r.author])
          : head.concat([r.contractNumber, r.unitName, r.parcela, rhonBr(r.dueDate), rhonBr(r.boletoDueDate),
            Number(r.valorOriginal.toFixed(2)), Number(r.multa.toFixed(2)), Number(r.juros.toFixed(2)),
            r.honorariosPct || 0, Number(r.honorarios.toFixed(2)), this.statusLabel(r), rhonBr(r.paidAt),
            r.paidValue ? Number(r.paidValue.toFixed(2)) : "", rhonBr(rhonIso(r.generatedAt)), r.author]));
      })));
      sheet = desc ? "Desconto de juros" : "Honorarios";
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    const file = { honorarios: "relatorio_honorarios_", desconto: "relatorio_desconto_juros_", ranking: "ranking_recebimentos_" }[this.tab];
    XLSX.writeFile(wb, file + this.comp + ".xlsx");
  },

  injectCss() {
    if (document.getElementById("rhon-css")) return;
    const st = document.createElement("style");
    st.id = "rhon-css";
    st.textContent = `
      #relatorios-cr-root { color:#0f172a; }
      #relatorios-cr-root .rhon-page { display:flex; flex-direction:column; height:calc(100vh - 160px); min-height:520px; }
      #relatorios-cr-root .rhon-head { background:#105436; padding:16px 20px; border-radius:12px 12px 0 0; }
      #relatorios-cr-root .rhon-head h2 { margin:0; color:#fff; font-size:1.15rem; }
      #relatorios-cr-root .rhon-head p { margin:4px 0 0; color:rgba(255,255,255,.8); font-size:.75rem; }
      #relatorios-cr-root .rhon-body { flex:1; min-height:0; display:flex; flex-direction:column; background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:14px 16px; }
      #relatorios-cr-root .rhon-content { flex:1; min-height:0; display:flex; flex-direction:column; position:relative; }
      #relatorios-cr-root .rhon-tabs { display:flex; gap:6px; border-bottom:1px solid #e2e8f0; margin-bottom:12px; }
      #relatorios-cr-root .rhon-tab { border:0; background:transparent; padding:8px 14px; font-weight:700; font-size:.82rem; color:#64748b; border-bottom:3px solid transparent; cursor:pointer; }
      #relatorios-cr-root .rhon-tab:hover { color:#105436; }
      #relatorios-cr-root .rhon-tab.is-active { color:#105436; border-bottom-color:#105436; }
      #relatorios-cr-root .rhon-tools { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin-bottom:12px; }
      #relatorios-cr-root .rhon-f-slot { flex:0 0 200px; min-width:0; }
      #relatorios-cr-root .rhon-f-emp, #relatorios-cr-root .rhon-f-ent { flex-basis:230px; }
      #relatorios-cr-root .rhon-f-city { flex-basis:170px; }
      #relatorios-cr-root .rhon-f-slot .ml-emp-filter { width:100%; min-width:0; max-width:none; position:relative; }
      #relatorios-cr-root .rhon-f-slot .ml-emp-filter-btn { height:38px; min-height:38px; }
      #relatorios-cr-root .rhon-f-slot .ml-emp-filter-panel { width:max-content; min-width:100%; max-width:min(560px, 92vw); right:auto; }
      #relatorios-cr-root .rhon-f-slot .ml-emp-filter-list { max-height:340px; }
      #relatorios-cr-root .rhon-f-slot .ml-emp-filter-item span { white-space:nowrap; }
      #relatorios-cr-root .rhon-btn { height:38px; display:inline-flex; align-items:center; gap:6px; }
      #relatorios-cr-root .rhon-field { display:flex; flex-direction:column; gap:4px; }
      #relatorios-cr-root .rhon-field label { font-size:.8rem; font-weight:600; color:#475569; }
      #relatorios-cr-root .rhon-field select,
      #relatorios-cr-root .rhon-field input { height:38px; border:1px solid #cbd5e1; border-radius:6px; padding:0 10px; background:#fff; color:#0f172a; font-size:.85rem; }
      #relatorios-cr-root .rhon-grow { flex:1; min-width:160px; }
      #relatorios-cr-root .rhon-cards { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:10px; margin-bottom:12px; }
      #relatorios-cr-root .rhon-card { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; flex-direction:column; gap:4px; min-width:0; }
      #relatorios-cr-root .rhon-card span { font-size:.72rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.03em; }
      #relatorios-cr-root .rhon-card strong { font-size:1.05rem; color:#0f172a; font-variant-numeric:tabular-nums; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #relatorios-cr-root .rhon-card em { font-style:normal; font-size:.75rem; color:#64748b; font-variant-numeric:tabular-nums; }
      #relatorios-cr-root .rhon-card-main { border-left:4px solid #105436; }
      #relatorios-cr-root .rhon-card-main strong { color:#105436; }
      #relatorios-cr-root .rhon-card-warn { border-left:4px solid #f37021; }
      #relatorios-cr-root .rhon-card-warn strong { color:#c2410c; }
      #relatorios-cr-root .rhon-wrap { flex:1; min-height:0; overflow:auto; border:1px solid #e2e8f0; border-radius:8px; background:#fff; }
      #relatorios-cr-root .rhon-table { width:100%; border-collapse:separate; border-spacing:0; font-size:.8rem; font-variant-numeric:tabular-nums; }
      #relatorios-cr-root .rhon-table th { background:#105436; color:#fff; font-weight:600; text-align:left; padding:8px 10px; position:sticky; top:0; z-index:2; white-space:nowrap; }
      #relatorios-cr-root .rhon-table th.rhon-sort { cursor:pointer; user-select:none; }
      #relatorios-cr-root .rhon-table td { padding:7px 10px; border-bottom:1px solid #eef2f6; vertical-align:top; }
      #relatorios-cr-root .rhon-num { text-align:right !important; white-space:nowrap; }
      #relatorios-cr-root .rhon-emp td { background:#0c3d28; color:#fff; font-weight:700; }
      #relatorios-cr-root .rhon-cc td { background:#e7f6ee; color:#105436; font-weight:700; }
      #relatorios-cr-root .rhon-table tfoot td { background:#0c3d28; color:#fff; font-weight:800; position:sticky; bottom:0; }
      #relatorios-cr-root .rhon-cli { font-weight:600; }
      #relatorios-cr-root .rhon-pos { font-weight:800; color:#105436; width:36px; }
      #relatorios-cr-root .rhon-sub { font-size:.7rem; color:#64748b; }
      #relatorios-cr-root .rhon-hon { font-weight:700; color:#105436; }
      #relatorios-cr-root .rhon-abono { font-weight:700; color:#c2410c; }
      #relatorios-cr-root .rhon-isen { display:inline-block; padding:1px 7px; border-radius:999px; background:#ffedd5; color:#c2410c; font-weight:700; font-size:.72rem; }
      #relatorios-cr-root .rhon-pbar-wrap { display:inline-flex; align-items:center; gap:8px; }
      #relatorios-cr-root .rhon-pbar { width:70px; height:6px; border-radius:999px; background:#e2e8f0; overflow:hidden; }
      #relatorios-cr-root .rhon-pbar span { display:block; height:100%; background:#16a34a; border-radius:999px; }
      #relatorios-cr-root .rhon-st { display:inline-block; border-radius:999px; padding:2px 9px; font-size:.7rem; font-weight:700; white-space:nowrap; }
      #relatorios-cr-root .rhon-st-pago { background:#dcfce7; color:#105436; }
      #relatorios-cr-root .rhon-st-aberto { background:#f1f5f9; color:#475569; }
      #relatorios-cr-root .rhon-st-vencido { background:#ffedd5; color:#c2410c; }
      #relatorios-cr-root .rhon-st-nd { background:#f8fafc; color:#94a3b8; border:1px dashed #cbd5e1; }
      #relatorios-cr-root .rhon-paid-at { font-size:.7rem; color:#64748b; margin-top:2px; }
      #relatorios-cr-root .rhon-empty { padding:40px; text-align:center; color:#64748b; background:#fff; border:1px dashed #cbd5e1; border-radius:8px; }
      #relatorios-cr-root .rhon-start { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#64748b; background:#fff; border:1px dashed #cbd5e1; border-radius:8px; text-align:center; padding:40px; }
      #relatorios-cr-root .rhon-start i { color:#105436; }
      #relatorios-cr-root .rhon-start strong { color:#0f172a; font-size:1rem; }
      #relatorios-cr-root .rhon-start span { font-size:.85rem; }
      #relatorios-cr-root .rhon-sync { display:flex; align-items:center; gap:6px; margin:-4px 0 10px; font-size:.75rem; color:#64748b; }
      #relatorios-cr-root .rhon-sync svg { color:#105436; }
      #relatorios-cr-root .rhon-sync-warn { color:#c2410c; }
      #relatorios-cr-root .rhon-sync-warn svg { color:#c2410c; }
      #relatorios-cr-root .rhon-error { padding:10px 12px; margin-bottom:12px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; border-radius:8px; font-size:.82rem; }
      #relatorios-cr-root .rhon-overlay { flex:1; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid #e2e8f0; border-radius:8px; }
      #relatorios-cr-root .rhon-loader { width:min(420px, 90%); display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
      #relatorios-cr-root .rhon-spin { width:48px; height:48px; border:5px solid #d1fae5; border-top-color:#105436; border-radius:50%; animation:rhon-rot .9s linear infinite; }
      #relatorios-cr-root .rhon-loader-title { font-weight:700; color:#105436; font-size:.95rem; margin-top:4px; }
      #relatorios-cr-root .rhon-loader-sub { font-size:.78rem; color:#64748b; }
      #relatorios-cr-root .rhon-track { width:100%; height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:6px; position:relative; }
      #relatorios-cr-root .rhon-fill { height:100%; background:linear-gradient(90deg, #16a34a, #105436); border-radius:999px; transition:width .3s ease; }
      #relatorios-cr-root .rhon-fill.is-indeterminate { width:35%; position:absolute; animation:rhon-slide 1.2s ease-in-out infinite; }
      #relatorios-cr-root .rhon-loader-count { font-size:.78rem; font-weight:600; color:#475569; font-variant-numeric:tabular-nums; min-height:1em; }
      @keyframes rhon-rot { to { transform:rotate(360deg); } }
      @keyframes rhon-slide { 0% { left:-35%; } 100% { left:100%; } }
      @media (max-width: 900px) { #relatorios-cr-root .rhon-cards { grid-template-columns:repeat(2, minmax(0,1fr)); } }
    `;
    document.head.appendChild(st);
  }
};

window.HonorariosReport = HonorariosReport;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "relatorios-cr") HonorariosReport.init();
});
