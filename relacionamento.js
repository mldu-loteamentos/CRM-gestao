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

  _formatUnidadeDoc(ctx) {
    const unitId = this._unitNumericId(ctx);
    const ql = this._quadraLoteLabel(ctx);
    return [unitId, ql].filter(Boolean).join(" ") || "—";
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
          if (n) return { adimplente: false, vencidas: n, label: labelVencidas(n) };
          return { adimplente: true, vencidas: 0, label: "Adimplente" };
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
          if (n) return { adimplente: false, vencidas: n, label: labelVencidas(n) };
          return { adimplente: true, vencidas: 0, label: "Adimplente" };
        }
      } catch (e) {
        console.warn("[Relacionamento] falha ao avaliar adimplência pelas parcelas", e);
      }
    }

    const status = String((sale && sale.status) || "").toLowerCase();
    if (status === "quitado" || (bill && bill.payOffDate)) {
      return { adimplente: true, vencidas: 0, label: "Adimplente" };
    }
    return { adimplente: true, vencidas: 0, label: "Adimplente" };
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

  _docPessoasExtraHtml(customer, sale) {
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
    if (spCpf && typeof formatCpfCnpj === "function") spCpf = formatCpfCnpj(spCpf);
    const secondary = people.filter((p) => {
      if (p.main) return false;
      if (String(p.id) === cid) return false;
      if (p.spouse) return false;
      if (spName && norm(p.name) === norm(spName)) return false;
      return true;
    });
    let html = `<div><span style="color:#64748b;">Estado civil</span><br><strong>${esc(civil)}${esc(regime)}</strong></div>`;
    if (spName) {
      html += `<div><span style="color:#64748b;">Cônjuge</span><br><strong>${esc(spName)}</strong>${spCpf ? `<div style="font-size:0.75rem;color:#64748b;margin-top:2px;">CPF ${esc(spCpf)}</div>` : ""}</div>`;
    }
    if (secondary.length) {
      const lines = secondary.map((p) => {
        const pct = p.participationPercentage != null ? " (" + p.participationPercentage + "%)" : "";
        return esc(p.name) + pct;
      }).join("<br>");
      html += `<div><span style="color:#64748b;">Clientes secundários</span><br><strong>${lines}</strong></div>`;
    }
    return html;
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
      if (blocked) orig.value = "";
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
      return;
    }
    let v = String(el.value || "").replace(/\D/g, "").slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
    el.value = v;
  },

  maskDocFone(el) {
    if (!el) return;
    let v = String(el.value || "").replace(/\D/g, "").slice(0, 11);
    if (!v) {
      el.value = "";
      return;
    }
    if (v.length <= 10) {
      v = v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    } else {
      v = v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
    }
    el.value = v.substring(0, 15);
  },

  _foneFromCustomer(c) {
    if (!c) return "";
    const phones = Array.isArray(c.phones) ? c.phones : [];
    const main = phones.find((p) => p && (p.main === true || String(p.type || "").toUpperCase() === "MAIN")) || phones[0];
    let digits = "";
    if (main) {
      digits = String(main.areaCode || "") + String(main.number || main.phoneNumber || "");
    }
    if (!digits) digits = String(c.phone || c.mobilePhone || "").replace(/\D/g, "");
    digits = digits.replace(/\D/g, "");
    if (!digits) return "";
    const fake = { value: digits };
    this.maskDocFone(fake);
    return fake.value;
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
    if (selectedId && norm(el.value) !== norm(selectedName)) {
      RelacionamentoState.terceiroClienteId = null;
      RelacionamentoState.terceiroClienteName = null;
      this._lockTerceiroDocs(false);
    }
    this.sugerirTerceiroNome(el.value);
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
      const doc = c.cpf || c.cnpj || c.cpfCnpj || "";
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
  },

  async selecionarTerceiroCliente(c) {
    if (!c) return;
    RelacionamentoState.terceiroClienteId = c.id;
    RelacionamentoState.terceiroClienteName = c.name || "";
    const nomeEl = document.getElementById("ter-nome");
    if (nomeEl) nomeEl.value = String(c.name || "").toUpperCase();
    this._aplicarDadosTerceiro(c);
    this._lockTerceiroDocs(true);
    if (c.id && window.SiengeApiService && typeof SiengeApiService.getCustomer === "function") {
      try {
        let full = await SiengeApiService.getCustomer(c.id);
        if (typeof window.enrichCustomerForLegalDocs === "function") {
          full = await window.enrichCustomerForLegalDocs(full);
        }
        if (String(RelacionamentoState.terceiroClienteId) === String(c.id)) {
          this._aplicarDadosTerceiro(full || c);
          this._lockTerceiroDocs(true);
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
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const host = (window.location.hostname === "" || window.location.hostname === "127.0.0.1") ? "localhost" : window.location.hostname;
    return `http://${host}:${port}/sienge-proxy`;
  },

  async _siengeGet(path) {
    const authHeader = window.getBasicAuthHeader ? getBasicAuthHeader() : "";
    const res = await fetch(this._siengeProxyBase() + path, { headers: { Authorization: authHeader } });
    if (!res.ok) throw new Error("Falha na consulta Sienge (HTTP " + res.status + ").");
    return res.json();
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
    ["esc-filter-titulo", "esc-filter-contrato", "esc-filter-nome", "esc-cartorio", "esc-cidade-cartorio", "esc-localizacao", "esc-bancos"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    this.cancelarNovoCartorio();
    const dd = document.getElementById("esc-nome-dropdown");
    if (dd) dd.style.display = "none";
  },

  sugerirNomeEscritura(query) {
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
      };
      dd.appendChild(item);
    });
    dd.style.display = "block";
  },

  async buscarEscritura() {
    const titulo = (document.getElementById("esc-filter-titulo")?.value || "").replace(/\D/g, "");
    const contrato = (document.getElementById("esc-filter-contrato")?.value || "").trim();
    const nome = (document.getElementById("esc-filter-nome")?.value || "").trim();
    if (!titulo && !contrato && !nome && !window.SelectedDynamicCustomerId) {
      alert("Informe o título, o contrato ou o nome do cliente.");
      return;
    }
    this._escSetResultsHtml(`<div style="padding:24px;text-align:center;color:var(--color-text-muted);">
      <div class="loading-spinner" style="width:28px;height:28px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 10px;"></div>
      Consultando contrato na Sienge...
    </div>`);
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
        const data = await this._siengeGet("/sales-contracts?number=" + encodeURIComponent(contrato));
        const list = data.results || [];
        if (!list.length) throw new Error("Contrato não encontrado: " + contrato);
        hintContract = list[0];
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
    this._escSetResultsHtml(`<div style="padding:16px;text-align:center;color:var(--color-text-muted);">Carregando dados do lote e do contrato...</div>`);
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
      const genBtn = document.querySelector('#esc-doc-card [onclick="RelacionamentoApp.gerarEscrituraPdf()"]');
      if (genBtn) genBtn.disabled = !quitadoInfo.quitado;
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
      const { customer, sale, unit, unitDetails, bill, empName, cidadeLote } = ctx;
      const block = unit.block && unit.block !== "N/D" ? unit.block : "";
      const lot = unit.lot && unit.lot !== "N/D" ? unit.lot : "";
      const unitName = String(sale.unitId || "").split("-").slice(2).join("-");
      const quadraLote = (block && lot) ? (block + " - " + lot) : (unitName || "____");
      const unitNumericId = unitDetails?.id || (unit.id && !String(unit.id).startsWith("U-") ? unit.id : "");
      const titulo = sale.receivableBillId || bill?.id || "____";
      const contratoLabel = (ctx.contratoLabel || this._formatContratoDoc(sale, bill));
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
      const cidadeCartorio = nomeCartorio;
      const localizacao = (document.getElementById("esc-localizacao")?.value || "").trim() || "____";
      const bancos = (document.getElementById("esc-bancos")?.value || "").trim() || "conforme extrato anexo";
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
        map: {
          NOME_CARTORIO: nomeCartorio,
          CIDADE_CARTORIO: cidadeCartorio,
          QUADRA_LOTE: quadraLote,
          LOCALIZACAO: localizacao,
          MATRICULA: matricula,
          AREA_LOTE: areaLabel,
          AREA_LOTE_EXTENSO: areaExt,
          VALOR_CONTRATO: valorFmt,
          VALOR_CONTRATO_EXTENSO: valorExt,
          PERCENTUAL_CLIENTE: pctLabel,
          DADOS_BANCARIOS: bancos,
          NUM_CONTRATO: sale.id || "____",
          NUMERO_CONTRATO: sale.id || "____",
          TITULO: titulo,
          UNIDADE: unitNumericId || quadraLote
        }
      });
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
      const filled = fillVars(markup, legalBase);
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

  _docSetResults(kind, html) {
    const el = this._docEl(kind, "-search-results");
    if (el) el.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  sugerirNomeDoc(kind, query) {
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
    window.SelectedDynamicCustomerId = null;
    window.SelectedDynamicCustomerName = null;
    window.SelectedDynamicCustomerDoc = null;
    const card = this._docEl(kind, "-doc-card");
    if (card) card.style.display = "none";
    this._docSetResults(kind, "");
    ["-filter-titulo", "-filter-contrato", "-filter-nome", "-nome", "-rg", "-cpf", "-fone", "-dia", "-data-original"].forEach((suf) => {
      const el = this._docEl(kind, suf);
      if (el) el.value = "";
    });
    const preview = this._docEl(kind, "-preview");
    if (preview) preview.textContent = "";
    const dd = this._docEl(kind, "-nome-dropdown");
    if (dd) dd.style.display = "none";
    if (kind === "vencimento") this._setVencimentoBloqueado(false);
    const terDd = document.getElementById("ter-terceiro-dropdown");
    if (kind === "terceiros" && terDd) {
      terDd.style.display = "none";
      terDd.innerHTML = "";
    }
  },

  atualizarPreviewVencimento() {
    const adimpl = RelacionamentoState.vencimento && RelacionamentoState.vencimento.adimplencia;
    if (adimpl && adimpl.adimplente === false) return;
    const computed = this._calcularNovoVencimento();
    const el = document.getElementById("ven-preview");
    if (!el) return;
    if (!computed) {
      el.textContent = "";
      return;
    }
    el.textContent = "O vencimento passará de " + computed.originalBr + " para " + computed.novoBr + " (" + computed.novoExt + ").";
  },

  _calcularNovoVencimento() {
    const dia = parseInt(document.getElementById("ven-dia")?.value, 10);
    const orig = document.getElementById("ven-data-original")?.value || "";
    if (!(dia >= 1 && dia <= 31) || !orig) return null;
    const key = typeof window.promiseDateKey === "function" ? window.promiseDateKey(orig) : orig.slice(0, 10);
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

  async buscarDocSimples(kind) {
    if (this._docSearchBusy === kind) return;
    const titulo = (this._docEl(kind, "-filter-titulo")?.value || "").replace(/\D/g, "");
    const contrato = (this._docEl(kind, "-filter-contrato")?.value || "").trim();
    const nome = (this._docEl(kind, "-filter-nome")?.value || "").trim();
    if (!titulo && !contrato && !nome && !window.SelectedDynamicCustomerId) {
      alert("Informe o título, o contrato ou o nome do cliente.");
      return;
    }
    this._docSearchBusy = kind;
    this._docSetResults(kind, `<div style="padding:24px;text-align:center;color:var(--color-text-muted);">
      <div class="loading-spinner" style="width:28px;height:28px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 10px;"></div>
      Consultando contrato na Sienge...
    </div>`);
    const card = this._docEl(kind, "-doc-card");
    if (card) card.style.display = "none";
    RelacionamentoState[kind] = null;

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
        const data = await this._siengeGet("/sales-contracts?number=" + encodeURIComponent(contrato));
        const list = data.results || [];
        if (!list.length) throw new Error("Contrato não encontrado: " + contrato);
        hintContract = list[0];
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
      this._docSetResults(kind, `<div style="padding:12px;color:#b91c1c;">${err.message || "Erro ao buscar."}</div>`);
    } finally {
      this._docSearchBusy = null;
    }
  },

  async selecionarDocSimples(kind, idx) {
    let sale = (RelacionamentoState[kind + "Matches"] || [])[idx];
    if (!sale) return;
    this._docSetResults(kind, `<div style="padding:16px;text-align:center;color:var(--color-text-muted);">Carregando dados do lote e do contrato...</div>`);
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
      const empName = window.resolveLoteamentoName ? window.resolveLoteamentoName(unit, sale) : "";
      const cidadeLote = window.resolveCidadeLoteamento ? window.resolveCidadeLoteamento(unit, sale) : "";
      if (typeof window.rememberContractBuyers === "function") window.rememberContractBuyers(sale);
      RelacionamentoState[kind] = { customer, sale, unit, unitDetails, bill, empName, cidadeLote, block, lot };
      const adimplencia = await this._avaliarAdimplencia(sale, bill);
      RelacionamentoState[kind].adimplencia = adimplencia;
      const titulo = sale.receivableBillId || bill?.id || "—";
      const contratoLabel = this._formatContratoDoc(sale, bill);
      RelacionamentoState[kind].contratoLabel = contratoLabel;
      const unidadeLabel = this._formatUnidadeDoc(RelacionamentoState[kind]);
      const sitColor = adimplencia.adimplente ? "#15803d" : "#b91c1c";
      const resumo = this._docEl(kind, "-contrato-resumo");
      if (resumo) {
        resumo.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;font-size:0.9rem;">
            <div><span style="color:#64748b;">Cliente</span><br><strong>${this._escDoc(customer.name || "—")}</strong></div>
            <div><span style="color:#64748b;">Título</span><br><strong>${this._escDoc(titulo)}</strong></div>
            <div><span style="color:#64748b;">Contrato</span><br><strong>${this._escDoc(contratoLabel)}</strong></div>
            <div><span style="color:#64748b;">Unidade</span><br><strong>${this._escDoc(unidadeLabel)}</strong></div>
            <div><span style="color:#64748b;">Empreendimento</span><br><strong>${this._escDoc(empName || "—")}</strong></div>
            <div><span style="color:#64748b;">Situação</span><br><strong style="color:${sitColor};">${this._escDoc(adimplencia.label)}</strong></div>
            ${this._docPessoasExtraHtml(customer, sale)}
          </div>`;
      }
      const card = this._docEl(kind, "-doc-card");
      if (card) card.style.display = "block";
      this._docSetResults(kind, "");
      if (kind === "vencimento") {
        this._setVencimentoBloqueado(!adimplencia.adimplente, adimplencia.label);
        if (adimplencia.adimplente) this.atualizarPreviewVencimento();
      }
    } catch (err) {
      console.error(err);
      this._docSetResults(kind, `<div style="padding:12px;color:#b91c1c;">${err.message || "Não foi possível carregar o contrato."}</div>`);
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
      const nomeTer = (document.getElementById("ter-nome")?.value || "").trim();
      if (!nomeTer) {
        alert("Informe o nome do terceiro autorizado.");
        return;
      }
    }
    if (kind === "vencimento") {
      const adimpl = RelacionamentoState.vencimento && RelacionamentoState.vencimento.adimplencia;
      if (adimpl && adimpl.adimplente === false) {
        alert("Não é possível alterar o vencimento: " + (adimpl.label || "o cliente possui parcelas vencidas") + ".");
        return;
      }
      const computed = this._calcularNovoVencimento();
      if (!computed) {
        alert("Informe o novo dia de vencimento e a data original do mês da alteração.");
        return;
      }
    }
    try {
      let t = {};
      try { t = JSON.parse(localStorage.getItem(cfg.storage) || "{}"); } catch (e) {}
      const titleEl = document.getElementById(cfg.titleId);
      const corpoEl = document.getElementById(cfg.corpoId);
      const docTitle = (titleEl && titleEl.value) || t[cfg.titleId] || cfg.defaultTitle;
      let corpo = (corpoEl && corpoEl.value) || t[cfg.corpoId] || "";
      if (!corpo && corpoEl) corpo = corpoEl.defaultValue || "";
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
      const maskCpf = (typeof formatCpfCnpj === "function")
        ? formatCpfCnpj
        : function (val) { return val || ""; };
      const extraMap = {
        QUADRA: quadra,
        LOTE: lote,
        TITULO: titulo,
        UNIDADE: this._formatUnidadeDoc(ctx),
        NUM_CONTRATO: (contratoLabel && contratoLabel !== "—") ? contratoLabel : (sale.contractNumber || sale.number || "____"),
        NUMERO_CONTRATO: (contratoLabel && contratoLabel !== "—") ? contratoLabel : (sale.contractNumber || sale.number || "____"),
        CIDADE_ATUAL: cidadeLote || "Botucatu",
        DATA_HOJE: new Date().toLocaleDateString("pt-BR"),
        NOME_TERCEIRO: String(document.getElementById("ter-nome")?.value || "").trim().toUpperCase() || "________________",
        RG_TERCEIRO: (document.getElementById("ter-rg")?.value || "").trim() || "________________",
        CPF_TERCEIRO: maskCpf((document.getElementById("ter-cpf")?.value || "").trim()) || "________________",
        TELEFONE_TERCEIRO: (document.getElementById("ter-fone")?.value || "").trim() || "________________"
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
      const filled = fillVars(markup, legalBase);
      const headerEmp = empName || "________________";
      const unidadeHeader = extraMap.UNIDADE || this._formatUnidadeDoc(ctx);
      const docHtml = `
        <div style="margin-bottom:1.4rem;font-family:'Times New Roman',serif;font-size:11pt;line-height:1.45;color:#111;">
          <div>Lot. ${headerEmp}</div>
          <div>Unidade: ${unidadeHeader}</div>
          <div>Título: ${titulo}</div>
        </div>
        <h2 style="text-align:center;color:#111;font-size:13pt;font-weight:bold;letter-spacing:0.04em;margin:0 0 1.4rem;">${docTitle}</h2>
        <div style="font-family:'Times New Roman',serif;font-size:11pt;line-height:1.55;text-align:justify;white-space:pre-wrap;">${filled}</div>`;
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    RelacionamentoApp.init();
  }, 500);
});
