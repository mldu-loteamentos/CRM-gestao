const FinanciamentoState = {
  view: "busca",
  painel: "pesquisa",
  customer: null,
  contracts: [],
  selected: null,
  process: null
};

const FIN_PROC_KEY = "crm_moura_financiamentos_proc";

const FinanciamentoApp = {
  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },

  fmtDate(raw) {
    if (!raw) return "—";
    const s = String(raw).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    }
    return s;
  },

  fmtMoney(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  formatUnidade(raw) {
    let s = String(raw == null ? "" : raw).trim();
    if (!s || s === "—" || s === "N/D") return s || "—";
    s = s.replace(/^quadra-lote:\s*/i, "").trim();
    s = s.replace(/^u[\.\s\-]+/i, "").trim();
    return s || "—";
  },

  init() {
    this.render();
    this.populateEmpreendimentos();
  },

  render() {
    const root = document.getElementById("financiamento-root");
    if (!root) return;
    const noFluxo = FinanciamentoState.view === "fluxo";
    const painel = FinanciamentoState.painel === "esteira" ? "esteira" : "pesquisa";
    root.innerHTML = noFluxo ? this.fluxoHtml() : (this.abasHtml(painel) + (painel === "esteira" ? this.esteiraHtml() : this.buscaHtml()));
    if (window.lucide) lucide.createIcons();
    if (!noFluxo && painel === "pesquisa") this.restoreBuscaUi();
    if (noFluxo) this.prepararTagsUnidade();
  },

  setPainel(id) {
    if (FinanciamentoState.process) this.saveProcess(FinanciamentoState.process);
    FinanciamentoState.painel = id === "esteira" ? "esteira" : "pesquisa";
    FinanciamentoState.view = "busca";
    this.render();
  },

  abasHtml(painel) {
    const n = this.listOpenProcesses().length;
    return `<div class="ml-tabs fin-abas" role="tablist">
      <button type="button" role="tab" aria-selected="${painel === "pesquisa"}" class="ml-tab ${painel === "pesquisa" ? "is-active" : ""}" onclick="FinanciamentoApp.setPainel('pesquisa')"><i data-lucide="search"></i> Pesquisar</button>
      <button type="button" role="tab" aria-selected="${painel === "esteira"}" class="ml-tab ${painel === "esteira" ? "is-active" : ""}" onclick="FinanciamentoApp.setPainel('esteira')"><i data-lucide="columns-3"></i> Esteira <span class="ml-tab-count">${n}</span></button>
    </div>`;
  },

  buscaHtml() {
    return `
      <style>
        #fin-filter-titulo, #fin-filter-contrato, #fin-filter-doc,
        #fin-filter-emp, #fin-filter-unidade, #fin-filter-nome,
        #fin-filter-telefone, #fin-filter-email { border-color:#94a3b8 !important; }
      </style>
      <div class="crm-card" style="margin-bottom:20px;">
        <div class="crm-card-header" style="background-color:#f3f4f6;padding:12px 20px;border-bottom:1px solid #e5e7eb;border-radius:8px 8px 0 0;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:1.1rem;color:var(--color-primary);">Pesquisar</h3>
          <div style="display:flex;gap:15px;align-items:center;">
            <button type="button" class="btn btn-outline btn-sm" onclick="window.startCustomerBackgroundSync && window.startCustomerBackgroundSync(true)" style="display:flex;align-items:center;gap:6px;padding:4px 8px;">
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Atualizar Base
            </button>
          </div>
        </div>
        <div class="crm-card-content" style="padding-bottom:0;">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 160px;gap:16px;align-items:end;margin-bottom:20px;">
            <div class="form-group" style="grid-column:1 / 2;margin:0;">
              <label>Título (Contas a Receber)</label>
              <input type="text" class="form-control" id="fin-filter-titulo" placeholder="" onkeydown="if((event.key==='Enter'||event.key==='Tab')&&this.value){event.preventDefault();FinanciamentoApp.buscar();}" oninput="this.value=this.value.replace(/[^0-9]/g,'');FinanciamentoApp.toggleFilters()">
            </div>
            <div class="form-group" style="grid-column:2 / 3;margin:0;">
              <label>Contrato</label>
              <input type="text" class="form-control" id="fin-filter-contrato" placeholder="" onkeydown="if((event.key==='Enter'||event.key==='Tab')&&this.value){event.preventDefault();FinanciamentoApp.buscar();}" oninput="FinanciamentoApp.toggleFilters()">
            </div>
            <div class="form-group" style="grid-column:3 / 4;margin:0;">
              <label>CPF/CNPJ</label>
              <input type="text" class="form-control" id="fin-filter-doc" placeholder="000.000.000-00" onkeydown="if((event.key==='Enter'||event.key==='Tab')&&this.value){event.preventDefault();FinanciamentoApp.buscar();}" oninput="if(typeof maskCpfCnpj==='function') maskCpfCnpj(this); FinanciamentoApp.toggleFilters()">
            </div>
            <div class="form-group" style="grid-column:1 / 3;margin:0;">
              <label>Empreendimento</label>
              <select class="form-control" id="fin-filter-emp" onchange="FinanciamentoApp.loadUnidades(this.value); FinanciamentoApp.toggleFilters();">
                <option value="">Selecione...</option>
              </select>
            </div>
            <div class="form-group" style="grid-column:3 / 4;margin:0;">
              <label>Unidade</label>
              <select class="form-control" id="fin-filter-unidade" onchange="if(this.value) FinanciamentoApp.buscar();" disabled>
                <option value="">Selecione o emp...</option>
              </select>
            </div>
            <div class="form-group" style="grid-column:4 / 5;margin:0;display:flex;align-items:flex-end;">
              <button type="button" class="btn btn-primary" style="height:38px;width:100%;display:flex;align-items:center;justify-content:center;font-size:0.85rem;padding:0;" onclick="FinanciamentoApp.limparBusca()" title="Nova Busca / Limpar">
                <i data-lucide="eraser" style="width:14px;margin-right:6px;"></i> Limpar
              </button>
            </div>
            <div class="form-group" style="grid-column:1 / 2;margin:0;position:relative;">
              <label>Nome do Cliente</label>
              <input type="text" class="form-control" id="fin-filter-nome" placeholder="Digite para buscar..." onkeydown="if((event.key==='Enter'||event.key==='Tab')&&this.value){event.preventDefault();FinanciamentoApp.buscar();}" oninput="handleDynamicCustomerSearch(this.value,'nome','fin'); FinanciamentoApp.toggleFilters()" autocomplete="off">
            </div>
            <div class="form-group" style="grid-column:2 / 3;margin:0;position:relative;">
              <label>Telefone</label>
              <input type="text" class="form-control" id="fin-filter-telefone" placeholder="Digite para buscar..." onkeydown="if((event.key==='Enter'||event.key==='Tab')&&this.value){event.preventDefault();FinanciamentoApp.buscar();}" oninput="handleDynamicCustomerSearch(this.value,'telefone','fin'); FinanciamentoApp.toggleFilters()" autocomplete="off">
            </div>
            <div class="form-group" style="grid-column:3 / 4;margin:0;position:relative;">
              <label>E-mail</label>
              <input type="text" class="form-control" id="fin-filter-email" placeholder="Digite para buscar..." onkeydown="if((event.key==='Enter'||event.key==='Tab')&&this.value){event.preventDefault();FinanciamentoApp.buscar();}" oninput="handleDynamicCustomerSearch(this.value,'email','fin'); FinanciamentoApp.toggleFilters()" autocomplete="off">
            </div>
          </div>
        </div>
      </div>

      <div class="crm-card" id="fin-abertos-card" style="margin-bottom:24px;">
        <div class="crm-card-header" style="background-color:#f3f4f6;padding:12px 20px;border-bottom:1px solid #e5e7eb;border-radius:8px 8px 0 0;margin-bottom:0;display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:1.1rem;color:var(--color-primary);">Financiamentos em aberto</h3>
          <span id="fin-abertos-count" style="font-size:0.75rem;color:#64748b;font-weight:700;"></span>
        </div>
        <div class="crm-card-content" style="padding:0;">
          <div style="overflow:auto;max-height:280px;border-bottom-left-radius:8px;border-bottom-right-radius:8px;">
            <table class="crm-table" style="width:100%;border-collapse:separate;border-spacing:0;">
              <thead style="position:sticky;top:0;background:#f3f4f6;z-index:10;">
                <tr>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Cliente</th>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Contrato</th>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Título</th>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Unidade</th>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Etapa</th>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Atualizado</th>
                </tr>
              </thead>
              <tbody id="fin-abertos-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="crm-card" id="fin-customer-card" style="display:none;margin-bottom:24px;">
        <div class="crm-card-header" style="background-color:#f3f4f6;padding:12px 20px;border-bottom:1px solid #e5e7eb;border-radius:8px 8px 0 0;margin-bottom:20px;">
          <h3 style="margin:0;font-size:1.1rem;color:var(--color-primary);">Dados do cliente</h3>
        </div>
        <div id="fin-customer-info" class="crm-card-content"></div>
      </div>

      <div class="crm-card" id="fin-results-card" style="display:none;">
        <div class="crm-card-header" style="background-color:#f3f4f6;padding:12px 20px;border-bottom:1px solid #e5e7eb;border-radius:8px 8px 0 0;margin-bottom:20px;">
          <h3 style="margin:0;font-size:1.1rem;color:var(--color-primary);">Contratos do cliente</h3>
        </div>
        <div class="crm-card-content" style="padding:0;">
          <div style="overflow:auto;max-height:480px;border-bottom-left-radius:8px;border-bottom-right-radius:8px;">
            <table class="crm-table" style="width:100%;border-collapse:separate;border-spacing:0;">
              <thead style="position:sticky;top:0;background:#f3f4f6;z-index:10;">
                <tr>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Contrato</th>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Título</th>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Empreendimento</th>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Unidade</th>
                  <th style="text-align:left;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Data Venda</th>
                  <th style="text-align:center;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Status</th>
                  <th style="text-align:center;padding:10px;font-size:0.6rem;color:#64748b;text-transform:uppercase;">Ações</th>
                </tr>
              </thead>
              <tbody id="fin-results-tbody">
                <tr><td colspan="7" style="text-align:center;padding:28px;color:#94a3b8;">Faça uma busca para encontrar clientes.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  restoreBuscaUi() {
    if (FinanciamentoState.customer) {
      const info = document.getElementById("fin-customer-info");
      const card = document.getElementById("fin-customer-card");
      if (info) info.innerHTML = this.customerCardHtml(FinanciamentoState.customer);
      if (card) card.style.display = "block";
    }
    if (FinanciamentoState.contracts && FinanciamentoState.contracts.length) {
      this.renderContractsTable(FinanciamentoState.contracts);
    }
    this.populateEmpreendimentos();
    this.renderAbertos();
  },

  limparBusca() {
    ["fin-filter-titulo", "fin-filter-contrato", "fin-filter-doc", "fin-filter-nome", "fin-filter-telefone", "fin-filter-email"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.value = ""; el.disabled = false; }
    });
    const emp = document.getElementById("fin-filter-emp");
    const uni = document.getElementById("fin-filter-unidade");
    if (emp) { emp.value = ""; emp.disabled = false; }
    if (uni) {
      uni.innerHTML = '<option value="">Selecione o emp...</option>';
      uni.disabled = true;
    }
    window.FinanciamentoSelectedCustomerId = null;
    FinanciamentoState.customer = null;
    FinanciamentoState.contracts = [];
    ["nome", "telefone", "email"].forEach((t) => {
      const dd = document.getElementById("custom-dropdown-fin-" + t);
      if (dd) dd.style.display = "none";
    });
    const cc = document.getElementById("fin-customer-card");
    const rc = document.getElementById("fin-results-card");
    if (cc) cc.style.display = "none";
    if (rc) rc.style.display = "none";
    this.toggleFilters();
    this.renderAbertos();
  },

  toggleFilters() {
    const nome = document.getElementById("fin-filter-nome");
    const tel = document.getElementById("fin-filter-telefone");
    const email = document.getElementById("fin-filter-email");
    const doc = document.getElementById("fin-filter-doc");
    const titulo = document.getElementById("fin-filter-titulo");
    const contrato = document.getElementById("fin-filter-contrato");
    const emp = document.getElementById("fin-filter-emp");
    const uni = document.getElementById("fin-filter-unidade");
    const hasNome = nome && nome.value.trim() !== "";
    const hasTel = tel && tel.value.trim() !== "";
    const hasEmail = email && email.value.trim() !== "";
    const hasDoc = doc && doc.value.trim() !== "";
    const hasTitulo = titulo && titulo.value.trim() !== "";
    const hasContrato = contrato && contrato.value.trim() !== "";
    const hasEmp = emp && emp.value !== "";
    if (nome) nome.disabled = hasTel || hasEmail || hasDoc || hasTitulo || hasContrato || hasEmp;
    if (tel) tel.disabled = hasNome || hasEmail || hasDoc || hasTitulo || hasContrato || hasEmp;
    if (email) email.disabled = hasNome || hasTel || hasDoc || hasTitulo || hasContrato || hasEmp;
    if (doc) doc.disabled = hasNome || hasTel || hasEmail || hasTitulo || hasContrato || hasEmp;
    if (titulo) titulo.disabled = hasNome || hasTel || hasEmail || hasDoc || hasContrato || hasEmp;
    if (contrato) contrato.disabled = hasNome || hasTel || hasEmail || hasDoc || hasTitulo || hasEmp;
    if (emp) emp.disabled = hasNome || hasTel || hasEmail || hasDoc || hasTitulo || hasContrato;
    if (uni) uni.disabled = !hasEmp || hasNome || hasTel || hasEmail || hasDoc || hasTitulo || hasContrato;
  },

  async populateEmpreendimentos() {
    const empSelect = document.getElementById("fin-filter-emp");
    if (!empSelect || !window.SiengeApiService) return;
    try {
      const keep = empSelect.value;
      let ccs = await SiengeApiService.getCostCenters();
      let customFields = {};
      try { customFields = JSON.parse(localStorage.getItem("crm_centros_custo_custom") || "{}") || {}; } catch (e) {}
      if (window.EstoqueComercialApp && typeof EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento === "function") {
        ccs = EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento(ccs);
      } else {
        ccs = (ccs || []).filter((c) => {
          const custom = customFields[c.id] || customFields[String(c.id)] || {};
          const tipo = custom.tipo_cc || "";
          return tipo === "Loteamento Aberto" || tipo === "Loteamento Fechado" || tipo === "Incorporação";
        });
      }
      ccs.sort((a, b) => a.id - b.id);
      empSelect.innerHTML = '<option value="">Selecione...</option>' + ccs.map((c) =>
        `<option value="${c.id}">${c.id} - ${this.esc(c.name)}</option>`
      ).join("");
      if (keep && Array.from(empSelect.options).some((o) => String(o.value) === String(keep))) empSelect.value = keep;
    } catch (e) {}
  },

  async loadUnidades(cc) {
    const selectUnidade = document.getElementById("fin-filter-unidade");
    if (!selectUnidade) return;
    selectUnidade.innerHTML = '<option value="">Carregando unidades...</option>';
    selectUnidade.disabled = true;
    if (!cc) {
      selectUnidade.innerHTML = '<option value="">Selecione o emp...</option>';
      return;
    }
    try {
      let allUnits = [];
      let offset = 0;
      const limit = 200;
      while (true) {
        const data = await window.siengeFetchWithRetry(`/units?limit=${limit}&offset=${offset}&enterpriseId=${cc}&additionalData=NONE`);
        const results = data.results || [];
        allUnits = allUnits.concat(results);
        if (!results.length) break;
        offset += results.length;
      }
      allUnits = allUnits.filter((u) => u.commercialStock !== "T");
      allUnits.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { numeric: true }));
      selectUnidade.innerHTML = '<option value="">Selecione...</option>' + allUnits.map((u) => {
        const label = this.formatUnidade(u.name || u.id);
        return `<option value="${u.id}" data-contract="${this.esc(u.contractId || "")}">${this.esc(label)}</option>`;
      }).join("");
      selectUnidade.disabled = false;
    } catch (e) {
      selectUnidade.innerHTML = '<option value="">Erro ao carregar unidades</option>';
    }
  },

  norm(str) {
    return String(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  },

  sugerirCliente(val, tipo) {
    if (typeof window.handleDynamicCustomerSearch === "function") {
      window.handleDynamicCustomerSearch(val, tipo, "fin");
    }
  },

  escolherSugestao(id) {
    window.FinanciamentoSelectedCustomerId = id;
    const cache = (window.GlobalCustomerCache && window.GlobalCustomerCache.data) || [];
    const hit = cache.find((c) => String(c.id) === String(id));
    if (hit) {
      const nome = document.getElementById("fin-filter-nome");
      const doc = document.getElementById("fin-filter-doc");
      if (nome) nome.value = hit.name || "";
      if (doc) doc.value = hit.cpf || hit.cnpj || hit.cpfCnpj || String(hit.id);
    }
    const sug = document.getElementById("fin-sugestoes");
    if (sug) sug.style.display = "none";
    this.buscar();
  },

  proxyBase() {
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const host = (window.location.hostname === "" || window.location.hostname === "127.0.0.1") ? "localhost" : window.location.hostname;
    return `http://${host}:${port}/sienge-proxy`;
  },

  authHeader() {
    return window.getBasicAuthHeader ? getBasicAuthHeader() : "";
  },

  async resolveCustomerId() {
    if (window.FinanciamentoSelectedCustomerId) return String(window.FinanciamentoSelectedCustomerId);
    const titulo = ((document.getElementById("fin-filter-titulo") || {}).value || "").trim();
    const contrato = ((document.getElementById("fin-filter-contrato") || {}).value || "").trim();
    const emp = ((document.getElementById("fin-filter-emp") || {}).value || "").trim();
    const unidadeSel = document.getElementById("fin-filter-unidade");
    const unidadeId = unidadeSel && unidadeSel.value ? unidadeSel.value : "";
    const nome = ((document.getElementById("fin-filter-nome") || {}).value || "").trim();
    const docRaw = ((document.getElementById("fin-filter-doc") || {}).value || "").trim();
    const tel = (((document.getElementById("fin-filter-telefone") || {}).value || "").replace(/\D/g, ""));
    const email = ((document.getElementById("fin-filter-email") || {}).value || "").trim();
    const docDigits = String(docRaw).replace(/\D/g, "");
    const cache = (window.GlobalCustomerCache && window.GlobalCustomerCache.data) || [];
    const base = this.proxyBase();
    const headers = { Authorization: this.authHeader() };

    if (titulo) {
      const res = await fetch(`${base}/accounts-receivable/receivable-bills/${encodeURIComponent(titulo)}`, { headers });
      if (!res.ok) throw new Error(`Título não encontrado: ${titulo}`);
      const bill = await res.json();
      if (!bill.customerId) throw new Error("Título sem cliente associado.");
      return String(bill.customerId);
    }

    if (contrato) {
      const c = await window.findSalesContractExact(contrato, async (path) => {
        const res = await fetch(`${base}${path}`, { headers });
        if (!res.ok) throw new Error(`Contrato não encontrado: ${contrato}`);
        return res.json();
      });
      if (!c) throw new Error(`Contrato não encontrado: ${contrato}`);
      let cid = c.customerId || (c.customer && c.customer.id) || (c.customers && c.customers[0] && (c.customers[0].id || c.customers[0].customerId));
      if (!cid && c.receivableBillId) {
        const bRes = await fetch(`${base}/accounts-receivable/receivable-bills/${c.receivableBillId}`, { headers });
        if (bRes.ok) {
          const bill = await bRes.json();
          cid = bill.customerId;
        }
      }
      if (!cid) throw new Error("Cliente não encontrado no contrato.");
      return String(cid);
    }

    if (emp && unidadeId) {
      const res = await fetch(`${base}/sales-contracts?enterpriseId=${encodeURIComponent(emp)}&unitId=${encodeURIComponent(unidadeId)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const list = data.results || [];
        const pick = list.find((c) => String(c.status).toUpperCase() === "ACTIVE") || list[0];
        if (pick) {
          const cid = pick.customerId || (pick.customer && pick.customer.id);
          if (cid) return String(cid);
        }
      }
      const opt = unidadeSel.options[unidadeSel.selectedIndex];
      const contractId = opt && opt.getAttribute("data-contract");
      if (contractId) {
        const scRes = await fetch(`${base}/sales-contracts/${contractId}`, { headers });
        if (scRes.ok) {
          const sc = await scRes.json();
          const cid = sc.customerId || (sc.customer && sc.customer.id);
          if (cid) return String(cid);
        }
      }
    }

    if (docDigits.length >= 11 && cache.length) {
      const byDoc = cache.find((c) => String(c.cpf || c.cnpj || c.cpfCnpj || "").replace(/\D/g, "") === docDigits);
      if (byDoc) return String(byDoc.id);
    }
    if (/^\d+$/.test(docRaw) && docRaw.length <= 8) return docRaw;
    let match = null;
    if (nome && cache.length) {
      const terms = this.norm(nome).split(/\s+/).filter(Boolean);
      match = cache.find((c) => terms.every((t) => this.norm(c.name).includes(t)));
    } else if (tel.length >= 4 && cache.length) {
      match = cache.find((c) => (c.phones || []).some((p) => {
        const full = String(p.areaCode || "") + String(p.number || p.phoneNumber || "");
        return full.replace(/\D/g, "").includes(tel);
      }));
    } else if (email && cache.length) {
      match = cache.find((c) => this.norm(c.email).includes(this.norm(email)));
    }
    return match ? String(match.id) : null;
  },

  customerCardHtml(c) {
    const doc = c.cpfCnpj || c.cpf || c.cnpj || "";
    const docLabel = String(doc).replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF";
    let age = "Não informado";
    if (c.birthDate && String(doc).replace(/\D/g, "").length <= 11) {
      const birth = new Date(String(c.birthDate).slice(0, 10) + "T12:00:00");
      if (!isNaN(birth.getTime())) {
        const today = new Date();
        let diff = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) diff--;
        age = diff + " anos";
      }
    }
    const prof = c.profession || c.occupation || "N/D";
    let addr = "Não informado";
    if (c.addresses && c.addresses[0]) {
      const a = c.addresses[0];
      addr = [a.street || a.streetName, a.number, a.complement, a.neighborhood, [a.cityName || a.city, a.stateName || a.state].filter(Boolean).join("/"), a.postalCode || a.zipCode ? "CEP: " + (a.postalCode || a.zipCode) : ""]
        .filter(Boolean).join(", ");
    }
    let phone = "Não informado";
    const phones = c.phones || [];
    if (phones[0]) {
      const p = phones[0];
      const d = (String(p.areaCode || "") + String(p.number || p.phoneNumber || "")).replace(/\D/g, "");
      phone = d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : (d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d);
    }
    const email = c.email || "Não informado";
    const fmtDoc = typeof formatCpfCnpj === "function" ? formatCpfCnpj(doc) : doc;
    return `
      <div class="cessao-customer-grid">
        <div class="cessao-customer-field cessao-customer-field--wide"><span class="cessao-lbl">Nome</span><span class="cessao-val">${this.esc(c.name || "—")}</span></div>
        <div class="cessao-customer-field"><span class="cessao-lbl">${docLabel}</span><span class="cessao-val">${this.esc(fmtDoc || "—")}</span></div>
        <div class="cessao-customer-field"><span class="cessao-lbl">Idade</span><span class="cessao-val">${this.esc(age)}</span></div>
        <div class="cessao-customer-field"><span class="cessao-lbl">Profissão</span><span class="cessao-val">${this.esc(prof)}</span></div>
        <div class="cessao-customer-field"><span class="cessao-lbl">Telefones</span><span class="cessao-val">${this.esc(phone)}</span></div>
        <div class="cessao-customer-field"><span class="cessao-lbl">E-mail</span><span class="cessao-val">${this.esc(email)}</span></div>
        <div class="cessao-customer-field cessao-customer-field--full"><span class="cessao-lbl">Endereço</span><span class="cessao-val">${this.esc(addr)}</span></div>
      </div>`;
  },

  statusPill(status) {
    const st = String(status || "").toUpperCase();
    if (st.includes("QUIT")) return '<span style="background:#eff6ff;border:1px solid #93c5fd;color:#1d4ed8;padding:4px 10px;border-radius:12px;font-size:0.72rem;font-weight:700;">Quitado</span>';
    if (st.includes("CANCEL") || st.includes("DISTRAT")) return '<span style="background:#f1f5f9;border:1px solid #cbd5e1;color:#475569;padding:4px 10px;border-radius:12px;font-size:0.72rem;font-weight:700;">Distratado/Cancelado</span>';
    if (st.includes("ACTIVE") || st.includes("ATIVO") || !st) {
      return '<span style="background:#ecfdf5;border:1px solid #86efac;color:#166534;padding:4px 10px;border-radius:12px;font-size:0.72rem;font-weight:700;">Adimplente</span>';
    }
    return `<span style="background:#f8fafc;border:1px solid #e2e8f0;color:#334155;padding:4px 10px;border-radius:12px;font-size:0.72rem;font-weight:700;">${this.esc(status)}</span>`;
  },

  async buscar() {
    const tbody = document.getElementById("fin-results-tbody");
    const info = document.getElementById("fin-customer-info");
    const card = document.getElementById("fin-customer-card");
    const results = document.getElementById("fin-results-card");
    const sug = document.getElementById("fin-sugestoes");
    if (sug) sug.style.display = "none";
    let customerId;
    try {
      customerId = await this.resolveCustomerId();
    } catch (e) {
      alert(e.message || "Não foi possível localizar o cliente.");
      return;
    }
    if (!customerId) {
      alert("Preencha pelo menos um campo para pesquisar.");
      return;
    }
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:36px;color:#64748b;">
        <div class="loading-spinner" style="width:28px;height:28px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 10px;"></div>
        Buscando contratos do cliente…
      </td></tr>`;
    }
    if (results) results.style.display = "block";
    if (card) card.style.display = "none";
    try {
      const svc = window.SiengeApiService;
      if (!svc) throw new Error("API Sienge indisponível");
      const customer = await svc.getCustomer(customerId);
      if (!customer) throw new Error("Cliente não encontrado");
      FinanciamentoState.customer = customer;
      if (info) info.innerHTML = this.customerCardHtml(customer);
      if (card) card.style.display = "block";
      let contracts = [];
      if (typeof svc.getSales === "function") contracts = await svc.getSales(customerId);
      if (!Array.isArray(contracts)) contracts = [];
      FinanciamentoState.contracts = contracts;
      this.renderContractsTable(contracts);
    } catch (e) {
      console.error("[Financiamento] busca", e);
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--color-danger);">${this.esc(e.message || "Falha na busca")}</td></tr>`;
    }
  },

  renderContractsTable(contracts) {
    const tbody = document.getElementById("fin-results-tbody");
    const results = document.getElementById("fin-results-card");
    if (results) results.style.display = "block";
    if (!tbody) return;
    if (!contracts.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:#94a3b8;">Nenhum contrato encontrado para este cliente.</td></tr>';
      return;
    }
    const ccs = (window.AppState && AppState.cachedCostCenters) || [];
    const ccMap = {};
    ccs.forEach((cc) => { ccMap[String(cc.id)] = cc.name; });
    const customer = FinanciamentoState.customer || {};
    tbody.innerHTML = contracts.map((c) => {
      const cid = c.id || c.contractId || "";
      const num = c.contractNumber || c.number || cid;
      const titulo = c.receivableBillId || c.billReceivableId || "—";
      const empId = c.enterpriseId || c.costCenterId || "";
      const empName = ccMap[String(empId)] || c.enterpriseName || empId || "—";
      const unitLabel = this.formatUnidade(c.unitName || c.unityName || c.unitId || "—");
      const dataVenda = this.fmtDate(c.saleDate || c.contractDate || c.issueDate);
      const proc = this.getProcess(customer.id, cid);
      const btnLabel = proc ? "Continuar financiamento" : "Iniciar financiamento";
      return `<tr>
        <td style="padding:10px;font-weight:700;font-size:0.75rem;">${this.esc(num)}</td>
        <td style="padding:10px;font-weight:800;font-size:0.75rem;">${this.esc(titulo)}</td>
        <td style="padding:10px;font-size:0.75rem;">${this.esc(empName)}</td>
        <td style="padding:10px;font-size:0.75rem;">${this.esc(unitLabel)}</td>
        <td style="padding:10px;font-size:0.75rem;">${this.esc(dataVenda)}</td>
        <td style="padding:10px;text-align:center;">${this.statusPill(c.status)}</td>
        <td style="padding:10px;text-align:center;white-space:nowrap;">
          <button type="button" class="btn btn-primary btn-sm"
            onclick="FinanciamentoApp.iniciar('${String(customer.id).replace(/'/g, "")}','${String(cid).replace(/'/g, "")}','${String(titulo).replace(/'/g, "")}','${String(num).replace(/'/g, "")}')"
            style="padding:6px 12px;font-size:0.75rem;font-weight:700;">
            <i data-lucide="landmark" style="width:14px;height:14px;margin-right:4px;"></i> ${btnLabel}
          </button>
        </td>
      </tr>`;
    }).join("");
    if (window.lucide) lucide.createIcons();
  },

  loadAllProcesses() {
    try {
      const obj = JSON.parse(localStorage.getItem(FIN_PROC_KEY) || "{}") || {};
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
    } catch (e) {
      return {};
    }
  },

  isProcessoAberto(proc) {
    if (!proc) return false;
    const st = String(proc.status || "").toLowerCase();
    if (st === "concluido" || st === "encerrado" || st === "cancelado" || st === "closed") return false;
    if (proc.closedAt || proc.finishedAt) return false;
    return true;
  },

  listOpenProcesses() {
    const all = this.loadAllProcesses();
    const mem = FinanciamentoState.process;
    if (mem && mem.customerId && mem.contractId) {
      const key = this.procKey(mem.customerId, mem.contractId);
      const saved = all[key];
      const tm = Date.parse(mem.updatedAt || mem.startedAt || 0) || 0;
      const ts = Date.parse((saved && (saved.updatedAt || saved.startedAt)) || 0) || 0;
      if (!saved || tm >= ts) all[key] = mem;
    }
    return Object.keys(all).map((key) => {
      const proc = all[key];
      if (!proc || typeof proc !== "object") return null;
      if (!this.isProcessoAberto(proc)) return null;
      return { key, proc };
    }).filter(Boolean).sort((a, b) => String(b.proc.updatedAt || b.proc.startedAt || "").localeCompare(String(a.proc.updatedAt || a.proc.startedAt || "")));
  },

  etapaLabel(proc) {
    const catalog = typeof window.buildFinanciamentoStageCatalog === "function"
      ? window.buildFinanciamentoStageCatalog()
      : (window.EtapasFinanciamentoState || []);
    const id = proc && proc.currentStageId;
    if (!id) return "Aguardando primeira etapa";
    const hit = (catalog || []).find((s) => s && String(s.id) === String(id));
    return (hit && (hit.label || hit.nome)) || String(id);
  },

  renderAbertos() {
    const tbody = document.getElementById("fin-abertos-tbody");
    const countEl = document.getElementById("fin-abertos-count");
    if (!tbody) return;
    const rows = this.listOpenProcesses();
    if (countEl) countEl.textContent = rows.length ? (rows.length + (rows.length === 1 ? " em andamento" : " em andamento")) : "";
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:22px;color:#94a3b8;">Nenhum financiamento em aberto. Pesquise um cliente e clique em Iniciar financiamento.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(({ key, proc }) => {
      const safeKey = String(key).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      return `<tr tabindex="0" role="button" onclick="FinanciamentoApp.abrirAberto('${safeKey}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();FinanciamentoApp.abrirAberto('${safeKey}')}" style="cursor:pointer;" onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background=''">
        <td style="padding:10px;font-weight:700;font-size:0.75rem;color:#0f172a;">${this.esc(proc.customerName || proc.customerId || "—")}</td>
        <td style="padding:10px;font-size:0.75rem;">${this.esc(proc.contractNumber || proc.contractId || "—")}</td>
        <td style="padding:10px;font-size:0.75rem;font-weight:800;">${this.esc(proc.titulo || "—")}</td>
        <td style="padding:10px;font-size:0.75rem;">${this.esc(this.formatUnidade(proc.unit || "—"))}</td>
        <td style="padding:10px;font-size:0.75rem;color:#105436;font-weight:600;">${this.esc(this.etapaLabel(proc))}</td>
        <td style="padding:10px;font-size:0.75rem;color:#64748b;">${this.esc(this.fmtDate(proc.updatedAt || proc.startedAt))}</td>
      </tr>`;
    }).join("");
  },

  async abrirAberto(key) {
    const all = this.loadAllProcesses();
    const proc = all[String(key)];
    if (!proc) return;
    FinanciamentoState.process = proc;
    let customer = FinanciamentoState.customer;
    if (!customer || String(customer.id) !== String(proc.customerId)) {
      try {
        if (window.SiengeApiService && typeof SiengeApiService.getCustomer === "function") {
          customer = await SiengeApiService.getCustomer(proc.customerId);
        }
      } catch (e) {
        customer = { id: proc.customerId, name: proc.customerName };
      }
    }
    FinanciamentoState.customer = customer || { id: proc.customerId, name: proc.customerName };
    FinanciamentoState.selected = {
      customerId: proc.customerId,
      contractId: proc.contractId,
      titulo: proc.titulo,
      contractNumber: proc.contractNumber,
      contract: { unitName: proc.unit, enterpriseId: proc.empId },
      customer: FinanciamentoState.customer
    };
    FinanciamentoState.view = "fluxo";
    this.render();
  },

  procKey(customerId, contractId) {
    return String(customerId) + ":" + String(contractId);
  },

  getProcess(customerId, contractId) {
    const all = this.loadAllProcesses();
    return all[this.procKey(customerId, contractId)] || null;
  },

  saveProcess(proc) {
    if (!proc || proc.customerId == null || proc.contractId == null) return;
    const all = this.loadAllProcesses();
    all[this.procKey(proc.customerId, proc.contractId)] = proc;
    localStorage.setItem(FIN_PROC_KEY, JSON.stringify(all));
    if (window.forceUploadLocalConfig) window.forceUploadLocalConfig(true).catch(() => {});
    if (FinanciamentoState.view === "busca") this.renderAbertos();
  },

  iniciar(customerId, contractId, titulo, contractNumber) {
    const customer = FinanciamentoState.customer || {};
    const contract = (FinanciamentoState.contracts || []).find((c) => String(c.id || c.contractId) === String(contractId)) || {};
    let proc = this.getProcess(customerId, contractId);
    if (!proc) {
      proc = {
        id: "fin-" + Date.now(),
        customerId: String(customerId),
        contractId: String(contractId),
        titulo: titulo || "",
        contractNumber: contractNumber || "",
        customerName: customer.name || "",
        unit: this.formatUnidade(contract.unitName || contract.unityName || contract.unitId || ""),
        empId: contract.enterpriseId || contract.costCenterId || "",
        costCenterId: String(contract.costCenterId || contract.enterpriseId || ""),
        unitName: String(contract.unitName || contract.unityName || contract.unitId || ""),
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentStageId: null,
        done: {}
      };
      this.saveProcess(proc);
    }
    FinanciamentoState.selected = { customerId, contractId, titulo, contractNumber, contract, customer };
    FinanciamentoState.process = proc;
    FinanciamentoState.view = "fluxo";
    this.render();
  },

  voltarBusca() {
    if (FinanciamentoState.process) this.saveProcess(FinanciamentoState.process);
    FinanciamentoState.view = "busca";
    FinanciamentoState.process = null;
    this.render();
  },

  hojeIso() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  },

  somarDias(iso, dias) {
    const base = String(iso || "").slice(0, 10);
    if (!base) return "";
    if (typeof window.addDaysIso === "function") return window.addDaysIso(base, dias);
    const d = new Date(base + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + (Number(dias) || 0));
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  },

  diasEntre(de, ate) {
    const a = new Date(String(de || "").slice(0, 10) + "T12:00:00");
    const b = new Date(String(ate || "").slice(0, 10) + "T12:00:00");
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  },

  catalogoEtapas() {
    if (typeof window.buildFinanciamentoStageCatalog === "function") return window.buildFinanciamentoStageCatalog();
    return (window.EtapasFinanciamentoState || []).map((e, i) => ({
      id: e.id, nome: e.nome, label: (i + 1) + ". " + e.nome, dias: parseInt(e.dias, 10) || 0, selectable: true, hasChildren: false
    }));
  },

  /* O prazo corre a partir do dia em que o financiamento entrou na etapa atual. */
  prazoEtapa(proc, etapa) {
    const entrada = String((proc && proc.done && etapa && proc.done[etapa.id]) || (proc && (proc.updatedAt || proc.startedAt)) || "").slice(0, 10);
    const dias = etapa ? (parseInt(etapa.dias, 10) || 0) : 0;
    if (!etapa) return { entrada: entrada, limite: "", dias: 0, status: "sem-etapa", restantes: null };
    if (!dias) return { entrada: entrada, limite: "", dias: 0, status: "sem-prazo", restantes: null };
    if (!entrada) return { entrada: "", limite: "", dias: dias, status: "sem-prazo", restantes: null };
    const limite = this.somarDias(entrada, dias);
    const restantes = this.diasEntre(this.hojeIso(), limite);
    return { entrada: entrada, limite: limite, dias: dias, status: restantes < 0 ? "atrasado" : "no-prazo", restantes: restantes };
  },

  esteiraHtml() {
    const catalogo = this.catalogoEtapas();
    const colunasEtapa = catalogo.filter((s) => s.selectable !== false && !s.hasChildren);
    const abertos = this.listOpenProcesses();
    const porId = {};
    colunasEtapa.forEach((s) => { porId[String(s.id)] = []; });
    const aguardando = [];
    const fora = [];
    abertos.forEach((row) => {
      const id = row.proc && row.proc.currentStageId;
      if (!id) aguardando.push(row);
      else if (porId[String(id)]) porId[String(id)].push(row);
      else fora.push(row);
    });
    const ordenar = (lista, etapa) => lista.slice().sort((a, b) => {
      const pa = this.prazoEtapa(a.proc, etapa);
      const pb = this.prazoEtapa(b.proc, etapa);
      const peso = (p) => p.status === "atrasado" ? -10000 + (p.restantes || 0) : (p.status === "no-prazo" ? (p.restantes || 0) : 10000);
      return peso(pa) - peso(pb);
    });
    const colunas = [{ id: "", nome: "Aguardando", label: "Aguardando", dias: 0, itens: aguardando }]
      .concat(colunasEtapa.map((s) => ({ ...s, itens: ordenar(porId[String(s.id)] || [], s) })));
    if (fora.length) colunas.push({ id: "__fora", nome: "Etapa removida", label: "Etapa removida", dias: 0, itens: fora });
    const atrasados = abertos.filter((row) => {
      const etapa = colunasEtapa.find((s) => String(s.id) === String(row.proc.currentStageId));
      return etapa && this.prazoEtapa(row.proc, etapa).status === "atrasado";
    }).length;
    const noPrazo = abertos.filter((row) => {
      const etapa = colunasEtapa.find((s) => String(s.id) === String(row.proc.currentStageId));
      return etapa && this.prazoEtapa(row.proc, etapa).status === "no-prazo";
    }).length;
    const resumo = abertos.length
      ? `<p class="fin-esteira-resumo">${abertos.length} em andamento · ${noPrazo} no prazo · ${atrasados} atrasado${atrasados === 1 ? "" : "s"} · ${aguardando.length} aguardando a primeira etapa.</p>`
      : `<p class="fin-esteira-resumo">Nenhum financiamento em aberto. Pesquise um cliente e clique em Iniciar financiamento.</p>`;
    const vazioEtapas = colunasEtapa.length ? "" : `<p class="fin-esteira-resumo">Nenhuma etapa cadastrada. Vá em Configurações → Etapas Financiamento.</p>`;
    return `<style>
      #financiamento-root .fin-abas { margin: 0 0 14px; }
      #financiamento-root .fin-esteira-resumo { margin: 0 0 12px; color: #64748b; font-size: 0.84rem; }
      #financiamento-root .fin-esteira { display: flex; gap: 12px; overflow-x: auto; align-items: flex-start; padding-bottom: 8px; }
      #financiamento-root .fin-col { flex: 0 0 280px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; min-height: 180px; display: flex; flex-direction: column; max-height: calc(100vh - 220px); }
      #financiamento-root .fin-col-h { padding: 12px 12px 8px; border-bottom: 1px solid #e2e8f0; }
      #financiamento-root .fin-col-h strong { display: block; color: #0f172a; font-size: 0.84rem; line-height: 1.3; }
      #financiamento-root .fin-col-h span { color: #64748b; font-size: 0.75rem; }
      #financiamento-root .fin-col-lista { padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
      #financiamento-root .fin-card { text-align: left; width: 100%; border: 1px solid #e2e8f0; border-left: 4px solid #105436; background: #fff; border-radius: 10px; padding: 10px 12px; cursor: pointer; }
      #financiamento-root .fin-card.is-atrasado { border-left-color: #b91c1c; }
      #financiamento-root .fin-card.is-vence { border-left-color: #f37021; }
      #financiamento-root .fin-card.is-sem { border-left-color: #94a3b8; }
      #financiamento-root .fin-card-nome { font-weight: 800; color: #0f172a; font-size: 0.84rem; }
      #financiamento-root .fin-card-meta { color: #64748b; font-size: 0.75rem; margin-top: 2px; }
      #financiamento-root .fin-pill { display: inline-block; margin-top: 8px; font-size: 0.72rem; font-weight: 800; border-radius: 999px; padding: 2px 8px; }
      #financiamento-root .fin-pill.is-ok { background: #dcfce7; color: #166534; }
      #financiamento-root .fin-pill.is-atrasado { background: #fee2e2; color: #991b1b; }
      #financiamento-root .fin-pill.is-vence { background: #ffedd5; color: #9a3412; }
      #financiamento-root .fin-pill.is-sem { background: #f1f5f9; color: #475569; }
      #financiamento-root .fin-col-vazia { color: #94a3b8; font-size: 0.78rem; padding: 8px 2px; }
      #financiamento-root .fin-card-nota { color: #334155; font-size: 0.75rem; margin-top: 6px; line-height: 1.35; }
    </style>
    ${resumo}${vazioEtapas}
    <div class="fin-esteira">${colunas.map((col) => this.colunaHtml(col)).join("")}</div>`;
  },

  colunaHtml(col) {
    const etapa = col.id && col.id !== "__fora" ? col : null;
    const prazoTxt = !col.id ? "Entrada na esteira" : (col.id === "__fora" ? "Etapa que saiu do cadastro" : (etapa && etapa.dias ? (etapa.dias + (etapa.dias === 1 ? " dia" : " dias")) : "Sem prazo definido"));
    const cards = (col.itens || []).map((row) => this.cardEsteiraHtml(row, etapa)).join("");
    return `<section class="fin-col">
      <header class="fin-col-h">
        <strong>${this.esc(col.label || col.nome)}</strong>
        <span>${(col.itens || []).length} · ${this.esc(prazoTxt)}</span>
      </header>
      <div class="fin-col-lista">${cards || '<div class="fin-col-vazia">Nenhum financiamento</div>'}</div>
    </section>`;
  },

  cardEsteiraHtml(row, etapa) {
    const proc = row.proc || {};
    const prazo = this.prazoEtapa(proc, etapa);
    let cls = "is-sem";
    let pill = "Sem prazo";
    if (prazo.status === "atrasado") {
      cls = "is-atrasado";
      const n = Math.abs(prazo.restantes || 0);
      pill = "Atrasado " + n + (n === 1 ? " dia" : " dias");
    } else if (prazo.status === "no-prazo") {
      const n = prazo.restantes || 0;
      if (n <= 2) {
        cls = "is-vence";
        pill = n === 0 ? "Vence hoje" : ("Vence em " + n + (n === 1 ? " dia" : " dias"));
      } else {
        cls = "is-ok";
        pill = "No prazo · " + n + " dias";
      }
    }
    const quando = prazo.entrada ? ("Entrou em " + this.fmtDate(prazo.entrada)) : "Sem data de entrada";
    const limite = prazo.limite ? (" · prazo " + this.fmtDate(prazo.limite)) : "";
    const safeKey = String(row.key).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `<button type="button" class="fin-card ${cls}" onclick="FinanciamentoApp.abrirAberto('${safeKey}')">
      <div class="fin-card-nome">${this.esc(proc.customerName || proc.customerId || "—")}</div>
      <div class="fin-card-meta">Contrato ${this.esc(proc.contractNumber || proc.contractId || "—")} · Título ${this.esc(proc.titulo || "—")}</div>
      <div class="fin-card-meta">${this.esc(this.formatUnidade(proc.unit || "—"))}</div>
      <div class="fin-card-meta">${this.esc(quando + limite)}</div>
      ${this.notaCardHtml(proc, etapa)}
      <span class="fin-pill ${cls}">${this.esc(pill)}</span>
    </button>`;
  },

  ehFeriado(iso) {
    if (window.EscalaHomeOffice && typeof window.EscalaHomeOffice.ehFeriado === "function") {
      return window.EscalaHomeOffice.ehFeriado(iso);
    }
    const ano = Number(String(iso).slice(0, 4));
    const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
    if (fixos.some((md) => iso === ano + "-" + md)) return true;
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    const pascoa = ano + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
    return [this.somarDias(pascoa, -48), this.somarDias(pascoa, -47), this.somarDias(pascoa, -2), this.somarDias(pascoa, 60)].indexOf(iso) >= 0;
  },

  ehDiaUtil(iso) {
    const dia = new Date(String(iso).slice(0, 10) + "T12:00:00").getDay();
    if (dia === 0 || dia === 6) return false;
    return !this.ehFeriado(iso);
  },

  segundaDaSemana(iso) {
    const dia = new Date(String(iso).slice(0, 10) + "T12:00:00").getDay();
    const volta = dia === 0 ? 6 : dia - 1;
    return this.somarDias(iso, -volta);
  },

  /* Segunda, ou o próximo dia útil se a segunda não for dia útil. */
  diaAlertaEsteira(hoje) {
    let d = this.segundaDaSemana(hoje);
    let guarda = 0;
    while (!this.ehDiaUtil(d) && guarda < 12) {
      d = this.somarDias(d, 1);
      guarda += 1;
    }
    return d;
  },

  usuarioVeAlertaEsteira() {
    let u = window.AppState && window.AppState.currentUser;
    if (!u) {
      try { u = JSON.parse(localStorage.getItem("crm_logged_user") || "null"); } catch (e) { u = null; }
    }
    if (!u) return false;
    const imp = typeof window.crmImpersonacaoAtual === "function" ? window.crmImpersonacaoAtual() : null;
    const efetivo = imp || u;
    if (!imp && typeof window.isCrmAdministrator === "function" && window.isCrmAdministrator(u)) return true;
    if (typeof window.isCrmAdminProfileName === "function" && window.isCrmAdminProfileName(efetivo.profile_name || efetivo.profile || efetivo.role || "")) return true;
    return typeof window.isCobrancaBackOfficeUser === "function" && window.isCobrancaBackOfficeUser(efetivo);
  },

  chaveAlertaEsteira(segunda) {
    const u = (window.AppState && window.AppState.currentUser) || {};
    return "crm_fin_esteira_" + String(u.email || u.name || "op").toLowerCase() + "_" + segunda;
  },

  atrasadosEsteira() {
    const etapas = this.catalogoEtapas().filter((s) => s && s.selectable !== false && !s.hasChildren);
    return this.listOpenProcesses().map((row) => {
      const etapa = etapas.find((s) => String(s.id) === String(row.proc && row.proc.currentStageId));
      if (!etapa) return null;
      const prazo = this.prazoEtapa(row.proc, etapa);
      if (prazo.status !== "atrasado") return null;
      return { row, etapa, prazo };
    }).filter(Boolean).sort((a, b) => (a.prazo.restantes || 0) - (b.prazo.restantes || 0));
  },

  agendarAlertaEsteira() {
    if (this._finAlertaTimer) {
      clearTimeout(this._finAlertaTimer);
      this._finAlertaTimer = null;
    }
    if (!this.usuarioVeAlertaEsteira()) return;
    const hoje = this.hojeIso();
    const alerta = this.diaAlertaEsteira(hoje);
    if (hoje < alerta) {
      const alvo = new Date(alerta + "T08:00:00");
      this._finAlertaTimer = setTimeout(() => this.agendarAlertaEsteira(), Math.max(1000, alvo.getTime() - Date.now()));
      return;
    }
    this.abrirAlertaEsteira();
    const proxima = this.somarDias(this.segundaDaSemana(hoje), 7);
    const quando = new Date(proxima + "T08:00:00");
    this._finAlertaTimer = setTimeout(() => this.agendarAlertaEsteira(), Math.max(1000, quando.getTime() - Date.now()));
  },

  abrirAlertaEsteira() {
    if (!this.usuarioVeAlertaEsteira()) return;
    const hoje = this.hojeIso();
    const alerta = this.diaAlertaEsteira(hoje);
    if (hoje < alerta) return;
    const chave = this.chaveAlertaEsteira(this.segundaDaSemana(hoje));
    try { if (localStorage.getItem(chave) === "ciente") return; } catch (e) {}
    const lista = this.atrasadosEsteira();
    if (!lista.length || document.getElementById("fin-alerta")) return;
    const linhas = lista.map((item) => {
      const proc = item.row.proc || {};
      const n = Math.abs(item.prazo.restantes || 0);
      const safe = String(item.row.key).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      return `<button type="button" class="fin-alerta-item" onclick="FinanciamentoApp.abrirDoAlerta('${safe}')">
        <strong>${this.esc(proc.customerName || "—")}</strong>
        <span>Contrato ${this.esc(proc.contractNumber || proc.contractId || "—")} · ${this.esc(this.formatUnidade(proc.unit || "—"))}</span>
        <span>${this.esc(item.etapa.label || item.etapa.nome)} · venceu em ${this.esc(this.fmtDate(item.prazo.limite))} · ${n} dia${n === 1 ? "" : "s"}</span>
      </button>`;
    }).join("");
    const overlay = document.createElement("div");
    overlay.id = "fin-alerta";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-labelledby", "fin-alerta-titulo");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483004;display:flex;align-items:center;justify-content:center;background:rgba(12,41,29,0.55);padding:16px;";
    overlay.innerHTML = `<div style="background:#fff;border-radius:12px;width:100%;max-width:640px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 18px 40px rgba(0,0,0,0.22);border:1px solid rgba(16,84,54,0.12);font-family:inherit;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 0;">
        <h2 id="fin-alerta-titulo" style="margin:0;font-size:1.05rem;color:#105436;">Etapas vencidas na esteira</h2>
        <button type="button" class="btn btn-fechar" id="fin-alerta-fechar">Fechar</button>
      </div>
      <div style="padding:12px 18px 18px;overflow:auto;">
        <p style="margin:0 0 12px;color:#1e293b;font-size:0.92rem;line-height:1.45;">${lista.length} financiamento${lista.length === 1 ? "" : "s"} na esteira com a etapa atual fora do prazo.</p>
        <div style="display:flex;flex-direction:column;gap:8px;">${linhas}</div>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const estilo = document.createElement("style");
    estilo.textContent = "#fin-alerta .fin-alerta-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;width:100%;border:1px solid #fecaca;border-left:4px solid #b91c1c;background:#fff;border-radius:10px;padding:10px 12px;cursor:pointer;}#fin-alerta .fin-alerta-item strong{color:#0f172a;font-size:0.9rem;}#fin-alerta .fin-alerta-item span{color:#64748b;font-size:0.78rem;}";
    overlay.appendChild(estilo);
    overlay.querySelector("#fin-alerta-fechar").addEventListener("click", () => this.fecharAlertaEsteira(chave));
  },

  fecharAlertaEsteira(chave) {
    try { localStorage.setItem(chave, "ciente"); } catch (e) {}
    const pop = document.getElementById("fin-alerta");
    if (pop) pop.remove();
  },

  async abrirDoAlerta(key) {
    const hoje = this.hojeIso();
    this.fecharAlertaEsteira(this.chaveAlertaEsteira(this.segundaDaSemana(hoje)));
    if (typeof window.switchTab === "function") window.switchTab("financiamento", "Financiamento");
    await this.abrirAberto(key);
  },

  async prepararTagsUnidade() {
    if (window.AnexosApp && typeof window.AnexosApp.loadTagsAtivas === "function") {
      try { await window.AnexosApp.loadTagsAtivas(); } catch (e) {}
    }
    const todas = (window.AnexosState && window.AnexosState.tagsAtivas) || [];
    this._tagsUnidade = todas.filter((t) => {
      if (window.AnexosApp && typeof window.AnexosApp.tagDestino === "function") return window.AnexosApp.tagDestino(t) === "Unidade";
      return true;
    });
    document.querySelectorAll("select.fin-tag").forEach((sel) => {
      const atual = sel.value;
      if (!this._tagsUnidade.length) {
        sel.innerHTML = '<option value="">Nenhuma tag de unidade</option>';
        return;
      }
      sel.innerHTML = '<option value="">Escolha a tag</option>' + this._tagsUnidade.map((t) => `<option value="${this.esc(t.name)}">${this.esc(t.name)}</option>`).join("");
      if (atual) sel.value = atual;
    });
  },

  async enviarAnexo(stageId) {
    const proc = FinanciamentoState.process;
    const arq = document.getElementById("fin-arq-" + stageId);
    const tagEl = document.getElementById("fin-tag-" + stageId);
    const btn = document.getElementById("fin-env-" + stageId);
    const st = document.getElementById("fin-st-" + stageId);
    const file = arq && arq.files && arq.files[0];
    const tag = tagEl && tagEl.value;
    if (!proc) return;
    if (!file || !tag) {
      if (st) st.textContent = "Escolha o arquivo e a tag da unidade.";
      return;
    }
    if (typeof window.anexosUploadUnitAttachment !== "function") {
      if (st) st.textContent = "O envio de anexos da unidade não está disponível.";
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }
    if (st) st.textContent = "";
    try {
      const resp = await window.anexosUploadUnitAttachment({
        file: file,
        tagLabel: tag,
        costCenterId: proc.costCenterId || proc.empId,
        unitName: proc.unitName || proc.unit,
        sale: {
          customerId: proc.customerId,
          id: proc.contractId,
          contractId: proc.contractId,
          contractNumber: proc.contractNumber,
          receivableBillId: proc.titulo,
          costCenterId: proc.costCenterId || proc.empId,
          unitName: proc.unitName || proc.unit
        },
        context: "financiamento"
      });
      proc.anexos = proc.anexos || {};
      const lista = Array.isArray(proc.anexos[stageId]) ? proc.anexos[stageId] : [];
      lista.push({ tag: tag, fileName: resp.fileName || file.name, em: new Date().toISOString(), unitId: resp.unitId || "" });
      proc.anexos[stageId] = lista;
      proc.updatedAt = new Date().toISOString();
      this.saveProcess(proc);
      FinanciamentoState.process = proc;
      this.render();
    } catch (e) {
      if (st) st.textContent = (e && e.message) ? e.message : "Não consegui enviar o anexo para a unidade.";
      if (btn) { btn.disabled = false; btn.textContent = "Enviar para a unidade"; }
    }
  },

  marcarEtapa(stageId) {
    const proc = FinanciamentoState.process;
    if (!proc) return;
    const mesma = String(proc.currentStageId || "") === String(stageId);
    proc.currentStageId = stageId;
    proc.done = proc.done || {};
    if (!mesma || !proc.done[stageId]) proc.done[stageId] = new Date().toISOString();
    proc.updatedAt = new Date().toISOString();
    this.saveProcess(proc);
    FinanciamentoState.process = proc;
    this.render();
  },

  notaDe(proc, stageId) {
    const notas = proc && proc.notas;
    if (!notas || !stageId) return null;
    return notas[stageId] || notas[String(stageId)] || null;
  },

  notaCardHtml(proc, etapa) {
    const nota = this.notaDe(proc, etapa && etapa.id);
    if (!nota || (!nota.texto && !nota.data)) return "";
    const quando = nota.data ? this.fmtDate(nota.data) : "";
    const texto = String(nota.texto || "").replace(/\s+/g, " ").trim();
    const linha = quando && texto ? (quando + " · " + texto) : (quando || texto);
    return `<div class="fin-card-nota">${this.esc(linha)}</div>`;
  },

  salvarNota(stageId) {
    const proc = FinanciamentoState.process;
    if (!proc) return;
    const textoEl = document.getElementById("fin-nota-" + stageId);
    const dataEl = document.getElementById("fin-nota-data-" + stageId);
    const st = document.getElementById("fin-nota-st-" + stageId);
    const texto = textoEl ? String(textoEl.value || "").trim() : "";
    const data = dataEl ? String(dataEl.value || "").slice(0, 10) : "";
    proc.notas = proc.notas || {};
    if (!texto && !data) delete proc.notas[stageId];
    else proc.notas[stageId] = { texto: texto, data: data, em: new Date().toISOString() };
    proc.updatedAt = new Date().toISOString();
    this.saveProcess(proc);
    FinanciamentoState.process = proc;
    if (st) st.textContent = "Nota salva nesta fase.";
  },

  fluxoHtml() {
    const proc = FinanciamentoState.process || {};
    const customer = (FinanciamentoState.selected && FinanciamentoState.selected.customer) || FinanciamentoState.customer || {};
    const catalog = typeof window.buildFinanciamentoStageCatalog === "function"
      ? window.buildFinanciamentoStageCatalog()
      : [];
    const etapas = catalog.length ? catalog : (window.EtapasFinanciamentoState || []).map((e, i) => ({
      id: e.id, label: (i + 1) + ". " + e.nome, nome: e.nome, dias: e.dias, hasChildren: false
    }));
    const current = proc.currentStageId;
    return `
      <div style="margin-bottom:16px;">
        <button type="button" class="btn btn-outline" onclick="FinanciamentoApp.voltarBusca()">
          <i data-lucide="arrow-left" style="width:14px;height:14px;"></i> ${FinanciamentoState.painel === "esteira" ? "Voltar à esteira" : "Voltar à pesquisa"}
        </button>
      </div>
      <div class="crm-card" style="margin-bottom:16px;">
        <div class="crm-card-header" style="background:#f3f4f6;padding:12px 20px;border-bottom:1px solid #e5e7eb;border-radius:8px 8px 0 0;">
          <h3 style="margin:0;font-size:1.1rem;color:var(--color-primary);display:flex;align-items:center;gap:8px;">
            <i data-lucide="landmark" style="width:18px;"></i> Financiamento iniciado
          </h3>
        </div>
        <div class="crm-card-content" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
          <div><div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:700;">Cliente</div><div style="font-weight:700;color:#0f172a;">${this.esc(proc.customerName || customer.name || "—")}</div></div>
          <div><div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:700;">Contrato</div><div style="font-weight:700;color:#0f172a;">${this.esc(proc.contractNumber || "—")}</div></div>
          <div><div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:700;">Título</div><div style="font-weight:700;color:#0f172a;">${this.esc(proc.titulo || "—")}</div></div>
          <div><div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:700;">Unidade</div><div style="font-weight:700;color:#0f172a;">${this.esc(this.formatUnidade(proc.unit || "—"))}</div></div>
        </div>
      </div>
      <div class="crm-card">
        <div class="crm-card-header" style="background:#f3f4f6;padding:12px 20px;border-bottom:1px solid #e5e7eb;border-radius:8px 8px 0 0;">
          <h3 style="margin:0;font-size:1.05rem;color:var(--color-primary);">Etapas do financiamento</h3>
        </div>
        <div class="crm-card-content">
          <style>
            #financiamento-root .fin-nota { margin-top: 10px; }
            #financiamento-root .fin-nota label { display: block; font-size: 0.72rem; font-weight: 700; color: #64748b; margin-bottom: 4px; }
            #financiamento-root .fin-nota textarea { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; font: inherit; background: #fff; min-height: 64px; resize: vertical; }
            #financiamento-root .fin-nota-linha { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-top: 8px; }
            #financiamento-root .fin-nota input[type="date"] { height: 36px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 8px; background: #fff; font: inherit; }
            #financiamento-root .fin-nota-st { margin: 0; color: #105436; font-size: 0.78rem; font-weight: 700; }
          </style>
          <p style="margin:0 0 12px;color:#64748b;font-size:0.82rem;">Em cada fase dá para registrar uma nota interna e a data. O arquivo, com a tag escolhida, sobe na hora para a unidade no Sienge.</p>
          ${!etapas.length ? '<p style="color:#64748b;">Nenhuma etapa cadastrada. Vá em Configurações → Etapas Financiamento.</p>' : etapas.map((s) => {
            const done = proc.done && proc.done[s.id];
            const isCurrent = String(current) === String(s.id);
            const bg = isCurrent ? "#ecfdf5" : (done ? "#f8fafc" : "#fff");
            const border = isCurrent ? "#86efac" : "#e2e8f0";
            const sid = String(s.id).replace(/'/g, "");
            const nota = this.notaDe(proc, s.id) || {};
            const enviados = ((proc.anexos && proc.anexos[s.id]) || []).map((a) => `<li>${this.esc(a.tag)} · ${this.esc(a.fileName)} · ${this.esc(this.fmtDate(a.em))}</li>`).join("");
            const notaHtml = `<div class="fin-nota">
              <label for="fin-nota-${sid}">Nota interna</label>
              <textarea id="fin-nota-${sid}" rows="2" placeholder="Ex.: termo enviado pela Allanis no ticket de orientações">${this.esc(nota.texto || "")}</textarea>
              <div class="fin-nota-linha">
                <div>
                  <label for="fin-nota-data-${sid}">Data</label>
                  <input type="date" id="fin-nota-data-${sid}" value="${this.esc(String(nota.data || "").slice(0, 10))}">
                </div>
                <button type="button" class="btn btn-primary btn-sm" onclick="FinanciamentoApp.salvarNota('${sid}')">Salvar nota</button>
                <p id="fin-nota-st-${sid}" class="fin-nota-st"></p>
              </div>
            </div>`;
            const anexo = s.hasChildren ? "" : `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;">
              <input type="file" id="fin-arq-${sid}" style="max-width:240px;font-size:0.8rem;">
              <select id="fin-tag-${sid}" class="fin-tag form-control" style="max-width:240px;height:36px;"><option value="">Carregando tags…</option></select>
              <button type="button" class="btn btn-primary btn-sm" id="fin-env-${sid}" onclick="FinanciamentoApp.enviarAnexo('${sid}')">Enviar para a unidade</button>
              <p id="fin-st-${sid}" style="margin:0;flex-basis:100%;color:#b45309;font-size:0.78rem;"></p>
              ${enviados ? `<ul style="margin:0;padding-left:18px;flex-basis:100%;color:#334155;font-size:0.78rem;">${enviados}</ul>` : ""}
            </div>`;
            return `<div style="padding:12px 14px;border:1px solid ${border};background:${bg};border-radius:8px;margin-bottom:8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div>
                  <div style="font-weight:700;color:#0f172a;">${this.esc(s.label || s.nome)}</div>
                  <div style="font-size:0.78rem;color:#64748b;">${s.dias || 0} dias${done ? " · desde " + this.fmtDate(done) : ""}</div>
                </div>
                ${s.hasChildren ? "" : `<button type="button" class="btn ${isCurrent ? "btn-outline" : "btn-primary"} btn-sm" onclick="FinanciamentoApp.marcarEtapa('${sid}')">${isCurrent ? "Etapa atual" : "Marcar etapa"}</button>`}
              </div>
              ${anexo}
              ${notaHtml}
            </div>`;
          }).join("")}
        </div>
      </div>`;
  }
};

window.FinanciamentoApp = FinanciamentoApp;

/* Junta os financiamentos deste navegador com os da nuvem. Fica o registro mais novo de cada contrato, sem apagar o outro. */
window.mergeFinanciamentosProc = function(localRaw, cloudRaw) {
  const ler = (raw) => {
    try {
      const o = JSON.parse(raw || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) {
      return {};
    }
  };
  const unirLista = (a, b) => {
    const out = [];
    const visto = {};
    [a, b].forEach((lista) => {
      (Array.isArray(lista) ? lista : []).forEach((item) => {
        if (!item || typeof item !== "object") return;
        const chave = String(item.fileName || "") + "|" + String(item.em || "");
        if (visto[chave]) return;
        visto[chave] = true;
        out.push(item);
      });
    });
    return out;
  };
  const unirMapa = (antigo, novo, porData) => {
    const out = Object.assign({}, antigo || {});
    Object.keys(novo || {}).forEach((id) => {
      const a = out[id];
      const b = novo[id];
      if (Array.isArray(a) || Array.isArray(b)) {
        out[id] = unirLista(a, b);
        return;
      }
      if (porData && a && b && typeof a === "object" && typeof b === "object") {
        const ta = Date.parse(a.em || 0) || 0;
        const tb = Date.parse(b.em || 0) || 0;
        out[id] = tb >= ta ? b : a;
        return;
      }
      if (porData && a && b && typeof a !== "object") {
        out[id] = String(a) <= String(b) ? a : b;
        return;
      }
      out[id] = b;
    });
    return out;
  };
  const local = ler(localRaw);
  const cloud = ler(cloudRaw);
  const chaves = {};
  Object.keys(local).forEach((k) => { chaves[k] = true; });
  Object.keys(cloud).forEach((k) => { chaves[k] = true; });
  const out = {};
  Object.keys(chaves).sort().forEach((k) => {
    const a = local[k];
    const b = cloud[k];
    if (!a || typeof a !== "object") { if (b) out[k] = b; return; }
    if (!b || typeof b !== "object") { out[k] = a; return; }
    const ta = Date.parse(a.updatedAt || a.startedAt || 0) || 0;
    const tb = Date.parse(b.updatedAt || b.startedAt || 0) || 0;
    const recente = tb > ta ? b : a;
    const antigo = recente === a ? b : a;
    const junto = Object.assign({}, antigo, recente);
    junto.done = unirMapa(antigo.done, recente.done, true);
    junto.anexos = unirMapa(antigo.anexos, recente.anexos, false);
    junto.notas = unirMapa(antigo.notas, recente.notas, true);
    out[k] = junto;
  });
  return JSON.stringify(out);
};

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "financiamento") FinanciamentoApp.init();
});

document.addEventListener("DOMContentLoaded", function () {
  let tentativas = 0;
  const tentar = function () {
    tentativas += 1;
    const app = window.FinanciamentoApp;
    if (!app || typeof app.agendarAlertaEsteira !== "function" || !app.usuarioVeAlertaEsteira()) {
      if (tentativas < 20) setTimeout(tentar, 1000);
      return;
    }
    app.agendarAlertaEsteira();
  };
  setTimeout(tentar, 2000);
});
