const RelacionamentoState = {
  activeTab: null,
  cliente: null,
  contrato: null
};

const RelacionamentoApp = {
  init() {
    this.renderAditamento();
    this.renderPermuta();
    this.renderTermos();
    this.renderHistorico();
    this.fillCartorioSelect();
  },

  DEFAULT_CARTORIOS: [
    "TABELIÃO DE NOTAS E DE PROTESTO DE LETRAS E TÍTULOS DE BOITUVA/SP",
    "OFICIAL DE REGISTRO CIVIL DAS PESSOAS NATURAIS E TABELIAO DE NOTAS DO MUNICIPIO DE ARAÇARIGUAMA/SP",
    "TABELIÃO DE NOTAS E DE PROTESTO DE LETRAS E TÍTULOS DE PIRAJU/SP",
    "1º TABELIÃO DE NOTAS E DE PROTESTO DE LETRAS E TÍTULOS DE BOTUCATU/SP",
    "2º TABELIAO DE NOTAS E DE PROTESTO DE LETRAS E TÍTULOS DE BOTUCATU/SP",
    "CARTÓRIO DE REGISTRO CIVIL DAS PESSOAS NATURAIS E TABELIONATO DO DISTRITO DE RUBIÃO JÚNIOR",
    "CARTÓRIO DE REGISTRO CIVIL E TABELIONATO DE TAGUAI/SP",
    "CARTÓRIO DE REGISTRO CIVIL E TABELIONATO DE FARTURA/SP",
    "OFICIAL DE REGISTRO CIVIL DAS PESSOAS NATURAIS E TABELIAO DE NOTAS DE BERNARDINO DE CAMPOS/SP",
    "CARTÓRIO DE NOTAS DA COMARCA DE CERQUEIRA CÉSAR/SP",
    "CARTÓRIO DE NOTAS DE MANDURI/SP",
    "1º TABELIAO DE NOTAS E PROTESTO DE AVARE/SP",
    "2º TABELIAO DE NOTAS E PROTESTOS DE AVARE/SP",
    "OFICIAL DE REGISTRO CIVIL DAS PESSOAS NATURAIS E TABELIÃO DE NOTAS DO MUNICÍPIO DE ARANDU",
    "CARTÓRIO DE NOTAS E PROTESTOS DE LARANJAL PAULISTA/SP"
  ],

  _normCartorioNome(s) {
    return String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  },

  getCartoriosList() {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem("crm_moura_cartorios_list") || "[]") || []; } catch (e) { saved = []; }
    const seed = this.DEFAULT_CARTORIOS.map((nome) => ({ nome: nome, deleted: false, updatedAt: 0 }));
    const merged = typeof window.mergeCartoriosList === "function"
      ? JSON.parse(window.mergeCartoriosList(JSON.stringify(saved), JSON.stringify(seed)) || "[]")
      : seed.concat(saved);
    const seen = new Set();
    const list = [];
    (Array.isArray(merged) ? merged : []).forEach((item) => {
      const nome = String((item && item.nome) || item || "").trim();
      const key = this._normCartorioNome(nome);
      if (!nome || !key || seen.has(key) || (item && item.deleted)) return;
      seen.add(key);
      list.push({ nome: nome, updatedAt: Number((item && item.updatedAt) || 0) });
    });
    list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return list;
  },

  persistCartoriosList(list) {
    localStorage.setItem("crm_moura_cartorios_list", JSON.stringify(list || []));
    if (window.forceUploadLocalConfig) window.forceUploadLocalConfig(true).catch(() => {});
  },

  fillCartorioSelect(selectedNome) {
    const sel = document.getElementById("esc-cartorio");
    if (!sel) return;
    const current = selectedNome != null ? selectedNome : sel.value;
    const list = this.getCartoriosList();
    sel.innerHTML = '<option value="">Selecione o cartório</option>' + list.map((c) => {
      const nome = c.nome || "";
      const esc = nome.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      return `<option value="${esc}">${esc}</option>`;
    }).join("");
    if (current) {
      const hit = list.find((c) => this._normCartorioNome(c.nome) === this._normCartorioNome(current));
      sel.value = hit ? hit.nome : current;
      if (sel.value !== current && current) {
        const opt = document.createElement("option");
        opt.value = current;
        opt.textContent = current;
        sel.appendChild(opt);
        sel.value = current;
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  pickCartorioForCidade(cidade) {
    const n = this._normCartorioNome(cidade).replace(/\/SP$/, "").trim();
    if (!n) return "";
    const list = this.getCartoriosList();
    const hit = list.find((c) => this._normCartorioNome(c.nome).includes(n));
    return hit ? hit.nome : "";
  },

  adicionarCartorio() {
    const box = document.getElementById("esc-cartorio-novo-box");
    const input = document.getElementById("esc-cartorio-novo-nome");
    if (box) box.style.display = "block";
    if (input) {
      input.value = "";
      input.focus();
    }
  },

  cancelarNovoCartorio() {
    const box = document.getElementById("esc-cartorio-novo-box");
    const input = document.getElementById("esc-cartorio-novo-nome");
    if (box) box.style.display = "none";
    if (input) input.value = "";
  },

  salvarNovoCartorio() {
    const input = document.getElementById("esc-cartorio-novo-nome");
    const nome = (input && input.value || "").trim();
    if (!nome) {
      alert("Informe o nome completo do cartório.");
      return;
    }
    const list = this.getCartoriosList();
    const key = this._normCartorioNome(nome);
    const exists = list.find((c) => this._normCartorioNome(c.nome) === key);
    if (!exists) {
      list.push({ nome: nome, deleted: false, updatedAt: Date.now() });
      this.persistCartoriosList(list);
    }
    this.fillCartorioSelect(nome);
    this.cancelarNovoCartorio();
  },

  _installmentSettled(inst) {
    if (typeof installmentIsSettled === "function") return installmentIsSettled(inst);
    if (!inst) return true;
    const sit = String(inst.installmentSituation || inst.situation || inst.status || "").toLowerCase();
    if (sit === "2" || sit === "paid" || /quitad|paga/.test(sit)) return true;
    if (inst.isValidReceipt === true) return true;
    const cb = inst.currentBalance;
    if (cb !== undefined && cb !== null && Number(cb) <= 0.009) return true;
    return false;
  },

  _todayKey() {
    if (typeof window.localDateStr === "function") return window.localDateStr(new Date());
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  },

  _dueKey(raw) {
    if (!raw) return "";
    if (typeof window.installmentDueIsoDate === "function") {
      const iso = window.installmentDueIsoDate(raw);
      if (iso) return iso;
    }
    if (typeof window.promiseDateKey === "function") {
      const k = window.promiseDateKey(raw);
      if (k) return k;
    }
    return String(raw).slice(0, 10);
  },

  _countParcelasVencidas(list) {
    const today = this._todayKey();
    return (Array.isArray(list) ? list : []).filter((p) => {
      if (this._installmentSettled(p)) return false;
      const bal = p.currentBalance;
      if (bal !== undefined && bal !== null && Number(bal) <= 0.009) return false;
      const delay = Number(p.daysOfDelay != null ? p.daysOfDelay : p.daysDelay);
      if (Number.isFinite(delay) && delay !== 0) return delay > 0;
      const dueRaw = p.originalDueDate || p.installmentDueDate || p.dataVencto || p.dueDate;
      const due = this._dueKey(dueRaw);
      return due && due < today;
    }).length;
  },

  _unitNumericId(ctx) {
    if (!ctx) return "";
    const details = ctx.unitDetails || {};
    const unit = ctx.unit || {};
    const bill = ctx.bill || {};
    const raw = details.id || details.unitId || bill.unitId || bill.unityId
      || (unit.id && !String(unit.id).startsWith("U-") ? unit.id : "");
    const digits = String(raw || "").replace(/\D/g, "");
    return digits || "";
  },

  _quadraLoteLabel(ctx) {
    if (!ctx) return "";
    const block = String(ctx.block || "").trim();
    const lot = String(ctx.lot || "").trim();
    if (block && lot) return block + "-" + lot;
    const unitName = String((ctx.sale && ctx.sale.unitId) || "").split("-").slice(2).join("-");
    return String(unitName || "").replace(/\s+/g, "") || "";
  },

  _codigoEmpreendimentoDoc(ctx) {
    if (!ctx) return "";
    const sale = ctx.sale || {};
    const bill = ctx.bill || {};
    const unit = ctx.unit || {};
    const details = ctx.unitDetails || {};
    return String(
      sale.enterpriseId || sale.costCenterId
      || bill.enterpriseId || bill.costCenterId || bill.enterpriseCode
      || unit.enterpriseId || unit.costCenterId
      || details.enterpriseId || details.costCenterId
      || ""
    ).trim();
  },

  _docHasTopoVars(text) {
    const first = String(text || "").split(/\r?\n/).find((ln) => String(ln).replace(/<[^>]+>/g, "").trim()) || "";
    const plain = first.replace(/<[^>]+>/g, "").trim();
    return /^t[ií]tulo\s*:/i.test(plain) || /\{\{\s*TITULO\s*\}\}/i.test(plain);
  },

  _ensureDocHeaderTopo(text, map) {
    let s = String(text || "").replace(/^\uFEFF/, "");
    const titulo = (map && map.TITULO) || "____";
    const unidade = (map && map.UNIDADE) || "____";
    s = s.replace(/\{\{\s*TITULO\s*\}\}/g, titulo).replace(/\{\{\s*UNIDADE\s*\}\}/g, unidade);
    if (this._docHasTopoVars(s)) return s;
    return "Título: " + titulo + " | Unidade: " + unidade + "\n\n" + s;
  },

  _resolveDocCorpo(cfg, corpoEl) {
    let saved = "";
    try {
      const t = JSON.parse(localStorage.getItem(cfg.storage) || "{}");
      saved = (t && t[cfg.corpoId]) || "";
    } catch (e) {}
    const live = (corpoEl && corpoEl.value) || "";
    const fallback = (corpoEl && corpoEl.defaultValue) || "";
    if (saved && this._docHasTopoVars(saved) && !this._docHasTopoVars(live)) return saved;
    return live || saved || fallback;
  },

  _formatUnidadeDoc(ctx) {
    if (!ctx) return "—";
    const sale = ctx.sale || {};
    const bill = ctx.bill || {};
    const empId = String(sale.enterpriseId || sale.costCenterId || bill.enterpriseId || bill.costCenterId || "").trim();
    const ql = this._quadraLoteLabel(ctx);
    if (empId && ql) return empId + " - " + ql;
    return empId || ql || "—";
  },

  async _avaliarAdimplencia(sale, bill) {
    const billId = (sale && sale.receivableBillId) || (bill && (bill.id || bill.receivableBillId));
    const customerId = (sale && sale.customerId) || (bill && bill.customerId);
    const labelVencidas = (n) => (n === 1 ? "1 parcela vencida" : n + " parcelas vencidas");

    if (customerId && window.SiengeApiService && typeof SiengeApiService.getCustomerFinancialStatements === "function") {
      try {
        const balRes = await SiengeApiService.getCustomerFinancialStatements(customerId);
        const bills = (balRes && balRes.results)
          ? balRes.results.flatMap((item) => item.billsReceivable || item.bills || [])
          : [];
        const dbContract = bills.find((db) =>
          String(db.billReceivableId) === String(billId)
          || String(db.receivableBillId) === String(billId)
          || String(db.id) === String(billId)
        ) || (bills.length === 1 ? bills[0] : null);
        const instList = dbContract && Array.isArray(dbContract.installments) ? dbContract.installments : [];
        if (instList.length) {
          const n = this._countParcelasVencidas(instList);
          if (n) return { adimplente: false, vencidas: n, label: labelVencidas(n), installments: instList };
          return { adimplente: true, vencidas: 0, label: "Adimplente", installments: instList };
        }
      } catch (e) {
        console.warn("[Relacionamento] falha ao avaliar adimplência pelo extrato", e);
      }
    }

    if (billId && window.SiengeApiService && typeof SiengeApiService.getBillInstallments === "function") {
      try {
        const inst = await SiengeApiService.getBillInstallments(billId);
        const list = Array.isArray(inst) ? inst : [];
        if (list.length) {
          const n = this._countParcelasVencidas(list);
          if (n) return { adimplente: false, vencidas: n, label: labelVencidas(n), installments: list };
          return { adimplente: true, vencidas: 0, label: "Adimplente", installments: list };
        }
      } catch (e) {
        console.warn("[Relacionamento] falha ao avaliar adimplência pelas parcelas", e);
      }
    }

    const status = String((sale && sale.status) || "").toLowerCase();
    if (status === "quitado" || (bill && bill.payOffDate)) {
      return { adimplente: true, vencidas: 0, label: "Adimplente", installments: [] };
    }
    return { adimplente: true, vencidas: 0, label: "Adimplente", installments: [] };
  },

  _formatContratoDoc(sale, bill) {
    let s = "";
    const docId = String((bill && bill.documentId) || "").trim();
    const docNum = String((bill && (bill.documentNumber || bill.number)) || "").trim();
    if (docId && docNum) s = docId + docNum;
    else if (docNum) s = docNum;
    else s = String((sale && (sale.contractNumber || sale.number || sale.documentNumber)) || "").trim();
    s = s.replace(/^CT[\.\s-]*/i, "").trim();
    if (!s || /^\d+$/.test(s)) {
      const alt = String((sale && sale.contractNumber) || "").replace(/^CT[\.\s-]*/i, "").trim();
      if (alt && !/^\d+$/.test(alt)) s = alt;
    }
    return s || "—";
  },

  _escDoc(s) {
    if (typeof window.escapeHtmlText === "function") return window.escapeHtmlText(String(s == null ? "" : s));
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  _docLoadingHtml(msg) {
    return `<div style="padding:32px 16px;text-align:center;color:var(--color-text-muted);">
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;margin:0 auto;">
        <div class="loading-spinner" aria-hidden="true"></div>
        <span style="font-weight:500;">${this._escDoc(msg || "Carregando...")}</span>
      </div>
    </div>`;
  },

  _docCopyBtn(value) {
    const raw = String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    if (!raw) return "";
    return `<button type="button" onclick="copyToClipboard('${raw}', this)" style="background:none;border:none;padding:4px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:0.7;" title="Copiar"><i data-lucide="copy" style="width:14px;height:14px;color:var(--color-primary);"></i></button>`;
  },

  _docFmtCpfCnpj(val) {
    const clean = String(val || "").replace(/\D/g, "");
    if (clean.length === 11) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (clean.length === 14) return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    if (typeof formatCpfCnpj === "function") {
      const alt = formatCpfCnpj(val);
      if (alt && alt !== "N/D") return alt;
    }
    return clean || "";
  },

  _docNormPhoneDigits(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
    d = d.replace(/^0+/, "");
    if (d.length > 11 && d.charAt(2) === "9") d = d.slice(0, 11);
    if (d.length > 11) d = d.slice(-11);
    return d;
  },

  _docFmtPhoneDigits(digits) {
    const d = this._docNormPhoneDigits(digits);
    if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    if (d.length === 9) return d.slice(0, 5) + "-" + d.slice(5);
    if (d.length === 8) return d.slice(0, 4) + "-" + d.slice(4);
    return d || "";
  },

  _docPhonesHtml(customer) {
    const list = [];
    const seen = new Set();
    const push = (formatted, raw, isMain) => {
      if (!formatted || seen.has(formatted)) return;
      seen.add(formatted);
      list.push({ formatted, raw: raw || formatted.replace(/\D/g, ""), isMain: !!isMain });
    };
    (customer && customer.phones ? customer.phones : []).forEach((p) => {
      const ddd = String(p.areaCode || "").replace(/\D/g, "").replace(/^0+/, "");
      let num = String(p.number || p.phoneNumber || "").replace(/\D/g, "");
      if (!ddd && num.startsWith("0") && num.length >= 11) num = num.replace(/^0+/, "");
      const full = ddd + num;
      const formatted = this._docFmtPhoneDigits(full)
        || (ddd ? "(" + ddd + ") " + (p.number || p.phoneNumber || "") : (p.number || p.phoneNumber || ""));
      const main = p.main === true || String(p.type || "").toUpperCase() === "MAIN" || String(p.type || "").toUpperCase() === "CELULAR";
      push(formatted, this._docNormPhoneDigits(full) || full || num, main);
    });
    if (!list.length && customer && customer.phone && customer.phone !== "N/D" && customer.phone !== "undefined") {
      const raw = String(customer.phone).replace(/\D/g, "");
      push(this._docFmtPhoneDigits(raw) || customer.phone, this._docNormPhoneDigits(raw) || raw, true);
    }
    if (list.length && !list.some((p) => p.isMain)) list[0].isMain = true;
    let foundMain = false;
    list.forEach((p) => {
      if (p.isMain && !foundMain) foundMain = true;
      else p.isMain = false;
    });
    if (!list.length) {
      return `<span class="cessao-val" style="display:flex;align-items:center;gap:8px;"><i data-lucide="phone" style="width:15px;height:15px;color:var(--color-primary);flex-shrink:0;"></i> <span>Não informado</span></span>`;
    }
    return `<div style="display:flex;flex-direction:column;gap:4px;">` + list.map((p) => `
      <div style="display:flex;align-items:center;gap:8px;">
        <i data-lucide="phone" style="width:15px;height:15px;color:var(--color-primary);"></i>
        <span class="cessao-val" style="margin:0;">${this._escDoc(p.formatted)}</span>
        ${p.isMain ? '<span class="badge badge-success" style="font-size:0.6rem;padding:2px 6px;text-transform:none;">Principal</span>' : ""}
        ${this._docCopyBtn(p.raw)}
      </div>`).join("") + `</div>`;
  },

  _docAgeLabel(customer) {
    const c = customer || {};
    const doc = String(c.cpfCnpj || c.cpf || c.cnpj || "").replace(/\D/g, "");
    if (doc.length > 11) return "Não se aplica";
    if (!c.birthDate || c.birthDate === "1980-01-01") return "Não informado";
    const birth = new Date(String(c.birthDate).indexOf("T") >= 0 ? c.birthDate : c.birthDate + "T12:00:00");
    if (isNaN(birth.getTime())) return "Não informado";
    const today = new Date();
    let diff = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) diff--;
    return diff + " anos";
  },

  _docProfIcon(prof) {
    const lower = String(prof || "").toLowerCase();
    if (lower.includes("engenh") || lower.includes("arquit")) return "hammer";
    if (lower.includes("médic") || lower.includes("medic") || lower.includes("enferm") || lower.includes("dentis")) return "stethoscope";
    if (lower.includes("advogad") || lower.includes("juiz") || lower.includes("promotor")) return "scale";
    if (lower.includes("estudant")) return "graduation-cap";
    if (lower.includes("aposent")) return "sunset";
    return "briefcase";
  },

  _docAddressInfo(customer) {
    const c = customer || {};
    if (c.addresses && c.addresses.length) {
      const a = c.addresses[0];
      const isCommercial = a.type === 2 || String(a.typeDescription || a.type || "").toUpperCase().includes("COM");
      const street = a.street || a.streetName || "";
      const num = a.number ? ", " + a.number : "";
      const compl = a.complement ? " - " + a.complement : "";
      const neigh = a.neighborhood ? ", " + a.neighborhood : "";
      const city = a.cityName || a.city || "";
      const state = a.stateName || a.state || "";
      const zip = (a.postalCode || a.zipCode) ? " - CEP: " + (a.postalCode || a.zipCode) : "";
      return {
        label: isCommercial ? "Endereço Comercial" : "Endereço Residencial",
        icon: isCommercial ? "building" : "home",
        str: (street + num + compl + neigh + (city || state ? ", " + city + "/" + state : "") + zip).trim() || "Não informado"
      };
    }
    if (c.address && c.address !== "N/D") {
      return { label: "Endereço", icon: "home", str: String(c.address) };
    }
    return { label: "Endereço", icon: "home", str: "Não informado" };
  },

  _docDataVenda(sale, bill) {
    const raw = (sale && (sale.contractDate || sale.saleDate || sale.date)) || (bill && bill.issueDate);
    if (!raw) return "—";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "—";
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000).toLocaleDateString("pt-BR");
  },

  _docPessoasExtraFields(customer, sale) {
    const esc = (v) => this._escDoc(v);
    const civil = (customer && (customer.civilStatus || customer.maritalStatus)) || "—";
    const regime = customer && customer.matrimonialRegime ? " — " + customer.matrimonialRegime : "";
    const sp = (customer && customer.spouse) || {};
    let spName = sp.name || (customer && customer.spouseName) || "";
    let spCpf = sp.cpf || sp.cpfCnpj || (customer && customer.spouseCpf) || "";
    const people = (typeof window.salesContractPeople === "function") ? window.salesContractPeople(sale) : [];
    const cid = String((customer && customer.id) || (sale && sale.customerId) || "");
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!spName) {
      const fromPeople = people.find((p) => p.spouse);
      if (fromPeople) {
        spName = fromPeople.name || "";
        spCpf = spCpf || fromPeople.cpfCnpj || "";
      }
    }
    if (spCpf) spCpf = this._docFmtCpfCnpj(spCpf) || spCpf;
    const secondary = people.filter((p) => {
      if (p.main) return false;
      if (String(p.id) === cid) return false;
      if (p.spouse) return false;
      if (spName && norm(p.name) === norm(spName)) return false;
      return true;
    });
    let html = `<div class="cessao-customer-field"><span class="cessao-lbl">Estado civil</span><span class="cessao-val">${esc(civil)}${esc(regime)}</span></div>`;
    if (spName) {
      html += `<div class="cessao-customer-field"><span class="cessao-lbl">Cônjuge</span><span class="cessao-val">${esc(spName)}${spCpf ? `<div style="font-size:0.75rem;color:#64748b;margin-top:2px;font-weight:500;">CPF ${esc(spCpf)}</div>` : ""}</span></div>`;
    }
    if (secondary.length) {
      const lines = secondary.map((p) => {
        const pct = p.participationPercentage != null ? " (" + p.participationPercentage + "%)" : "";
        return esc(p.name) + pct;
      }).join("<br>");
      html += `<div class="cessao-customer-field cessao-customer-field--wide"><span class="cessao-lbl">Clientes secundários</span><span class="cessao-val">${lines}</span></div>`;
    }
    return html;
  },

  _docDadosClienteHtml(customer, sale) {
    const c = customer || {};
    const docRaw = String(c.cpfCnpj || c.cpf || c.cnpj || "").replace(/\D/g, "");
    const docLabel = docRaw.length > 11 ? "CNPJ" : "CPF";
    const docFmt = this._docFmtCpfCnpj(docRaw || c.cpfCnpj || "") || "—";
    const age = this._docAgeLabel(c);
    const prof = c.profession || c.occupation || "N/D";
    const profIcon = this._docProfIcon(prof);
    const hasEmail = c.email && c.email !== "N/D" && c.email !== "undefined";
    const addr = this._docAddressInfo(c);
    const people = (typeof window.salesContractPeople === "function") ? window.salesContractPeople(sale) : [];
    const cid = String(c.id || (sale && sale.customerId) || "");
    const mainP = people.find((p) => p.main) || people[0];
    const me = people.find((p) => String(p.id) === cid);
    const secondaryBanner = (me && mainP && !me.main && String(me.id) !== String(mainP.id) && mainP.name)
      ? `<div style="margin:0 18px 10px;padding:10px 12px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:0.85rem;font-weight:700;">Este cliente é <strong>comprador secundário</strong> no contrato. Cliente principal: ${this._escDoc(mainP.name)}.</div>`
      : "";
    return `
      ${secondaryBanner}
      <div class="cessao-customer-grid" style="padding:16px 18px;">
        <div class="cessao-customer-field cessao-customer-field--wide">
          <span class="cessao-lbl">Nome</span>
          <span class="cessao-val">${this._escDoc(c.name || "—")}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">${docLabel}</span>
          <span class="cessao-val" style="display:flex;align-items:center;gap:8px;">
            ${this._escDoc(docFmt || "—")}
            ${docRaw ? this._docCopyBtn(docRaw) : ""}
          </span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Idade</span>
          <span class="cessao-val" style="display:flex;align-items:center;gap:8px;">
            <i data-lucide="calendar" style="width:15px;height:15px;color:var(--color-primary);flex-shrink:0;"></i>
            <span>${this._escDoc(age)}</span>
          </span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Profissão</span>
          <span class="cessao-val" style="display:flex;align-items:center;gap:8px;">
            <i data-lucide="${profIcon}" style="width:15px;height:15px;color:var(--color-primary);flex-shrink:0;"></i>
            <span>${this._escDoc(prof)}</span>
          </span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Telefones</span>
          ${this._docPhonesHtml(c)}
        </div>
        <div class="cessao-customer-field cessao-customer-field--wide">
          <span class="cessao-lbl">E-mail</span>
          <span class="cessao-val" style="display:flex;align-items:center;gap:8px;">
            <i data-lucide="mail" style="width:15px;height:15px;color:var(--color-primary);flex-shrink:0;"></i>
            <span style="word-break:break-all;">${this._escDoc(hasEmail ? c.email : "Não informado")}</span>
            ${hasEmail ? this._docCopyBtn(c.email) : ""}
          </span>
        </div>
        <div class="cessao-customer-field cessao-customer-field--full">
          <span class="cessao-lbl">${this._escDoc(addr.label)}</span>
          <span class="cessao-val" style="display:flex;align-items:flex-start;gap:8px;">
            <i data-lucide="${addr.icon}" style="width:15px;height:15px;color:var(--color-primary);flex-shrink:0;margin-top:2px;"></i>
            <span>${this._escDoc(addr.str)}</span>
          </span>
        </div>
      </div>`;
  },

  _docContratoHtml(ctx) {
    const sale = (ctx && ctx.sale) || {};
    const bill = (ctx && ctx.bill) || {};
    const customer = (ctx && ctx.customer) || {};
    const adimplencia = (ctx && ctx.adimplencia) || { adimplente: true, label: "Adimplente" };
    const sitColor = adimplencia.adimplente ? "#15803d" : "#b91c1c";
    const sitBg = adimplencia.adimplente ? "#ecfdf5" : "#fef2f2";
    const sitBd = adimplencia.adimplente ? "#86efac" : "#fecaca";
    const titulo = sale.receivableBillId || bill.id || "—";
    const contratoLabel = ctx.contratoLabel || this._formatContratoDoc(sale, bill);
    const unidadeLabel = this._formatUnidadeDoc(ctx);
    const empName = ctx.empName || "—";
    const dataVenda = this._docDataVenda(sale, bill);
    return `
      <div class="cessao-customer-grid" style="padding:0 0 4px;">
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Contrato</span>
          <span class="cessao-val">${this._escDoc(contratoLabel)}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Título</span>
          <span class="cessao-val">${this._escDoc(titulo)}</span>
        </div>
        <div class="cessao-customer-field cessao-customer-field--wide">
          <span class="cessao-lbl">Empreendimento</span>
          <span class="cessao-val">${this._escDoc(empName)}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Unidade</span>
          <span class="cessao-val">${this._escDoc(unidadeLabel)}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Data venda</span>
          <span class="cessao-val">${this._escDoc(dataVenda)}</span>
        </div>
        <div class="cessao-customer-field">
          <span class="cessao-lbl">Status</span>
          <span class="cessao-val"><span style="background:${sitBg};border:1px solid ${sitBd};color:${sitColor};padding:4px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;">${this._escDoc(adimplencia.label)}</span></span>
        </div>
        ${this._docPessoasExtraFields(customer, sale)}
      </div>`;
  },

  _setVencimentoBloqueado(blocked, motivo) {
    const dia = document.getElementById("ven-dia");
    const orig = document.getElementById("ven-data-original");
    const gen = document.querySelector('#ven-doc-card [onclick*="gerarDocSimplesPdf"]');
    if (dia) {
      dia.disabled = !!blocked;
      if (blocked) dia.value = "";
    }
    if (orig) {
      orig.disabled = !!blocked;
      if (blocked) {
        orig.value = "";
        orig.removeAttribute("min");
        orig.removeAttribute("max");
      }
    }
    if (gen) {
      gen.disabled = !!blocked;
      gen.style.opacity = blocked ? "0.55" : "";
      gen.style.cursor = blocked ? "not-allowed" : "";
    }
    const preview = document.getElementById("ven-preview");
    if (preview) {
      if (blocked) {
        preview.innerHTML = `<span style="color:#b91c1c;font-weight:700;">Não é possível alterar o vencimento: ${this._escDoc(motivo || "o cliente possui parcelas vencidas")}.</span>`;
      } else if (!dia || !dia.value) {
        preview.textContent = "";
      }
    }
  },

  _janelaMesAlteracaoVencimento() {
    const n = new Date();
    const next = new Date(n.getFullYear(), n.getMonth() + 1, 1);
    const y = next.getFullYear();
    const m = next.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    return {
      year: y,
      month: m,
      lastDay,
      prefix: y + "-" + mm,
      min: y + "-" + mm + "-01",
      max: y + "-" + mm + "-" + String(lastDay).padStart(2, "0")
    };
  },

  _isoInJanelaVencimento(iso) {
    const w = this._janelaMesAlteracaoVencimento();
    const key = String(iso || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= w.min && key <= w.max;
  },

  _dataOriginalPadraoVencimento(installments) {
    const w = this._janelaMesAlteracaoVencimento();
    const list = Array.isArray(installments) ? installments : [];
    const inMonth = [];
    let typicalDay = 0;
    const today = new Date();
    const curPrefix = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
    list.forEach((p) => {
      const due = this._dueKey(p.originalDueDate || p.installmentDueDate || p.dataVencto || p.dueDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return;
      const day = Number(due.slice(8, 10));
      if (due.slice(0, 7) === w.prefix) {
        inMonth.push({ due, settled: this._installmentSettled(p) });
      }
      if (due.slice(0, 7) === curPrefix && day >= 1 && day <= 31) typicalDay = day;
      else if (!typicalDay && day >= 1 && day <= 31) typicalDay = day;
    });
    const open = inMonth.find((x) => !x.settled);
    if (open) return open.due;
    if (inMonth.length) return inMonth[0].due;
    const day = Math.min(typicalDay || 1, w.lastDay);
    return w.prefix + "-" + String(day).padStart(2, "0");
  },

  _aplicarJanelaCalendarioVencimento(installments) {
    const orig = document.getElementById("ven-data-original");
    if (!orig || orig.disabled) return this._janelaMesAlteracaoVencimento();
    const w = this._janelaMesAlteracaoVencimento();
    orig.min = w.min;
    orig.max = w.max;
    const padrao = this._dataOriginalPadraoVencimento(installments);
    if (!this._isoInJanelaVencimento(orig.value)) orig.value = padrao;
    this._popularOpcoesDiaVencimento();
    return w;
  },

  _diasVencimentoPermitidos() {
    return [10, 15, 20];
  },

  _diaOriginalVencimento() {
    const orig = document.getElementById("ven-data-original")?.value || "";
    const key = typeof window.promiseDateKey === "function" ? window.promiseDateKey(orig) : String(orig).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return 0;
    return Number(key.slice(8, 10)) || 0;
  },

  _popularOpcoesDiaVencimento() {
    const sel = document.getElementById("ven-dia");
    if (!sel) return;
    const blocked = this._diaOriginalVencimento();
    const prev = String(sel.value || "");
    const days = this._diasVencimentoPermitidos().filter((d) => d !== blocked);
    sel.innerHTML = '<option value="">Selecione</option>' +
      days.map((d) => '<option value="' + d + '">' + d + "</option>").join("");
    sel.value = (prev && days.some((d) => String(d) === prev)) ? prev : "";
  },

  onDataOriginalVencimentoChange() {
    this._garantirDataOriginalNaJanela();
    this._popularOpcoesDiaVencimento();
    this.atualizarPreviewVencimento();
  },

  _garantirDataOriginalNaJanela() {
    const orig = document.getElementById("ven-data-original");
    if (!orig || orig.disabled) return true;
    const ctx = RelacionamentoState.vencimento || {};
    const inst = ctx.installments || (ctx.adimplencia && ctx.adimplencia.installments) || [];
    this._aplicarJanelaCalendarioVencimento(inst);
    if (orig.value && !this._isoInJanelaVencimento(orig.value)) {
      orig.value = this._dataOriginalPadraoVencimento(inst);
    }
    return this._isoInJanelaVencimento(orig.value);
  },

  onDocSearchKey(event, kind) {
    if (!event || (event.key !== "Enter" && event.key !== "Tab")) return;
    const titulo = (this._docEl(kind, "-filter-titulo")?.value || "").replace(/\D/g, "");
    const contrato = (this._docEl(kind, "-filter-contrato")?.value || "").trim();
    const nome = (this._docEl(kind, "-filter-nome")?.value || "").trim();
    if (!titulo && !contrato && !nome && !window.SelectedDynamicCustomerId) return;
    if (event.key === "Enter") event.preventDefault();
    if (this._docSearchTimer) clearTimeout(this._docSearchTimer);
    this._docSearchTimer = setTimeout(() => this.buscarDocSimples(kind), event.key === "Tab" ? 40 : 0);
  },

  maskDocCpf(el) {
    if (!el) return;
    if (typeof maskCpfCnpjTyping === "function") {
      el.value = maskCpfCnpjTyping(el.value);
      this._atualizarBtnGerarTerceiro();
      return;
    }
    const formatted = this._docFmtCpfCnpj(el.value);
    if (formatted) el.value = formatted;
    else {
      let v = String(el.value || "").replace(/\D/g, "").slice(0, 14);
      if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, "$1.$2.$3/$4-$5");
      else if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
      else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
      else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
      el.value = v;
    }
    this._atualizarBtnGerarTerceiro();
  },

  maskDocFone(el) {
    if (!el) return;
    const v = this._docNormPhoneDigits(el.value);
    if (!v) el.value = "";
    else if (v.length <= 2) el.value = "(" + v;
    else if (v.length <= 6) el.value = "(" + v.slice(0, 2) + ") " + v.slice(2);
    else if (v.length <= 10) el.value = "(" + v.slice(0, 2) + ") " + v.slice(2, 6) + "-" + v.slice(6);
    else el.value = "(" + v.slice(0, 2) + ") " + v.slice(2, 7) + "-" + v.slice(7);
    this._atualizarBtnGerarTerceiro();
  },

  _foneFromCustomer(c) {
    if (!c) return "";
    const phones = Array.isArray(c.phones) ? c.phones : [];
    const main = phones.find((p) => p && (p.main === true || String(p.type || "").toUpperCase() === "MAIN")) || phones[0];
    let digits = "";
    if (main) {
      const ddd = String(main.areaCode || "").replace(/\D/g, "").replace(/^0+/, "");
      const num = String(main.number || main.phoneNumber || "").replace(/\D/g, "");
      digits = ddd + num;
    }
    if (!digits) digits = String(c.phone || c.mobilePhone || "").replace(/\D/g, "");
    return this._docFmtPhoneDigits(digits);
  },

  _valorTerceiro(id) {
    return String(document.getElementById(id)?.value || "").trim();
  },

  _camposTerceiroFaltando() {
    const nome = this._valorTerceiro("ter-nome");
    const rg = this._valorTerceiro("ter-rg");
    const cpfDigits = this._valorTerceiro("ter-cpf").replace(/\D/g, "");
    const foneDigits = this._docNormPhoneDigits(this._valorTerceiro("ter-fone"));
    const missing = [];
    if (!nome) missing.push("nome");
    if (!rg) missing.push("RG");
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) missing.push("CPF/CNPJ");
    if (foneDigits.length < 10) missing.push("telefone");
    return missing;
  },

  _atualizarBtnGerarTerceiro() {
    const btn = document.getElementById("ter-btn-gerar");
    if (!btn) return;
    const ok = this._camposTerceiroFaltando().length === 0;
    btn.disabled = !ok;
    btn.style.opacity = ok ? "" : "0.55";
    btn.style.cursor = ok ? "" : "not-allowed";
    btn.title = ok ? "" : "Preencha nome, RG, CPF/CNPJ e telefone do terceiro.";
  },

  _lockTerceiroDocs(lock) {
    ["ter-rg", "ter-cpf", "ter-fone"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.readOnly = !!lock;
      el.style.background = lock ? "#f1f5f9" : "";
      el.style.cursor = lock ? "not-allowed" : "";
    });
  },

  _limparCamposTerceiro() {
    RelacionamentoState.terceiroClienteId = null;
    RelacionamentoState.terceiroClienteName = null;
    ["ter-rg", "ter-cpf", "ter-fone"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    this._lockTerceiroDocs(false);
    this._atualizarBtnGerarTerceiro();
  },

  _aplicarDadosTerceiro(c) {
    if (!c) return;
    const rgEl = document.getElementById("ter-rg");
    const cpfEl = document.getElementById("ter-cpf");
    const foneEl = document.getElementById("ter-fone");
    const rg = (typeof window.pickCustomerRg === "function")
      ? window.pickCustomerRg(c)
      : (c.rg || c.numberIdentityCard || c.identityCard || "");
    if (rgEl) rgEl.value = rg || "";
    const doc = c.cpfCnpj || c.cpf || c.cnpj || "";
    if (cpfEl) {
      cpfEl.value = doc;
      this.maskDocCpf(cpfEl);
    }
    if (foneEl) foneEl.value = this._foneFromCustomer(c);
    this._atualizarBtnGerarTerceiro();
  },

  onTerceiroNomeInput(el) {
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = String(el.value || "").toUpperCase();
    try { el.setSelectionRange(start, end); } catch (e) {}
    const selectedId = RelacionamentoState.terceiroClienteId;
    const selectedName = RelacionamentoState.terceiroClienteName || "";
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!String(el.value || "").trim()) {
      this._limparCamposTerceiro();
      this.sugerirTerceiroNome("");
      this._atualizarBtnGerarTerceiro();
      return;
    }
    if (selectedId && norm(el.value) !== norm(selectedName)) {
      RelacionamentoState.terceiroClienteId = null;
      RelacionamentoState.terceiroClienteName = null;
      this._lockTerceiroDocs(false);
    }
    this.sugerirTerceiroNome(el.value);
    this._atualizarBtnGerarTerceiro();
  },

  sugerirTerceiroNome(query) {
    const dd = document.getElementById("ter-terceiro-dropdown");
    if (!dd) return;
    const normalizeStr = (str) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    const qNorm = normalizeStr(query);
    if (!qNorm || !window.GlobalCustomerCache || !window.GlobalCustomerCache.data) {
      dd.style.display = "none";
      dd.innerHTML = "";
      return;
    }
    const terms = qNorm.split(" ").filter((t) => t);
    const matches = window.GlobalCustomerCache.data.filter((c) => {
      const cName = normalizeStr(c.name);
      return terms.every((term) => cName.includes(term));
    }).slice(0, 12);
    if (!matches.length) {
      dd.style.display = "none";
      return;
    }
    dd.innerHTML = "";
    matches.forEach((c) => {
      const item = document.createElement("div");
      item.style.cssText = "padding:8px 12px;cursor:pointer;font-size:0.85rem;border-bottom:1px solid #f3f4f6;";
      const doc = this._docFmtCpfCnpj(c.cpf || c.cnpj || c.cpfCnpj || "") || "";
      item.textContent = (c.id ? c.id + " - " : "") + (c.name || "") + (doc ? " - " + doc : "");
      item.onmouseover = () => { item.style.background = "#f0fdf4"; };
      item.onmouseout = () => { item.style.background = "#fff"; };
      item.onmousedown = (ev) => {
        ev.preventDefault();
        dd.style.display = "none";
        this.selecionarTerceiroCliente(c);
      };
      dd.appendChild(item);
    });
    dd.style.display = "block";
    dd.style.top = "calc(100% + 4px)";
    dd.style.left = "0";
    dd.style.zIndex = "80";
  },

  async selecionarTerceiroCliente(c) {
    if (!c) return;
    RelacionamentoState.terceiroClienteId = c.id;
    RelacionamentoState.terceiroClienteName = c.name || "";
    const nomeEl = document.getElementById("ter-nome");
    if (nomeEl) nomeEl.value = String(c.name || "").toUpperCase();
    this._aplicarDadosTerceiro(c);
    this._lockTerceiroDocs(true);
    this._atualizarBtnGerarTerceiro();
    if (c.id && window.SiengeApiService && typeof SiengeApiService.getCustomer === "function") {
      try {
        let full = await SiengeApiService.getCustomer(c.id);
        if (typeof window.enrichCustomerForLegalDocs === "function") {
          full = await window.enrichCustomerForLegalDocs(full);
        }
        if (String(RelacionamentoState.terceiroClienteId) === String(c.id)) {
          this._aplicarDadosTerceiro(full || c);
          this._lockTerceiroDocs(true);
          this._atualizarBtnGerarTerceiro();
        }
      } catch (e) {
        console.warn("[Relacionamento] não foi possível carregar o cadastro do terceiro", e);
      }
    }
  },

  abrirExtratoDoc(kind) {
    const ctx = RelacionamentoState[kind];
    if (!ctx || !ctx.sale) {
      alert("Busque o contrato antes de abrir o extrato.");
      return;
    }
    const btn = this._docEl(kind, "-btn-extrato");
    if (!btn || typeof window.visualizarExtratoDireto !== "function") {
      alert("Não foi possível abrir o extrato.");
      return;
    }
    btn.dataset.customerId = ctx.sale.customerId || (ctx.customer && ctx.customer.id) || "";
    btn.dataset.title = ctx.sale.receivableBillId || (ctx.bill && ctx.bill.id) || "";
    btn.dataset.name = (ctx.customer && ctx.customer.name) || "";
    btn.dataset.unit = this._formatUnidadeDoc(ctx);
    btn.dataset.cc = ctx.sale.enterpriseId || "";
    window.visualizarExtratoDireto(btn);
  },

  async _avaliarContratoQuitado(sale, bill) {
    const status = String((sale && sale.status) || "").toLowerCase();
    if (status === "quitado") return { quitado: true, motivo: "Status do contrato: Quitado" };
    if (bill && bill.payOffDate) return { quitado: true, motivo: "Título com data de quitação" };
    const bals = [
      sale && sale.outstandingBalance,
      bill && bill.outstandingBalance,
      bill && bill.balance,
      bill && bill.currentBalance
    ].filter((v) => v !== undefined && v !== null && v !== "");
    if (bals.length && bals.every((v) => Number(v) <= 0.009)) {
      return { quitado: true, motivo: "Saldo do contrato zerado" };
    }
    const perc = Number(sale && sale.percPaid);
    if (Number.isFinite(perc) && perc >= 0.999) return { quitado: true, motivo: "Contrato 100% pago" };
    const billId = (sale && sale.receivableBillId) || (bill && (bill.id || bill.receivableBillId));
    if (billId && window.SiengeApiService && SiengeApiService.getBillInstallments) {
      try {
        const inst = await SiengeApiService.getBillInstallments(billId);
        const list = Array.isArray(inst) ? inst : [];
        if (list.length) {
          const open = list.filter((p) => !this._installmentSettled(p));
          if (!open.length) return { quitado: true, motivo: "Todas as parcelas baixadas" };
          return { quitado: false, motivo: open.length + " parcela(s) em aberto" };
        }
      } catch (e) {}
    }
    return { quitado: false, motivo: "Não foi possível confirmar a quitação no Sienge" };
  },

  renderBuscaCliente(contextId) {
    return `
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header">
          <h3 style="margin: 0; color: var(--color-primary);"><i data-lucide="search"></i> Buscar Cliente ou Contrato</h3>
        </div>
        <div class="card-body">
          <div style="display: flex; gap: 15px;">
            <div style="flex: 1;">
              <label style="font-weight: 500; font-size: 0.9rem; color: var(--color-text-muted);">CPF/CNPJ, Nome ou Contrato</label>
              <input type="text" id="relacionamento-busca-${contextId}" class="form-control" placeholder="Digite para buscar..." onkeydown="if(event.key === 'Enter') RelacionamentoApp.buscarCliente('${contextId}')">
            </div>
            <div style="align-self: flex-end;">
              <button class="btn btn-primary" onclick="RelacionamentoApp.buscarCliente('${contextId}')"><i data-lucide="search" style="width:16px;"></i> Buscar</button>
            </div>
          </div>
          <div id="relacionamento-resultado-${contextId}" style="margin-top: 20px;"></div>
        </div>
      </div>
    `;
  },

  async buscarCliente(contextId) {
    const term = document.getElementById(`relacionamento-busca-${contextId}`).value;
    if (!term) return;
    
    const resEl = document.getElementById(`relacionamento-resultado-${contextId}`);
    resEl.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--color-text-muted);"><i data-lucide="loader" class="lucide-spin" style="width:24px; height:24px; margin-bottom: 10px;"></i><br>Buscando <strong>${term}</strong> no Sienge...</div>`;
    lucide.createIcons();

    // Simulação de busca
    setTimeout(() => {
      resEl.innerHTML = `
        <div style="padding: 15px; border: 1px solid var(--color-border); border-radius: 6px; background: #fafafa;">
          <h4 style="margin: 0 0 10px 0; color: var(--color-text-dark);">JOÃO DA SILVA SA</h4>
          <div style="display: flex; gap: 20px; margin-bottom: 15px; font-size: 0.9rem;">
            <div><i data-lucide="file-text" style="width:14px;"></i> Contrato: <strong>159458</strong></div>
            <div><i data-lucide="check-circle" style="width:14px; color: var(--color-success);"></i> Status: <strong style="color: var(--color-success);">ATIVO</strong></div>
            <div><i data-lucide="alert-circle" style="width:14px; color: var(--color-danger);"></i> Inadimplência: <strong>Não</strong></div>
          </div>
          <button class="btn btn-outline" style="border-color: var(--color-primary); color: var(--color-primary);" onclick="RelacionamentoApp.selecionarContrato('${contextId}', '159458')">Selecionar Contrato</button>
        </div>
      `;
      lucide.createIcons();
    }, 1000);
  },

  selecionarContrato(contextId, contratoId) {
    const rootForm = document.getElementById(`relacionamento-form-${contextId}`);
    if (rootForm) {
      rootForm.style.display = 'block';
      rootForm.scrollIntoView({ behavior: 'smooth' });
    }
  },

  renderCessao() {
    const root = document.getElementById('relacionamento-cessao-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="file-text" style="color: var(--color-primary);"></i> Cessão de Direitos</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Transfira a titularidade do contrato para um novo cliente (Cessionário).</p>
      </div>
      ${this.renderBuscaCliente('cessao')}
      
      <div id="relacionamento-form-cessao" class="card" style="display: none; border-top: 4px solid var(--color-primary);">
        <div class="card-header">
          <h3 style="margin: 0;"><i data-lucide="user-plus"></i> Dados do Cessionário (Novo Titular)</h3>
        </div>
        <div class="card-body">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <label style="font-weight:500;">Nome Completo</label>
              <input type="text" class="form-control" placeholder="Nome do novo titular">
            </div>
            <div>
              <label style="font-weight:500;">CPF/CNPJ</label>
              <input type="text" class="form-control" placeholder="000.000.000-00">
            </div>
            <div style="grid-column: span 2;">
              <label style="font-weight:500;">Motivo da Cessão</label>
              <textarea class="form-control" rows="3" placeholder="Descreva o motivo..."></textarea>
            </div>
          </div>
        </div>
        <div class="card-footer" style="display: flex; justify-content: flex-end; padding: 20px;">
          <button class="btn btn-primary" onclick="alert('Cessão validada e registrada com sucesso!')"><i data-lucide="check"></i> Validar e Registrar Cessão</button>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  renderAditamento() {
    const root = document.getElementById('relacionamento-aditamento-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="file-plus" style="color: var(--color-primary);"></i> Aditamento Contratual</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Altere cláusulas, prazos ou valores do contrato atual.</p>
      </div>
      ${this.renderBuscaCliente('aditamento')}
      
      <div id="relacionamento-form-aditamento" class="card" style="display: none; border-top: 4px solid var(--color-primary);">
        <div class="card-body" style="text-align: center; padding: 40px;">
          <i data-lucide="file-edit" style="width:48px; height:48px; color: var(--color-primary); margin-bottom: 15px;"></i>
          <h3>Formulário de Aditamento</h3>
          <p class="text-muted">O contrato selecionado está habilitado para aditamento.</p>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  renderPermuta() {
    const root = document.getElementById('relacionamento-permuta-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="refresh-ccw" style="color: var(--color-primary);"></i> Permuta</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Troca de unidade do cliente.</p>
      </div>
      ${this.renderBuscaCliente('permuta')}
      
      <div id="relacionamento-form-permuta" class="card" style="display: none; border-top: 4px solid var(--color-primary);">
        <div class="card-body" style="text-align: center; padding: 40px;">
          <i data-lucide="home" style="width:48px; height:48px; color: var(--color-primary); margin-bottom: 15px;"></i>
          <h3>Selecionar Nova Unidade</h3>
          <p class="text-muted">Aguardando seleção da unidade de destino.</p>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  renderTermos() {
    const root = document.getElementById('relacionamento-termos-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="file-signature" style="color: var(--color-primary);"></i> Emissão de Termos</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Gere os termos em PDF e envie ao Sienge.</p>
      </div>
      ${this.renderBuscaCliente('termos')}
    `;
    lucide.createIcons();
  },

  renderHistorico() {
    const root = document.getElementById('relacionamento-historico-root');
    if (!root) return;
    root.innerHTML = `
      <div class="search-filter-panel" style="margin-bottom: 20px;">
        <h2><i data-lucide="history" style="color: var(--color-primary);"></i> Histórico de Interações</h2>
        <p style="color: var(--color-text-muted); font-size: 0.95rem;">Veja todo o relacionamento com o cliente.</p>
      </div>
      ${this.renderBuscaCliente('historico')}
    `;
    lucide.createIcons();
  },

  _siengeProxyBase() {
    return "/api/sienge-proxy";
  },

  _siengeBusy(err) {
    if (!err) return false;
    const st = Number(err.status);
    if (st === 429 || st === 421) return true;
    return /429|421|Too Many Requests|temporariamente ocupada/i.test(String(err.message || ""));
  },

  _docSaleFromBill(bill, titulo, customerId) {
    if (!bill) return null;
    const t = String(titulo || bill.id || bill.receivableBillId || "").replace(/\D/g, "") || String(bill.id || "");
    const emp = bill.enterpriseCode || bill.enterpriseId || bill.costCenterId || "0";
    const unitName = String(bill.unityName || bill.unitName || bill.units || "ND").replace(/\s+/g, "");
    return {
      id: bill.salesContractId || bill.contractId || bill.documentNumber || bill.id,
      customerId: customerId || bill.customerId,
      customerName: bill.clientName || bill.customerName,
      receivableBillId: bill.id || bill.receivableBillId || t,
      enterpriseId: emp,
      unitId: bill.unitId || ("U-" + emp + "-" + unitName),
      unitName: bill.unityName || bill.unitName || bill.units,
      saleDate: bill.issueDate || bill.emissionDate || bill.contractDate,
      contractDate: bill.contractDate || bill.issueDate || bill.emissionDate,
      contractNumber: bill.documentNumber || bill.contractNumber,
      documentNumber: bill.documentNumber,
      contractValue: bill.receivableBillValue || bill.value || bill.contractValue,
      status: bill.status || "Ativo",
      customers: bill.customers || []
    };
  },

  _docFindLocalSale(titulo) {
    const t = String(titulo || "").replace(/\D/g, "");
    if (!t) return null;
    const sales = (typeof AppState !== "undefined" && AppState.sales) || [];
    const sale = sales.find((s) => String(s.receivableBillId) === t || String(s.id) === t);
    if (sale && sale.customerId) return sale;
    if (typeof window.relFindTituloLocal === "function") {
      const bill = window.relFindTituloLocal(t);
      if (bill && bill.customerId) return this._docSaleFromBill(bill, t, bill.customerId);
    }
    const bills = (typeof AppState !== "undefined" && AppState.defaultersBills) || [];
    const bill = bills.find((b) => String(b.id) === t || String(b.saleId) === t);
    if (bill && bill.customerId) return this._docSaleFromBill(bill, t, bill.customerId);
    return null;
  },

  async _siengeGet(path) {
    const p = path.startsWith("/") ? path : "/" + path;
    const fetchFn = (typeof window.siengeFetchWithRetry === "function")
      ? window.siengeFetchWithRetry
      : ((typeof siengeFetchWithRetry === "function") ? siengeFetchWithRetry : null);
    if (fetchFn) return fetchFn(p);
    let lastStatus = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(this._siengeProxyBase() + p, {
        headers: {
          Authorization: window.getBasicAuthHeader ? getBasicAuthHeader() : "",
          Accept: "application/json"
        }
      });
      if (res.ok) return res.json();
      lastStatus = res.status;
      if (res.status === 429 || res.status === 421 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, Math.min(4000 * Math.pow(2, attempt), 20000)));
        continue;
      }
      const err = new Error("Falha na consulta Sienge (HTTP " + res.status + ").");
      err.status = res.status;
      throw err;
    }
    const busy = new Error("A Sienge está temporariamente ocupada (HTTP " + lastStatus + "). Aguarde alguns segundos e tente de novo.");
    busy.status = lastStatus;
    throw busy;
  },

  _escSetResultsHtml(html) {
    const el = document.getElementById("esc-search-results");
    if (el) el.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  limparEscritura() {
    RelacionamentoState.escritura = null;
    RelacionamentoState.escrituraMatches = [];
    const card = document.getElementById("esc-doc-card");
    if (card) card.style.display = "none";
    this._escSetResultsHtml("");
    this._liberarFiltrosDoc("escritura");
    ["esc-filter-titulo", "esc-filter-contrato", "esc-filter-nome", "esc-cartorio", "esc-cidade-cartorio", "esc-localizacao", "esc-bancos", "esc-quitacao-modo"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    this.cancelarNovoCartorio();
    const dd = document.getElementById("esc-nome-dropdown");
    if (dd) dd.style.display = "none";
  },

  sugerirNomeEscritura(query) {
    if (RelacionamentoState.escrituraFromGestao || RelacionamentoState.escrituraFiltroLock === "gestao") return;
    window.SelectedDynamicCustomerId = null;
    window.SelectedDynamicCustomerName = null;
    const dd = document.getElementById("esc-nome-dropdown");
    if (!dd) return;
    const normalizeStr = (str) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    const qNorm = normalizeStr(query);
    if (!qNorm || !window.GlobalCustomerCache || !window.GlobalCustomerCache.data) {
      dd.style.display = "none";
      dd.innerHTML = "";
      return;
    }
    const terms = qNorm.split(" ").filter((t) => t);
    const matches = window.GlobalCustomerCache.data.filter((c) => {
      const cName = normalizeStr(c.name);
      return terms.every((term) => cName.includes(term));
    });
    const scoped = (typeof window.filterCustomersToAssignedPortfolio === "function"
      ? window.filterCustomersToAssignedPortfolio(matches)
      : matches).slice(0, 12);
    if (!scoped.length) {
      dd.style.display = "none";
      return;
    }
    dd.innerHTML = "";
    scoped.forEach((c) => {
      const item = document.createElement("div");
      item.style.cssText = "padding:8px 12px;cursor:pointer;font-size:0.85rem;border-bottom:1px solid #f3f4f6;";
      item.textContent = (c.id ? c.id + " - " : "") + (c.name || "");
      item.onmouseover = () => { item.style.background = "#f0fdf4"; };
      item.onmouseout = () => { item.style.background = "#fff"; };
      item.onmousedown = (ev) => {
        ev.preventDefault();
        const input = document.getElementById("esc-filter-nome");
        if (input) input.value = c.name || "";
        window.SelectedDynamicCustomerId = c.id;
        window.SelectedDynamicCustomerName = c.name;
        dd.style.display = "none";
        this._travarFiltrosDoc("escritura", "nome");
      };
      dd.appendChild(item);
    });
    dd.style.display = "block";
  },

  async buscarEscritura() {
    const titulo = (document.getElementById("esc-filter-titulo")?.value || "").replace(/\D/g, "");
    const contrato = (document.getElementById("esc-filter-contrato")?.value || "").trim();
    const nome = (document.getElementById("esc-filter-nome")?.value || "").trim();
    if (!RelacionamentoState.escrituraFiltroLock) {
      if (titulo) this._travarFiltrosDoc("escritura", "titulo");
      else if (contrato) this._travarFiltrosDoc("escritura", "contrato");
      else if (nome) this._travarFiltrosDoc("escritura", "nome");
    }
    if (!titulo && !contrato && !nome && !window.SelectedDynamicCustomerId) {
      alert("Informe o título, o contrato ou o nome do cliente.");
      return;
    }
    this._escSetResultsHtml(this._docLoadingHtml("Consultando contrato na Sienge..."));
    document.getElementById("esc-doc-card").style.display = "none";
    RelacionamentoState.escritura = null;

    try {
      let customerId = null;
      let hintBill = null;
      let hintContract = null;

      if (titulo) {
        hintBill = await this._siengeGet("/accounts-receivable/receivable-bills/" + encodeURIComponent(titulo));
        const bType = String(hintBill.documentId || "").trim().toUpperCase();
        if (bType && bType !== "CT" && bType !== "CTCV") {
          throw new Error("O título " + titulo + " não é do tipo CT.");
        }
        customerId = hintBill.customerId;
      } else if (contrato) {
        hintContract = await window.findSalesContractExact(contrato, (p) => this._siengeGet(p));
        if (!hintContract) throw new Error("Contrato não encontrado: " + contrato);
        customerId = hintContract.customerId
          || hintContract.customer?.id
          || hintContract.salesContractCustomers?.[0]?.id
          || hintContract.salesContractCustomers?.[0]?.customerId;
        if (!customerId && hintContract.receivableBillId) {
          hintBill = await this._siengeGet("/accounts-receivable/receivable-bills/" + hintContract.receivableBillId);
          customerId = hintBill.customerId;
        }
        if (!customerId) throw new Error("Não foi possível identificar o cliente deste contrato.");
      } else {
        customerId = window.SelectedDynamicCustomerId;
        if (!customerId && window.GlobalCustomerCache && window.GlobalCustomerCache.data) {
          const normalizeStr = (str) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
          const terms = normalizeStr(nome).split(" ").filter((t) => t);
          const match = window.GlobalCustomerCache.data.find((c) => {
            const cName = normalizeStr(c.name);
            return terms.every((term) => cName.includes(term));
          });
          if (match) customerId = match.id;
        }
        if (!customerId) throw new Error("Cliente não encontrado. Selecione um nome da lista ou use título/contrato.");
      }

      const sales = (window.SiengeApiService && typeof SiengeApiService.getSales === "function")
        ? await SiengeApiService.getSales(customerId)
        : [];
      let matches = Array.isArray(sales) ? sales.slice() : [];
      if (titulo) {
        const filtered = matches.filter((s) => String(s.receivableBillId) === String(titulo) || String(s.id) === String(titulo));
        if (filtered.length) matches = filtered;
      }
      if (contrato) {
        const filtered = matches.filter((s) => String(s.id) === String(contrato) || String(s.contractNumber) === String(contrato) || String(s.number) === String(contrato));
        if (filtered.length) matches = filtered;
      }
      if (!matches.length && hintBill) {
        matches = [{
          id: hintBill.documentNumber || hintBill.id,
          customerId,
          receivableBillId: hintBill.id || titulo,
          enterpriseId: hintBill.enterpriseCode || hintBill.enterpriseId,
          unitId: "U-" + (hintBill.enterpriseCode || hintBill.enterpriseId || "0") + "-" + String(hintBill.unityName || hintBill.unitName || "ND").replace(/\s+/g, ""),
          saleDate: hintBill.issueDate || hintBill.emissionDate,
          contractValue: hintBill.receivableBillValue || hintBill.value,
          status: "Ativo",
          customers: []
        }];
      }
      if (!matches.length) throw new Error("Nenhum contrato encontrado para este cliente.");

      RelacionamentoState.escrituraMatches = matches;
      if (matches.length === 1) {
        await this.selecionarEscritura(0);
        return;
      }
      const rows = matches.map((s, idx) => {
        const quadraLote = String(s.unitId || "").split("-").slice(2).join("-") || "—";
        const valor = Number(s.contractValue || s.updatedContractValue || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return `<tr>
          <td>${s.receivableBillId || "—"}</td>
          <td>${s.id || "—"}</td>
          <td>${quadraLote}</td>
          <td>${s.status || "—"}</td>
          <td>${valor}</td>
          <td><button type="button" class="btn btn-outline" onclick="RelacionamentoApp.selecionarEscritura(${idx})">Selecionar</button></td>
        </tr>`;
      }).join("");
      this._escSetResultsHtml(`
        <p style="font-size:0.9rem;color:#475569;margin:0 0 8px;">Vários contratos encontrados. Escolha um:</p>
        <div class="table-responsive"><table class="data-table">
          <thead><tr><th>Título</th><th>Contrato</th><th>Unidade</th><th>Status</th><th>Valor</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`);
    } catch (err) {
      console.error(err);
      this._escSetResultsHtml(`<div style="padding:12px;color:#b91c1c;">${err.message || "Erro ao buscar."}</div>`);
    }
  },

  async selecionarEscritura(idx) {
    const sale = (RelacionamentoState.escrituraMatches || [])[idx];
    if (!sale) return;
    this._escSetResultsHtml(this._docLoadingHtml("Carregando dados do lote e do contrato..."));
    try {
      const customerId = sale.customerId;
      let customer = {};
      if (window.SiengeApiService && SiengeApiService.getCustomer) {
        customer = await SiengeApiService.getCustomer(customerId);
      }
      if (typeof window.enrichCustomerForLegalDocs === "function") {
        customer = await window.enrichCustomerForLegalDocs(customer);
      }
      const unitParts = String(sale.unitId || "").split("-");
      const unitName = unitParts.slice(2).join("-");
      const enterpriseId = sale.enterpriseId || sale.costCenterId || unitParts[1];
      let unit = (typeof AppState !== "undefined" && AppState.units && AppState.units[sale.unitId]) || null;
      if (!unit && window.SiengeApiService && SiengeApiService.getUnit) {
        unit = await SiengeApiService.getUnit(sale.unitId).catch(() => null);
      }
      unit = unit || { id: sale.unitId, block: "N/D", lot: "N/D", area: 0 };
      let unitDetails = null;
      if (window.SiengeApiService && SiengeApiService.getUnitDetails && enterpriseId && unitName) {
        const det = await SiengeApiService.getUnitDetails(enterpriseId, unitName).catch(() => null);
        if (det && det.results && det.results.length) unitDetails = det.results[0];
      }
      let bill = null;
      if (sale.receivableBillId) {
        try {
          bill = await this._siengeGet("/accounts-receivable/receivable-bills/" + encodeURIComponent(sale.receivableBillId));
        } catch (e) { bill = null; }
      }
      const block = unit.block && unit.block !== "N/D" ? unit.block : (unitName.split("-")[0] || "");
      const lot = unit.lot && unit.lot !== "N/D" ? unit.lot : (unitName.split("-").slice(1).join("-") || unitName);
      const empName = window.resolveLoteamentoName ? window.resolveLoteamentoName(unit, sale) : "";
      const cidadeLote = window.resolveCidadeLoteamento ? window.resolveCidadeLoteamento(unit, sale) : "";
      const areaNum = unitDetails?.privateArea || unitDetails?.Privatearea || unit.area || "";
      const areaStr = areaNum === "" || areaNum == null
        ? ""
        : (String(areaNum).match(/m/) ? String(areaNum) : Number(areaNum).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " m²");
      const localizacao = [
        "Lote nº " + (lot || "____") + " da quadra " + (block || "____") + " do loteamento " + (empName || "____") + ",",
        "situado no município de " + (cidadeLote || "____") + ",",
        areaStr ? ("com área de " + areaStr + ".") : ""
      ].filter(Boolean).join(" ");
      const quitadoInfo = await this._avaliarContratoQuitado(sale, bill);
      RelacionamentoState.escritura = { customer, sale, unit, unitDetails, bill, empName, cidadeLote, quitado: quitadoInfo.quitado, quitadoMotivo: quitadoInfo.motivo };
      const cartorioHint = this.pickCartorioForCidade(cidadeLote);
      this.fillCartorioSelect(cartorioHint);
      const locEl = document.getElementById("esc-localizacao");
      if (locEl) locEl.value = localizacao;
      const bancEl = document.getElementById("esc-bancos");
      if (bancEl) bancEl.value = "";
      const titulo = sale.receivableBillId || bill?.id || "—";
      const valor = Number(sale.contractValue || sale.updatedContractValue || bill?.receivableBillValue || 0);
      const valorFmt = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const statusHtml = quitadoInfo.quitado
        ? `<span style="color:#15803d;font-weight:700;">Quitado</span><div style="font-size:0.75rem;color:#64748b;">${quitadoInfo.motivo}</div>`
        : `<span style="color:#b91c1c;font-weight:700;">Não quitado</span><div style="font-size:0.75rem;color:#b91c1c;">${quitadoInfo.motivo}. Este termo só pode ser emitido com o contrato quitado.</div>`;
      document.getElementById("esc-contrato-resumo").innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;font-size:0.9rem;">
          <div><span style="color:#64748b;">Cliente</span><br><strong>${customer.name || "—"}</strong></div>
          <div><span style="color:#64748b;">Título</span><br><strong>${titulo}</strong></div>
          <div><span style="color:#64748b;">Contrato</span><br><strong>${sale.id || "—"}</strong></div>
          <div><span style="color:#64748b;">Unidade</span><br><strong>${block && lot ? (block + " - " + lot) : (unitName || "—")}</strong></div>
          <div><span style="color:#64748b;">Valor</span><br><strong>${valorFmt}</strong></div>
          <div><span style="color:#64748b;">Situação</span><br>${statusHtml}</div>
        </div>`;
      document.querySelectorAll('#esc-doc-card [onclick="RelacionamentoApp.gerarEscrituraPdf()"], #esc-doc-card [onclick="RelacionamentoApp.gerarQuitacaoPdf()"]').forEach((btn) => {
        btn.disabled = !quitadoInfo.quitado;
      });
      document.getElementById("esc-doc-card").style.display = "block";
      this._escSetResultsHtml("");
    } catch (err) {
      console.error(err);
      this._escSetResultsHtml(`<div style="padding:12px;color:#b91c1c;">${err.message || "Não foi possível carregar o contrato."}</div>`);
    }
  },

  async gerarEscrituraPdf() {
    const ctx = RelacionamentoState.escritura;
    if (!ctx || !ctx.sale) {
      alert("Busque e selecione um contrato antes de gerar o documento.");
      return;
    }
    if (!ctx.quitado) {
      alert("Este termo só pode ser emitido se o contrato estiver quitado. " + (ctx.quitadoMotivo || ""));
      return;
    }
    const nomeCartorio = (document.getElementById("esc-cartorio")?.value || "").trim();
    if (!nomeCartorio) {
      alert("Selecione o cartório.");
      return;
    }
    try {
      let t = {};
      try { t = JSON.parse(localStorage.getItem("crm_docpadrao_escritura") || "{}"); } catch (e) {}
      const titleEl = document.getElementById("doc-escritura-title");
      const corpoEl = document.getElementById("doc-escritura-corpo");
      const docTitle = (titleEl && titleEl.value) || t["doc-escritura-title"] || "AUTORIZAÇÃO PARA LAVRATURA DE ESCRITURA";
      let corpo = (corpoEl && corpoEl.value) || t["doc-escritura-corpo"] || "";
      if (!corpo || /^Autorizamos o\(a\) Senhor\(a\) Tabelião/i.test(corpo)) {
        const ta = document.getElementById("doc-escritura-corpo");
        corpo = (ta && ta.defaultValue) || corpo;
      }
      if (!corpo) {
        alert("O modelo de autorização não está preenchido. Salve-o em Configurações → Documentos padrões.");
        return;
      }
      const cidadeCartorio = nomeCartorio;
      const localizacao = (document.getElementById("esc-localizacao")?.value || "").trim() || "____";
      const bancos = (document.getElementById("esc-bancos")?.value || "").trim() || "conforme extrato anexo";
      const { legalBase, quadraLote, unitNumericId, titulo } = this._escDocBase(ctx, {
        NOME_CARTORIO: nomeCartorio,
        CIDADE_CARTORIO: cidadeCartorio,
        LOCALIZACAO: localizacao,
        DADOS_BANCARIOS: bancos
      });
      const markup = typeof window.formatDocPadraoMarkup === "function" ? window.formatDocPadraoMarkup(corpo) : corpo;
      const filled = this._fillDocVars(markup, legalBase);
      const headerUnidade = [unitNumericId, "Quadra-Lote: " + quadraLote].filter(Boolean).join(" - ");
      const alreadyHasTabeliao = /Livro\s*n/i.test(filled);
      const tabeliaoBox = alreadyHasTabeliao ? "" : `
        <div style="border:1.5px solid #105436;padding:12px 14px;margin-top:2rem;font-size:10pt;">
          <p style="margin:0 0 10px;font-weight:bold;">ATENÇÃO: Senhor tabelião, favor preencher os dados abaixo e devolver esta autorização à Moura Leite Desenvolvimento & Urbanização, no ato da assinatura desta.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;">
            <div>Livro nº ________________________</div>
            <div>Folha nº ________________________</div>
            <div>Matrícula nº ____________________</div>
            <div>Data ____ / ____ / ________</div>
          </div>
        </div>`;
      const docHtml = `
        <div style="text-align:center;margin-bottom:1.25rem;">
          <div style="font-size:10pt;color:#334155;margin-bottom:4px;">${headerUnidade}</div>
          <div style="font-size:10pt;color:#334155;margin-bottom:10px;">Título ${titulo}</div>
          <h2 style="color:#105436;font-size:13pt;font-weight:bold;margin:0;">${docTitle}</h2>
        </div>
        <div style="font-family:'Times New Roman',serif;font-size:11pt;line-height:1.5;text-align:justify;white-space:pre-wrap;">${filled}</div>
        ${tabeliaoBox}`;
      document.getElementById("pdf-modal-title").textContent = "Autorização para lavratura de escritura";
      document.getElementById("pdf-document-content").innerHTML = docHtml;
      document.getElementById("pdf-view-overlay").classList.add("active");
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error("Erro ao gerar autorização de escritura", err);
      alert("Não foi possível gerar a autorização. Verifique o modelo em Documentos padrões e tente de novo.");
    }
  },

  _fillDocVars(text, map) {
    if (typeof window.applyDistratoTemplateVars === "function") return window.applyDistratoTemplateVars(text, map);
    let s = String(text || "");
    Object.keys(map || {}).forEach((key) => {
      s = s.replace(new RegExp("\\{\\{" + key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\}\\}", "g"), map[key] == null ? "" : String(map[key]));
    });
    return s;
  },

  _escDocBase(ctx, extraMap) {
      const { customer, sale, unit, unitDetails, bill, empName, cidadeLote } = ctx;
      const block = unit.block && unit.block !== "N/D" ? unit.block : "";
      const lot = unit.lot && unit.lot !== "N/D" ? unit.lot : "";
      const unitName = String(sale.unitId || "").split("-").slice(2).join("-");
      const quadraLote = (block && lot) ? (block + " - " + lot) : (unitName || "____");
      const unitNumericId = unitDetails?.id || (unit.id && !String(unit.id).startsWith("U-") ? unit.id : "");
      const titulo = sale.receivableBillId || bill?.id || "____";
      const matriculaRaw = unitDetails?.legalRegistrationNumber || unitDetails?.legalregistrationnumber || "";
      const matriculaNum = String(matriculaRaw || "").replace(/\D/g, "");
      const matricula = matriculaNum
        ? Number(matriculaNum).toLocaleString("pt-BR")
        : (matriculaRaw || "____");
      const areaNum = unitDetails?.privateArea || unitDetails?.Privatearea || unit.area || "";
      const areaLabel = areaNum === "" || areaNum == null ? "____" : (String(areaNum).match(/m/) ? String(areaNum) : (Number(areaNum).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " m²"));
      const areaExt = areaNum && !isNaN(Number(areaNum))
        ? ((typeof numeroPorExtenso === "function" ? numeroPorExtenso(areaNum) : String(areaNum)) + " metros quadrados")
        : "____";
      const valor = Number(sale.contractValue || sale.updatedContractValue || bill?.receivableBillValue || 0);
      const valorFmt = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const valorExt = typeof valorPorExtensoBRL === "function" ? valorPorExtensoBRL(valor) : "";
      const custs = sale.customers || sale.salesContractCustomers || [];
      const mine = custs.find((c) => String(c.id || c.customerId) === String(customer.id)) || custs.find((c) => c.main) || null;
      const pct = mine && (mine.percentage != null || mine.participationPercentage != null)
        ? Number(mine.percentage != null ? mine.percentage : mine.participationPercentage)
        : (custs.length <= 1 ? 100 : null);
      const pctLabel = pct != null && !isNaN(pct) ? " (" + pct + "%)" : "";
      const dateExt = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
      const saleDateRaw = sale.saleDate || sale.contractDate || bill?.issueDate;
      let saleDateStr = "____";
      if (saleDateRaw) {
        const iso = String(saleDateRaw).slice(0, 10);
        saleDateStr = /^\d{4}-\d{2}-\d{2}/.test(iso)
          ? iso.split("-").reverse().join("/")
          : new Date(String(saleDateRaw).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");
      }
      let preambleText = "";
      if (typeof window.getPreambleForContract === "function") {
        preambleText = window.getPreambleForContract(unit, sale) || "";
      }
      const legalBase = window.buildLegalDocVarMap(customer, sale, unit, {
        preambleText,
        empName,
        cidadeLote,
        saleDateStr,
        dateExt,
        map: Object.assign({
          QUADRA_LOTE: quadraLote,
          MATRICULA: matricula,
          AREA_LOTE: areaLabel,
          AREA_LOTE_EXTENSO: areaExt,
          VALOR_CONTRATO: valorFmt,
          VALOR_CONTRATO_EXTENSO: valorExt,
          PERCENTUAL_CLIENTE: pctLabel,
          NUM_CONTRATO: sale.id || "____",
          NUMERO_CONTRATO: sale.id || "____",
          TITULO: titulo,
          UNIDADE: unitNumericId || quadraLote
        }, extraMap || {})
      });
      return { legalBase, quadraLote, unitNumericId, titulo, preambleText };
  },

  async gerarQuitacaoPdf() {
    const ctx = RelacionamentoState.escritura;
    if (!ctx || !ctx.sale) {
      alert("Busque e selecione um contrato antes de gerar o documento.");
      return;
    }
    if (!ctx.quitado) {
      alert("O termo de quitação só pode ser emitido se o contrato estiver quitado. " + (ctx.quitadoMotivo || ""));
      return;
    }
    const modo = document.getElementById("esc-quitacao-modo")?.value || "";
    if (modo !== "aviso" && modo !== "formal") {
      alert("Escolha o tipo do termo de quitação: aviso (informativo) ou formal (assinado pelo sócio).");
      document.getElementById("esc-quitacao-modo")?.focus();
      return;
    }
    try {
      let t = {};
      try { t = JSON.parse(localStorage.getItem("crm_docpadrao_quitacao") || "{}"); } catch (e) {}
      const titleEl = document.getElementById("doc-quitacao-title");
      const corpoEl = document.getElementById("doc-quitacao-corpo");
      const docTitle = (titleEl && titleEl.value) || t["doc-quitacao-title"] || "INSTRUMENTO PARTICULAR DE QUITAÇÃO E NOTIFICAÇÃO";
      let corpo = (corpoEl && corpoEl.value) || t["doc-quitacao-corpo"] || (corpoEl && corpoEl.defaultValue) || "";
      if (typeof window.upgradeQuitacaoCorpo === "function") corpo = window.upgradeQuitacaoCorpo(corpo);
      if (!corpo) {
        alert("O modelo do termo de quitação não está preenchido. Salve-o em Configurações → Documentos padrões.");
        return;
      }
      const { legalBase, quadraLote, titulo, preambleText } = this._escDocBase(ctx, {});
      if (!preambleText || /NÃO CADASTRADO/i.test(String(preambleText))) {
        alert("Preâmbulo não cadastrado para o centro de custo deste contrato. Cadastre-o antes de gerar o termo.");
        return;
      }
      legalBase.PREAMBULO = String(preambleText).trim().replace(/[.;,\s]+$/, "");
      legalBase.CANAIS_ATENDIMENTO = modo === "aviso" && typeof window.quitacaoCanaisHtml === "function" ? window.quitacaoCanaisHtml() : "";
      const markup = typeof window.formatDocPadraoMarkup === "function" ? window.formatDocPadraoMarkup(corpo) : corpo;
      let filled = this._fillDocVars(markup, legalBase);
      if (typeof window.centerSimpleDocSignature === "function") filled = window.centerSimpleDocSignature(filled);
      if (modo === "aviso" && typeof window.applyQuitacaoRubrica === "function") filled = window.applyQuitacaoRubrica(filled);
      const codEmp = legalBase.CODIGO_EMPREENDIMENTO && legalBase.CODIGO_EMPREENDIMENTO !== "____" ? legalBase.CODIGO_EMPREENDIMENTO : "";
      const headerUnidade = [codEmp, "Quadra-Lote: " + quadraLote].filter(Boolean).join(" - ");
      const docHtml = `
        <div style="text-align:center;margin-bottom:1.25rem;">
          <div style="font-size:10pt;color:#334155;margin-bottom:4px;">${headerUnidade}</div>
          <div style="font-size:10pt;color:#334155;margin-bottom:10px;">Título ${titulo}</div>
          <h2 style="color:#105436;font-size:13pt;font-weight:bold;margin:0;">${docTitle}</h2>
        </div>
        <div style="font-family:'Times New Roman',serif;font-size:11pt;line-height:1.5;text-align:justify;white-space:pre-wrap;">${filled}</div>`;
      document.getElementById("pdf-modal-title").textContent = modo === "aviso" ? "Termo de quitação (aviso)" : "Termo de quitação (formal)";
      document.getElementById("pdf-document-content").innerHTML = docHtml;
      document.getElementById("pdf-view-overlay").classList.add("active");
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error("Erro ao gerar termo de quitação", err);
      alert("Não foi possível gerar o termo de quitação. Verifique o modelo em Documentos padrões e tente de novo.");
    }
  },

  _docCfg(kind) {
    const map = {
      terceiros: { p: "ter", title: "Autorização de terceiros", storage: "crm_docpadrao_terceiros", titleId: "doc-terceiros-title", corpoId: "doc-terceiros-corpo", defaultTitle: "AUTORIZAÇÃO DE TERCEIROS" },
      vencimento: { p: "ven", title: "Alteração de vencimento", storage: "crm_docpadrao_vencimento", titleId: "doc-vencimento-title", corpoId: "doc-vencimento-corpo", defaultTitle: "ALTERAÇÃO DE VENCIMENTO" }
    };
    return map[kind] || map.terceiros;
  },

  _docEl(kind, suffix) {
    return document.getElementById(this._docCfg(kind).p + suffix);
  },

  _setDocExtraCard(kind, show) {
    const extra = this._docEl(kind, "-terceiro-card");
    if (extra) extra.style.display = show ? "block" : "";
  },

  _docFilterEl(kind, campo) {
    if (kind === "escritura") return document.getElementById("esc-filter-" + campo);
    return this._docEl(kind, "-filter-" + campo);
  },

  _travarFiltrosDoc(kind, campo) {
    if (RelacionamentoState[kind + "FromGestao"] || RelacionamentoState[kind + "FiltroLock"] === "gestao") {
      this._travarFiltrosDocOrigem(kind);
      return;
    }
    RelacionamentoState[kind + "FiltroLock"] = campo;
    ["titulo", "contrato", "nome"].forEach((k) => {
      const el = this._docFilterEl(kind, k);
      if (!el) return;
      if (k === campo) {
        el.disabled = false;
        el.readOnly = false;
      } else {
        el.disabled = true;
        el.readOnly = true;
        el.value = "";
      }
    });
    if (campo !== "nome") {
      const dd = kind === "escritura"
        ? document.getElementById("esc-nome-dropdown")
        : this._docEl(kind, "-nome-dropdown");
      if (dd) {
        dd.style.display = "none";
        dd.innerHTML = "";
      }
    }
  },

  _travarFiltrosDocOrigem(kind, valores) {
    valores = valores || {};
    RelacionamentoState[kind + "FiltroLock"] = "gestao";
    RelacionamentoState[kind + "FromGestao"] = true;
    const map = {
      titulo: valores.titulo != null ? String(valores.titulo) : null,
      contrato: valores.contrato != null ? String(valores.contrato) : null,
      nome: valores.nome != null ? String(valores.nome) : null
    };
    ["titulo", "contrato", "nome"].forEach((k) => {
      const el = this._docFilterEl(kind, k);
      if (!el) return;
      if (map[k] != null && map[k] !== "") el.value = map[k];
      el.disabled = true;
      el.readOnly = true;
    });
    const dd = kind === "escritura"
      ? document.getElementById("esc-nome-dropdown")
      : this._docEl(kind, "-nome-dropdown");
    if (dd) {
      dd.style.display = "none";
      dd.innerHTML = "";
    }
  },

  _liberarFiltrosDoc(kind) {
    RelacionamentoState[kind + "FiltroLock"] = null;
    RelacionamentoState[kind + "FromGestao"] = null;
    ["titulo", "contrato", "nome"].forEach((k) => {
      const el = this._docFilterEl(kind, k);
      if (!el) return;
      el.disabled = false;
      el.readOnly = false;
    });
  },

  onDocFilterInput(kind, campo) {
    const el = this._docFilterEl(kind, campo);
    if (!el) return;
    if (RelacionamentoState[kind + "FromGestao"] || RelacionamentoState[kind + "FiltroLock"] === "gestao") {
      this._travarFiltrosDocOrigem(kind);
      return;
    }
    if (campo === "titulo") el.value = String(el.value || "").replace(/[^0-9]/g, "");
    const lock = RelacionamentoState[kind + "FiltroLock"];
    if (lock && lock !== campo) {
      el.value = "";
      return;
    }
    if (String(el.value || "").trim()) this._travarFiltrosDoc(kind, campo);
    if (campo === "nome") {
      if (kind === "escritura") this.sugerirNomeEscritura(el.value);
      else this.sugerirNomeDoc(kind, el.value);
    }
  },

  _docSetResults(kind, html) {
    const el = this._docEl(kind, "-search-results");
    if (el) el.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  sugerirNomeDoc(kind, query) {
    if (RelacionamentoState[kind + "FromGestao"] || RelacionamentoState[kind + "FiltroLock"] === "gestao") return;
    window.SelectedDynamicCustomerId = null;
    window.SelectedDynamicCustomerName = null;
    const dd = this._docEl(kind, "-nome-dropdown");
    if (!dd) return;
    const normalizeStr = (str) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    const qNorm = normalizeStr(query);
    if (!qNorm || !window.GlobalCustomerCache || !window.GlobalCustomerCache.data) {
      dd.style.display = "none";
      dd.innerHTML = "";
      return;
    }
    const terms = qNorm.split(" ").filter((t) => t);
    const matches = window.GlobalCustomerCache.data.filter((c) => {
      const cName = normalizeStr(c.name);
      return terms.every((term) => cName.includes(term));
    });
    const scoped = (typeof window.filterCustomersToAssignedPortfolio === "function"
      ? window.filterCustomersToAssignedPortfolio(matches)
      : matches).slice(0, 12);
    if (!scoped.length) {
      dd.style.display = "none";
      return;
    }
    dd.innerHTML = "";
    scoped.forEach((c) => {
      const item = document.createElement("div");
      item.style.cssText = "padding:8px 12px;cursor:pointer;font-size:0.85rem;border-bottom:1px solid #f3f4f6;";
      item.textContent = (c.id ? c.id + " - " : "") + (c.name || "");
      item.onmouseover = () => { item.style.background = "#f0fdf4"; };
      item.onmouseout = () => { item.style.background = "#fff"; };
      item.onmousedown = (ev) => {
        ev.preventDefault();
        const input = this._docEl(kind, "-filter-nome");
        if (input) input.value = c.name || "";
        window.SelectedDynamicCustomerId = c.id;
        window.SelectedDynamicCustomerName = c.name;
        dd.style.display = "none";
        this._travarFiltrosDoc(kind, "nome");
        this.buscarDocSimples(kind);
      };
      dd.appendChild(item);
    });
    dd.style.display = "block";
  },

  limparDocSimples(kind) {
    RelacionamentoState[kind] = null;
    RelacionamentoState[kind + "Matches"] = [];
    if (kind === "terceiros") {
      RelacionamentoState.terceiroClienteId = null;
      RelacionamentoState.terceiroClienteName = null;
      this._lockTerceiroDocs(false);
    }
    this._docSearchBusy = null;
    this._docSearchAgain = null;
    window.SelectedDynamicCustomerId = null;
    window.SelectedDynamicCustomerName = null;
    window.SelectedDynamicCustomerDoc = null;
    const card = this._docEl(kind, "-doc-card");
    if (card) card.style.display = "none";
    this._setDocExtraCard(kind, false);
    const custCard = this._docEl(kind, "-customer-card");
    if (custCard) custCard.style.display = "none";
    const custInfo = this._docEl(kind, "-customer-info");
    if (custInfo) custInfo.innerHTML = "";
    this._docSetResults(kind, "");
    this._liberarFiltrosDoc(kind);
    ["-filter-titulo", "-filter-contrato", "-filter-nome", "-nome", "-rg", "-cpf", "-fone", "-dia", "-data-original"].forEach((suf) => {
      const el = this._docEl(kind, suf);
      if (el) el.value = "";
    });
    const preview = this._docEl(kind, "-preview");
    if (preview) preview.textContent = "";
    const dd = this._docEl(kind, "-nome-dropdown");
    if (dd) dd.style.display = "none";
    if (kind === "vencimento") {
      this._setVencimentoBloqueado(false);
      const orig = document.getElementById("ven-data-original");
      if (orig) {
        orig.removeAttribute("min");
        orig.removeAttribute("max");
      }
      this._popularOpcoesDiaVencimento();
    }
    const terDd = document.getElementById("ter-terceiro-dropdown");
    if (kind === "terceiros" && terDd) {
      terDd.style.display = "none";
      terDd.innerHTML = "";
    }
  },

  atualizarPreviewVencimento() {
    const adimpl = RelacionamentoState.vencimento && RelacionamentoState.vencimento.adimplencia;
    if (adimpl && adimpl.adimplente === false) return;
    this._garantirDataOriginalNaJanela();
    const computed = this._calcularNovoVencimento();
    const el = document.getElementById("ven-preview");
    if (!el) return;
    if (!computed) {
      el.textContent = "";
      return;
    }
    el.textContent = "O vencimento passará de " + computed.originalBr + " para " + computed.novoBr + " (" + computed.novoExt + "). A parcela do mês atual não é alterada.";
  },

  _calcularNovoVencimento() {
    const dia = parseInt(document.getElementById("ven-dia")?.value, 10);
    const orig = document.getElementById("ven-data-original")?.value || "";
    if (!this._diasVencimentoPermitidos().includes(dia) || !orig) return null;
    if (dia === this._diaOriginalVencimento()) return null;
    const key = typeof window.promiseDateKey === "function" ? window.promiseDateKey(orig) : orig.slice(0, 10);
    if (!this._isoInJanelaVencimento(key)) return null;
    const parts = key.split("-");
    if (parts.length !== 3) return null;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const last = new Date(y, m, 0).getDate();
    const day = Math.min(dia, last);
    const iso = y + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const originalBr = parts[2] + "/" + parts[1] + "/" + parts[0];
    const novoBr = String(day).padStart(2, "0") + "/" + String(m).padStart(2, "0") + "/" + y;
    const novoExt = typeof window.dataPorExtenso === "function" ? window.dataPorExtenso(iso) : novoBr;
    const diaExt = typeof numeroPorExtenso === "function" ? numeroPorExtenso(dia) : String(dia);
    return { originalBr, novoBr, novoExt, dia, diaExt: String(diaExt || "").toUpperCase() };
  },

  async buscarDocSimples(kind, opts) {
    opts = opts || {};
    if (this._docSearchBusy === kind) {
      this._docSearchAgain = kind;
      return;
    }
    const titulo = (this._docEl(kind, "-filter-titulo")?.value || "").replace(/\D/g, "");
    const contrato = (this._docEl(kind, "-filter-contrato")?.value || "").trim();
    const nome = (this._docEl(kind, "-filter-nome")?.value || "").trim();
    if (!titulo && !contrato && !nome && !window.SelectedDynamicCustomerId) {
      if (!opts.quiet) alert("Informe o título, o contrato ou o nome do cliente.");
      return;
    }
    if (!RelacionamentoState[kind + "FiltroLock"]) {
      if (titulo) this._travarFiltrosDoc(kind, "titulo");
      else if (contrato) this._travarFiltrosDoc(kind, "contrato");
      else if (nome) this._travarFiltrosDoc(kind, "nome");
    }
    this._docSearchBusy = kind;
    this._docSetResults(kind, this._docLoadingHtml("Consultando contrato na Sienge..."));
    const card = this._docEl(kind, "-doc-card");
    if (card) card.style.display = "none";
    this._setDocExtraCard(kind, false);
    RelacionamentoState[kind] = null;

    try {
      let customerId = null;
      let hintBill = null;
      let hintContract = null;

      if (titulo) {
        const local = this._docFindLocalSale(titulo);
        if (local && local.customerId) {
          RelacionamentoState[kind + "Matches"] = [local];
          await this.selecionarDocSimples(kind, 0);
          return;
        }
        try {
          hintBill = await this._siengeGet("/accounts-receivable/receivable-bills/" + encodeURIComponent(titulo));
        } catch (e) {
          const fallback = this._docFindLocalSale(titulo);
          if (fallback && fallback.customerId) {
            RelacionamentoState[kind + "Matches"] = [fallback];
            await this.selecionarDocSimples(kind, 0);
            return;
          }
          throw e;
        }
        const bType = String(hintBill.documentId || "").trim().toUpperCase();
        if (bType && bType !== "CT" && bType !== "CTCV") {
          throw new Error("O título " + titulo + " não é do tipo CT.");
        }
        customerId = hintBill.customerId;
      } else if (contrato) {
        hintContract = await window.findSalesContractExact(contrato, (p) => this._siengeGet(p));
        if (!hintContract) throw new Error("Contrato não encontrado: " + contrato);
        customerId = hintContract.customerId
          || hintContract.customer?.id
          || hintContract.salesContractCustomers?.[0]?.id
          || hintContract.salesContractCustomers?.[0]?.customerId;
        if (!customerId && hintContract.receivableBillId) {
          hintBill = await this._siengeGet("/accounts-receivable/receivable-bills/" + hintContract.receivableBillId);
          customerId = hintBill.customerId;
        }
        if (!customerId) throw new Error("Não foi possível identificar o cliente deste contrato.");
      } else {
        customerId = window.SelectedDynamicCustomerId;
        if (!customerId && window.GlobalCustomerCache && window.GlobalCustomerCache.data) {
          const normalizeStr = (str) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
          const terms = normalizeStr(nome).split(" ").filter((t) => t);
          const match = window.GlobalCustomerCache.data.find((c) => {
            const cName = normalizeStr(c.name);
            return terms.every((term) => cName.includes(term));
          });
          if (match) customerId = match.id;
        }
        if (!customerId) throw new Error("Cliente não encontrado. Selecione um nome da lista ou use título/contrato.");
      }

      let matches = [];
      if (hintBill && customerId) {
        matches = [this._docSaleFromBill(hintBill, titulo, customerId)].filter(Boolean);
      }
      if (!matches.length) {
        try {
          const sales = (window.SiengeApiService && typeof SiengeApiService.getSales === "function")
            ? await SiengeApiService.getSales(customerId)
            : [];
          matches = Array.isArray(sales) ? sales.slice() : [];
        } catch (e) {
          if (!matches.length) throw e;
        }
      }
      if (titulo && matches.length > 1) {
        const filtered = matches.filter((s) => String(s.receivableBillId) === String(titulo) || String(s.id) === String(titulo));
        if (filtered.length) matches = filtered;
      }
      if (contrato) {
        const filtered = matches.filter((s) => String(s.id) === String(contrato) || String(s.contractNumber) === String(contrato) || String(s.number) === String(contrato));
        if (filtered.length) matches = filtered;
      }
      if (!matches.length && hintBill) {
        matches = [this._docSaleFromBill(hintBill, titulo, customerId)].filter(Boolean);
      }
      if (!matches.length) throw new Error("Nenhum contrato encontrado para este cliente.");

      RelacionamentoState[kind + "Matches"] = matches;
      if (matches.length === 1) {
        await this.selecionarDocSimples(kind, 0);
        return;
      }
      const rows = matches.map((s, idx) => {
        const quadraLote = String(s.unitId || "").split("-").slice(2).join("-") || "—";
        const valor = Number(s.contractValue || s.updatedContractValue || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return `<tr>
          <td>${s.receivableBillId || "—"}</td>
          <td>${s.id || "—"}</td>
          <td>${quadraLote}</td>
          <td>${s.status || "—"}</td>
          <td>${valor}</td>
          <td><button type="button" class="btn btn-outline" onclick="RelacionamentoApp.selecionarDocSimples('${kind}', ${idx})">Selecionar</button></td>
        </tr>`;
      }).join("");
      this._docSetResults(kind, `
        <p style="font-size:0.9rem;color:#475569;margin:0 0 8px;">Vários contratos encontrados. Escolha um:</p>
        <div class="table-responsive"><table class="data-table">
          <thead><tr><th>Título</th><th>Contrato</th><th>Unidade</th><th>Status</th><th>Valor</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`);
    } catch (err) {
      console.error(err);
      const busy = this._siengeBusy(err);
      if (busy && titulo && !opts.retried) {
        this._docSetResults(kind, `<div style="padding:12px;color:#92400e;">A Sienge está ocupada no momento. Nova tentativa em alguns segundos...</div>`);
        await new Promise((r) => setTimeout(r, 4000));
        return this.buscarDocSimples(kind, { quiet: true, retried: true });
      }
      const friendly = busy
        ? "A Sienge está ocupada no momento (muitas consultas). Aguarde uns segundos e busque de novo."
        : (err.message || "Erro ao buscar.");
      this._docSetResults(kind, `<div style="padding:12px;color:#b91c1c;">${friendly}</div>`);
    } finally {
      this._docSearchBusy = null;
      if (this._docSearchAgain === kind) {
        this._docSearchAgain = null;
        setTimeout(() => this.buscarDocSimples(kind, { quiet: true }), 50);
      }
    }
  },

  buscarSeCamposPreenchidos(kind) {
    const titulo = (this._docEl(kind, "-filter-titulo")?.value || "").replace(/\D/g, "");
    const contrato = (this._docEl(kind, "-filter-contrato")?.value || "").trim();
    const nome = (this._docEl(kind, "-filter-nome")?.value || "").trim();
    if (!titulo && !contrato && !nome && !window.SelectedDynamicCustomerId) return;
    this.buscarDocSimples(kind, { quiet: true });
  },

  preencherEBuscarDocSimples(kind, dados) {
    dados = dados || {};
    const titulo = dados.titulo && String(dados.titulo) !== "—" ? String(dados.titulo).replace(/\D/g, "") || String(dados.titulo) : "";
    const contrato = dados.contrato ? String(dados.contrato).trim() : "";
    const nome = dados.nome ? String(dados.nome).trim() : "";
    this._travarFiltrosDocOrigem(kind, { titulo, contrato, nome });
    if (dados.customerId) {
      window.SelectedDynamicCustomerId = dados.customerId;
      window.SelectedDynamicCustomerName = nome || window.SelectedDynamicCustomerName;
    }
    this._docSearchBusy = null;
    this._docSearchAgain = null;
    if (dados.customerId && (titulo || contrato || dados.contractId)) {
      const seeded = this._docSaleFromGestao(dados, titulo, contrato, nome);
      RelacionamentoState[kind + "Matches"] = [seeded];
      this.selecionarDocSimples(kind, 0);
      return;
    }
    this.buscarDocSimples(kind, { quiet: true });
  },

  _docSaleFromGestao(dados, titulo, contrato, nome) {
    const t = String(titulo || "").replace(/\D/g, "");
    const local = t ? this._docFindLocalSale(t) : null;
    if (local && String(local.customerId) === String(dados.customerId)) {
      return Object.assign({}, local, {
        contractNumber: local.contractNumber || contrato,
        customerName: local.customerName || nome
      });
    }
    const unitLabel = String(dados.unidade || "").trim();
    let empId = "";
    let ql = "";
    const m = unitLabel.match(/^(\d+)\s*[-–]?\s*(.+)$/);
    if (m) {
      empId = m[1];
      ql = String(m[2] || "").replace(/\s+/g, "");
    } else if (unitLabel) {
      ql = unitLabel.replace(/\s+/g, "");
    }
    return {
      id: dados.contractId || contrato || t,
      customerId: dados.customerId,
      customerName: nome,
      receivableBillId: t || dados.titulo,
      enterpriseId: empId || undefined,
      unitId: ql ? ("U-" + (empId || "0") + "-" + ql.replace(/\s+/g, "")) : undefined,
      unitName: ql || unitLabel,
      empName: dados.empreendimento || "",
      contractNumber: contrato,
      number: contrato,
      status: "Ativo",
      customers: []
    };
  },

  async selecionarDocSimples(kind, idx) {
    let sale = (RelacionamentoState[kind + "Matches"] || [])[idx];
    if (!sale) return;
    this._docSetResults(kind, this._docLoadingHtml("Carregando dados do lote e do contrato..."));
    try {
      const customerId = sale.customerId;
      let customer = { id: customerId, name: sale.customerName || sale.name || "" };
      try {
        if (window.SiengeApiService && SiengeApiService.getCustomer) {
          const full = await SiengeApiService.getCustomer(customerId);
          if (full) customer = full;
        }
      } catch (e) {
        console.warn("[Relacionamento] cliente indisponível, seguindo com dados locais", e);
      }
      try {
        if (typeof window.enrichCustomerForLegalDocs === "function") {
          customer = await window.enrichCustomerForLegalDocs(customer);
        }
      } catch (e) {}
      const unitParts = String(sale.unitId || "").split("-");
      const unitName = unitParts.slice(2).join("-");
      const enterpriseId = sale.enterpriseId || sale.costCenterId || unitParts[1];
      let unit = (typeof AppState !== "undefined" && AppState.units && AppState.units[sale.unitId]) || null;
      if (!unit && window.SiengeApiService && SiengeApiService.getUnit) {
        unit = await SiengeApiService.getUnit(sale.unitId).catch(() => null);
      }
      unit = unit || { id: sale.unitId, block: "N/D", lot: "N/D", area: 0 };
      let unitDetails = null;
      if (window.SiengeApiService && SiengeApiService.getUnitDetails && enterpriseId && unitName) {
        const det = await SiengeApiService.getUnitDetails(enterpriseId, unitName).catch(() => null);
        if (det && det.results && det.results.length) unitDetails = det.results[0];
      }
      let bill = null;
      if (sale.receivableBillId) {
        try {
          bill = await this._siengeGet("/accounts-receivable/receivable-bills/" + encodeURIComponent(sale.receivableBillId));
        } catch (e) { bill = null; }
      }
      if (sale.id) {
        try {
          const sc = await this._siengeGet("/sales-contracts/" + encodeURIComponent(sale.id));
          if (sc) {
            sale = Object.assign({}, sale, {
              contractNumber: sale.contractNumber || sc.contractNumber || sc.number,
              number: sale.number || sc.number || sc.contractNumber,
              salesContractCustomers: sale.salesContractCustomers || sc.salesContractCustomers,
              customers: sale.customers || sc.salesContractCustomers || sale.customers,
              receivableBillId: sale.receivableBillId || sc.receivableBillId
            });
            const su = (sc.salesContractUnits || []).find((u) => u.main === true) || (sc.salesContractUnits || [])[0] || {};
            if (su.id && !(unitDetails && unitDetails.id)) {
              unitDetails = Object.assign({}, unitDetails || {}, { id: su.id, name: su.name });
            }
          }
        } catch (e) {}
      }
      const block = unit.block && unit.block !== "N/D" ? unit.block : (unitName.split("-")[0] || "");
      const lot = unit.lot && unit.lot !== "N/D" ? unit.lot : (unitName.split("-").slice(1).join("-") || unitName);
      const empName = (window.resolveLoteamentoName ? window.resolveLoteamentoName(unit, sale) : "") || sale.empName || "";
      const cidadeLote = window.resolveCidadeLoteamento ? window.resolveCidadeLoteamento(unit, sale) : "";
      if (typeof window.rememberContractBuyers === "function") window.rememberContractBuyers(sale);
      RelacionamentoState[kind] = { customer, sale, unit, unitDetails, bill, empName, cidadeLote, block, lot };
      const adimplencia = await this._avaliarAdimplencia(sale, bill);
      RelacionamentoState[kind].adimplencia = adimplencia;
      const contratoLabel = this._formatContratoDoc(sale, bill);
      RelacionamentoState[kind].contratoLabel = contratoLabel;
      const custInfo = this._docEl(kind, "-customer-info");
      if (custInfo) custInfo.innerHTML = this._docDadosClienteHtml(customer, sale);
      const custCard = this._docEl(kind, "-customer-card");
      if (custCard) custCard.style.display = "block";
      const resumo = this._docEl(kind, "-contrato-resumo");
      if (resumo) resumo.innerHTML = this._docContratoHtml(RelacionamentoState[kind]);
      const card = this._docEl(kind, "-doc-card");
      if (card) card.style.display = "block";
      this._setDocExtraCard(kind, true);
      if (kind === "terceiros") this._atualizarBtnGerarTerceiro();
      if (window.lucide) lucide.createIcons();
      this._docSetResults(kind, "");
      if (kind === "vencimento") {
        RelacionamentoState[kind].installments = adimplencia.installments || [];
        this._setVencimentoBloqueado(!adimplencia.adimplente, adimplencia.label);
        if (adimplencia.adimplente) {
          const diaEl = document.getElementById("ven-dia");
          if (diaEl) diaEl.value = "";
          this._aplicarJanelaCalendarioVencimento(RelacionamentoState[kind].installments);
          this.atualizarPreviewVencimento();
        }
      }
      if (RelacionamentoState[kind + "FromGestao"]) this._travarFiltrosDocOrigem(kind);
    } catch (err) {
      console.error(err);
      this._docSetResults(kind, `<div style="padding:12px;color:#b91c1c;">${err.message || "Não foi possível carregar o contrato."}</div>`);
      if (RelacionamentoState[kind + "FromGestao"]) this._travarFiltrosDocOrigem(kind);
    }
  },

  async gerarDocSimplesPdf(kind) {
    const cfg = this._docCfg(kind);
    const ctx = RelacionamentoState[kind];
    if (!ctx || !ctx.sale) {
      alert("Busque e selecione um contrato antes de gerar o documento.");
      return;
    }
    if (kind === "terceiros") {
      const missing = this._camposTerceiroFaltando();
      if (missing.length) {
        alert("Preencha todos os campos do terceiro autorizado: " + missing.join(", ") + ".");
        const firstId = !this._valorTerceiro("ter-nome") ? "ter-nome"
          : !this._valorTerceiro("ter-rg") ? "ter-rg"
          : (this._valorTerceiro("ter-cpf").replace(/\D/g, "").length !== 11 && this._valorTerceiro("ter-cpf").replace(/\D/g, "").length !== 14) ? "ter-cpf"
          : "ter-fone";
        document.getElementById(firstId)?.focus();
        this._atualizarBtnGerarTerceiro();
        return;
      }
    }
    if (kind === "vencimento") {
      const adimpl = RelacionamentoState.vencimento && RelacionamentoState.vencimento.adimplencia;
      if (adimpl && adimpl.adimplente === false) {
        alert("Não é possível alterar o vencimento: " + (adimpl.label || "o cliente possui parcelas vencidas") + ".");
        return;
      }
      if (!this._garantirDataOriginalNaJanela()) {
        alert("A alteração só vale a partir da parcela do mês seguinte. Não é permitida data no mês atual nem carência em meses posteriores.");
        return;
      }
      const computed = this._calcularNovoVencimento();
      if (!computed) {
        alert("Informe um novo dia de vencimento diferente do dia original (10, 15 ou 20).");
        return;
      }
    }
    try {
      let t = {};
      try { t = JSON.parse(localStorage.getItem(cfg.storage) || "{}"); } catch (e) {}
      const titleEl = document.getElementById(cfg.titleId);
      const corpoEl = document.getElementById(cfg.corpoId);
      const docTitle = (titleEl && titleEl.value) || t[cfg.titleId] || cfg.defaultTitle;
      let corpo = this._resolveDocCorpo(cfg, corpoEl);
      if (!corpo) {
        alert("O modelo não está preenchido. Salve-o em Configurações → Documentos padrões.");
        return;
      }
      const { customer, sale, unit, bill, empName, cidadeLote, block, lot } = ctx;
      const unitName = String(sale.unitId || "").split("-").slice(2).join("-");
      const quadra = block || unit.block || unitName.split("-")[0] || "____";
      const lote = lot || unit.lot || unitName.split("-").slice(1).join("-") || unitName || "____";
      const titulo = sale.receivableBillId || bill?.id || sale.id || "____";
      const contratoLabel = (ctx.contratoLabel || this._formatContratoDoc(sale, bill));
      const saleDateRaw = sale.saleDate || sale.contractDate || bill?.issueDate;
      let saleDateStr = "____";
      if (saleDateRaw) {
        const iso = String(saleDateRaw).slice(0, 10);
        saleDateStr = /^\d{4}-\d{2}-\d{2}/.test(iso)
          ? iso.split("-").reverse().join("/")
          : new Date(String(saleDateRaw).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");
      }
      const dateExt = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
      const maskCpf = (val) => this._docFmtCpfCnpj(val) || "";
      const extraMap = {
        QUADRA: quadra,
        LOTE: lote,
        TITULO: titulo,
        UNIDADE: this._formatUnidadeDoc(ctx),
        UNIDADE_NOME: this._quadraLoteLabel(ctx) || unitName || "____",
        CODIGO_EMPREENDIMENTO: this._codigoEmpreendimentoDoc(ctx) || "____",
        NUM_CONTRATO: (contratoLabel && contratoLabel !== "—") ? contratoLabel : (sale.contractNumber || sale.number || "____"),
        NUMERO_CONTRATO: (contratoLabel && contratoLabel !== "—") ? contratoLabel : (sale.contractNumber || sale.number || "____"),
        CIDADE_ATUAL: cidadeLote || "Botucatu",
        DATA_HOJE: new Date().toLocaleDateString("pt-BR"),
        NOME_TERCEIRO: String(document.getElementById("ter-nome")?.value || "").trim().toUpperCase() || "________________",
        RG_TERCEIRO: (document.getElementById("ter-rg")?.value || "").trim() || "________________",
        CPF_TERCEIRO: maskCpf((document.getElementById("ter-cpf")?.value || "").trim()) || "________________",
        TELEFONE_TERCEIRO: this._docFmtPhoneDigits((document.getElementById("ter-fone")?.value || "").trim()) || "________________"
      };
      if (kind === "vencimento") {
        const computed = this._calcularNovoVencimento();
        extraMap.DIA_NOVO_VENCIMENTO = String(computed.dia).padStart(2, "0");
        extraMap.DIA_NOVO_VENCIMENTO_EXTENSO = computed.diaExt;
        extraMap.DATA_VENCIMENTO_ORIGINAL = computed.originalBr;
        extraMap.DATA_NOVO_VENCIMENTO = computed.novoBr;
        extraMap.DATA_NOVO_VENCIMENTO_EXTENSO = String(computed.novoExt || "").toUpperCase();
      }
      let preambleText = "";
      if (typeof window.getPreambleForContract === "function") {
        preambleText = window.getPreambleForContract(unit, sale) || "";
      }
      const legalBase = window.buildLegalDocVarMap(customer, sale, unit, {
        preambleText,
        empName,
        cidadeLote,
        saleDateStr,
        dateExt,
        map: extraMap
      });
      const docCliente = this._docFmtCpfCnpj(legalBase.CPF_CNPJ || customer.cpfCnpj || customer.cpf || customer.cnpj);
      if (docCliente) {
        legalBase.CPF_CNPJ = docCliente;
        legalBase.CPF_CLIENTE = docCliente;
      }
      const markup = typeof window.formatDocPadraoMarkup === "function" ? window.formatDocPadraoMarkup(corpo) : corpo;
      const fillVars = typeof window.applyDistratoTemplateVars === "function"
        ? window.applyDistratoTemplateVars
        : function (text, map) {
            let s = String(text || "");
            Object.keys(map || {}).forEach((key) => {
              s = s.replace(new RegExp("\\{\\{" + key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\}\\}", "g"), map[key] == null ? "" : String(map[key]));
            });
            return s;
          };
      let filled = fillVars(markup, legalBase);
      if (typeof window.centerSimpleDocSignature === "function") {
        filled = window.centerSimpleDocSignature(filled);
      }
      filled = this._ensureDocHeaderTopo(filled, legalBase);
      const lineHeight = kind === "vencimento" ? "1.85" : "1.75";
      const docHtml = `
        <h2 style="text-align:center;color:#111;font-size:13pt;font-weight:bold;letter-spacing:0.04em;margin:0 0 1.4rem;">${docTitle}</h2>
        <div style="font-family:'Times New Roman',serif;font-size:11pt;line-height:${lineHeight};text-align:justify;white-space:pre-wrap;">${filled}</div>`;
      document.getElementById("pdf-modal-title").textContent = cfg.title;
      document.getElementById("pdf-document-content").innerHTML = docHtml;
      document.getElementById("pdf-view-overlay").classList.add("active");
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error("Erro ao gerar " + cfg.title, err);
      alert("Não foi possível gerar o documento. Verifique o modelo em Documentos padrões e tente de novo.");
    }
  }
};

window.RelacionamentoApp = RelacionamentoApp;
window.RelacionamentoState = RelacionamentoState;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    RelacionamentoApp.init();
  }, 500);
});
